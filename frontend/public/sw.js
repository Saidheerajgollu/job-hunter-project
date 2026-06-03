// Service Worker for Job Hunter Pro push notifications

self.addEventListener('push', event => {
    const data = event.data?.json() ?? {};
    event.waitUntil(
        self.registration.showNotification(data.title ?? 'New Job Alert', {
            body: data.body ?? '',
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            data: { url: data.url ?? '/' },
            requireInteraction: true,
            actions: [
                { action: 'view', title: 'View Job' },
                { action: 'dismiss', title: 'Dismiss' },
            ],
        })
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    if (event.action === 'dismiss') return;
    const url = event.notification.data?.url ?? '/';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            for (const client of windowClients) {
                if (client.url === url && 'focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow(url);
        })
    );
});
