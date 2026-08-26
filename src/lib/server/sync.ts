import { prisma } from './db';
import type { SyncBondItem, SyncOp, SyncOpResult, SyncUpsertOp } from '$lib/types/sync';

/**
 * Server side of the subscription sync protocol.
 *
 * Sync is one-directional: the client owns `bonds`, `timezone` and the
 * push keys; the server owns only `lastNotified`. So there is nothing to merge —
 * each op is applied idempotently, guarded by last-write-wins on the client clock.
 *
 * No dedup table is needed. `upsert` is keyed on the unique `endpoint` and so is
 * idempotent by construction, and `delete` is idempotent. `opId` exists purely so
 * the client can correlate results back to its outbox.
 */

const MAX_OPS_PER_REQUEST = 100;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class SyncRequestError extends Error {}

/** Reject anything malformed up front so a bad op cannot be retried forever. */
export function parseOps(body: unknown): SyncOp[] {
	const ops = (body as { ops?: unknown })?.ops;
	if (!Array.isArray(ops)) {
		throw new SyncRequestError('Expected body { ops: SyncOp[] }');
	}
	if (ops.length === 0) {
		throw new SyncRequestError('No ops supplied');
	}
	if (ops.length > MAX_OPS_PER_REQUEST) {
		throw new SyncRequestError(`Too many ops (max ${MAX_OPS_PER_REQUEST})`);
	}
	return ops.map(parseOp);
}

function parseOp(raw: unknown): SyncOp {
	const op = raw as Partial<Omit<SyncUpsertOp, 'kind'>> & { kind?: string };

	if (typeof op?.opId !== 'string' || !op.opId) {
		throw new SyncRequestError('Op is missing opId');
	}
	if (typeof op.endpoint !== 'string' || !op.endpoint) {
		throw new SyncRequestError(`Op ${op.opId} is missing endpoint`);
	}
	if (typeof op.clientUpdatedAt !== 'string' || !ISO_RE.test(op.clientUpdatedAt)) {
		throw new SyncRequestError(`Op ${op.opId} has a non-ISO-8601 clientUpdatedAt`);
	}

	if (op.kind === 'delete') {
		return {
			opId: op.opId,
			kind: 'delete',
			endpoint: op.endpoint,
			clientUpdatedAt: op.clientUpdatedAt
		};
	}

	if (op.kind !== 'upsert') {
		throw new SyncRequestError(`Op ${op.opId} has unknown kind "${op.kind}"`);
	}
	if (typeof op.keys?.p256dh !== 'string' || typeof op.keys?.auth !== 'string') {
		throw new SyncRequestError(`Op ${op.opId} is missing push keys`);
	}

	let bonds: SyncBondItem[] = [];
	if (Array.isArray(op.bonds)) {
		bonds = op.bonds.map((b, idx) => {
			if (typeof b?.bondId !== 'string' || !b.bondId) {
				throw new SyncRequestError(`Op ${op.opId} bond at index ${idx} is missing bondId`);
			}
			if (typeof b?.togetherSince !== 'string' || !DATE_RE.test(b.togetherSince)) {
				throw new SyncRequestError(`Op ${op.opId} bond ${b.bondId} has an invalid togetherSince`);
			}
			const categories = Array.isArray(b.categories)
				? b.categories.filter((c: unknown) => typeof c === 'string')
				: ['years', 'months', 'days_all', 'custom'];
			return {
				bondId: b.bondId,
				togetherSince: b.togetherSince,
				categories
			};
		});
	} else if (typeof op.togetherSince === 'string' && DATE_RE.test(op.togetherSince)) {
		bonds = [
			{
				bondId: 'primary_bond',
				togetherSince: op.togetherSince,
				categories: ['years', 'months', 'days_all', 'custom']
			}
		];
	}

	return {
		opId: op.opId,
		kind: 'upsert',
		endpoint: op.endpoint,
		clientUpdatedAt: op.clientUpdatedAt,
		keys: { p256dh: op.keys.p256dh, auth: op.keys.auth },
		bonds,
		togetherSince: bonds[0]?.togetherSince,
		timezone: typeof op.timezone === 'string' && op.timezone ? op.timezone : 'UTC',
		...(typeof op.oldEndpoint === 'string' && op.oldEndpoint
			? { oldEndpoint: op.oldEndpoint }
			: {})
	};
}

