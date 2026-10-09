// public/sw.js
self.addEventListener("install", () => {
    self.skipWaiting();
  });
  
  self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
  });
  
  // 1. Receive background push from server (wakes phone!)
  self.addEventListener("push", (event) => {
    let data = {};
    if (event.data) {
      try {
        data = event.data.json();
      } catch {
        data = { title: "Rest Over!", body: event.data.text() };
      }
    }
  
    const title = data.title || "Rest Complete!";
    const options = {
      body: data.body || "Time for your next set.",
      icon: "/icon.png",
      badge: "/icon.png",
      vibrate: [200, 100, 200],
      tag: "repiq-rest-timer",
      renotify: true,
      data: { url: data.url || "/" },
    };
  
    event.waitUntil(self.registration.showNotification(title, options));
  });
  
  // 2. Open app when notification clicked
  self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const urlToOpen = event.notification.data?.url || "/";
  
    event.waitUntil(
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((clientList) => {
          for (const client of clientList) {
            if (client.url.includes(urlToOpen) && "focus" in client) {
              return client.focus();
            }
          }
          if (self.clients.openWindow) {
            return self.clients.openWindow(urlToOpen);
          }
        })
    );
  });