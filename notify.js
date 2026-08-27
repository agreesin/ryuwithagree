// =========================================================
// notify.js - 실시간 알림, 알림 센터 드롭다운 및 Firebase Cloud Messaging (FCM) 웹 푸시 모듈
// 브라우저 시스템 알림, 앱 내 토스트 팝업, 탭 제목 깜빡임,
// 상단 종 아이콘 클릭 시 알림 내역 목록 확인 및 클릭 시 해당 글/댓글로 스크롤 이동을 담당합니다.
// =========================================================

import { getCurrentUser, getCurrentProfiles } from "./state.js?v=2.7.9";
import { app, saveUserFcmToken, getPartnerFcmTokens, getAllFcmTokens } from "./store.js?v=2.7.9";

const FIREBASE_MESSAGING_URL = "https://www.gstatic.com/firebasejs/12.17.1/firebase-messaging.js";
const FCM_VAPID_KEY = "BMwoxyNkaOfECoLOtTqhnVp76x2U3_7FgE4b08fKPSKxDxQ-EKCJb2z7cMaPjWNtjIPHXBaYbUhHLL1p0Gc1KNo";
const PUSH_PROXY_URL = "https://silent-mud-06b5.ehd8109.workers.dev";

// 화면 요소
const toastContainer = document.getElementById("toast-container");
const notifBellBtn = document.getElementById("notif-bell-btn");
const notifBellIcon = document.getElementById("notif-bell-icon");
const notifBadge = document.getElementById("notif-badge");
const notifDropdown = document.getElementById("notif-dropdown");
const notifUnreadCount = document.getElementById("notif-unread-count");
const notifMarkAllBtn = document.getElementById("notif-mark-all-btn");
const notifPushStatusText = document.getElementById("notif-push-status-text");
const notifPushToggleBtn = document.getElementById("notif-push-toggle-btn");
const notifList = document.getElementById("notif-list");
const notifEmpty = document.getElementById("notif-empty");

// 내부 상태
const appStartTime = Date.now();
let isInitialEntriesLoad = true;
let knownEntryIds = new Set();
let knownCommentIds = new Set();
let originalDocumentTitle = document.title || "류이어리";
let unreadCount = 0;
let titleInterval = null;
let cachedEntries = [];

// FCM 동적 인스턴스 및 서비스워커 등록 객체
let messagingMod = null;
let fcmMessaging = null;
let swRegistration = null;
let fcmInitPromise = null;

// 읽은 알림 ID 목록 (localStorage 보관)
const STORAGE_KEY_READ_NOTIFS = "diary_read_notification_ids";
let readNotificationIds = new Set();

try {
  const saved = localStorage.getItem(STORAGE_KEY_READ_NOTIFS);
  if (saved) {
    readNotificationIds = new Set(JSON.parse(saved));
  }
} catch (e) {
  readNotificationIds = new Set();
}

function saveReadNotificationIds() {
  try {
    localStorage.setItem(STORAGE_KEY_READ_NOTIFS, JSON.stringify(Array.from(readNotificationIds)));
  } catch (e) {
    // LocalStorage 용량 초과 또는 제한 방지
  }
}

/**
 * 상대 시간 포맷 헬퍼 (예: "방금 전", "5분 전", "2시간 전", "어제")
 */
function formatRelativeTime(timestamp) {
  if (!timestamp) return "";
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay === 1) return "어제";
  if (diffDay < 7) return `${diffDay}일 전`;

  const d = new Date(timestamp);
  return d.toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getBasePath() {
  const isGitHubPages = typeof window !== "undefined" && window.location.pathname.includes("/ryuwithagree");
  return isGitHubPages ? "/ryuwithagree/" : "/";
}

/** 이 브라우저에서 웹 푸시가 물리적으로 가능한지 (iOS 비-standalone이면 false) */
function isPushCapable() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "Notification" in window
  );
}

/** Firebase Messaging 모듈을 동적 로드 → 실패해도 전체 모듈 그래프를 죽이지 않음 */
async function loadMessaging() {
  if (!messagingMod) {
    messagingMod = await import(FIREBASE_MESSAGING_URL);
  }
  return messagingMod;
}

/**
 * Firebase Cloud Messaging (FCM) 초기화 및 서비스 워커 등록
 */
