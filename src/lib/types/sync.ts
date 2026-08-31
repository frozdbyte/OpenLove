/**
 * Wire + outbox types for client -> server subscription sync.
 *
 * Sync is strictly one-directional: the client is the sole authority for
 * `togetherSince`, `timezone` and the push keys, and the server owns exactly one
 * field the client never reads (`lastNotified`). So there is no pull phase, no
 * merge and no conflict resolution — just an at-least-once outbox against
 * idempotent, last-write-wins server handlers.
 *
 * This module must stay free of DOM and Svelte imports: it is loaded by the
 * service worker as well as the window.
 */

export interface SyncKeys {
	p256dh: string;
	auth: string;
}

export interface SyncBondItem {
	bondId: string;
	togetherSince: string;
	categories: string[]; // e.g. ["years", "months", "days_all", "custom"]
}

interface SyncOpBase {
	/** Client-generated id. Used for coalescing and log correlation only. */
	opId: string;
	/** ISO-8601 on the client clock. Drives last-write-wins on the server. */
	clientUpdatedAt: string;
	/** Push endpoint this op applies to. Also the server's primary key. */
	endpoint: string;
	/** Delivery attempts so far. Used for backoff and permanent-failure detection. */
	attempts?: number;
}

export interface SyncUpsertOp extends SyncOpBase {
	kind: 'upsert';
	keys: SyncKeys;
	bonds: SyncBondItem[];
	/** Legacy single-date fallback for older servers/clients during rolling upgrades */
	togetherSince?: string;
	timezone: string;
	/**
	 * Set when the push service rotated our endpoint. The server migrates the
	 * existing row instead of delete-then-create, so `lastNotified` survives and
	 * a rotation on a milestone day cannot produce a duplicate notification.
	 */
	oldEndpoint?: string;
}

export interface SyncDeleteOp extends SyncOpBase {
	kind: 'delete';
}

export type SyncOp = SyncUpsertOp | SyncDeleteOp;

export type SyncOpStatus = 'applied' | 'stale' | 'error';

export interface SyncOpResult {
	opId: string;
	status: SyncOpStatus;
	/** Set on 'error' when retrying can never succeed. */
	permanent?: boolean;
	message?: string;
}

export interface SyncResponse {
	results: SyncOpResult[];
}

/**
 * Everything the service worker needs to rebuild a subscription without touching
 * `profileStore` (which touches `document` and can never be imported into a SW).
 * Written by the window after every successful sync.
 */
export interface SyncMeta {
	vapidPublicKey?: string;
	endpoint?: string;
	bonds?: SyncBondItem[];
	togetherSince?: string;
	timezone?: string;
	updatedAt?: string;
}

export type SyncFailureReason = 'client-offline' | 'server-unreachable';

export interface FlushResult {
	flushed: number;
	failed: number;
	dropped: number;
	/** True when the flush was a no-op: nothing queued, or still inside backoff. */
	skipped: boolean;
	/** Set when `failed > 0` — why delivery failed, for UI messaging. */
	reason?: SyncFailureReason;
}

