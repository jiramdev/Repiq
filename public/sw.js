// public/sw.js
self.addEventListener("install", () => {
    self.skipWaiting();
  });
  
  self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
  });
  
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
  
  self.addEventListener("message", (event) => {
    if (event.data?.type === "TRIGGER_NOTIFICATION") {
      const { title, body, tag, url } = event.data;
      self.registration.showNotification(title, {
        body,
        tag: tag || "repiq-notification",
        icon: "/icon.png",
        badge: "/icon.png",
        data: { url: url || "/" },
      });
    }
  });