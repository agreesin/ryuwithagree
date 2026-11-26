// =========================================================
// notify.js - 실시간 알림, 알림 센터 드롭다운 및 FCM 웹 푸시 모듈
// - XSS 방어(escapeHtml), 알림 클릭 시 탭 전환 + 일기/과거 문답 자동 탐색
// - 공감 리액션 알림 통합, 본인 기기 한정 테스트 푸시, UID별 읽음 상태 격리
// =========================================================

import { getCurrentUser, isMyContent, getUserDisplayName } from "./state.js";
import {
  app,
  saveUserFcmToken,
  getPartnerFcmTokens,
  getMyFcmTokens,
} from "./store.js";
import {
  getMilestonesForDate,
  onDdayChange,
  getDdayItems,
  openDdayModal,
  calculateDdayInfo,
} from "./dday.js";
import { formatDateString, formatRelativeTime, escapeHtml } from "./ui.js";

const FIREBASE_MESSAGING_URL = "https://www.gstatic.com/firebasejs/12.17.1/firebase-messaging.js";
const FCM_VAPID_KEY =
  "BMwoxyNkaOfECoLOtTqhnVp76x2U3_7FgE4b08fKPSKxDxQ-EKCJb2z7cMaPjWNtjIPHXBaYbUhHLL1p0Gc1KNo";
const PUSH_PROXY_URL = "https://silent-mud-06b5.ehd8109.workers.dev";
const MAX_STORED_READ_IDS = 300;

const toastContainer = document.getElementById("toast-container");
const notifBellBtn = document.getElementById("notif-bell-btn");
const notifBadge = document.getElementById("notif-badge");
const notifDropdown = document.getElementById("notif-dropdown");
const notifUnreadCount = document.getElementById("notif-unread-count");
const notifMarkAllBtn = document.getElementById("notif-mark-all-btn");
const notifPushStatusText = document.getElementById("notif-push-status-text");
const notifPushToggleBtn = document.getElementById("notif-push-toggle-btn");
const notifList = document.getElementById("notif-list");
const notifEmpty = document.getElementById("notif-empty");

const appStartTime = Date.now();
let isInitialEntriesLoad = true;
let knownEntryIds = new Set();
let knownCommentIds = new Set();
let isInitialQuestionsLoad = true;
let knownQuestionAnsKeys = new Set();
let knownQuestionCommentKeys = new Set();
let originalDocumentTitle = document.title || "류이어리";
let unreadCount = 0;
let titleInterval = null;
let cachedEntries = [];
let cachedQuestionDocs = [];
let lastFirestoreNotifTime = 0;

let messagingMod = null;
let fcmMessaging = null;
let swRegistration = null;
let fcmInitPromise = null;

// UID별 읽은 알림 ID 관리
let loadedReadUid = null;
let readNotificationIds = new Set();

function getReadStorageKey() {
  const uid = getCurrentUser()?.uid;
  return uid ? `diary_read_notification_ids_${uid}` : "diary_read_notification_ids";
}

function ensureReadIdsLoaded() {
  const uid = getCurrentUser()?.uid || "__anon__";
  if (loadedReadUid === uid) return;
  loadedReadUid = uid;
  try {
    const saved =
      localStorage.getItem(getReadStorageKey()) ||
      localStorage.getItem("diary_read_notification_ids");
    readNotificationIds = saved ? new Set(JSON.parse(saved)) : new Set();
  } catch {
    readNotificationIds = new Set();
  }
}

function saveReadNotificationIds() {
  try {
    const arr = Array.from(readNotificationIds);
    const trimmed = arr.length > MAX_STORED_READ_IDS ? arr.slice(-MAX_STORED_READ_IDS) : arr;
    if (trimmed.length !== arr.length) {
      readNotificationIds = new Set(trimmed);
    }
    localStorage.setItem(getReadStorageKey(), JSON.stringify(trimmed));
  } catch {
    // LocalStorage 제한 안전 무시
  }
}

/**
 * 로그아웃 시 알림 내부 상태 초기화
 */
