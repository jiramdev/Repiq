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
  
  let currentTimerTimeout = null;
  
  self.addEventListener("message", (event) => {
    if (event.data?.type === "TRIGGER_NOTIFICATION") {
      const { title, body, tag, url } = event.data;
      event.waitUntil(
        self.registration.showNotification(title, {
          body,
          tag: tag || "repiq-notification",
          icon: "/icon.png",
          badge: "/icon.png",
          data: { url: url || "/" },
        })
      );
    }
  
    // Cancel any running countdown if the user unchecks the set or finishes early
    if (event.data?.type === "CANCEL_REST_TIMER") {
      if (currentTimerTimeout) {
        clearTimeout(currentTimerTimeout);
        currentTimerTimeout = null;
      }
    }
  
    // Schedule timer directly in the service worker
    if (event.data?.type === "SCHEDULE_REST_TIMER") {
      const { restSeconds, workoutId } = event.data;
  
      if (currentTimerTimeout) {
        clearTimeout(currentTimerTimeout);
      }
  
      const timerPromise = new Promise((resolve) => {
        currentTimerTimeout = setTimeout(async () => {
          await self.registration.showNotification("Rest complete!", {
            body: "Time for your next set. Tap to resume workout.",
            tag: "repiq-rest-timer",
            icon: "/icon.png",
            badge: "/icon.png",
            vibrate: [200, 100, 200],
            data: { url: `/workout/${workoutId}` },
          });
          currentTimerTimeout = null;
          resolve();
        }, restSeconds * 1000);
      });
  
      event.waitUntil(timerPromise);
    }
  });