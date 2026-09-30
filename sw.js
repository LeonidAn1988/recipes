// Service worker только для уведомлений таймеров: через него Android
// показывает уведомления, а касание уведомления возвращает в приложение.
// Обработчика fetch нет намеренно — файлы не кэшируются, и обновления сайта
// приходят как раньше (см. deploy.sh).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const own = list.find(c => c.url.startsWith(self.registration.scope));
    if (own) return own.focus();
    return self.clients.openWindow(self.registration.scope);
  })());
});
