import { createStore, get, set, del, update } from 'idb-keyval';
import type { SyncMeta, SyncOp } from '$lib/types/sync';

/**
 * The client outbox.
 *
 * HARD CONSTRAINT: zero DOM and zero Svelte imports. This module is loaded by
 * both the window and the service worker, and `src/service-worker.ts` cannot
 * reach anything that touches `document` (which rules out `profileStore`).
 *
 * Backed by its own IndexedDB database so it is fully isolated from the profile
 * store, and deliberately *not* `workbox-background-sync`: that keeps its queue
 * in an opaque store the window cannot read, which would make both the coalescing
 * rules below and the "N changes pending" UI impossible.
 */

const outboxStore = createStore('openlove-sync', 'outbox');

const OPS_KEY = 'ops';
const META_KEY = 'sync-meta';
const RETRY_KEY = 'retry-state';

/** Give up on an op after this many failed deliveries. */
export const MAX_ATTEMPTS = 8;

interface RetryState {
	/** Epoch ms before which no flush should be attempted. */
	nextAttemptAt: number;
	consecutiveFailures: number;
}

export function newOpId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return `op_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function listOps(): Promise<SyncOp[]> {
	const ops = await get<SyncOp[]>(OPS_KEY, outboxStore);
	return Array.isArray(ops) ? ops : [];
}

export async function countOps(): Promise<number> {
	return (await listOps()).length;
}

/**
 * Append an op. Uses `update()` so the read-modify-write happens inside a single
 * IndexedDB transaction — the window and the service worker both write here.
 */
export async function enqueue(op: SyncOp): Promise<void> {
	await update<SyncOp[]>(
		OPS_KEY,
		(existing) => coalesce([...(existing ?? []), op]),
		outboxStore
	);
}

export async function replaceOps(ops: SyncOp[]): Promise<void> {
	if (ops.length === 0) {
		await del(OPS_KEY, outboxStore);
		return;
	}
	await set(OPS_KEY, ops, outboxStore);
}

export async function removeOps(opIds: string[]): Promise<void> {
	if (opIds.length === 0) return;
	const drop = new Set(opIds);
	await update<SyncOp[]>(
		OPS_KEY,
		(existing) => (existing ?? []).filter((op) => !drop.has(op.opId)),
		outboxStore
	);
}

export async function clearOps(): Promise<void> {
	await del(OPS_KEY, outboxStore);
}

/**
 * Collapse the queue to the smallest equivalent set of ops.
 *
 * - Only the newest `upsert` per endpoint survives.
 * - A `delete` supersedes every earlier op for the same endpoint.
 * - An op for an endpoint that a surviving upsert is migrating away from
 *   (`oldEndpoint`) is dropped, so a queued change to a rotated-away endpoint
 *   cannot resurrect its row after the migration.
 *
 * Without this, nudging the date picker forty times offline becomes forty
 * requests on reconnect.
 */
export function coalesce(ops: SyncOp[]): SyncOp[] {
	const byEndpoint = new Map<string, SyncOp>();

	for (const op of ops) {
		const prev = byEndpoint.get(op.endpoint);
		const attempts = Math.max(prev?.attempts ?? 0, op.attempts ?? 0);

		if (op.kind === 'delete') {
			byEndpoint.set(op.endpoint, { ...op, attempts });
			continue;
		}

		// An upsert queued after a delete means the user re-subscribed; it wins.
		// Carry `oldEndpoint` forward when the newer op does not name one itself,
		// otherwise coalescing would silently discard a pending migration.
		const oldEndpoint =
			op.oldEndpoint ?? (prev?.kind === 'upsert' ? prev.oldEndpoint : undefined);

		byEndpoint.set(op.endpoint, {
			...op,
			...(oldEndpoint ? { oldEndpoint } : {}),
			attempts
		});
	}

	const survivors = [...byEndpoint.values()];
	const migratedAway = new Set(
		survivors
			.filter((op): op is SyncOp & { oldEndpoint: string } =>
				op.kind === 'upsert' && !!op.oldEndpoint && op.oldEndpoint !== op.endpoint
			)
			.map((op) => op.oldEndpoint)
	);

	return survivors.filter((op) => !migratedAway.has(op.endpoint));
}

/* -------------------------------------------------------------------------- */
/* sync-meta                                                                  */
/* -------------------------------------------------------------------------- */

export async function getSyncMeta(): Promise<SyncMeta> {
	return (await get<SyncMeta>(META_KEY, outboxStore)) ?? {};
}

export async function setSyncMeta(patch: Partial<SyncMeta>): Promise<SyncMeta> {
	const next: SyncMeta = {
		...(await getSyncMeta()),
		...patch,
		updatedAt: new Date().toISOString()
	};
	await set(META_KEY, next, outboxStore);
	return next;
}

export async function clearSyncMeta(): Promise<void> {
	await del(META_KEY, outboxStore);
}

/* -------------------------------------------------------------------------- */
/* retry state                                                                */
/* -------------------------------------------------------------------------- */

export async function getRetryState(): Promise<RetryState> {
	return (
		(await get<RetryState>(RETRY_KEY, outboxStore)) ?? {
			nextAttemptAt: 0,
			consecutiveFailures: 0
		}
	);
}

/** Exponential backoff with jitter, capped at ~5 minutes. */
export async function recordFailure(): Promise<RetryState> {
	const prev = await getRetryState();
	const failures = prev.consecutiveFailures + 1;
	const base = Math.min(5 * 60_000, 1000 * 2 ** Math.min(failures, 9));
	const jitter = base * 0.25 * Math.random();
	const next: RetryState = {
		nextAttemptAt: Date.now() + base + jitter,
		consecutiveFailures: failures
	};
	await set(RETRY_KEY, next, outboxStore);
	return next;
}

export async function recordSuccess(): Promise<void> {
	await del(RETRY_KEY, outboxStore);
}