async function initFcm() {
  if (!isPushCapable()) {
    console.info("[notify] 이 브라우저 환경에서는 웹 푸시를 사용할 수 없습니다.");
    return;
  }

  const base = getBasePath();
  const swPath = `${base}firebase-messaging-sw.js`;
  const swScope = `${base}`;

  swRegistration = await navigator.serviceWorker.register(swPath, { scope: swScope });
  console.log("[notify] FCM ServiceWorker 등록 성공:", swPath);

  const { getMessaging, getToken, onMessage, isSupported } = await loadMessaging();

  const supported = await isSupported().catch(() => false);
  if (!supported) {
    console.info("[notify] Firebase Messaging 미지원 환경");
    return;
  }

  fcmMessaging = getMessaging(app);

  // 포그라운드(앱이 켜져 있을 때) 수신 리스너
  onMessage(fcmMessaging, (payload) => {
    console.log("[notify] FCM 포그라운드 메시지 수신:", payload);
    const title = payload.notification?.title || payload.data?.title || "류이어리";
    const message = payload.notification?.body || payload.data?.body || payload.data?.message || "새 소식이 도착했습니다 ✨";
    showToastNotification(`${title}: ${message}`, "🔔");
    showSystemNotification(title, message);
  });

  await refreshPushStatus();
}

function ensureFcm() {
  if (!fcmInitPromise) {
    fcmInitPromise = initFcm().catch((err) => {
      console.warn("[notify] FCM 초기화 안전 처리:", err);
      fcmInitPromise = null;
    });
  }
  return fcmInitPromise;
}

/**
 * 푸시 알림 실제 구독 상태 및 브라우저 권한을 검사하여 UI를 갱신합니다.
 */
export async function refreshPushStatus() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    updatePushStatusUI({ status: "unsupported", message: "웹 알림 미지원 브라우저" });
    return { status: "unsupported" };
  }

  const permission = Notification.permission;
  if (permission === "denied") {
    updatePushStatusUI({ status: "denied", message: "기기 알림 차단됨 🔕" });
    return { status: "denied" };
  }

  if (permission === "granted") {
    updatePushStatusUI({ status: "granted", message: "기기 푸시 알림 켜짐 🔔" });
    return { status: "granted" };
  }

  updatePushStatusUI({ status: "default", message: "기기 푸시 알림 꺼짐" });
  return { status: "default" };
}

/**
 * 로그인한 사용자의 UID와 FCM 토큰을 Firestore에 동기화합니다 (호환용 함수명).
 * @param {Object} user - Firebase User 객체
 */
export async function syncUserWithOneSignal(user) {
  if (!user || !("Notification" in window) || Notification.permission !== "granted") return;

  try {
    await ensureFcm();
    const { getToken } = await loadMessaging();

    if (fcmMessaging && swRegistration) {
      const token = await getToken(fcmMessaging, {
        vapidKey: FCM_VAPID_KEY,
        serviceWorkerRegistration: swRegistration,
      });

      if (token) {
        await saveUserFcmToken(user.uid, token, user.email || "");
        console.log("[notify] FCM 토큰 Firestore 동기화 완료:", token.substring(0, 15) + "...");
      }
    }
  } catch (err) {
    console.warn("[notify] FCM 토큰 동기화 오류:", err);
  }
}

/**
 * 브라우저 알림 권한을 요청하고 FCM 푸시 토큰을 발급받아 Firestore에 저장합니다.
 */
