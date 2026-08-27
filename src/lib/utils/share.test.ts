import { describe, it, expect } from 'vitest';
import { decodeSharePayloadString, detectFullBackup } from './share';

describe('decodeSharePayloadString', () => {
	it('decodes a full share URL containing #import=<uri-encoded-base64-json>', () => {
		const json = JSON.stringify({ names: 'Emma & Paul' });
		const url = `https://example.com/#import=${encodeURIComponent(btoa(json))}`;
		expect(decodeSharePayloadString(url)).toBe(json);
	});

	it('passes raw JSON through unchanged', () => {
		const json = '{"names":"Emma & Paul"}';
		expect(decodeSharePayloadString(json)).toBe(json);
	});

	it('decodes a bare base64 sync code', () => {
		const json = JSON.stringify({ names: 'Emma & Paul' });
		expect(decodeSharePayloadString(btoa(json))).toBe(json);
	});

	it('falls back to the raw string when it is neither a #import= URL, JSON, nor valid base64', () => {
		const garbage = 'not valid base64 !!! ###';
		expect(decodeSharePayloadString(garbage)).toBe(garbage);
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
