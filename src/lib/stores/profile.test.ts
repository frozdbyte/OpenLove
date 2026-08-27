import { describe, it, expect, beforeEach } from 'vitest';
import { parseSharePayload, profileStore } from './profile.svelte';
import { blobToBase64 } from '$lib/utils/imageBase64';

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

	it('leaves photoBlob/photoUrl unset when the payload has no inline photo', () => {
		const data = { isSingleBond: true, bond: { names: 'No Photo', togetherSince: '2022-01-01' } };
		const result = parseSharePayload(JSON.stringify(data));
		expect(result!.photoBlob).toBeNull();
		expect(result!.photoUrl).toBeUndefined();
	});
});

/**
 * Stage 1 of IMAGE_SHARING_PLAN.md: JSON *file* backups embed each bond's
 * photo inline as base64 (`profileStore.exportBackupJSON()`), decoded back
 * into a `Blob` by the same `normalizeIncomingBond()` helper `importJSON()`
 * already routes every incoming bond shape through. Exercised via the
 * `profileStore` singleton directly (safe under Node/vitest — see the
 * `parseSharePayload` describe block's doc comment above) rather than
 * through the two `.svelte` components that call these methods, since
 * neither component adds any logic of its own beyond awaiting them.
 */
describe('exportBackupJSON / importJSON photo round trip', () => {
	beforeEach(async () => {
		await profileStore.reset();
	});

	it('embeds and restores a photo through a full (all-bonds) file backup', async () => {
		const bytes = new Uint8Array([10, 20, 30, 40, 50]);
		profileStore.state.bonds[0].photoBlob = new Blob([bytes], { type: 'image/png' });

		const json = await profileStore.exportBackupJSON(false);
		const parsed = JSON.parse(json);
		expect(parsed.bonds[0].photo).toEqual({
			dataBase64: await blobToBase64(new Blob([bytes], { type: 'image/png' })),
			mimeType: 'image/png'
		});

		await profileStore.reset();
		expect(profileStore.activeBond.photoBlob).toBeNull();

		expect(await profileStore.importJSON(json)).toBe(true);
		const restored = profileStore.activeBond.photoBlob;
		expect(restored).not.toBeNull();
		expect(restored!.type).toBe('image/png');
		expect(Array.from(new Uint8Array(await restored!.arrayBuffer()))).toEqual(Array.from(bytes));
	});

	it('embeds and restores a photo through a single-bond file backup (isSingleBond shape)', async () => {
		const bytes = new Uint8Array([1, 2, 3]);
		profileStore.state.bonds[0].photoBlob = new Blob([bytes], { type: 'image/webp' });

		const json = await profileStore.exportBackupJSON(true);
		const parsed = JSON.parse(json);
		expect(parsed.bond.photo.mimeType).toBe('image/webp');

		await profileStore.reset();

		// mode: 'replace' is the branch that previously dropped photoBlob/photoUrl
		// entirely (see the fix in importJSON's Case 2) — exercise it directly
		// rather than 'auto', which would mask the bug via its own bonds=[newBond]
		// assignment.
		expect(await profileStore.importJSON(json, 'replace')).toBe(true);
		const restored = profileStore.activeBond.photoBlob;
		expect(restored).not.toBeNull();
		expect(restored!.type).toBe('image/webp');
		expect(Array.from(new Uint8Array(await restored!.arrayBuffer()))).toEqual(Array.from(bytes));
	});

	it('imports a backup with no photo field cleanly, without throwing', async () => {
		const json = await profileStore.exportBackupJSON(false);
		expect(JSON.parse(json).bonds[0].photo).toBeUndefined();

		expect(await profileStore.importJSON(json)).toBe(true);
		expect(profileStore.activeBond.photoBlob).toBeNull();
	});
});