export async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    alert("현재 브라우저에서는 웹 알림을 지원하지 않습니다.\n(iOS 16.4+ 사파리 '홈 화면에 추가' 필수)");
    return false;
  }

  if (Notification.permission === "denied") {
    alert("아이폰에서 알림이 차단되어 있습니다.\n\n아이폰 [설정] -> [알림] -> [류이어리]에서 [알림 허용]을 켜주세요!");
    refreshPushStatus();
    return false;
  }

  try {
    if (notifPushToggleBtn) {
      notifPushToggleBtn.disabled = true;
      notifPushToggleBtn.textContent = "연동 중...";
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      alert("알림 권한이 허용되지 않았습니다.");
      refreshPushStatus();
      return false;
    }

    await ensureFcm();
    const { getToken } = await loadMessaging();

    if (!fcmMessaging || !swRegistration) {
      throw new Error("FCM 서비스워커 등록에 실패했습니다.");
    }

    const token = await getToken(fcmMessaging, {
      vapidKey: FCM_VAPID_KEY,
      serviceWorkerRegistration: swRegistration,
    });

    const curUser = getCurrentUser();
    if (curUser && token) {
      await saveUserFcmToken(curUser.uid, token, curUser.email || "");
    }

    updatePushStatusUI({ status: "granted", message: "기기 푸시 알림 켜짐 🔔" });

    alert(
      `🎉 기기 푸시 알림 연동 완료!\n\n` +
      `FCM 기기 토큰이 정상 발급되어 등록되었습니다.\n` +
      `이제 [테스트] 버튼을 누르면 잠금화면으로 알림이 도착합니다! 🔔`
    );
    return true;
  } catch (err) {
    console.error("[notify] FCM 권한/토큰 오류:", err);
    alert("FCM 연동 오류: " + err.message);
    refreshPushStatus();
    return false;
  } finally {
    if (notifPushToggleBtn) notifPushToggleBtn.disabled = false;
  }
}

/**
 * 푸시 알림 상태 UI 갱신
 */
function updatePushStatusUI(info) {
  if (!notifPushStatusText || !notifPushToggleBtn) return;

  const status = typeof info === "string" ? info : info.status;
  const message = typeof info === "object" && info.message ? info.message : null;

  if (status === "granted") {
    notifPushStatusText.textContent = message || "기기 푸시 알림 켜짐 🔔";
    notifPushToggleBtn.textContent = "재연동";
    notifPushToggleBtn.disabled = false;
    notifPushToggleBtn.title = "알림이 잘 안 올 때 클릭하여 푸시 토큰 재등록";
    if (notifBellBtn) notifBellBtn.classList.add("enabled");
  } else if (status === "denied") {
    notifPushStatusText.textContent = message || "기기 알림 차단됨 🔕";
    notifPushToggleBtn.textContent = "설정 안내";
    notifPushToggleBtn.disabled = false;
    if (notifBellBtn) notifBellBtn.classList.remove("enabled");
  } else {
    notifPushStatusText.textContent = message || "기기 푸시 알림 꺼짐";
    notifPushToggleBtn.textContent = "알림 켜기";
    notifPushToggleBtn.disabled = false;
    if (notifBellBtn) notifBellBtn.classList.remove("enabled");
  }
}

/**
 * 내 기기로 즉시 테스트 푸시를 발송하여 알림 수신 상태를 검증합니다.
 */
export async function sendTestPush() {
  const testBtn = document.getElementById("notif-test-push-btn");
  if (testBtn) testBtn.disabled = true;

  showToastNotification("테스트 푸시 발송 요청 중... 🚀", "💌");

  try {
    const tokens = await getAllFcmTokens();
    if (tokens.length === 0) {
      alert("⚠️ 등록된 기기 토큰이 없습니다.\n\n상단 [알림 켜기] 또는 [재연동] 버튼을 먼저 눌러 기기를 등록해 주세요!");
      return;
    }

    await sendPushToPartner({
      title: "🔔 류이어리 푸시 알림 테스트",
      message: "정상적으로 알림이 잘 도착했습니다! ✨",
      isTest: true,
    });

    alert("✅ 푸시 발송 성공!\n\n홈 화면으로 나가거나 화면을 잠그고 3~5초 뒤 잠금화면 알림을 확인하세요 🔔");
  } catch (err) {
    console.error("[notify] 테스트 푸시 실패:", err);
    alert("⚠️ 푸시 발송 실패:\n" + err.message);
  } finally {
    if (testBtn) testBtn.disabled = false;
  }
}

/**
 * 앱 내 화면 상단에 핑크 토스트 알림을 띄웁니다.
 * @param {string} message - 표시할 메시지
 * @param {string} icon - 이모지 아이콘
 */
export function showToastNotification(message, icon = "💌") {
  if (!toastContainer) return;

  const toast = document.createElement("div");
  toast.className = "toast-item";

  const iconSpan = document.createElement("span");
  iconSpan.className = "toast-icon";
  iconSpan.textContent = icon;

  const textSpan = document.createElement("span");
  textSpan.className = "toast-text";
  textSpan.textContent = message;

  toast.appendChild(iconSpan);
  toast.appendChild(textSpan);

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast-hide");
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 400);
  }, 4000);
}