export function resetNotifyState() {
  isInitialEntriesLoad = true;
  knownEntryIds.clear();
  knownCommentIds.clear();
  isInitialQuestionsLoad = true;
  knownQuestionAnsKeys.clear();
  knownQuestionCommentKeys.clear();
  cachedEntries = [];
  cachedQuestionDocs = [];
  loadedReadUid = null;
  readNotificationIds = new Set();
  stopTitleBlink();
  if (notifDropdown) notifDropdown.hidden = true;
  if (notifBadge) notifBadge.hidden = true;
}

function getAppBaseUrl() {
  if (typeof window === "undefined") return "https://ryuwithagree.firebaseapp.com/";
  const basePath = location.pathname.substring(0, location.pathname.lastIndexOf("/") + 1) || "/";
  return `${location.origin}${basePath}`;
}

function isPushCapable() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "Notification" in window
  );
}

async function loadMessaging() {
  if (!messagingMod) {
    messagingMod = await import(FIREBASE_MESSAGING_URL);
  }
  return messagingMod;
}

async function initFcm() {
  if (!isPushCapable()) return;

  const basePath = location.pathname.substring(0, location.pathname.lastIndexOf("/") + 1) || "/";
  const swPath = basePath + "firebase-messaging-sw.js";
  const swScope = basePath;

  swRegistration = await navigator.serviceWorker.register(swPath, { scope: swScope });

  const { getMessaging, onMessage, isSupported } = await loadMessaging();
  const supported = await isSupported().catch(() => false);
  if (!supported) return;

  fcmMessaging = getMessaging(app);

  onMessage(fcmMessaging, (payload) => {
    if (Date.now() - lastFirestoreNotifTime < 6000) return;

    const title = payload.notification?.title || payload.data?.title || "류이어리";
    const message =
      payload.notification?.body ||
      payload.data?.body ||
      payload.data?.message ||
      "새 소식이 도착했습니다 ✨";
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

async function refreshPushStatus() {
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

export async function syncUserFcm(user) {
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
      }
    }
  } catch (err) {
    console.warn("[notify] FCM 토큰 동기화 오류:", err);
  }
}

async function requestNotificationPermission(interactive = false) {
  if (!("Notification" in window)) {
    if (interactive) {
      showToastNotification("현재 브라우저는 웹 알림을 지원하지 않습니다 (iOS 홈 화면 추가 필요).", "🔕");
    }
    return false;
  }

  if (Notification.permission === "denied") {
    if (interactive) {
      showToastNotification("기기 [설정 > 알림 > 류이어리]에서 알림을 허용해 주세요!", "🔕");
    }
    refreshPushStatus();
    return false;
  }

  try {
    if (notifPushToggleBtn && interactive) {
      notifPushToggleBtn.disabled = true;
      notifPushToggleBtn.textContent = "연동 중...";
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      if (interactive) {
        showToastNotification("알림 권한이 허용되지 않았습니다.", "🔕");
      }
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

    if (interactive) {
      showToastNotification("기기 푸시 알림이 정상 연동되었습니다! 🔔", "🎉");
    }
    return true;
  } catch (err) {
    console.error("[notify] FCM 권한/토큰 오류:", err);
    if (interactive) {
      showToastNotification("FCM 연동 오류: " + err.message, "⚠️");
    }
    refreshPushStatus();
    return false;
  } finally {
    if (notifPushToggleBtn) notifPushToggleBtn.disabled = false;
  }
}

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
 * 내 기기로만 즉시 테스트 푸시를 발송합니다 (상대방 기기 오발송 방지).
 */
async function sendTestPush() {
  const curUser = getCurrentUser();
  if (!curUser) {
    showToastNotification("로그인 후 테스트할 수 있습니다.", "🔒");
    return;
  }

  const testBtn = document.getElementById("notif-test-push-btn");
  if (testBtn) testBtn.disabled = true;

  showToastNotification("내 기기로 테스트 푸시 발송 중... 🚀", "💌");

  try {
    const myTokens = await getMyFcmTokens(curUser.uid);
    if (myTokens.length === 0) {
      showToastNotification("먼저 [알림 켜기] 또는 [재연동]을 눌러 기기를 등록해 주세요!", "⚠️");
      return;
    }

    await sendPushToPartner({
      title: "🔔 류이어리 푸시 알림 테스트",
      message: "내 기기에 알림이 정상 도착했습니다! ✨",
      targetTokens: myTokens,
    });

    showToastNotification("내 기기로 테스트 푸시를 보냈습니다! 3~5초 뒤 확인해 보세요 🔔", "✅");
  } catch (err) {
    console.error("[notify] 테스트 푸시 실패:", err);
    showToastNotification("푸시 발송 실패: " + err.message, "⚠️");
  } finally {
    if (testBtn) testBtn.disabled = false;
  }
}

export function showToastNotification(message, icon = "💌") {
  if (!toastContainer) return;

  const toast = document.createElement("div");
  toast.className = "toast-item";
  toast.setAttribute("role", "status");

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

export function showSystemNotification(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  try {
    const notification = new Notification(title, {
      body,
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

export async function sendPushToPartner({ title, message, targetTokens = null }) {
  if (!PUSH_PROXY_URL) return;

  const curUser = getCurrentUser();
  const tokens = Array.isArray(targetTokens)
    ? targetTokens
    : await getPartnerFcmTokens(curUser?.uid);

  if (!tokens || tokens.length === 0) return;

  const res = await fetch(PUSH_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tokens,
      title,
      message,
      url: getAppBaseUrl(),
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || (data && !data.success)) {
    const errMsg = data?.error || `서버 응답 오류 (${res.status})`;
    console.warn("[notify] FCM 푸시 중계 서버 응답 실패:", res.status, errMsg);
    throw new Error(errMsg);
  }

  return data;
}

export function startTitleBlink(message) {
  stopTitleBlink();
  let isOriginal = false;
  titleInterval = setInterval(() => {
    document.title = isOriginal ? originalDocumentTitle : `🔔 ${message}`;
    isOriginal = !isOriginal;
  }, 1000);
}

export function stopTitleBlink() {
  if (titleInterval) {
    clearInterval(titleInterval);
    titleInterval = null;
  }
  document.title = originalDocumentTitle;
}

function getNotificationItems(entries = cachedEntries) {
  const currentUser = getCurrentUser();
  const items = [];

  if (!entries || !Array.isArray(entries)) return items;

  entries.forEach((entry) => {
    const entryUid = entry.uid || entry.authorUid;
    const isMyEntry = isMyContent(entry);

    // 1. 상대방 새 일기
    if (currentUser && !isMyEntry) {
      const authorName = escapeHtml(getUserDisplayName(entryUid, entry.author || "상대방"));
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

    // 2. 내 일기에 달린 상대방 공감 리액션
    if (currentUser && isMyEntry && entry.reactions && typeof entry.reactions === "object") {
      Object.entries(entry.reactions).forEach(([emoji, uids]) => {
        if (!Array.isArray(uids)) return;
        uids.forEach((rUid) => {
          if (rUid && rUid !== currentUser.uid) {
            const reactorName = escapeHtml(getUserDisplayName(rUid, "상대방"));
            const safeTitle = escapeHtml((entry.title || "일기").slice(0, 16));
            items.push({
              id: `reaction-${entry.id}-${emoji}-${rUid}`,
              type: "entry",
              entryId: entry.id,
              targetId: `entry-${entry.id}`,
              author: reactorName,
              text: `${escapeHtml(emoji)} <b>${reactorName}</b>님이 '${safeTitle}' 일기에 공감했습니다.`,
              createdAt: entry.updatedAt || entry.createdAt || 0,
              icon: emoji,
            });
          }
        });
      });
    }

    // 3. 댓글 및 답글
    (entry.comments || []).forEach((comment) => {
      const commentUid = comment.uid || comment.authorUid;
      const isMyComment = isMyContent(comment);

      if (currentUser && !isMyComment) {
        const commentAuthor = escapeHtml(getUserDisplayName(commentUid, comment.author || "상대방"));
        const rawText = String(comment.text || "");
        const safePreview = escapeHtml(rawText.substring(0, 20) + (rawText.length > 20 ? "..." : ""));

        let text = "";
        if (comment.parentCommentId || comment.parentId) {
          text = `💬 <b>${commentAuthor}</b>님이 답글을 남겼습니다: "${safePreview}"`;
        } else if (isMyEntry) {
          text = `💌 <b>${commentAuthor}</b>님이 내 일기에 댓글을 남겼습니다: "${safePreview}"`;
        } else {
          text = `💬 <b>${commentAuthor}</b>님이 댓글을 남겼습니다: "${safePreview}"`;
        }

        items.push({
          id: `comment-${comment.id}`,
          type: "comment",
          entryId: entry.id,
          targetId: `comment-${comment.id}`,
          author: commentAuthor,
          text,
          createdAt: comment.createdAt || 0,
          icon: "💬",
        });
      }
    });
  });

  // 4. 커플 문답 알림
  if (Array.isArray(cachedQuestionDocs)) {
    cachedQuestionDocs.forEach((qDoc) => {
      if (!qDoc || !qDoc.question) return;
      const q = qDoc.question;
      const safeBadge = escapeHtml(q.badge || (q.order ? `Q.${q.order}` : "오늘의 질문"));

      const answers = qDoc.answers || {};
      for (const [ansUid, ansData] of Object.entries(answers)) {
        if (currentUser && ansUid !== currentUser.uid && ansData && ansData.text) {
          const authorName = escapeHtml(getUserDisplayName(ansUid, ansData.author || "상대방"));
          items.push({
            id: `dq-ans-${qDoc.id}-${ansUid}`,
            type: "question-answer",
            docId: qDoc.id,
            targetId: "dq-answers-wrap",
            author: authorName,
            text: `💌 <b>${authorName}</b>님이 '${safeBadge}' 문답에 답변을 등록했습니다.`,
            createdAt: ansData.updatedAt || qDoc.lastUpdatedAt || 0,
            icon: "💌",
          });
        }
      }

      const comments = qDoc.comments || [];
      comments.forEach((comment) => {
        if (currentUser && comment.uid !== currentUser.uid && comment.text) {
          const authorName = escapeHtml(getUserDisplayName(comment.uid, comment.author || "상대방"));
          const rawText = String(comment.text || "");
          const safePreview = escapeHtml(rawText.substring(0, 20) + (rawText.length > 20 ? "..." : ""));
          items.push({
            id: `dq-comment-${qDoc.id}-${comment.id}`,
            type: "question-comment",
            docId: qDoc.id,
            targetId: `dq-comment-item-${comment.id}`,
            author: authorName,
            text: `💬 <b>${authorName}</b>님이 '${safeBadge}' 문답에 한마디를 남겼습니다: "${safePreview}"`,
            createdAt: comment.createdAt || 0,
            icon: "💬",
          });
        }
      });
    });
  }

  // 5. 당일 기념일/생일/일정 알림 (오늘 00:00 기준 고정 타임스탬프 사용)
  try {
    const now = new Date();
    const todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayStr = formatDateString(now);

    const todayMilestones = getMilestonesForDate(todayStr);
    todayMilestones.forEach((ms) => {
      items.push({
        id: `dday-milestone-${todayStr}-${ms.id}`,
        type: "dday",
        author: "류이어리",
        text: `🎉 오늘은 <b>${escapeHtml(ms.title)}</b>입니다! 💕`,
        createdAt: todayStartMs,
        icon: ms.icon || "💖",
      });
    });

    const ddayItems = getDdayItems();
    const curY = now.getFullYear();
    const curM = now.getMonth() + 1;
    const curD = now.getDate();

    ddayItems.forEach((item) => {
      if (!item.date) return;
      const [itemY, itemM, itemD] = item.date.split("-").map(Number);
      const type = item.type || "count_up";
      if (type === "birthday" && curM === itemM && curD === itemD) {
        items.push({
          id: `dday-bday-${todayStr}-${item.id}`,
          type: "dday",
          author: "류이어리",
          text: `🎂 오늘은 <b>${escapeHtml(item.title)}</b> 생일입니다! 🎉`,
          createdAt: todayStartMs,
          icon: item.icon || "🎂",
        });
      } else if (type === "event" && curY === itemY && curM === itemM && curD === itemD) {
        items.push({
          id: `dday-event-${todayStr}-${item.id}`,
          type: "dday",
          author: "류이어리",
          text: `🌟 오늘은 <b>${escapeHtml(item.title)}</b> 일정 당일입니다!`,
          createdAt: todayStartMs,
          icon: item.icon || "🌟",
        });
      }
    });
  } catch (err) {
    console.warn("[notify] 당일 디데이 알림 집계 오류:", err);
  }

  items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return items;
}

function updateNotificationBadge() {
  ensureReadIdsLoaded();
  const items = getNotificationItems();
  const unreadItems = items.filter((item) => !readNotificationIds.has(item.id));
  unreadCount = unreadItems.length;

  if (notifBadge) {
    if (unreadCount > 0) {
      notifBadge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
      notifBadge.hidden = false;
    } else {
      notifBadge.hidden = true;
    }
  }

  if (notifUnreadCount) {
    if (unreadCount > 0) {
      notifUnreadCount.textContent = `(${unreadCount})`;
      notifUnreadCount.hidden = false;
    } else {
      notifUnreadCount.textContent = "";
      notifUnreadCount.hidden = true;
    }
  }
}

function renderNotificationDropdown() {
  if (!notifList || !notifEmpty) return;

  ensureReadIdsLoaded();
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
    li.setAttribute("role", "button");
    li.setAttribute("tabindex", "0");

    const iconSpan = document.createElement("span");
    iconSpan.className = "notif-item-icon";
    iconSpan.textContent = item.icon;

    const contentDiv = document.createElement("div");
    contentDiv.className = "notif-item-content";

    const textP = document.createElement("p");
    textP.className = "notif-item-text";
    textP.innerHTML = item.text; // item.text 내부 동적 필드는 모두 escapeHtml 처리 완료

    const timeSpan = document.createElement("span");
    timeSpan.className = "notif-item-time";
    timeSpan.textContent = formatRelativeTime(item.createdAt);

    contentDiv.appendChild(textP);
    contentDiv.appendChild(timeSpan);

    li.appendChild(iconSpan);
    li.appendChild(contentDiv);

    const onSelect = () => {
      readNotificationIds.add(item.id);
      saveReadNotificationIds();
      updateNotificationBadge();
      li.classList.remove("unread");
      li.classList.add("read");

      if (notifDropdown) notifDropdown.hidden = true;
      scrollToNotificationTarget(item);
    };

    li.addEventListener("click", onSelect);
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect();
      }
    });

    notifList.appendChild(li);
  }
}

function scrollToNotificationTarget(item) {
  if (item.type === "dday") {
    openDdayModal();
    return;
  }

  if (item.type === "question-answer" || item.type === "question-comment") {
    window.dispatchEvent(new CustomEvent("diary:switch-tab", { detail: { mode: "question" } }));
    setTimeout(() => {
      if (item.docId) {
        window.dispatchEvent(
          new CustomEvent("diary:open-question", {
            detail: { docId: item.docId, targetId: item.targetId },
          })
        );
      }
    }, 120);
    return;
  }

  // 일기·댓글·리액션 알림: 피드 탭으로 전환 후 필터/페이징 자동 확장 탐색
  window.dispatchEvent(new CustomEvent("diary:switch-tab", { detail: { mode: "feed" } }));
  setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent("diary:reveal-entry", {
        detail: {
          entryId: item.entryId,
          targetId: item.targetId,
          onNotFound: () => {
            showToastNotification("해당 글 또는 댓글을 찾을 수 없습니다.", "🔍");
          },
        },
      })
    );
  }, 150);
}

function markAllNotificationsAsRead() {
  ensureReadIdsLoaded();
  const items = getNotificationItems();
  items.forEach((item) => readNotificationIds.add(item.id));
  saveReadNotificationIds();
  updateNotificationBadge();
  renderNotificationDropdown();
  showToastNotification("모든 알림을 읽음 처리했습니다. ✨", "💌");
}

export function checkNewUpdates(entries) {
  cachedEntries = entries;
  const currentUser = getCurrentUser();

  if (isInitialEntriesLoad) {
    isInitialEntriesLoad = false;
    entries.forEach((e) => {
      knownEntryIds.add(e.id);
      (e.comments || []).forEach((c) => knownCommentIds.add(c.id));
    });
    updateNotificationBadge();
    return;
  }

  entries.forEach((entry) => {
    if (!knownEntryIds.has(entry.id)) {
      knownEntryIds.add(entry.id);

      const entryUid = entry.uid || entry.authorUid;
      const isMyEntry = isMyContent(entry);

      if (currentUser && !isMyEntry && entry.createdAt > appStartTime - 5000) {
        const authorName = getUserDisplayName(entryUid, entry.author || "상대방");
        const title = "📖 새로운 일기 등록!";
        const body = `${authorName}님이 새 일기를 남겼습니다.`;

        lastFirestoreNotifTime = Date.now();
        showToastNotification(body, "💌");
        showSystemNotification(title, body);
        startTitleBlink("새 일기가 도착했습니다!");
      }
    }

    (entry.comments || []).forEach((comment) => {
      if (!knownCommentIds.has(comment.id)) {
        knownCommentIds.add(comment.id);

        const commentUid = comment.uid || comment.authorUid;
        const isMyComment = isMyContent(comment);

        if (currentUser && !isMyComment && comment.createdAt > appStartTime - 5000) {
          const commentAuthor = getUserDisplayName(commentUid, comment.author || "상대방");
          const title = "💬 새로운 댓글 도착!";
          const body = `${commentAuthor}: ${comment.text.substring(0, 30)}${comment.text.length > 30 ? "..." : ""}`;

          lastFirestoreNotifTime = Date.now();
          showToastNotification(body, "💌");
          showSystemNotification(title, body);
          startTitleBlink("새 댓글이 도착했습니다!");
        }
      }
    });
  });

  updateNotificationBadge();
  if (notifDropdown && !notifDropdown.hidden) {
    renderNotificationDropdown();
  }
}

export function updateQuestionNotifications(qDocs) {
  if (!Array.isArray(qDocs)) return;
  cachedQuestionDocs = qDocs;
  const currentUser = getCurrentUser();

  if (isInitialQuestionsLoad) {
    isInitialQuestionsLoad = false;
    qDocs.forEach((qd) => {
      const answers = qd.answers || {};
      Object.keys(answers).forEach((uid) => knownQuestionAnsKeys.add(`${qd.id}-${uid}`));
      (qd.comments || []).forEach((c) => knownQuestionCommentKeys.add(`${qd.id}-${c.id}`));
    });
    updateNotificationBadge();
    return;
  }

  qDocs.forEach((qd) => {
    const q = qd.question || {};
    const badgeText = q.badge || (q.order ? `Q.${q.order}` : "오늘의 질문");
    const answers = qd.answers || {};

    for (const [ansUid, ansData] of Object.entries(answers)) {
      const key = `${qd.id}-${ansUid}`;
      if (!knownQuestionAnsKeys.has(key)) {
        knownQuestionAnsKeys.add(key);
        if (currentUser && ansUid !== currentUser.uid && (ansData.updatedAt || 0) > appStartTime - 5000) {
          const authorName = getUserDisplayName(ansUid, ansData.author || "상대방");
          const title = "💌 오늘의 질문 답변 도착!";
          const body = `${authorName}님이 '${badgeText}' 문답에 답변을 등록했습니다.`;
          lastFirestoreNotifTime = Date.now();
          showToastNotification(body, "💌");
          showSystemNotification(title, body);
          startTitleBlink("새 문답 답변이 도착했습니다!");
        }
      }
    }

    (qd.comments || []).forEach((comment) => {
      const key = `${qd.id}-${comment.id}`;
      if (!knownQuestionCommentKeys.has(key)) {
        knownQuestionCommentKeys.add(key);
        if (currentUser && comment.uid !== currentUser.uid && (comment.createdAt || 0) > appStartTime - 5000) {
          const authorName = getUserDisplayName(comment.uid, comment.author || "상대방");
          const title = "💬 오늘의 질문 한마디 도착!";
          const preview = comment.text.substring(0, 30);
          const body = `${authorName}: "${preview}${comment.text.length > 30 ? "..." : ""}"`;
          lastFirestoreNotifTime = Date.now();
          showToastNotification(body, "💬");
          showSystemNotification(title, body);
          startTitleBlink("새 한마디가 도착했습니다!");
        }
      }
    });
  });

  updateNotificationBadge();
  if (notifDropdown && !notifDropdown.hidden) {
    renderNotificationDropdown();
  }
}

export function initNotify() {
  ensureFcm();

  if (notifBellBtn && notifDropdown) {
    notifBellBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = notifDropdown.hidden;
      notifDropdown.hidden = !isHidden;
      notifBellBtn.setAttribute("aria-expanded", String(!notifDropdown.hidden));

      if (!notifDropdown.hidden) {
        renderNotificationDropdown();
        refreshPushStatus();
      }
    });
  }

  if (notifDropdown) {
    notifDropdown.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  document.addEventListener("click", () => {
    if (notifDropdown && !notifDropdown.hidden) {
      notifDropdown.hidden = true;
      if (notifBellBtn) notifBellBtn.setAttribute("aria-expanded", "false");
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && notifDropdown && !notifDropdown.hidden) {
      notifDropdown.hidden = true;
      if (notifBellBtn) notifBellBtn.setAttribute("aria-expanded", "false");
    }
  });

  if (notifMarkAllBtn) {
    notifMarkAllBtn.addEventListener("click", () => markAllNotificationsAsRead());
  }

  if (notifPushToggleBtn) {
    notifPushToggleBtn.addEventListener("click", () => requestNotificationPermission(true));
  }

  const notifTestPushBtn = document.getElementById("notif-test-push-btn");
  if (notifTestPushBtn) {
    notifTestPushBtn.addEventListener("click", () => sendTestPush());
  }

  window.addEventListener("focus", () => stopTitleBlink());

  onDdayChange(() => {
    if (getCurrentUser()) {
      checkTodayMilestoneNotifications();
      updateNotificationBadge();
    }
  });
}

