// =========================================================
// notify.js - 실시간 알림, 알림 센터 드롭다운 및 PWA/OneSignal 웹 푸시 모듈
// 브라우저 시스템 알림, 앱 내 토스트 팝업, 탭 제목 깜빡임,
// 상단 종 아이콘 클릭 시 알림 내역 목록 확인 및 클릭 시 해당 글/댓글로 스크롤 이동을 담당합니다.
// =========================================================

import { getCurrentUser, getCurrentProfiles } from "./state.js";

// OneSignal 설정 상수
const ONESIGNAL_APP_ID = "5405c7d7-4164-4bc8-af32-7863626eaa06";
// 안전한 Cloudflare Worker 푸시 중계 엔드포인트
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

/**
 * OneSignal SDK 비동기 래퍼 (타임아웃 보장으로 UI 프리징 방지)
 */
function runWithOneSignal(fn, timeoutMs = 3500) {
  return new Promise((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    }, timeoutMs);

    if (typeof window !== "undefined" && window.OneSignal && typeof window.OneSignal.User !== "undefined") {
      try {
        Promise.resolve(fn(window.OneSignal))
          .then((res) => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              resolve(res);
            }
          })
          .catch((err) => {
            console.warn("[notify] OneSignal 즉시 실행 오류:", err);
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              resolve(null);
            }
          });
      } catch (err) {
        console.warn("[notify] OneSignal 즉시 실행 예외:", err);
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(null);
        }
      }
      return;
    }

    if (typeof window !== "undefined") {
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async (OneSignal) => {
        try {
          const res = await fn(OneSignal);
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            resolve(res);
          }
        } catch (err) {
          console.warn("[notify] OneSignal 지연 실행 오류:", err);
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            resolve(null);
          }
        }
      });
    } else {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/**
 * 정확한 GitHub Pages 및 서브디렉터리 Base Path 계산
 */
function getBasePath() {
  if (typeof window === "undefined") return "/";
  let p = window.location.pathname;
  if (!p.endsWith("/")) {
    if (p.endsWith(".html")) {
      p = p.substring(0, p.lastIndexOf("/") + 1);
    } else {
      p = p + "/";
    }
  }
  return p;
}

/**
 * OneSignal SDK를 초기화합니다.
 */
function initOneSignal() {
  if (typeof window === "undefined") return;

  runWithOneSignal(async (OneSignal) => {
    try {
      const isGitHubPages = window.location.pathname.includes("/ryuwithagree");
      const swPath = isGitHubPages ? "/ryuwithagree/OneSignalSDKWorker.js" : "/OneSignalSDKWorker.js";
      const swScope = isGitHubPages ? "/ryuwithagree/" : "/";

      await OneSignal.init({
        appId: ONESIGNAL_APP_ID || "5405c7d7-4164-4bc8-af32-7863626eaa06",
        allowLocalhostAsSecureOrigin: true,
        serviceWorkerPath: swPath,
        serviceWorkerParam: {
          scope: swScope,
        },
        notifyButton: {
          enable: false,
        },
      });

      // OneSignal 구독 상태 변화 리스너
      OneSignal.User?.PushSubscription?.addEventListener("change", async (event) => {
        console.log("[notify] OneSignal PushSubscription 상태 변경:", event);
        await refreshPushStatus();
      });

      // 초기 상태 동기화
      await refreshPushStatus();
    } catch (err) {
      console.warn("[notify] OneSignal 초기화 경고:", err);
    }
  }, 5000);
}

/**
 * OneSignal 실제 구독 상태 및 브라우저 권한을 검사하여 UI를 갱신합니다.
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
 * 로그인한 사용자의 UID를 OneSignal에 등록하여 기기와 연결합니다.
 * @param {Object} user - Firebase User 객체
 */
export function syncUserWithOneSignal(user) {
  if (!user) return;

  runWithOneSignal(async (OneSignal) => {
    try {
      if (OneSignal.login) {
        await OneSignal.login(user.uid);
        console.log("[notify] OneSignal 사용자 연결 완료:", user.uid);
      }

      if (OneSignal.User?.PushSubscription?.optIn) {
        await OneSignal.User.PushSubscription.optIn();
      }
      refreshPushStatus();
    } catch (err) {
      console.warn("[notify] OneSignal 로그인 실패:", err);
    }
  }, 3000);
}

/**
 * 브라우저 및 OneSignal 알림 권한을 요청하고 구독 토큰을 동기화합니다.
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

    let subId = null;
    let isOptedIn = false;

    // OneSignal v16 권장 방식: Notifications.requestPermission() 직접 호출 및 User Model 순서(login -> optIn) 준수
    await runWithOneSignal(async (OneSignal) => {
      try {
        if (OneSignal.Notifications?.requestPermission) {
          await OneSignal.Notifications.requestPermission();
        }

        const curUser = getCurrentUser();
        if (curUser && OneSignal.login) {
          await OneSignal.login(curUser.uid);
        }

        if (OneSignal.User?.PushSubscription?.optIn) {
          await OneSignal.User.PushSubscription.optIn();
        }

        subId = OneSignal.User?.PushSubscription?.id;
        isOptedIn = Boolean(OneSignal.User?.PushSubscription?.optedIn);
        console.log("[notify] OneSignal 동기화 완료, SubId:", subId, "OptedIn:", isOptedIn);
      } catch (e) {
        console.warn("[notify] OneSignal optIn 에러:", e);
      }
    }, 3500);

    updatePushStatusUI({ status: "granted", message: "기기 푸시 알림 켜짐 🔔" });
    if (subId) {
      showToastNotification("기기 푸시 등록 성공! 이제 [테스트]를 눌러보세요 🔔", "🔔");
    } else {
      showToastNotification("푸시 토큰 발급 요청 완료! 2초 뒤 [테스트]를 눌러보세요 🔔", "🔔");
    }
    return true;
  } catch (err) {
    console.warn("[notify] 권한 요청 오류:", err);
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
  const message = (typeof info === "object" && info.message) ? info.message : null;

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
    await sendPushToPartner({
      title: "🔔 류이어리 푸시 알림 테스트",
      message: "정상적으로 알림이 잘 도착했습니다! ✨",
    });
    showToastNotification("푸시 발송 성공! 앱을 닫고 3~5초 뒤 잠금화면을 확인하세요 🔔", "🔔");
  } catch (err) {
    console.error("[notify] 테스트 푸시 실패:", err);
    if (err.message && err.message.includes("not subscribed")) {
      showToastNotification("⚠️ 아직 서버에 기기가 등록되지 않았습니다. [재연동] 버튼을 먼저 눌러주세요!", "⚠️");
    } else {
      showToastNotification("푸시 발송 실패: " + err.message, "❌");
    }
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

  // 4초 후 서서히 사라짐
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
 * (Cloudflare Worker 서버리스 중계 연동)
 */
export async function sendPushToPartner({ title, message }) {
  if (!PUSH_PROXY_URL) {
    return;
  }

  const res = await fetch(PUSH_PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: title,
      message: message,
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || (data && data.errors && data.errors.length > 0)) {
    const errMsg = data?.errors?.[0] || `서버 응답 오류 (${res.status})`;
    console.warn("[notify] 푸시 중계 서버 응답 실패:", res.status, errMsg);
    throw new Error(errMsg);
  }

  console.log("[notify] OneSignal 백그라운드 푸시 발송 완료:", data);
  return data;
}

/**
 * 탭 제목 깜빡임 효과를 시작합니다.
 */
function startTitleBlink(message) {
  unreadCount++;
  if (titleInterval) clearInterval(titleInterval);

  let showMsg = true;
  titleInterval = setInterval(() => {
    document.title = showMsg ? `(${unreadCount}) 💌 ${message}` : originalDocumentTitle;
    showMsg = !showMsg;
  }, 1000);
}

/**
 * 사용자가 페이지를 보게 되면 탭 제목을 원래대로 복구합니다.
 */
function stopTitleBlink() {
  unreadCount = 0;
  if (titleInterval) {
    clearInterval(titleInterval);
    titleInterval = null;
  }
  document.title = originalDocumentTitle;
}

// =========================================================
// 알림 센터 (Notification Center) 데이터 & 드롭다운 관리
// =========================================================

/**
 * 상대방이 작성한 모든 일기, 댓글, 답글을 시간순으로 정렬한 알림 목록을 생성합니다.
 */
export function getNotificationItems(entries = cachedEntries) {
  const currentUser = getCurrentUser();
  const items = [];

  for (const entry of entries) {
    // 1. 상대방이 쓴 일기
    const isMyEntry = currentUser && (
      (entry.uid && entry.uid === currentUser.uid) ||
      (entry.author && currentUser.displayName && entry.author === currentUser.displayName)
    );

    if (!isMyEntry && entry.createdAt) {
      items.push({
        id: `entry_${entry.id}`,
        type: "entry",
        icon: "📖",
        text: "당신의 반쪽이 새 일기를 남겼습니다.",
        createdAt: entry.createdAt,
        entryId: entry.id,
        targetId: `entry-${entry.id}`,
      });
    }

    // 2. 상대방이 쓴 댓글 / 답글
    const comments = entry.comments || [];
    for (const comment of comments) {
      const isMyComment = currentUser && (
        (comment.uid && comment.uid === currentUser.uid) ||
        (comment.author && currentUser.displayName && comment.author === currentUser.displayName)
      );

      if (!isMyComment && comment.createdAt) {
        const isReply = Boolean(comment.parentId);
        const typeLabel = isReply ? "답글" : "댓글";
        items.push({
          id: `comment_${comment.id}`,
          type: isReply ? "reply" : "comment",
          icon: "💬",
          text: `당신의 반쪽이 새 ${typeLabel}을 남겼습니다.`,
          createdAt: comment.createdAt,
          entryId: entry.id,
          commentId: comment.id,
          targetId: `comment-${comment.id}`,
        });
      }
    }
  }

  // 최신순 정렬
  items.sort((a, b) => b.createdAt - a.createdAt);
  return items;
}

/**
 * 읽지 않은 알림 개수를 계산하여 상단 종 뱃지를 갱신합니다.
 */
export function updateNotificationBadge() {
  const items = getNotificationItems();
  const unreadItems = items.filter((item) => !readNotificationIds.has(item.id));
  const unreadLen = unreadItems.length;

  if (notifBadge) {
    if (unreadLen > 0) {
      notifBadge.textContent = unreadLen > 99 ? "99+" : String(unreadLen);
      notifBadge.hidden = false;
    } else {
      notifBadge.hidden = true;
    }
  }

  if (notifUnreadCount) {
    notifUnreadCount.textContent = unreadLen > 0 ? `(${unreadLen}개 안읽음)` : "";
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
    textP.textContent = item.text;

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
    knownEntryIds = new Set(entries.map((e) => e.id));
    knownCommentIds = new Set();
    entries.forEach((e) => {
      (e.comments || []).forEach((c) => knownCommentIds.add(c.id));
    });
    updateNotificationBadge();
    return;
  }

  // 2. 신규 일기 감지
  for (const entry of entries) {
    if (!knownEntryIds.has(entry.id)) {
      knownEntryIds.add(entry.id);

      // 내가 쓴 글이 아니고, 앱 실행 이후에 등록된 새 글일 때만 알림
      const isMyEntry = currentUser && (
        (entry.uid && entry.uid === currentUser.uid) ||
        (entry.author && currentUser.displayName && entry.author === currentUser.displayName)
      );

      const isRecent = entry.createdAt && entry.createdAt >= appStartTime - 3000;
      if (!isMyEntry && isRecent) {
        const message = "당신의 반쪽이 새 일기를 남겼습니다.";

        showToastNotification(message, "📖");
        showSystemNotification("📖 류이어리 새 일기", message);
        startTitleBlink("새 일기 도착!");
      }
    }

    // 3. 신규 댓글/답글 감지
    const comments = entry.comments || [];
    for (const comment of comments) {
      if (!knownCommentIds.has(comment.id)) {
        knownCommentIds.add(comment.id);

        const isMyComment = currentUser && (
          (comment.uid && comment.uid === currentUser.uid) ||
          (comment.author && currentUser.displayName && comment.author === currentUser.displayName)
        );

        const isRecent = comment.createdAt && comment.createdAt >= appStartTime - 3000;
        if (!isMyComment && isRecent) {
          const isReply = Boolean(comment.parentId);
          const typeLabel = isReply ? "답글" : "댓글";
          const message = `당신의 반쪽이 새 ${typeLabel}을 남겼습니다.`;

          showToastNotification(message, "💬");
          showSystemNotification(`💬 류이어리 새 ${typeLabel}`, message);
          startTitleBlink(`새 ${typeLabel} 도착!`);
        }
      }
    }
  }

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
  // OneSignal SDK 초기화
  initOneSignal();

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

  // 6. 브라우저 창 복구 시 탭 제목 복구
  window.addEventListener("focus", () => {
    stopTitleBlink();
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      stopTitleBlink();
    }
  });
}
