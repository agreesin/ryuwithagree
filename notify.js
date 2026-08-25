// =========================================================
// notify.js - 실시간 알림 및 PWA/OneSignal 웹 푸시 모듈
// 브라우저 시스템 알림, 앱 내 토스트 팝업, 탭 제목 깜빡임 및
// 아이폰/스마트폰 백그라운드 웹 푸시(PWA + OneSignal)를 담당합니다.
// =========================================================

import { getCurrentUser, getCurrentProfiles } from "./state.js";

// OneSignal 설정 상수
const ONESIGNAL_APP_ID = "5405c7d7-4164-4bc8-af32-7863626eaa06";
// 안전한 Cloudflare Worker 푸시 중계 엔드포인트 (REST API Key는 Worker 내부에 안전하게 보관됨)
const PUSH_PROXY_URL = "https://ryuwithagree.ehd8109.workers.dev";

// 화면 요소
const toastContainer = document.getElementById("toast-container");
const notifBellBtn = document.getElementById("notif-bell-btn");

// 내부 상태
let isInitialEntriesLoad = true;
let knownEntryIds = new Set();
let knownCommentIds = new Set();
let originalDocumentTitle = document.title || "류이어리";
let unreadCount = 0;
let titleInterval = null;

/**
 * OneSignal SDK를 초기화합니다.
 */
function initOneSignal() {
  if (typeof window === "undefined") return;

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function (OneSignal) {
    try {
      const basePath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf("/") + 1);

      await OneSignal.init({
        appId: ONESIGNAL_APP_ID || "5405c7d7-4164-4bc8-af32-7863626eaa06",
        allowLocalhostAsSecureOrigin: true,
        serviceWorkerPath: `${basePath}OneSignalSDKWorker.js`,
        serviceWorkerParam: {
          scope: basePath,
        },
        notifyButton: {
          enable: false, // 우리 커스텀 벨 버튼 사용
        },
      });

      // OneSignal 구독 상태 변화 리스너
      OneSignal.User.PushSubscription.addEventListener("change", (event) => {
        const isOptedIn = event.current.optedIn;
        updateBellIcon(isOptedIn ? "granted" : "default");
      });
    } catch (err) {
      console.warn("[notify] OneSignal 초기화 경고:", err);
    }
  });
}

/**
 * 로그인한 사용자의 UID를 OneSignal에 등록하여 기기와 연결합니다.
 * @param {Object} user - Firebase User 객체
 */
export function syncUserWithOneSignal(user) {
  if (!user || !window.OneSignalDeferred) return;

  window.OneSignalDeferred.push(async function (OneSignal) {
    try {
      await OneSignal.login(user.uid);
      console.log("[notify] OneSignal 사용자 연결 완료:", user.uid);
    } catch (err) {
      console.warn("[notify] OneSignal 로그인 실패:", err);
    }
  });
}

/**
 * 브라우저 및 OneSignal 알림 권한을 요청합니다.
 */
export async function requestNotificationPermission() {
  // 1. OneSignal 알림 요청 (PWA / 모바일 웹 푸시)
  if (window.OneSignalDeferred) {
    window.OneSignalDeferred.push(async function (OneSignal) {
      try {
        await OneSignal.Slidedown.promptPush();
      } catch (e) {
        console.log("[notify] OneSignal prompt:", e);
      }
    });
  }

  // 2. 표준 Web Notification 권한 요청
  if (!("Notification" in window)) {
    return false;
  }

  if (Notification.permission === "granted") {
    updateBellIcon("granted");
    return true;
  }

  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    updateBellIcon(permission);
    if (permission === "granted") {
      showToastNotification("알림이 켜졌습니다! 상대방이 글을 쓰면 알려드릴게요 🔔", "🔔");
      return true;
    }
  }

  updateBellIcon(Notification.permission);
  return false;
}

/**
 * 상단 알림 종(🔔) 버튼의 상태 아이콘을 갱신합니다.
 */
function updateBellIcon(permission) {
  if (!notifBellBtn) return;
  if (permission === "granted") {
    notifBellBtn.textContent = "🔔";
    notifBellBtn.title = "알림이 켜져 있습니다";
    notifBellBtn.classList.add("enabled");
  } else {
    notifBellBtn.textContent = "🔕";
    notifBellBtn.title = "클릭하여 새 글/댓글 알림을 켜세요";
    notifBellBtn.classList.remove("enabled");
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

  try {
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

    if (!res.ok) {
      const errText = await res.text();
      console.warn("[notify] 푸시 중계 서버 응답 실패:", res.status, errText);
    } else {
      console.log("[notify] OneSignal 백그라운드 푸시 발송 완료");
    }
  } catch (err) {
    console.warn("[notify] 푸시 중계 서버 네트워크 오류:", err);
  }
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

/**
 * Firestore 일기 목록이 갱신될 때 새로 추가된 글/댓글을 감지하여 알림을 발송합니다.
 * @param {Array<Object>} entries - 일기 목록
 */
export function checkNewUpdates(entries) {
  const currentUser = getCurrentUser();
  const currentProfiles = getCurrentProfiles();

  // 1. 첫 로딩 시점에는 기존 항목 ID들만 기록하고 알림 건너뜀
  if (isInitialEntriesLoad) {
    isInitialEntriesLoad = false;
    knownEntryIds = new Set(entries.map((e) => e.id));
    knownCommentIds = new Set();
    entries.forEach((e) => {
      (e.comments || []).forEach((c) => knownCommentIds.add(c.id));
    });
    return;
  }

  // 2. 신규 일기 감지
  for (const entry of entries) {
    if (!knownEntryIds.has(entry.id)) {
      knownEntryIds.add(entry.id);

      // 내가 쓴 글이 아닌 경우에만 알림
      const isMyEntry = currentUser && (
        (entry.uid && entry.uid === currentUser.uid) ||
        (entry.author && currentUser.displayName && entry.author === currentUser.displayName)
      );

      if (!isMyEntry) {
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

        if (!isMyComment) {
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
}

/**
 * 알림 모듈을 초기화하고 이벤트 리스너를 바인딩합니다.
 */
export function initNotify() {
  // OneSignal SDK 초기화
  initOneSignal();

  // 알림 종 버튼 클릭 시 권한 요청
  if (notifBellBtn) {
    if ("Notification" in window) {
      updateBellIcon(Notification.permission);
    }
    notifBellBtn.addEventListener("click", () => {
      requestNotificationPermission();
    });
  }

  // 창이 다시 활성화되면 탭 제목 복구
  window.addEventListener("focus", () => {
    stopTitleBlink();
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      stopTitleBlink();
    }
  });
}
