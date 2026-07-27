/**
 * Mounaqasat service worker — push notifications only.
 *
 * Deliberately NOT a caching/offline worker: a stale cached tender list on an
 * alerting product is actively harmful (a supplier could act on a deadline that
 * has already moved). Freshness beats offline here, so nothing is cached.
 */

self.addEventListener('install', (event) => {
  // Take over immediately rather than waiting for every tab to close.
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'Mounaqasat', body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || 'Mounaqasat'
  const options = {
    body: payload.body || '',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    // A tag collapses repeat alerts for the same watchlist instead of stacking.
    tag: payload.tag || 'mounaqasat',
    renotify: true,
    data: { url: payload.url || '/app/notifications' },
    dir: 'auto',
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/app/notifications'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Reuse an existing tab when one is already open on this origin.
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(target)
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
