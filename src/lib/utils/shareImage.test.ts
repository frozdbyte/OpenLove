import { afterEach, describe, expect, it, vi } from 'vitest';
import { uploadSharedImage, fetchSharedImage } from './shareImage';
import { featureFlags } from '$lib/stores/featureFlags.svelte';

describe('uploadSharedImage', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		featureFlags.flags.shareImages = true; // restore the default between tests
	});

	it('returns null without attempting a network call when the flag is off', async () => {
		featureFlags.flags.shareImages = false;
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);

		const result = await uploadSharedImage(new Blob([new Uint8Array([1, 2, 3])]));

		expect(result).toBeNull();
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('returns {shareId, key, iv, mimeType} on a successful upload, mimeType from the source Blob', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ shareId: 'abc-123' }), { status: 200 }))
		);

		const result = await uploadSharedImage(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }));

		expect(result).not.toBeNull();
		expect(result!.shareId).toBe('abc-123');
		expect(typeof result!.key).toBe('string');
		expect(typeof result!.iv).toBe('string');
		expect(result!.mimeType).toBe('image/png');
	});

	it('falls back to image/jpeg when the source Blob has no type', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ shareId: 'abc-123' }), { status: 200 }))
		);
		const result = await uploadSharedImage(new Blob([new Uint8Array([1])]));
		expect(result!.mimeType).toBe('image/jpeg');
	});

	it('fails soft (null) on a non-ok response (e.g. the 413 size-cap rejection)', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ error: 'too big' }), { status: 413 }))
		);
		expect(await uploadSharedImage(new Blob([new Uint8Array([1])]))).toBeNull();
	});

	it('fails soft (null) on a network error', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('network down');
			})
		);
		expect(await uploadSharedImage(new Blob([new Uint8Array([1])]))).toBeNull();
	});

	it('fails soft (null) on a malformed response body', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ oops: true }), { status: 200 })));
		expect(await uploadSharedImage(new Blob([new Uint8Array([1])]))).toBeNull();
	});
});

describe('fetchSharedImage', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('fails soft (null) on a 404 (expired or never existed)', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'gone' }), { status: 404 })));
		expect(await fetchSharedImage('some-id', 'a2V5', 'aXY=', 'image/png')).toBeNull();
	});

	it('fails soft (null) on a network error', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('offline');
			})
		);
		expect(await fetchSharedImage('some-id', 'a2V5', 'aXY=', 'image/png')).toBeNull();
	});

	it('fails soft (null) when decryption fails (wrong/corrupt key)', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ ciphertext: btoa('not real ciphertext') }), { status: 200 }))
		);
		expect(await fetchSharedImage('some-id', 'a2V5', 'aXY=', 'image/png')).toBeNull();
	});
});

describe('uploadSharedImage -> fetchSharedImage, full client pipeline', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('round-trips a real encrypted blob through both functions against an in-memory fake relay', async () => {
		const store = new Map<string, string>();
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string | URL, init?: RequestInit) => {
				if (init?.method === 'POST') {
					const { ciphertext } = JSON.parse(init.body as string);
					const id = 'fake-share-id';
					store.set(id, ciphertext);
					return new Response(JSON.stringify({ shareId: id }), { status: 200 });
				}
				const id = String(url).split('/').pop()!;
				const ciphertext = store.get(id);
				if (!ciphertext) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
				return new Response(JSON.stringify({ ciphertext }), { status: 200 });
			})
		);

		const bytes = new Uint8Array([10, 20, 30, 40, 50]);
		const blob = new Blob([bytes], { type: 'image/webp' });

		const uploaded = await uploadSharedImage(blob);
		expect(uploaded).not.toBeNull();
		expect(uploaded!.mimeType).toBe('image/webp');

		const fetched = await fetchSharedImage(uploaded!.shareId, uploaded!.key, uploaded!.iv, uploaded!.mimeType);
		expect(fetched).not.toBeNull();
		expect(fetched!.type).toBe('image/webp');
		expect(Array.from(new Uint8Array(await fetched!.arrayBuffer()))).toEqual(Array.from(bytes));
	});
});
