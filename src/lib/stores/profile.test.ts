import { describe, it, expect, beforeEach, vi } from 'vitest';
import { blobToBase64 } from '$lib/utils/imageBase64';

/**
 * `profile.svelte.ts` imports `fetchSharedImage` from `$lib/utils/shareImage`
 * for Stage 5's relay-photo attachment. Mocked here so these tests exercise
 * `importJSON()`'s own wiring (does it recognize `sharedImage`, guard a
 * malformed one, prefer an inline `photo` if somehow both are present, never
 * touch it during preview) in isolation from `shareImage.ts`'s own
 * correctness, which already has its own full-coverage tests (Stage 4) plus
 * a live real-crypto/real-server check.
 */
const { fetchSharedImageMock } = vi.hoisted(() => ({ fetchSharedImageMock: vi.fn() }));
vi.mock('$lib/utils/shareImage', () => ({ fetchSharedImage: fetchSharedImageMock }));

// `vi.mock`/`vi.hoisted` above are hoisted above this import by vitest's transform.
import { parseSharePayload, profileStore } from './profile.svelte';

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

/**
 * Stage 5 of IMAGE_SHARING_PLAN.md: `exportJSON()`'s optional `sharedImage`
 * param and `importJSON()`'s Case 2 attaching a relay-fetched photo. Unlike
 * the Stage 1 tests above, `photo` (inline base64) is never involved here —
 * `sharedImage` is the compact QR/link/sync-code payload's own mechanism.
 */
