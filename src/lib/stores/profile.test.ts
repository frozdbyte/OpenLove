import { describe, it, expect } from 'vitest';
import { parseSharePayload } from './profile.svelte';

/**
 * Regression coverage for the `normalizeIncomingBond()` extraction (REFACTOR_PLAN.md
 * Medium M2) and `parseSharePayload`'s reuse of `decodeSharePayloadString` (High H4).
 * `parseSharePayload` is the one already-exported entry point that exercises both, so
 * it's tested directly rather than exporting the private `normalizeIncomingBond`
 * helper just for testability.
 *
 * Importing `./profile.svelte` here is safe under Node/vitest: the module's
 * side-effecting `export const profileStore = new ProfileStore()` takes the
 * `typeof window === 'undefined'` branch in its constructor, which touches neither
 * IndexedDB nor the DOM.
 */

describe('parseSharePayload', () => {
	it('decodes a #import= share URL and normalizes a friendship bond (months/days default off "major")', () => {
		const data = {
			version: 2,
			isSingleBond: true,
			bond: {
				names: 'Alex & Sam',
				type: 'friendship',
				togetherSince: '2024-01-01',
				customMilestones: [{ id: 'c1', title: 'Met at camp', date: '2024-02-01' }]
			},
			uiTheme: 'cover',
			colorMode: 'dark'
		};
		const url = `https://example.com/#import=${encodeURIComponent(btoa(JSON.stringify(data)))}`;

		const result = parseSharePayload(url);

		expect(result).not.toBeNull();
		expect(result!.names).toBe('Alex & Sam');
		expect(result!.type).toBe('friendship');
		expect(result!.togetherSince).toBe('2024-01-01');
		expect(result!.customMilestones).toEqual([{ id: 'c1', title: 'Met at camp', date: '2024-02-01' }]);
		// Friendship defaults: months off, days 'major' — unless the payload overrides them.
		expect(result!.milestonePrefs).toEqual({ years: true, months: false, days: 'major', custom: true });
		// uiTheme is bond-less here, so it falls through to the envelope (top-level `data`).
		expect(result!.uiTheme).toBe('cover');
		expect(result!.colorMode).toBe('dark');
		// Neither bond nor envelope set a palette, so it falls to the hardcoded default.
		expect(result!.colorPalette).toBe('rose');
		expect(result!.showSeconds).toBe(true);
	});

	it('lets an explicit partial milestonePrefs override only the fields it sets', () => {
		const data = {
			isSingleBond: true,
			bond: {
				names: 'Emma & Paul',
				type: 'romantic',
				togetherSince: '2020-01-01',
				milestonePrefs: { years: false }
			}
		};
		const result = parseSharePayload(JSON.stringify(data));
		expect(result!.milestonePrefs).toEqual({ years: false, months: true, days: 'all', custom: true });
	});

	it('decodes a bare base64 sync code (no URL wrapper)', () => {
		const data = {
			isSingleBond: true,
			bond: { names: 'Bare Code', type: 'romantic', togetherSince: '2021-06-15' }
		};
		const result = parseSharePayload(btoa(JSON.stringify(data)));
		expect(result!.names).toBe('Bare Code');
	});

	it('decodes raw JSON (V1 legacy shape) and always resolves type to romantic', () => {
		const json = JSON.stringify({
			names: 'Legacy Two',
			togetherSince: '2019-05-05',
			customMilestones: [],
			type: 'friendship' // a stray field V1 never had — must NOT influence the result.
		});
		const result = parseSharePayload(json);
		expect(result!.type).toBe('romantic');
		expect(result!.names).toBe('Legacy Two');
		expect(result!.milestonePrefs).toEqual({ years: true, months: true, days: 'all', custom: true });
	});

	it('returns null for input that decodes but does not match any known shape', () => {
		expect(parseSharePayload(JSON.stringify({ foo: 'bar' }))).toBeNull();
	});

	it('returns null for garbage input', () => {
		expect(parseSharePayload('not json and not valid base64 !!!')).toBeNull();
	});
});
