/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener('install', (event) => {
	sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(sw.clients.claim());
});

/**
 * Handle incoming Web Push events
 */
sw.addEventListener('push', (event) => {
	if (!event.data) return;

	let payload = {
		title: 'OpenLove Milestone! ❤️',
		body: 'Today is a special milestone in your relationship!',
		type: 'milestone',
		milestoneId: 'milestone'
	};

	try {
		payload = event.data.json();
	} catch {
		payload.body = event.data.text();
	}

	const options: NotificationOptions = {
		body: payload.body,
		icon: '/icon-192.png',
		badge: '/icon-192.png',
		tag: payload.milestoneId || 'openlove-milestone',
		renotify: true,
		data: {
			url: '/',
			type: payload.type
		}
	};

	event.waitUntil(sw.registration.showNotification(payload.title, options));
});

/**
 * Handle notification clicks
 */
sw.addEventListener('notificationclick', (event) => {
	event.notification.close();

	event.waitUntil(
		sw.clients
			.matchAll({ type: 'window', includeUncontrolled: true })
			.then((clientList) => {
				for (const client of clientList) {
					if (client.url && 'focus' in client) {
						return client.focus();
					}
				}
				if (sw.clients.openWindow) {
					return sw.clients.openWindow('/');
				}
			})
	);
});
