// =========================================================
// firebase-messaging-sw.js - Firebase Cloud Messaging 백그라운드 푸시 서비스 워커
// =========================================================

importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDJ_xp-Ahc4NbzPRPqdCd57E1Ai0Xjn7Ro",
  authDomain: "ryuwithagree.firebaseapp.com",
  projectId: "ryuwithagree",
  storageBucket: "ryuwithagree.firebasestorage.app",
  messagingSenderId: "843802806582",
  appId: "1:843802806582:web:fd8702bf1dd0d385d98b97",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log("[FCM-SW] 백그라운드 푸시 수신:", payload);

  // FCM 페이로드에 notification 객체가 포함된 경우 브라우저/OS가 이미 자동으로
  // 시스템 푸시 알림을 띄우므로, 중복 알림을 방지하기 위해 수동 showNotification을 건너뜁니다.
  if (payload.notification) {
    console.log("[FCM-SW] notification 페이로드 자동 표시 완료 (중복 방지)");
    return;
  }

  const title = payload.data?.title || "류이어리 💌";
  const body = payload.data?.body || payload.data?.message || "새로운 소식이 도착했습니다! ✨";

  const options = {
    body: body,
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    data: {
      url: payload.data?.url || "/ryuwithagree/",
    },
    tag: "diary-update",
    renotify: true,
  };

  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || "/ryuwithagree/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("ryuwithagree") && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});