export async function applySyncOps(ops: SyncOp[]): Promise<SyncOpResult[]> {
	const results: SyncOpResult[] = [];

	for (const op of ops) {
		try {
			results.push(op.kind === 'upsert' ? await applyUpsert(op) : await applyDelete(op));
		} catch (error: any) {
			console.error(`Error applying sync op ${op.opId} (${op.kind}):`, error);
			results.push({
				opId: op.opId,
				status: 'error',
				message: 'Server error while applying op'
			});
		}
	}

	return results;
}

async function applyUpsert(op: SyncUpsertOp): Promise<SyncOpResult> {
	const data = {
		p256dh: op.keys.p256dh,
		auth: op.keys.auth,
		togetherSince: op.togetherSince || null,
		timezone: op.timezone,
		clientUpdatedAt: op.clientUpdatedAt
	};


	// Endpoint rotation: migrate the existing row rather than delete-then-create, so
	// `lastNotified` survives. Losing it on a milestone day would send a duplicate.
	if (op.oldEndpoint && op.oldEndpoint !== op.endpoint) {
		const migrated = await prisma.$transaction(async (tx) => {
			const previous = await tx.pushSubscription.findUnique({
				where: { endpoint: op.oldEndpoint }
			});
			if (!previous) return false;

			if (op.clientUpdatedAt < previous.clientUpdatedAt) {
				return 'stale' as const;
			}

			// Clear conflicting endpoint if any
			await tx.pushSubscription.deleteMany({
				where: { endpoint: op.endpoint, NOT: { id: previous.id } }
			});
			await tx.pushSubscription.update({
				where: { id: previous.id },
				data: { endpoint: op.endpoint, ...data }
			});

			await syncSubscriptionBonds(tx, previous.id, op.bonds);
			return true;
		});

		if (migrated === 'stale') return { opId: op.opId, status: 'stale' };
		if (migrated) return { opId: op.opId, status: 'applied' };
	}

	const existing = await prisma.pushSubscription.findUnique({
		where: { endpoint: op.endpoint }
	});

	if (existing) {
		if (op.clientUpdatedAt < existing.clientUpdatedAt) {
			return { opId: op.opId, status: 'stale' };
		}
		await prisma.$transaction(async (tx) => {
			await tx.pushSubscription.update({ where: { id: existing.id }, data });
			await syncSubscriptionBonds(tx, existing.id, op.bonds);
		});
		return { opId: op.opId, status: 'applied' };
	}

	await prisma.$transaction(async (tx) => {
		const created = await tx.pushSubscription.create({
			data: { endpoint: op.endpoint, ...data }
		});
		await syncSubscriptionBonds(tx, created.id, op.bonds);
	});
	return { opId: op.opId, status: 'applied' };
}

/**
 * Synchronize SubscriptionBond relational records for a subscription within a transaction.
 */
async function syncSubscriptionBonds(
	tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
	subscriptionId: string,
	bonds: SyncBondItem[]
) {
	const incomingBondIds = bonds.map((b) => b.bondId);

	// 1. Delete removed bonds
	await tx.subscriptionBond.deleteMany({
		where: {
			subscriptionId,
			bondId: { notIn: incomingBondIds }
		}
	});

	// 2. Upsert incoming bonds
	for (const bond of bonds) {
		const categoriesStr = Array.isArray(bond.categories)
			? bond.categories.join(',')
			: 'years,months,days_all,custom';

		const existing = await tx.subscriptionBond.findUnique({
			where: {
				subscriptionId_bondId: {
					subscriptionId,
					bondId: bond.bondId
				}
			}
		});

		if (existing) {
			await tx.subscriptionBond.update({
				where: { id: existing.id },
				data: {
					togetherSince: bond.togetherSince,
					categories: categoriesStr
				}
			});
		} else {
			await tx.subscriptionBond.create({
				data: {
					subscriptionId,
					bondId: bond.bondId,
					togetherSince: bond.togetherSince,
					categories: categoriesStr
				}
			});
		}
	}
}

async function applyDelete(op: SyncOp): Promise<SyncOpResult> {
	const existing = await prisma.pushSubscription.findUnique({
		where: { endpoint: op.endpoint }
	});

	// Already gone: deletes are idempotent.
	if (!existing) return { opId: op.opId, status: 'applied' };

	// A delete queued before a newer re-subscribe must not win.
	if (op.clientUpdatedAt < existing.clientUpdatedAt) {
		return { opId: op.opId, status: 'stale' };
	}

	// Deleting PushSubscription cascades and deletes all SubscriptionBonds
	await prisma.pushSubscription.delete({ where: { id: existing.id } });
	return { opId: op.opId, status: 'applied' };
}