describe('exportJSON sharedImage param / importJSON relay-photo attachment', () => {
	const ref = { shareId: 'share-1', key: 'a2V5', iv: 'aXY=', mimeType: 'image/png' };

	beforeEach(async () => {
		await profileStore.reset();
		fetchSharedImageMock.mockReset();
	});

	it('exportJSON embeds sharedImage on the single-bond payload only when both activeOnly and a ref are given', () => {
		const withRef = JSON.parse(profileStore.exportJSON(true, ref));
		expect(withRef.bond.sharedImage).toEqual(ref);

		const withoutRef = JSON.parse(profileStore.exportJSON(true));
		expect(withoutRef.bond.sharedImage).toBeUndefined();

		// activeOnly=false (full backup) has no single `bond` to attach it to —
		// a ref passed here is simply ignored, not an error.
		const fullBackup = JSON.parse(profileStore.exportJSON(false, ref));
		expect(fullBackup.bond).toBeUndefined();
		expect(fullBackup.sharedImage).toBeUndefined();
	});

	it('parseSharePayload never calls fetchSharedImage, even when sharedImage is present (preview must not fetch)', () => {
		const data = { isSingleBond: true, bond: { names: 'Preview Only', togetherSince: '2023-01-01', sharedImage: ref } };
		const result = parseSharePayload(JSON.stringify(data));

		expect(result!.names).toBe('Preview Only');
		expect(fetchSharedImageMock).not.toHaveBeenCalled();
	});

	it('importJSON fetches the relay photo (with the right args) when sharedImage is present', async () => {
		// Actually persisting the fetched Blob goes through setPhoto() ->
		// saveBondPhoto(), which is window-guarded (needs real IndexedDB) and
		// no-ops under Node/vitest — that last step is covered by a live
		// two-browser-context check instead (see IMAGE_SHARING_PLAN.md, Stage
		// 5's manual verification). What's unit-testable here, and what this
		// asserts, is that importJSON recognizes `sharedImage` and dispatches
		// to fetchSharedImage with the exact values from the payload.
		const photoBytes = new Uint8Array([1, 2, 3]);
		fetchSharedImageMock.mockResolvedValue(new Blob([photoBytes], { type: 'image/png' }));

		const data = { isSingleBond: true, bond: { names: 'Relay Photo', togetherSince: '2023-01-01', sharedImage: ref } };
		expect(await profileStore.importJSON(JSON.stringify(data), 'replace')).toBe(true);

		expect(fetchSharedImageMock).toHaveBeenCalledOnce();
		expect(fetchSharedImageMock).toHaveBeenCalledWith('share-1', 'a2V5', 'aXY=', 'image/png');
		expect(profileStore.activeBond.names).toBe('Relay Photo');
	});

	it('fails soft: an expired/failed relay fetch (null) still lets the import succeed, just without a photo', async () => {
		fetchSharedImageMock.mockResolvedValue(null);

		const data = { isSingleBond: true, bond: { names: 'Expired Photo', togetherSince: '2023-01-01', sharedImage: ref } };
		expect(await profileStore.importJSON(JSON.stringify(data), 'replace')).toBe(true);

		expect(profileStore.activeBond.names).toBe('Expired Photo');
		expect(profileStore.activeBond.photoBlob).toBeNull();
	});

	it('fails soft: fetchSharedImage throwing does not fail the whole import', async () => {
		fetchSharedImageMock.mockRejectedValue(new Error('network exploded'));

		const data = { isSingleBond: true, bond: { names: 'Throws', togetherSince: '2023-01-01', sharedImage: ref } };
		expect(await profileStore.importJSON(JSON.stringify(data), 'replace')).toBe(true);
		expect(profileStore.activeBond.names).toBe('Throws');
	});

	it('never calls fetchSharedImage for a malformed sharedImage (missing key/iv)', async () => {
		const data = {
			isSingleBond: true,
			bond: { names: 'Malformed', togetherSince: '2023-01-01', sharedImage: { shareId: 'only-this' } }
		};
		expect(await profileStore.importJSON(JSON.stringify(data), 'replace')).toBe(true);
		expect(fetchSharedImageMock).not.toHaveBeenCalled();
	});

	it('never calls fetchSharedImage when no sharedImage field is present at all', async () => {
		const data = { isSingleBond: true, bond: { names: 'No Field', togetherSince: '2023-01-01' } };
		expect(await profileStore.importJSON(JSON.stringify(data), 'replace')).toBe(true);
		expect(fetchSharedImageMock).not.toHaveBeenCalled();
	});

	it('prefers an inline photo over sharedImage if a payload somehow carries both', async () => {
		const inlineBytes = new Uint8Array([9, 9, 9]);
		const data = {
			isSingleBond: true,
			bond: {
				names: 'Both Fields',
				togetherSince: '2023-01-01',
				photo: { dataBase64: await blobToBase64(new Blob([inlineBytes])), mimeType: 'image/gif' },
				sharedImage: ref
			}
		};
		expect(await profileStore.importJSON(JSON.stringify(data), 'replace')).toBe(true);

		expect(fetchSharedImageMock).not.toHaveBeenCalled();
		const photo = profileStore.activeBond.photoBlob;
		expect(photo!.type).toBe('image/gif');
		expect(Array.from(new Uint8Array(await photo!.arrayBuffer()))).toEqual(Array.from(inlineBytes));
	});

	it('targets the correct bond id under mode "add" (a second bond, not the active one)', async () => {
		// Same reasoning as the previous test on why this checks the
		// dispatch (which bond id setPhoto() is called with) rather than the
		// window-guarded persistence itself.
		const photoBytes = new Uint8Array([5, 5, 5]);
		fetchSharedImageMock.mockResolvedValue(new Blob([photoBytes], { type: 'image/png' }));
		const setPhotoSpy = vi.spyOn(profileStore, 'setPhoto');

		// First, configure an initial bond so mode:'add' actually adds rather
		// than auto-replacing the unconfigured default.
		await profileStore.importJSON(
			JSON.stringify({ isSingleBond: true, bond: { names: 'First Bond', togetherSince: '2020-01-01' } }),
			'replace'
		);
		await profileStore.update({ isConfigured: true });

		const data = { isSingleBond: true, bond: { names: 'Second Bond', togetherSince: '2023-01-01', sharedImage: ref } };
		expect(await profileStore.importJSON(JSON.stringify(data), 'add')).toBe(true);

		const firstBond = profileStore.state.bonds.find((b) => b.names === 'First Bond');
		const secondBond = profileStore.state.bonds.find((b) => b.names === 'Second Bond');
		expect(setPhotoSpy).not.toHaveBeenCalledWith(expect.anything(), firstBond!.id);
		expect(setPhotoSpy).toHaveBeenCalledWith(expect.any(Blob), secondBond!.id);

		setPhotoSpy.mockRestore();
	});
});
