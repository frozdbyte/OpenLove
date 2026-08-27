import { prisma } from './db';

/**
 * Post-encryption upload size cap for the relay. Roughly a compressed phone
 * photo — large enough to not be annoying, small enough to bound abuse
 * without new infra (this app has no rate limiting anywhere; see
 * IMAGE_SHARING_PLAN.md's Open Items).
 */
export const MAX_SHARED_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB

const DEFAULT_TTL_HOURS = 24;
let warnedAboutTtl = false;

/**
 * Resolve the relay's TTL from `SHARED_IMAGE_TTL_HOURS`, in milliseconds.
 * Read fresh on every call (no caching) — same reasoning as
 * `getFeatureFlags()`: a value changed via `docker-compose` and the
 * container restarted takes effect immediately, both for the next
 * `cleanupExpiredSharedImages()` sweep and for `getSharedImage()`'s own
 * live TTL check.
 */
export function getSharedImageTtlMs(): number {
	const raw = process.env.SHARED_IMAGE_TTL_HOURS;
	if (raw === undefined || raw.trim() === '') {
		return DEFAULT_TTL_HOURS * 60 * 60 * 1000;
	}

	const hours = Number(raw);
	if (!Number.isFinite(hours) || hours <= 0) {
		if (!warnedAboutTtl) {
			warnedAboutTtl = true;
			console.warn(
				`⚠️  SHARED_IMAGE_TTL_HOURS has an invalid value "${raw}" (expected a positive number of hours). Falling back to ${DEFAULT_TTL_HOURS}h.`
			);
		}
		return DEFAULT_TTL_HOURS * 60 * 60 * 1000;
	}
	return hours * 60 * 60 * 1000;
}

export async function saveSharedImage(ciphertext: Buffer): Promise<{ id: string }> {
	// Prisma's generated type wants a `Uint8Array<ArrayBuffer>` specifically;
	// `Buffer`'s underlying buffer is typed `ArrayBufferLike` (could in
	// principle be a `SharedArrayBuffer`), which isn't assignable. `.from()`
	// always allocates a fresh, non-shared buffer.
	const row = await prisma.sharedImage.create({ data: { ciphertext: Uint8Array.from(ciphertext) } });
	return { id: row.id };
}

/**
 * Look up a relayed image and return its bytes if not past its TTL.
 *
 * Does **not** delete on read — unlimited loads within the TTL window, not
 * read-once (see IMAGE_SHARING_PLAN.md's design-decision note on why).
 * Deletion is exclusively `cleanupExpiredSharedImages()`'s job.
 *
 * Checks the TTL itself rather than trusting the row to already be gone:
 * the sweep runs on a fixed hourly cadence, so a row can be past its TTL
 * for up to an hour before the sweep deletes it. Without this check a GET
 * in that window would still serve a technically-expired image.
 */
export async function getSharedImage(id: string): Promise<Buffer | null> {
	const row = await prisma.sharedImage.findUnique({ where: { id } });
	if (!row) return null;

	const ageMs = Date.now() - row.createdAt.getTime();
	if (ageMs > getSharedImageTtlMs()) return null;

	return Buffer.from(row.ciphertext);
}

/**
 * Delete every row past the *current* TTL — a TTL changed at container
 * restart applies to the very next sweep, no data migration needed.
 */
export async function cleanupExpiredSharedImages(): Promise<{ deleted: number }> {
	const cutoff = new Date(Date.now() - getSharedImageTtlMs());
	const result = await prisma.sharedImage.deleteMany({ where: { createdAt: { lt: cutoff } } });
	return { deleted: result.count };
}

let isCleanupRunning = false;
let cleanupIntervalHandle: NodeJS.Timeout | null = null;

/**
 * Start the background TTL sweep running periodically. Mirrors
 * `scheduler.ts`'s `startMilestoneScheduler()` exactly — same
 * `setInterval` + `unref()` shape, same reason: `adapter-node`'s SIGINT/SIGTERM
 * handling never calls `process.exit()`, so anything still holding the
 * event loop open keeps the process alive forever unless cleared on
 * shutdown (see `stopSharedImageCleanup()`, wired into `hooks.server.ts`).
 */
export function startSharedImageCleanup(intervalMs: number = 1000 * 60 * 60): void {
	if (isCleanupRunning) return;
	isCleanupRunning = true;
	console.log('🧹 OpenLove shared-image cleanup started.');

	cleanupExpiredSharedImages().catch((err) =>
		console.error('Initial shared-image cleanup error:', err)
	);

	cleanupIntervalHandle = setInterval(() => {
		cleanupExpiredSharedImages().catch((err) =>
			console.error('Recurring shared-image cleanup error:', err)
		);
	}, intervalMs);

	cleanupIntervalHandle.unref?.();
}

export function stopSharedImageCleanup(): void {
	if (cleanupIntervalHandle) {
		clearInterval(cleanupIntervalHandle);
		cleanupIntervalHandle = null;
	}
	isCleanupRunning = false;
}
