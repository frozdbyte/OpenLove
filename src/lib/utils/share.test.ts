import { describe, it, expect } from 'vitest';
import { decodeSharePayloadString, detectFullBackup, buildShareUrl } from './share';

/** Every character a base64url string can contain — nothing outside this
 * set should ever appear in a buildShareUrl() fragment. */
const BASE64URL_SAFE = /^[A-Za-z0-9_-]*$/;

describe('buildShareUrl', () => {
	it('separates #share from the payload with "-", using gzip + base64url', async () => {
		const json = JSON.stringify({ names: 'Emma & Paul' });
		const url = await buildShareUrl('https://example.com', json);
		expect(url).toMatch(/^https:\/\/example\.com\/#share-/);
	});

	it('round-trips through decodeSharePayloadString', async () => {
		const json = JSON.stringify({ names: 'Emma & Paul', togetherSince: '2020-01-01' });
		const url = await buildShareUrl('https://example.com', json);
		expect(await decodeSharePayloadString(url)).toBe(json);
	});

	it('never leaves a "=", "/", "+", or "%" anywhere in the fragment', async () => {
		// Several different payload lengths, deliberately to hit all three
		// base64 padding remainders (0, 1, and 2 trailing "=" in the
		// unencoded form) — every one of them must produce a fully
		// base64url-safe fragment regardless of padding amount.
		for (const names of ['A', 'AB', 'ABC', 'Emma & Paul + Co. / Ltd. = Partners']) {
			const url = await buildShareUrl('https://example.com', JSON.stringify({ names }));
			const fragment = url.split('#share-')[1];
			expect(fragment).toBeTruthy();
			expect(fragment).toMatch(BASE64URL_SAFE);
		}
	});

	it('produces a meaningfully shorter fragment than the pre-gzip encoding for a realistic, repetitive payload', async () => {
		// The actual motivation for gzip: real bond payloads repeat field
		// names (milestonePrefs, colorPalette, togetherSince, ...) per bond,
		// which compresses very well. Compare against the old
		// encodeURIComponent(btoa(...)) scheme directly to prove the win is
		// real, not just "it still works."
		const json = JSON.stringify({
			version: 2,
			isSingleBond: true,
			bond: {
				names: 'Emma & Paul',
				type: 'romantic',
				togetherSince: '2020-01-01',
				customMilestones: [],
				milestonePrefs: { years: true, months: true, days: 'all', custom: true },
				uiTheme: 'modern',
				colorPalette: 'rose',
				colorMode: 'system',
				showSeconds: true
			},
			uiTheme: 'modern',
			colorMode: 'system',
			colorPalette: 'rose',
			showSeconds: true,
			exportedAt: '2026-01-01T00:00:00.000Z'
		});
		const gzipUrl = await buildShareUrl('https://example.com', json);
		const legacyUrl = `https://example.com/#import-${encodeURIComponent(btoa(json))}`;
		expect(gzipUrl.length).toBeLessThan(legacyUrl.length);
	});
});

describe('decodeSharePayloadString', () => {
	it('decodes a full share URL containing #share-<base64url(gzip(json))> (current format)', async () => {
		const json = JSON.stringify({ names: 'Emma & Paul' });
		const url = await buildShareUrl('https://example.com', json);
		expect(await decodeSharePayloadString(url)).toBe(json);
	});

	it('decodes a full share URL containing the legacy #import-<base64url-json> (uncompressed)', async () => {
		const json = JSON.stringify({ names: 'Emma & Paul' });
		const base64url = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
		const url = `https://example.com/#import-${base64url}`;
		expect(await decodeSharePayloadString(url)).toBe(json);
	});

	it('decodes a full share URL containing the older legacy #import/<uri-encoded-base64-json>', async () => {
		const json = JSON.stringify({ names: 'Emma & Paul' });
		const url = `https://example.com/#import/${encodeURIComponent(btoa(json))}`;
		expect(await decodeSharePayloadString(url)).toBe(json);
	});

	it('decodes a full share URL containing the oldest legacy #import=<uri-encoded-base64-json>', async () => {
		// Every one of these separators/encodings was tried and superseded —
		// see buildShareUrl()'s doc comment for the full history. Old links
		// already shared, in any prior shape, must still resolve.
		const json = JSON.stringify({ names: 'Emma & Paul' });
		const url = `https://example.com/#import=${encodeURIComponent(btoa(json))}`;
		expect(await decodeSharePayloadString(url)).toBe(json);
	});

	it('prefers the current #share- form when (hypothetically) more than one marker is present', async () => {
		const json = JSON.stringify({ names: 'Dash Wins' });
		const url = await buildShareUrl('https://example.com', json);
		expect(await decodeSharePayloadString(url)).toBe(json);
	});

	it('passes raw JSON through unchanged', async () => {
		const json = '{"names":"Emma & Paul"}';
		expect(await decodeSharePayloadString(json)).toBe(json);
	});

	it('decodes a bare base64 sync code', async () => {
		const json = JSON.stringify({ names: 'Emma & Paul' });
		expect(await decodeSharePayloadString(btoa(json))).toBe(json);
	});

	it('falls back to the raw string when it is neither a #share/#import URL, JSON, nor valid base64', async () => {
		const garbage = 'not valid base64 !!! ###';
		expect(await decodeSharePayloadString(garbage)).toBe(garbage);
	});
});

describe('detectFullBackup', () => {
	it('detects a full multi-bond backup and reports the bond count', () => {
		const json = JSON.stringify({
			version: 2,
			activeBondId: 'a',
			bonds: [{ id: 'a', names: 'Emma & Paul' }, { id: 'b', names: 'Alex & Sam' }]
		});
		expect(detectFullBackup(json)).toEqual({ bondCount: 2 });
	});

	it('returns null for a single-bond invite (isSingleBond shape)', () => {
		const json = JSON.stringify({
			isSingleBond: true,
			bond: { names: 'Emma & Paul', togetherSince: '2020-01-01' }
		});
		expect(detectFullBackup(json)).toBeNull();
	});

	it('returns null for a V1 legacy single-profile shape', () => {
		const json = JSON.stringify({ names: 'Emma & Paul', togetherSince: '2020-01-01' });
		expect(detectFullBackup(json)).toBeNull();
	});

	it('returns null for version 2 with an empty bonds array', () => {
		const json = JSON.stringify({ version: 2, bonds: [] });
		expect(detectFullBackup(json)).toBeNull();
	});

	it('returns null for version 2 with a missing/non-array bonds field', () => {
		const json = JSON.stringify({ version: 2 });
		expect(detectFullBackup(json)).toBeNull();
	});

	it('returns null for invalid JSON without throwing', () => {
		expect(detectFullBackup('not json at all')).toBeNull();
	});
});
