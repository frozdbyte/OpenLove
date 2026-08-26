import { onFlush, pendingSyncCount } from '$lib/sync';

/**
 * Connectivity and outbox state for the UI.
 *
 * `navigator.onLine` is a hint only — it reports `true` behind captive portals —
 * so it drives presentation here but never gates a flush. The authoritative
 * signal is whether a flush actually succeeded, which is why `isSyncing` and
 * `pendingCount` come from the outbox rather than from the connectivity events.
 */
class NetworkStore {
	isOnline = $state(true);
	pendingCount = $state(0);
	isSyncing = $state(false);
	lastSyncedAt = $state<Date | null>(null);

	private initialized = false;

	init() {
		if (typeof window === 'undefined' || this.initialized) return;
		this.initialized = true;

		this.isOnline = navigator.onLine !== false;

		window.addEventListener('online', () => {
			this.isOnline = true;
			this.isSyncing = true;
		});
		window.addEventListener('offline', () => {
			this.isOnline = false;
			this.isSyncing = false;
		});

		onFlush((result, pending) => {
			this.pendingCount = pending;
			this.isSyncing = false;
			if (result.flushed > 0) {
				this.lastSyncedAt = new Date();
			}
		});

		// The service worker flushes too (on `push`, `sync`, `periodicsync`), so keep
		// the indicator honest when the work happened outside this page.
		navigator.serviceWorker?.addEventListener('message', (event) => {
			if ((event.data as { type?: string } | undefined)?.type !== 'OPENLOVE_SYNC_FLUSHED') {
				return;
			}
			void this.refresh();
		});

		void this.refresh();
	}

	async refresh() {
		try {
			this.pendingCount = await pendingSyncCount();
		} catch {
			// IndexedDB unavailable (private mode, evicted). Nothing useful to show.
		}
	}

	markSyncing() {
		if (this.pendingCount > 0) this.isSyncing = true;
	}
}

export const networkStore = new NetworkStore();