export function checkTodayMilestoneNotifications() {
  if (!getCurrentUser()) return;
  const todayStr = formatDateString();

  const milestones = getMilestonesForDate(todayStr);
  milestones.forEach((ms) => {
    const storageKey = `dday_notif_${todayStr}_${ms.title}`;
    if (!localStorage.getItem(storageKey)) {
      try {
        localStorage.setItem(storageKey, "sent");
      } catch {
        // 무시
      }

      const title = "🎉 기념일 알림";
      const body = `오늘은 [${ms.title}]입니다! 💕`;

      showToastNotification(body, ms.icon || "💖");
      showSystemNotification(title, body);
      startTitleBlink(body);
    }
  });

  const ddayItems = getDdayItems();
  ddayItems.forEach((item) => {
    const info = calculateDdayInfo(item);
    if (!info || !info.isToday) return;

    const type = item.type || "count_up";
    if (type === "count_up") return;

    const eventTitle =
      type === "birthday"
        ? `🎂 오늘은 [${item.title}] 생일입니다! 🎉`
        : `🌟 오늘은 [${item.title}] 일정/데이트 당일입니다!`;

    const storageKey = `dday_event_notif_${todayStr}_${item.id}`;
    if (!localStorage.getItem(storageKey)) {
      try {
        localStorage.setItem(storageKey, "sent");
      } catch {
        // 무시
      }
      showToastNotification(eventTitle, item.icon || "💖");
      showSystemNotification("🗓️ 일정 알림", eventTitle);
      startTitleBlink(eventTitle);
    }
  });
}
