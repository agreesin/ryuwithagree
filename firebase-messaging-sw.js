// =========================================================
// firebase-messaging-sw.js - FCM 백그라운드 푸시 + PWA 오프라인 앱 셸 서비스 워커
// =========================================================

importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

const APP_CACHE_NAME = "ryudiary-shell-v4-1";
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./manifest.json",
  "./app.js",
  "./auth.js",
  "./calendar.js",
  "./changelog.js",
  "./comments.js",
  "./daily-question.js",
  "./dday.js",
  "./draw.js",
  "./entries.js",
  "./entry-card.js",
  "./gestures.js",
  "./notice.js",
  "./notify.js",
  "./nudge.js",
  "./profile.js",
  "./questions.js",
  "./render.js",
  "./report.js",
  "./state.js",
  "./store.js",
  "./timelapse.js",
  "./ui.js",
  "./icons/favicon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("ryudiary-shell-") && k !== APP_CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// 동일 출처 앱 셸 파일은 Network-First(오프라인 시 캐시 폴백)로 응답하여 오프라인 진입 지원
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isStaticAsset =
    req.mode === "navigate" ||
    /\.(html|css|js|json|svg|png|jpg|jpeg|webp|ico)$/i.test(url.pathname);
  if (!isStaticAsset) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === "basic") {
          const clone = res.clone();
          caches.open(APP_CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req, { ignoreSearch: true });
        if (cached) return cached;
        if (req.mode === "navigate") {
          return caches.match("./index.html", { ignoreSearch: true });
        }
        return Response.error();
      })
  );
});

firebase.initializeApp({
  apiKey: "AIzaSyDJ_xp-Ahc4NbzPRPqdCd57E1Ai0Xjn7Ro",
  authDomain: "ryuwithagree.firebaseapp.com",
  projectId: "ryuwithagree",
  storageBucket: "ryuwithagree.firebasestorage.app",
  messagingSenderId: "843802806582",
  appId: "1:843802806582:web:fd8702bf1dd0d385d98b97",
});

const messaging = firebase.messaging();

function getDefaultAppUrl() {
  return self.registration?.scope || "/";
}

messaging.onBackgroundMessage((payload) => {
  if (payload.notification) {
    return;
  }

  const title = payload.data?.title || "류이어리 💌";
  const body = payload.data?.body || payload.data?.message || "새로운 소식이 도착했습니다! ✨";

  const options = {
    body,
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    data: {
      url: payload.data?.url || getDefaultAppUrl(),
    },
    tag: "diary-update",
    renotify: true,
  };

  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const scopeUrl = getDefaultAppUrl();
  const urlToOpen = event.notification.data?.url || scopeUrl;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
