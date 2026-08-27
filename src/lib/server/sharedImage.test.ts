import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Mirrors `scheduler.test.ts`'s `vi.hoisted` + in-memory-fake-Prisma pattern —
 * exercises real TTL/cleanup logic without a database.
 */
const { prismaMock, seedImages, getImages } = vi.hoisted(() => {
	interface Row {
		id: string;
		ciphertext: Uint8Array;
		createdAt: Date;
	}
	let images: Row[] = [];
	let nextId = 1;

	const prismaMock = {
		sharedImage: {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			async create({ data }: any) {
				const row: Row = { id: `img-${nextId++}`, ciphertext: data.ciphertext, createdAt: new Date() };
				images.push(row);
				return row;
			},
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			async findUnique({ where }: any) {
				return images.find((i) => i.id === where.id) ?? null;
			},
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			async deleteMany({ where }: any) {
				const cutoff: Date = where.createdAt.lt;
				const before = images.length;
				images = images.filter((i) => i.createdAt >= cutoff);
				return { count: before - images.length };
			}
		}
	};

	function seedImages(rows: Row[]) {
		images = rows;
	}
	function getImages() {
		return images;
	}

	return { prismaMock, seedImages, getImages };
});

vi.mock('./db', () => ({ prisma: prismaMock }));

// `vi.mock`/`vi.hoisted` above are hoisted above this import by vitest's transform.
import { saveSharedImage, getSharedImage, cleanupExpiredSharedImages, getSharedImageTtlMs } from './sharedImage';

describe('getSharedImageTtlMs', () => {
	const original = process.env.SHARED_IMAGE_TTL_HOURS;
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		if (original === undefined) delete process.env.SHARED_IMAGE_TTL_HOURS;
		else process.env.SHARED_IMAGE_TTL_HOURS = original;
		warnSpy.mockRestore();
	});

	it('defaults to 24h when unset', () => {
		delete process.env.SHARED_IMAGE_TTL_HOURS;
		expect(getSharedImageTtlMs()).toBe(24 * 60 * 60 * 1000);
	});

	it('respects a valid positive value', () => {
		process.env.SHARED_IMAGE_TTL_HOURS = '2';
		expect(getSharedImageTtlMs()).toBe(2 * 60 * 60 * 1000);
	});

	it('falls back to the default (not a crash) on zero, negative, or non-numeric values, warning once', () => {
		process.env.SHARED_IMAGE_TTL_HOURS = '0';
		expect(getSharedImageTtlMs()).toBe(24 * 60 * 60 * 1000);
		expect(warnSpy).toHaveBeenCalledTimes(1);

		process.env.SHARED_IMAGE_TTL_HOURS = '-5';
		expect(getSharedImageTtlMs()).toBe(24 * 60 * 60 * 1000);

		process.env.SHARED_IMAGE_TTL_HOURS = 'not a number';
		expect(getSharedImageTtlMs()).toBe(24 * 60 * 60 * 1000);
	});
});

describe('saveSharedImage / getSharedImage / cleanupExpiredSharedImages', () => {
	beforeEach(() => {
		seedImages([]);
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
		delete process.env.SHARED_IMAGE_TTL_HOURS; // default 24h unless a test overrides it
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('round-trips ciphertext bytes through save and get', async () => {
		const bytes = Buffer.from([1, 2, 3, 4, 5]);
		const { id } = await saveSharedImage(bytes);

		const result = await getSharedImage(id);
		expect(result).not.toBeNull();
		expect(Array.from(result!)).toEqual([1, 2, 3, 4, 5]);
	});

	it('returns null for a nonexistent id', async () => {
		expect(await getSharedImage('does-not-exist')).toBeNull();
	});

	it('serves the same image on repeated GETs — unlimited loads, not read-once', async () => {
		const { id } = await saveSharedImage(Buffer.from([9, 9, 9]));

		const first = await getSharedImage(id);
		const second = await getSharedImage(id);

		expect(first).not.toBeNull();
		expect(second).not.toBeNull();
		expect(Array.from(first!)).toEqual(Array.from(second!));
		// Still present in the backing store — a GET must never delete it.
		expect(getImages().find((r) => r.id === id)).toBeDefined();
	});

	it('treats a row past the current TTL as expired even before any sweep has run', async () => {
		const { id } = await saveSharedImage(Buffer.from([1]));

		// Default TTL is 24h — jump 25h forward without running cleanup.
		vi.setSystemTime(new Date('2026-01-02T01:00:00.000Z'));

		expect(await getSharedImage(id)).toBeNull();
		// The row itself is untouched — expiry is a read-time check, not a delete.
		expect(getImages().find((r) => r.id === id)).toBeDefined();
	});

	it('respects a non-default SHARED_IMAGE_TTL_HOURS for the expiry check', async () => {
		process.env.SHARED_IMAGE_TTL_HOURS = '1';
		const { id } = await saveSharedImage(Buffer.from([1]));

		vi.setSystemTime(new Date('2026-01-01T00:30:00.000Z')); // 30 min later
		expect(await getSharedImage(id)).not.toBeNull();

		vi.setSystemTime(new Date('2026-01-01T01:30:00.000Z')); // 90 min later
		expect(await getSharedImage(id)).toBeNull();
	});

	it('cleanupExpiredSharedImages deletes only rows past the TTL, keeping newer ones', async () => {
		const { id: oldId } = await saveSharedImage(Buffer.from([1]));
		vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
		const { id: newId } = await saveSharedImage(Buffer.from([2]));

		vi.setSystemTime(new Date('2026-01-02T01:00:00.000Z')); // 25h after oldId, 13h after newId

		const { deleted } = await cleanupExpiredSharedImages();

		expect(deleted).toBe(1);
		expect(getImages().map((r) => r.id)).toEqual([newId]);
		expect(oldId).not.toBe(newId);
	});

	it('cleanup uses the current SHARED_IMAGE_TTL_HOURS value, not the one active when the row was saved', async () => {
		const { id } = await saveSharedImage(Buffer.from([1]));

		vi.setSystemTime(new Date('2026-01-01T02:00:00.000Z')); // 2h later
		process.env.SHARED_IMAGE_TTL_HOURS = '1'; // shortened at "container restart"

		const { deleted } = await cleanupExpiredSharedImages();
		expect(deleted).toBe(1);
		expect(getImages().find((r) => r.id === id)).toBeUndefined();
	});
});
