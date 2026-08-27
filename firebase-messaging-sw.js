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

  const title = payload.notification?.title || payload.data?.title || "류이어리 💌";
  const body = payload.notification?.body || payload.data?.body || payload.data?.message || "새로운 소식이 도착했습니다! ✨";

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