/**
 * 브라우저 시스템 푸시 알림을 띄웁니다.
 * @param {string} title - 알림 제목
 * @param {string} body - 알림 본문
 */
function showSystemNotification(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  try {
    const notification = new Notification(title, {
      body: body,
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      tag: "diary-update",
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch (err) {
    console.warn("[notify] 시스템 알림 발생 실패:", err);
  }
}

/**
 * 상대방의 스마트폰/아이폰으로 백그라운드 웹 푸시 알림을 전송합니다.
 * (Cloudflare Worker -> Google FCM HTTP v1 API 직통 발송)
 */
export async function sendPushToPartner({ title, message, isTest = false }) {
  if (!PUSH_PROXY_URL) return;

  const curUser = getCurrentUser();
  const tokens = isTest ? await getAllFcmTokens() : await getPartnerFcmTokens(curUser?.uid);

  if (!tokens || tokens.length === 0) {
    console.log("[notify] 발송할 대상 FCM 토큰이 없습니다.");
    return;
  }

  const res = await fetch(PUSH_PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tokens: tokens,
      title: title,
      message: message,
      url: "https://agreesin.github.io/ryuwithagree/",
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || (data && !data.success)) {
    const errMsg = data?.error || `서버 응답 오류 (${res.status})`;
    console.warn("[notify] FCM 푸시 중계 서버 응답 실패:", res.status, errMsg);
    throw new Error(errMsg);
  }

  console.log("[notify] FCM 백그라운드 푸시 발송 완료:", data);
  return data;
}

/**
 * 탭 제목 깜빡임 효과를 시작합니다.
 */
function startTitleBlink(message) {
  stopTitleBlink();
  let isOriginal = false;
  titleInterval = setInterval(() => {
    document.title = isOriginal ? originalDocumentTitle : `🔔 ${message}`;
    isOriginal = !isOriginal;
  }, 1000);
}

/**
 * 탭 제목 깜빡임 효과를 정지합니다.
 */
function stopTitleBlink() {
  if (titleInterval) {
    clearInterval(titleInterval);
    titleInterval = null;
  }
  document.title = originalDocumentTitle;
}

/**
 * 전체 일기 목록에서 알림 항목(새 일기 + 새 댓글)을 시간 역순으로 추출합니다.
 * @param {Array<Object>} entries - Firestore 일기 목록
 * @returns {Array<Object>} 알림 아이템 목록
 */
export function getNotificationItems(entries = cachedEntries) {
  const currentUser = getCurrentUser();
  const currentProfiles = getCurrentProfiles();
  const items = [];

  if (!entries || !Array.isArray(entries)) return items;

  entries.forEach((entry) => {
    // 1. 상대방이 작성한 새 일기 알림
    if (currentUser && entry.authorUid !== currentUser.uid) {
      const authorName = currentProfiles[entry.authorUid] || entry.author || "상대방";
      items.push({
        id: `entry-${entry.id}`,
        type: "entry",
        entryId: entry.id,
        targetId: `entry-${entry.id}`,
        author: authorName,
        text: `✏️ <b>${authorName}</b>님이 새 일기를 남겼습니다.`,
        createdAt: entry.createdAt || 0,
        icon: "📖",
      });
    }

    // 2. 일기에 달린 댓글 및 대댓글 알림
    (entry.comments || []).forEach((comment) => {
      // 내가 쓴 댓글은 제외
      if (currentUser && comment.authorUid !== currentUser.uid) {
        const commentAuthor = currentProfiles[comment.authorUid] || comment.author || "상대방";
        const isMyEntry = currentUser && entry.authorUid === currentUser.uid;

        let text = "";
        if (comment.parentCommentId) {
          text = `💬 <b>${commentAuthor}</b>님이 답글을 남겼습니다: "${comment.text.substring(0, 20)}${comment.text.length > 20 ? "..." : ""}"`;
        } else if (isMyEntry) {
          text = `💌 <b>${commentAuthor}</b>님이 내 일기에 댓글을 남겼습니다: "${comment.text.substring(0, 20)}${comment.text.length > 20 ? "..." : ""}"`;
        } else {
          text = `💬 <b>${commentAuthor}</b>님이 댓글을 남겼습니다: "${comment.text.substring(0, 20)}${comment.text.length > 20 ? "..." : ""}"`;
        }

        items.push({
          id: `comment-${comment.id}`,
          type: "comment",
          entryId: entry.id,
          targetId: `comment-${comment.id}`,
          author: commentAuthor,
          text: text,
          createdAt: comment.createdAt || 0,
          icon: "💬",
        });
      }
    });
  });

  // 최신순 정렬
  items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return items;
}

/**
 * 상단 종 아이콘 옆의 빨간색 안 읽은 알림 뱃지 숫자를 갱신합니다.
 */
export function updateNotificationBadge() {
  const items = getNotificationItems();
  const unreadItems = items.filter((item) => !readNotificationIds.has(item.id));
  unreadCount = unreadItems.length;

  if (notifBadge) {
    if (unreadCount > 0) {
      notifBadge.textContent = unreadCount > 99 ? "99+" : unreadCount;
      notifBadge.hidden = false;
    } else {
      notifBadge.hidden = true;
    }
  }

  if (notifUnreadCount) {
    notifUnreadCount.textContent = unreadCount;
  }
}

/**
 * 알림 내역 드롭다운 목록을 렌더링합니다.
 */
export function renderNotificationDropdown() {
  if (!notifList || !notifEmpty) return;

  const items = getNotificationItems();
  notifList.innerHTML = "";

  if (items.length === 0) {
    notifEmpty.hidden = false;
    return;
  }

  notifEmpty.hidden = true;

  for (const item of items) {
    const isUnread = !readNotificationIds.has(item.id);

    const li = document.createElement("li");
    li.className = `notif-item ${isUnread ? "unread" : "read"}`;

    const iconSpan = document.createElement("span");
    iconSpan.className = "notif-item-icon";
    iconSpan.textContent = item.icon;

    const contentDiv = document.createElement("div");
    contentDiv.className = "notif-item-content";

    const textP = document.createElement("p");
    textP.className = "notif-item-text";
    textP.innerHTML = item.text;

    const timeSpan = document.createElement("span");
    timeSpan.className = "notif-item-time";
    timeSpan.textContent = formatRelativeTime(item.createdAt);

    contentDiv.appendChild(textP);
    contentDiv.appendChild(timeSpan);

    li.appendChild(iconSpan);
    li.appendChild(contentDiv);

    // 알림 클릭 시 해당 글/댓글로 스크롤 이동
    li.addEventListener("click", () => {
      // 1. 해당 알림 읽음 처리
      readNotificationIds.add(item.id);
      saveReadNotificationIds();
      updateNotificationBadge();
      li.classList.remove("unread");
      li.classList.add("read");

      // 2. 드롭다운 닫기
      if (notifDropdown) notifDropdown.hidden = true;

      // 3. 해당 위치로 스크롤 및 강조
      scrollToNotificationTarget(item);
    });

    notifList.appendChild(li);
  }
}

/**
 * 알림 대상 요소로 스크롤 이동 및 반짝임 하이라이트 효과 부여
 */
function scrollToNotificationTarget(item) {
  let targetEl = null;

  if (item.targetId) {
    targetEl = document.getElementById(item.targetId);
  }

  // 만약 댓글 요소를 직접 찾지 못했다면 부모 일기 카드로 fallback
  if (!targetEl && item.entryId) {
    targetEl = document.getElementById(`entry-${item.entryId}`);
  }

  if (targetEl) {
    targetEl.scrollIntoView({ behavior: "smooth", block: "center" });

    // 반짝이는 하이라이트 애니메이션
    targetEl.classList.remove("highlight-flash");
    void targetEl.offsetWidth; // CSS 애니메이션 재시작 트릭
    targetEl.classList.add("highlight-flash");

    setTimeout(() => {
      targetEl.classList.remove("highlight-flash");
    }, 1800);
  } else {
    showToastNotification("해당 글 또는 댓글을 찾을 수 없습니다.", "🔍");
  }
}

/**
 * 모든 알림을 읽음 상태로 변경합니다.
 */
function markAllNotificationsAsRead() {
  const items = getNotificationItems();
  items.forEach((item) => readNotificationIds.add(item.id));
  saveReadNotificationIds();
  updateNotificationBadge();
  renderNotificationDropdown();
  showToastNotification("모든 알림을 읽음 처리했습니다. ✨", "💌");
}

/**
 * Firestore 일기 목록이 갱신될 때 새로 추가된 글/댓글을 감지하여 알림을 발송합니다.
 * @param {Array<Object>} entries - 일기 목록
 */
export function checkNewUpdates(entries) {
  cachedEntries = entries;
  const currentUser = getCurrentUser();

  // 1. 첫 로딩 시점에는 기존 항목 ID들만 기록하고 알림 건너뜀
  if (isInitialEntriesLoad) {
    isInitialEntriesLoad = false;
    entries.forEach((e) => {
      knownEntryIds.add(e.id);
      (e.comments || []).forEach((c) => knownCommentIds.add(c.id));
    });
    updateNotificationBadge();
    return;
  }

  // 2. 새 일기 감지
  entries.forEach((entry) => {
    if (!knownEntryIds.has(entry.id)) {
      knownEntryIds.add(entry.id);

      // 내가 쓴 글이 아니고, 앱 켜진 이후에 작성된 글인 경우에만 알림
      if (currentUser && entry.authorUid !== currentUser.uid && entry.createdAt > appStartTime - 5000) {
        const authorName = getCurrentProfiles()[entry.authorUid] || entry.author || "상대방";
        const title = "📖 새로운 일기 등록!";
        const body = `${authorName}님이 새 일기를 남겼습니다.`;

        showToastNotification(body, "💌");
        showSystemNotification(title, body);
        startTitleBlink("새 일기가 도착했습니다!");
      }
    }

    // 3. 새 댓글/대댓글 감지
    (entry.comments || []).forEach((comment) => {
      if (!knownCommentIds.has(comment.id)) {
        knownCommentIds.add(comment.id);

        if (currentUser && comment.authorUid !== currentUser.uid && comment.createdAt > appStartTime - 5000) {
          const commentAuthor = getCurrentProfiles()[comment.authorUid] || comment.author || "상대방";
          const title = "💬 새로운 댓글 도착!";
          const body = `${commentAuthor}: ${comment.text.substring(0, 30)}${comment.text.length > 30 ? "..." : ""}`;

          showToastNotification(body, "💌");
          showSystemNotification(title, body);
          startTitleBlink("새 댓글이 도착했습니다!");
        }
      }
    });
  });

  // 뱃지 및 드롭다운 목록 갱신
  updateNotificationBadge();
  if (notifDropdown && !notifDropdown.hidden) {
    renderNotificationDropdown();
  }
}

/**
 * 알림 모듈을 초기화하고 이벤트 리스너를 바인딩합니다.
 */
export function initNotify() {
  // FCM 백그라운드 등록 시도 (전체 앱 흐름을 막지 않음)
  ensureFcm();

  // 1. 상단 종 버튼 클릭 시 알림 센터 드롭다운 토글
  if (notifBellBtn && notifDropdown) {
    notifBellBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = notifDropdown.hidden;
      notifDropdown.hidden = !isHidden;

      if (!notifDropdown.hidden) {
        // 열릴 때 최신 알림 목록 렌더링 및 푸시 상태 확인
        renderNotificationDropdown();
        refreshPushStatus();
      }
    });
  }

  // 2. 드롭다운 내부 클릭 시 외부 닫힘 방지
  if (notifDropdown) {
    notifDropdown.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  // 3. 화면 바깥 영역 클릭 시 드롭다운 닫기
  document.addEventListener("click", () => {
    if (notifDropdown && !notifDropdown.hidden) {
      notifDropdown.hidden = true;
    }
  });

  // 4. "모두 읽음" 버튼
  if (notifMarkAllBtn) {
    notifMarkAllBtn.addEventListener("click", () => {
      markAllNotificationsAsRead();
    });
  }

  // 5. 드롭다운 내부 푸시 알림 설정 버튼
  if (notifPushToggleBtn) {
    notifPushToggleBtn.addEventListener("click", () => {
      requestNotificationPermission();
    });
  }

  // 6. 푸시 알림 자가 진단 테스트 발송 버튼
  const notifTestPushBtn = document.getElementById("notif-test-push-btn");
  if (notifTestPushBtn) {
    notifTestPushBtn.addEventListener("click", () => {
      sendTestPush();
    });
  }

  // 7. 브라우저 창 복구 시 탭 제목 복구
  window.addEventListener("focus", () => {
    stopTitleBlink();
  });
}
