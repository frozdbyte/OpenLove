import { onFlush, pendingSyncOps } from '$lib/sync';
import type { SyncOp } from '$lib/types/sync';

/** Why the outbox can't currently reach the server, for UI messaging. `'online'`
 *  covers both "fully synced" and "not yet tried" — there's nothing to warn
 *  about either way. */
export type Reachability = 'online' | 'client-offline' | 'server-unreachable';

/**
 * Connectivity and outbox state for the UI.
 *
 * `navigator.onLine` is a hint only — it reports `true` behind captive portals —
 * so it drives presentation here but never gates a flush. The authoritative
 * signal is whether a flush actually succeeded, which is why `isSyncing` and
 * `pendingCount` come from the outbox rather than from the connectivity events.
 * `reachability` likewise comes from the last flush attempt's own outcome
 * (`FlushResult.reason`, set in `$lib/sync/core.ts`), not from these events.
 */
class NetworkStore {
	isOnline = $state(true);
	pendingCount = $state(0);
	pendingOps = $state<SyncOp[]>([]);
	isSyncing = $state(false);
	lastSyncedAt = $state<Date | null>(null);
	reachability = $state<Reachability>('online');

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

		onFlush((result) => {
			this.isSyncing = false;
			if (result.flushed > 0) {
				this.lastSyncedAt = new Date();
			}
			// Skipped flushes (nothing queued, or still inside backoff) didn't
			// actually attempt delivery — leave the last known reason as-is rather
			// than optimistically clearing it mid-backoff.
			if (!result.skipped) {
				this.reachability = result.reason ?? 'online';
			}
			void this.refresh();
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
			const ops = await pendingSyncOps();
			this.pendingOps = ops;
			this.pendingCount = ops.length;
		} catch {
			// IndexedDB unavailable (private mode, evicted). Nothing useful to show.
		}
	}

	markSyncing() {
		if (this.pendingCount > 0) this.isSyncing = true;
	}
}

export const networkStore = new NetworkStore();
