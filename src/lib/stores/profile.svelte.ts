import {
	DEFAULT_APP_STATE,
	DEFAULT_PRIMARY_BOND,
	DEFAULT_PROFILE,
	loadAppStateFromStorage,
	saveAppStateToStorage,
	saveBondPhoto,
	clearAllStorage
} from '$lib/storage/db';
import type { CoupleProfile, ColorMode, ColorPalette, CustomMilestone, UIThemeId } from '$lib/types/profile';
import {
	DEFAULT_MILESTONE_PREFS_FRIENDSHIP,
	DEFAULT_MILESTONE_PREFS_ROMANTIC,
	type AppState,
	type Bond,
	type BondType,
	type MilestoneCategoryPrefs
} from '$lib/types/bonds';
import { decodeSharePayloadString } from '$lib/utils/share';
import { blobToBase64, base64ToBlob } from '$lib/utils/imageBase64';
import { fetchSharedImage, type SharedImageRef } from '$lib/utils/shareImage';

export type ProfileMutationHook = (
	next: AppState,
	previous: AppState
) => void | Promise<void>;

const mutationHooks = new Set<ProfileMutationHook>();

export function onProfileMutation(hook: ProfileMutationHook): () => void {
	mutationHooks.add(hook);
	return () => mutationHooks.delete(hook);
}

const PALETTE_PRIMARY_HEX: Record<ColorPalette, { light: string; dark: string }> = {
	rose: { light: '#e11d48', dark: '#f43f5e' },
	lavender: { light: '#8b5cf6', dark: '#a78bfa' },
	terracotta: { light: '#ea580c', dark: '#fb923c' },
	sage: { light: '#059669', dark: '#34d399' },
	midnight: { light: '#2563eb', dark: '#60a5fa' }
};

/** Shape every incoming bond payload (V2 full backup, V2 single-bond invite, V1
 * legacy) exposes for the fields `normalizeIncomingBond` fills in. `milestonePrefs`
 * is itself partial here — every source may be missing individual categories. */
interface RawBondLike {
	names?: string;
	togetherSince?: string;
	customMilestones?: unknown;
	milestonePrefs?: Partial<MilestoneCategoryPrefs>;
	uiTheme?: UIThemeId;
	colorPalette?: ColorPalette;
	colorMode?: ColorMode;
	showSeconds?: boolean;
	autoCelebrateMilestones?: boolean;
	/** Inline base64 photo, present only in JSON *file* backups
	 * (`exportBackupJSON`) — never in the compact QR/link/sync-code payload
	 * `exportJSON` produces, which must stay small. See IMAGE_SHARING_PLAN.md.
	 *
	 * Its sibling field `sharedImage` (relay `{shareId,key,iv,mimeType}`,
	 * present only on the compact payload, the inverse of `photo` above) is
	 * deliberately *not* declared here and not decoded by
	 * `normalizeIncomingBond()`. Unlike `photo`, resolving it means a network
	 * fetch — `normalizeIncomingBond()` is also called by `parseSharePayload()`
	 * for the invite *preview*, which must never fetch it (see
	 * IMAGE_SHARING_PLAN.md, Stage 5's design-decision note). `importJSON()`'s
	 * Case 2 reads `data.bond.sharedImage` directly, only at actual import
	 * commit time — see `attachSharedImageIfPresent()`. */
	photo?: { dataBase64?: string; mimeType?: string };
}

/**
 * Decode a `RawBondLike.photo` field (if present) back into a `Blob` + a
 * fresh object URL. Synchronous — base64 decoding needs no I/O, unlike
 * encoding a `Blob` (`encodeBondPhoto` below), which does.
 */
function decodeBondPhoto(photo?: { dataBase64?: string; mimeType?: string }): {
	blob: Blob | null;
	url: string | undefined;
} {
	if (!photo?.dataBase64) return { blob: null, url: undefined };
	const blob = base64ToBlob(photo.dataBase64, photo.mimeType || 'image/jpeg');
	const url = typeof URL !== 'undefined' ? URL.createObjectURL(blob) : undefined;
	return { blob, url };
}

/** Inverse of `decodeBondPhoto`, for `exportBackupJSON`. */
async function encodeBondPhoto(
	photoBlob: Blob | null | undefined
): Promise<{ photo?: { dataBase64: string; mimeType: string } }> {
	if (!photoBlob) return {};
	return { photo: { dataBase64: await blobToBase64(photoBlob), mimeType: photoBlob.type || 'image/jpeg' } };
}

type NormalizedBondCore = Pick<
	Bond,
	| 'type'
	| 'names'
	| 'togetherSince'
	| 'photoBlob'
	| 'photoUrl'
	| 'customMilestones'
	| 'milestonePrefs'
	| 'uiTheme'
	| 'colorPalette'
	| 'colorMode'
	| 'showSeconds'
	| 'autoCelebrateMilestones'
>;

/**
 * Normalize an incoming bond payload into everything a `Bond` needs *except*
 * `id` and `notificationsEnabled` — those two vary by call site in ways that
 * aren't safely derivable (an invite always forces `notificationsEnabled: true`
 * regardless of what the payload says; a full backup preserves the id it was
 * exported with, an invite always mints a fresh one) — so callers set them
 * explicitly. `bondType` is likewise a parameter rather than read off `raw.type`
 * here, since V1-legacy payloads must always resolve to `'romantic'` even if a
 * stray `type` field is present.
 *
 * Was independently reimplemented across `importJSON`'s three branches and
 * `parseSharePayload`'s two — see REFACTOR_PLAN.md, Medium M2. `envelope`
 * defaults to `raw` itself, which reduces the `raw.x || envelope.x || default`
 * chain to `raw.x || default` for legacy payloads that have no separate outer
 * envelope object, matching their pre-extraction behavior exactly.
 */
function normalizeIncomingBond(
	bondType: BondType,
	raw: RawBondLike,
	envelope: RawBondLike = raw
): NormalizedBondCore {
	const photo = decodeBondPhoto(raw.photo);
	return {
		type: bondType,
		names: raw.names || 'Emma & Paul',
		togetherSince: raw.togetherSince || new Date().toISOString().split('T')[0],
		photoBlob: photo.blob,
		photoUrl: photo.url,
		customMilestones: Array.isArray(raw.customMilestones)
			? (raw.customMilestones as CustomMilestone[])
			: [],
		milestonePrefs: {
			years: raw.milestonePrefs?.years ?? true,
			months: raw.milestonePrefs?.months ?? (bondType === 'friendship' ? false : true),
			days: raw.milestonePrefs?.days ?? (bondType === 'friendship' ? 'major' : 'all'),
			custom: raw.milestonePrefs?.custom ?? true
		},
		uiTheme: raw.uiTheme || envelope.uiTheme || 'modern',
		colorPalette: raw.colorPalette || envelope.colorPalette || 'rose',
		colorMode: raw.colorMode || envelope.colorMode || 'system',
		showSeconds: raw.showSeconds ?? envelope.showSeconds ?? true,
		autoCelebrateMilestones: raw.autoCelebrateMilestones ?? envelope.autoCelebrateMilestones ?? true
	};
}

class ProfileStore {
	state = $state<AppState>({ ...DEFAULT_APP_STATE });
	isLoading = $state(true);
	isInitialized = $state(false);

	/** Active bond currently selected in the UI */
	activeBond = $derived<Bond>(
		this.state.bonds.find((b) => b.id === this.state.activeBondId) ||
			this.state.bonds[0] ||
			DEFAULT_PRIMARY_BOND
	);

	/**
	 * Backward compatibility alias for components reading `profileStore.profile`.
	 * Reflects the active bond's data and UI preferences.
	 */
	get profile(): CoupleProfile {
		const active = this.activeBond;
		return {
			names: active.names,
			togetherSince: active.togetherSince,
			photoBlob: active.photoBlob,
			photoUrl: active.photoUrl,
			uiTheme: active.uiTheme ?? this.state.uiTheme,
			colorMode: active.colorMode ?? this.state.colorMode,
			colorPalette: active.colorPalette ?? this.state.colorPalette,
			showSeconds: active.showSeconds ?? this.state.showSeconds,
			isConfigured: this.state.isConfigured,
			pushSubscribed: this.state.pushSubscribed,
			pushIntent: this.state.pushIntent,
			customMilestones: active.customMilestones,
			autoCelebrateMilestones: this.state.autoCelebrateMilestones ?? true
		};
	}

	/**
	 * Resolves once IndexedDB has been read.

	 */
	readonly ready: Promise<void>;
	private resolveReady!: () => void;

	constructor() {
		this.ready = new Promise<void>((resolve) => {
			this.resolveReady = resolve;
		});

		if (typeof window !== 'undefined') {
			try {
				const mode = localStorage.getItem('openlove_theme_mode') as ColorMode | null;
				const palette = localStorage.getItem('openlove_theme_palette') as ColorPalette | null;
				const ui = localStorage.getItem('openlove_theme_ui') as UIThemeId | null;
				if (mode) this.state.colorMode = mode;
				if (palette) this.state.colorPalette = palette;
				if (ui) this.state.uiTheme = ui;
			} catch {}

			this.init();
		} else {
			this.resolveReady();
		}
	}

	async init() {
		try {
			const loaded = await loadAppStateFromStorage();
			this.state = loaded;
			this.applyThemeAndDarkMode();
			this.setupSystemDarkModeListener();
		} catch (error) {
			console.error('Failed to initialize profile store:', error);
		} finally {
			this.isLoading = false;
			this.isInitialized = true;
			this.resolveReady();
		}
	}

	applyThemeAndDarkMode() {
		if (typeof document === 'undefined') return;

		const root = document.documentElement;
		const active = this.activeBond;
		const colorMode = active.colorMode ?? this.state.colorMode;
		const colorPalette = active.colorPalette ?? this.state.colorPalette;
		const uiTheme = active.uiTheme ?? this.state.uiTheme;

		try {
			localStorage.setItem('openlove_theme_mode', colorMode);
			localStorage.setItem('openlove_theme_palette', colorPalette);
			localStorage.setItem('openlove_theme_ui', uiTheme);
		} catch {}

		root.setAttribute('data-theme', colorPalette);

		let isDark = false;
		if (colorMode === 'dark') {
			isDark = true;
		} else if (colorMode === 'light') {
			isDark = false;
		} else {
			isDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
		}

		if (isDark) {
			root.classList.add('dark');
		} else {
			root.classList.remove('dark');
		}

		const metaTheme = document.querySelector('meta[name="theme-color"]');
		if (metaTheme) {
			const paletteHex = PALETTE_PRIMARY_HEX[colorPalette] || PALETTE_PRIMARY_HEX.rose;
			if (uiTheme === 'traditional') {
				metaTheme.setAttribute('content', isDark ? paletteHex.dark : paletteHex.light);
			} else {
				metaTheme.setAttribute('content', isDark ? '#18181b' : paletteHex.light);
			}
		}
	}

	private setupSystemDarkModeListener() {
		if (typeof window === 'undefined') return;
		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		mediaQuery.addEventListener('change', () => {
			const active = this.activeBond;
			const mode = active.colorMode ?? this.state.colorMode;
			if (mode === 'system') {
				this.applyThemeAndDarkMode();
			}
		});
	}

	private notifyMutation(previous: AppState) {
		const next = { ...this.state };
		for (const hook of mutationHooks) {
			try {
				void Promise.resolve(hook(next, previous)).catch((err) =>
					console.error('Profile mutation hook failed:', err)
				);
			} catch (err) {
				console.error('Profile mutation hook threw:', err);
			}
		}
	}

	/**
	 * Switch active displayed bond.
	 */
	async setActiveBond(id: string) {
		if (this.state.activeBondId === id) return;
		const previous = { ...this.state };
		this.state.activeBondId = id;
		const nextActive = this.state.bonds.find((b) => b.id === id);
		if (nextActive) {
			if (nextActive.uiTheme) this.state.uiTheme = nextActive.uiTheme;
			if (nextActive.colorPalette) this.state.colorPalette = nextActive.colorPalette;
			if (nextActive.colorMode) this.state.colorMode = nextActive.colorMode;
			if (nextActive.showSeconds !== undefined) this.state.showSeconds = nextActive.showSeconds;
		}
		this.applyThemeAndDarkMode();
		await saveAppStateToStorage(this.state);
		this.notifyMutation(previous);
	}


	/**
	 * Add a new bond. Inherits UI theme and color palette from the currently active bond.
	 */
	async addBond(newBond: Partial<Bond>) {
		const currentActive = this.activeBond;
		const bond: Bond = {
			id: newBond.id || `bond_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
			type: newBond.type || 'romantic',
			names: newBond.names || '',
			togetherSince: newBond.togetherSince || new Date().toISOString().split('T')[0],
			photoBlob: newBond.photoBlob ?? null,
			photoUrl: newBond.photoUrl,
			customMilestones: newBond.customMilestones || [],
			notificationsEnabled: newBond.notificationsEnabled ?? true,
			milestonePrefs:
				newBond.milestonePrefs ||
				(newBond.type === 'friendship'
					? DEFAULT_MILESTONE_PREFS_FRIENDSHIP
					: DEFAULT_MILESTONE_PREFS_ROMANTIC),
			uiTheme: newBond.uiTheme ?? currentActive.uiTheme ?? this.state.uiTheme,
			colorPalette: newBond.colorPalette ?? currentActive.colorPalette ?? this.state.colorPalette,
			colorMode: newBond.colorMode ?? currentActive.colorMode ?? this.state.colorMode,
			showSeconds: newBond.showSeconds ?? currentActive.showSeconds ?? this.state.showSeconds,
			autoCelebrateMilestones: newBond.autoCelebrateMilestones ?? currentActive.autoCelebrateMilestones ?? true
		};

		const previous = { ...this.state };
		this.state.bonds = [...this.state.bonds, bond];
		this.state.activeBondId = bond.id;
		this.state.isConfigured = true;
		this.applyThemeAndDarkMode();
		await saveAppStateToStorage(this.state);
		this.notifyMutation(previous);
		return bond;
	}

	/**
	 * Update an existing bond.
	 */
	async updateBond(id: string, patch: Partial<Bond>) {
		const previous = { ...this.state };
		this.state.bonds = this.state.bonds.map((b) => (b.id === id ? { ...b, ...patch } : b));
		this.applyThemeAndDarkMode();
		await saveAppStateToStorage(this.state);
		this.notifyMutation(previous);
	}

	/**
	 * Delete a bond.
	 */
	async deleteBond(id: string) {
		if (this.state.bonds.length <= 1) {
			// Don't delete last bond, reset it
			await this.reset();
			return;
		}
		const previous = { ...this.state };
		const nextBonds = this.state.bonds.filter((b) => b.id !== id);
		this.state.bonds = nextBonds;
		if (this.state.activeBondId === id) {
			this.state.activeBondId = nextBonds[0].id;
		}
		this.applyThemeAndDarkMode();
		await saveAppStateToStorage(this.state);
		this.notifyMutation(previous);
	}

	/**
	 * Update fields on active bond or global settings (backward compatible).
	 */
	async update(fields: Partial<CoupleProfile>) {
		const previous = { ...this.state };

		// Split global fields vs bond fields
		const {
			names,
			togetherSince,
			customMilestones,
			uiTheme,
			colorMode,
			colorPalette,
			showSeconds,
			isConfigured,
			pushSubscribed,
			pushIntent,
			autoCelebrateMilestones
		} = fields;

		if (isConfigured !== undefined) this.state.isConfigured = isConfigured;
		if (pushSubscribed !== undefined) this.state.pushSubscribed = pushSubscribed;
		if (pushIntent !== undefined) this.state.pushIntent = pushIntent;
		if (autoCelebrateMilestones !== undefined) this.state.autoCelebrateMilestones = autoCelebrateMilestones;

		// Update active bond
		this.state.bonds = this.state.bonds.map((b) => {
			if (b.id === this.state.activeBondId) {
				return {
					...b,
					names: names !== undefined ? names : b.names,
					togetherSince: togetherSince !== undefined ? togetherSince : b.togetherSince,
					customMilestones: customMilestones !== undefined ? customMilestones : b.customMilestones,
					uiTheme: uiTheme !== undefined ? uiTheme : b.uiTheme,
					colorPalette: colorPalette !== undefined ? colorPalette : b.colorPalette,
					colorMode: colorMode !== undefined ? colorMode : b.colorMode,
					showSeconds: showSeconds !== undefined ? showSeconds : b.showSeconds
				};
			}
			return b;
		});

		this.applyThemeAndDarkMode();
		await saveAppStateToStorage(this.state);
		this.notifyMutation(previous);
	}

	/**
	 * Marks the post-onboarding "Enable Notifications?" prompt as shown, so it
	 * never shows again — called regardless of whether the user accepted or
	 * declined.
	 */
	async markNotificationsPromptShown() {
		this.state.notificationsPromptShown = true;
		await saveAppStateToStorage(this.state);
	}

	/**
	 * Set or replace photo for a bond (defaults to active bond).
	 */
	async setPhoto(blob: Blob | null, targetBondId?: string) {
		const bondId = targetBondId || this.state.activeBondId;
		const currentBond = this.state.bonds.find((b) => b.id === bondId);
		const { blob: newBlob, url } = await saveBondPhoto(bondId, blob, currentBond?.photoUrl);

		this.state.bonds = this.state.bonds.map((b) =>
			b.id === bondId ? { ...b, photoBlob: newBlob, photoUrl: url } : b
		);
		await saveAppStateToStorage(this.state);
	}

	/**
	 * Fetch and attach a relay-shared photo (`ShareModal.svelte`'s photo
	 * toggle — IMAGE_SHARING_PLAN.md, Stage 5) to a just-imported bond, if the
	 * payload carried one. Only ever called from `importJSON()`'s Case 2,
	 * *after* the bond already exists — never from `normalizeIncomingBond()`
	 * (used by the invite preview too, which must not trigger a fetch).
	 *
	 * Wraps `fetchSharedImage()` (which already fails soft, never throwing)
	 * in its own try/catch anyway: `setPhoto()` below touches IndexedDB, and
	 * `importJSON()`'s own outer try/catch would otherwise turn any failure
	 * here into the whole import being reported as failed, even though the
	 * bond itself already saved successfully.
	 */
	private async attachSharedImageIfPresent(
		ref: { shareId?: unknown; key?: unknown; iv?: unknown; mimeType?: unknown } | undefined,
		bondId: string
	): Promise<void> {
		if (typeof ref?.shareId !== 'string' || typeof ref.key !== 'string' || typeof ref.iv !== 'string') {
			return;
		}
		try {
			const mimeType = typeof ref.mimeType === 'string' ? ref.mimeType : 'image/jpeg';
			const blob = await fetchSharedImage(ref.shareId, ref.key, ref.iv, mimeType);
			if (blob) {
				await this.setPhoto(blob, bondId);
			}
		} catch (err) {
			console.error('Failed to attach shared image to imported bond:', err);
		}
	}

	/**
	 * Regenerate a bond's photo object URL from its already-in-memory Blob.
	 *
	 * Object URLs are scoped to the browsing context, never persisted (see
	 * `saveAppStateToStorage`'s `sanitizedBonds`, which strips `photoUrl` before
	 * writing to IndexedDB) — every fresh load calls `URL.createObjectURL` anew.
	 * But a PWA that sits backgrounded for a while can have the browser reclaim
	 * an object URL's registry entry without tearing down the page's JS heap,
	 * which surfaces as an `<img>` failing to load a `photoUrl` that looks
	 * perfectly valid. Since the `Blob` itself is untouched, this is a one-line
	 * self-heal — see `createPhotoRetryGuard`/`createKeyedPhotoRetryGuard` in
	 * `./photoRetryGuard.svelte.ts`, which every `<img src={...photoUrl}>` in
	 * the app wires up via `onerror`/`onload`, including the always-mounted
	 * hidden preloader in `BondPhotoPreloader.svelte` that exists specifically
	 * so every bond gets this treatment, not just whichever one is on screen.
	 *
	 * Only called after that bond's own `<img>` has already fired `onerror`,
	 * so the old URL is known-dead — safe to revoke here rather than proactively
	 * (a global "revoke + recreate every bond's URL on foreground" sweep was
	 * tried and made things worse: revoking a URL an `<img>` is *currently*
	 * relying on races against the browser's own foreground repaint and can
	 * break an image that was still fine).
	 */
	regeneratePhotoUrl(bondId: string) {
		const bond = this.state.bonds.find((b) => b.id === bondId);
		if (!bond?.photoBlob || typeof URL === 'undefined') return;
		if (bond.photoUrl?.startsWith('blob:')) {
			try {
				URL.revokeObjectURL(bond.photoUrl);
			} catch {}
		}
		const url = URL.createObjectURL(bond.photoBlob);
		this.state.bonds = this.state.bonds.map((b) => (b.id === bondId ? { ...b, photoUrl: url } : b));
	}

	async setUITheme(uiTheme: UIThemeId, targetBondId?: string) {
		const bondId = targetBondId || this.state.activeBondId;
		await this.updateBond(bondId, { uiTheme });
		if (bondId === this.state.activeBondId) {
			this.state.uiTheme = uiTheme;
		}
	}

	async setColorMode(colorMode: ColorMode, targetBondId?: string) {
		const bondId = targetBondId || this.state.activeBondId;
		await this.updateBond(bondId, { colorMode });
		if (bondId === this.state.activeBondId) {
			this.state.colorMode = colorMode;
		}
	}

	async setColorPalette(colorPalette: ColorPalette, targetBondId?: string) {
		const bondId = targetBondId || this.state.activeBondId;
		await this.updateBond(bondId, { colorPalette });
		if (bondId === this.state.activeBondId) {
			this.state.colorPalette = colorPalette;
		}
	}

	async setAutoCelebrateMilestones(autoCelebrateMilestones: boolean, targetBondId?: string) {
		const bondId = targetBondId || this.state.activeBondId;
		await this.updateBond(bondId, { autoCelebrateMilestones });
	}

	async setGlobalAutoCelebrateMilestones(autoCelebrateMilestones: boolean) {
		await this.update({ autoCelebrateMilestones });
	}

	async completeOnboarding() {
		await this.update({ isConfigured: true });
	}

	/**
	 * Reset all data to fresh state.
	 */
	async reset() {
		const previous = { ...this.state };
		const photoUrls = this.state.bonds.map((b) => b.photoUrl).filter(Boolean) as string[];
		await clearAllStorage(photoUrls);
		this.state = JSON.parse(JSON.stringify(DEFAULT_APP_STATE));
		this.applyThemeAndDarkMode();
		this.notifyMutation(previous);
	}

	/**
	 * Shape shared by `exportJSON()` (compact — no photo, stays synchronous
	 * for the QR/link/sync-code paths that need a small payload) and
	 * `exportBackupJSON()` (JSON *file* backups — same shape, photo embedded
	 * afterward). Kept as one builder so the two never drift apart on every
	 * other field. `bond`/`bonds` are typed loosely (`Record<string, unknown>`)
	 * because `exportBackupJSON()` mutates them in place to add the `photo`
	 * field — narrowed on which of `bond`/`bonds` is present, not on
	 * `activeOnly` again, since a boolean parameter doesn't let TypeScript
	 * narrow a previously-returned union.
	 */
	private buildExportable(activeOnly: boolean): {
		version: number;
		isSingleBond?: true;
		bond?: Record<string, unknown>;
		activeBondId?: string;
		bonds?: Record<string, unknown>[];
		uiTheme: UIThemeId;
		colorMode: ColorMode;
		colorPalette: ColorPalette;
		showSeconds: boolean;
		exportedAt: string;
	} {
		if (activeOnly) {
			const active = this.activeBond;
			return {
				version: 2,
				isSingleBond: true,
				bond: {
					names: active.names,
					type: active.type,
					togetherSince: active.togetherSince,
					customMilestones: active.customMilestones,
					milestonePrefs: active.milestonePrefs,
					uiTheme: active.uiTheme ?? this.state.uiTheme,
					colorPalette: active.colorPalette ?? this.state.colorPalette,
					colorMode: active.colorMode ?? this.state.colorMode,
					showSeconds: active.showSeconds ?? this.state.showSeconds,
					autoCelebrateMilestones: active.autoCelebrateMilestones ?? true
				},
				uiTheme: active.uiTheme ?? this.state.uiTheme,
				colorMode: active.colorMode ?? this.state.colorMode,
				colorPalette: active.colorPalette ?? this.state.colorPalette,
				showSeconds: active.showSeconds ?? this.state.showSeconds,
				exportedAt: new Date().toISOString()
			};
		}

		return {
			version: 2,
			activeBondId: this.state.activeBondId,
			bonds: this.state.bonds.map(({ photoBlob, photoUrl, ...rest }) => rest),
			uiTheme: this.state.uiTheme,
			colorMode: this.state.colorMode,
			colorPalette: this.state.colorPalette,
			showSeconds: this.state.showSeconds,
			exportedAt: new Date().toISOString()
		};
	}

	/**
	 * Export full application state or single active bond to JSON. Compact —
	 * never embeds a photo's actual bytes — for the QR code / share link /
	 * sync code paths, which must stay small. See `exportBackupJSON()` for
	 * JSON file backups.
	 *
	 * `sharedImage` is the one exception: when `ShareModal.svelte`'s photo
	 * toggle is on, it's already uploaded the active bond's photo to the
	 * relay (`uploadSharedImage()`) before calling this, and passes the
	 * resulting `{shareId,key,iv,mimeType}` reference through here — a
	 * few hundred bytes, not the photo itself, so it doesn't compromise the
	 * "must stay small" contract. Only applies when `activeOnly` — a full
	 * multi-bond backup has no single photo to attach it to.
	 */
	exportJSON(activeOnly = false, sharedImage?: SharedImageRef): string {
		const exportable = this.buildExportable(activeOnly);
		if (activeOnly && exportable.bond && sharedImage) {
			exportable.bond.sharedImage = sharedImage;
		}
		return JSON.stringify(exportable, null, 2);
	}

	/**
	 * Same shape as `exportJSON()`, but embeds each bond's photo inline as
	 * base64 — for JSON *file* backups only (download / restore), never the
	 * compact payload above. Async because encoding a `Blob` to base64 needs
	 * `Blob.arrayBuffer()`.
	 */
	async exportBackupJSON(activeOnly = false): Promise<string> {
		const exportable = this.buildExportable(activeOnly);

		if (exportable.bond) {
			Object.assign(exportable.bond, await encodeBondPhoto(this.activeBond.photoBlob));
		} else if (exportable.bonds) {
			exportable.bonds = await Promise.all(
				exportable.bonds.map(async (bond, i) => ({
					...bond,
					...(await encodeBondPhoto(this.state.bonds[i].photoBlob))
				}))
			);
		}

		return JSON.stringify(exportable, null, 2);
	}

	/**
	 * Import profile / bond data from JSON.
	 * Supports mode: 'auto' | 'replace' | 'add'.
	 *
	 * The three Cases' detection conditions are deliberately mirrored by
	 * `classifyImportPayload()` (`$lib/utils/share.ts`), which needs to
	 * classify a payload the same way *without* actually importing it, for
	 * the pre-import preview drawer. If you change a condition here, update
	 * that function's matching branch too — see its doc comment for why
	 * they're two separately-maintained copies rather than a shared helper.
	 */
	async importJSON(jsonStr: string, mode: 'auto' | 'replace' | 'add' = 'auto'): Promise<boolean> {
		try {
			const data = JSON.parse(jsonStr);

			// Case 1: V2 full backup (always replaces full state)
			if (data.version === 2 && Array.isArray(data.bonds) && data.bonds.length > 0) {
				const previous = { ...this.state };
				const normalizedBonds: Bond[] = data.bonds.map((b: Partial<Bond>) => ({
					id: b.id || `bond_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
					notificationsEnabled: b.notificationsEnabled ?? true,
					...normalizeIncomingBond(b.type || 'romantic', b, data)
				}));
				this.state = {
					activeBondId: data.activeBondId || normalizedBonds[0].id,
					bonds: normalizedBonds,
					uiTheme: data.uiTheme || 'modern',
					colorMode: data.colorMode || 'system',
					colorPalette: data.colorPalette || 'rose',
					showSeconds: data.showSeconds ?? true,
					isConfigured: true,
					pushSubscribed: this.state.pushSubscribed,
					pushIntent: this.state.pushIntent,
					notificationsPromptShown: this.state.notificationsPromptShown
				};
				// Persist any decoded inline photos to IndexedDB
				for (const b of normalizedBonds) {
					if (b.photoBlob) {
						await saveBondPhoto(b.id, b.photoBlob);
					}
				}
				this.applyThemeAndDarkMode();
				await saveAppStateToStorage(this.state);
				this.notifyMutation(previous);
				return true;
			}

			// Case 2: V2 Single Bond invite
			if (data.isSingleBond && data.bond?.names && data.bond?.togetherSince) {
				const b = data.bond;
				const newBond: Bond = {
					id: `bond_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
					notificationsEnabled: true,
					...normalizeIncomingBond(b.type || 'romantic', b, data)
				};

				let targetBondId: string;

				if (mode === 'replace') {
					// Overwrite current active bond. Must include photoBlob/photoUrl
					// explicitly — normalizeIncomingBond() can now decode an inline
					// backup photo onto `newBond`, and updateBond()'s patch is a plain
					// object merge, so any field left out here is silently dropped
					// rather than falling back to the previous bond's own photo.
					targetBondId = this.state.activeBondId;
					await this.updateBond(this.state.activeBondId, {
						type: newBond.type,
						names: newBond.names,
						togetherSince: newBond.togetherSince,
						customMilestones: newBond.customMilestones,
						milestonePrefs: newBond.milestonePrefs,
						uiTheme: newBond.uiTheme,
						colorPalette: newBond.colorPalette,
						colorMode: newBond.colorMode,
						showSeconds: newBond.showSeconds,
						photoBlob: newBond.photoBlob,
						photoUrl: newBond.photoUrl
					});
					await this.update({ isConfigured: true });
				} else if (mode === 'add') {
					const added = await this.addBond(newBond);
					targetBondId = added.id;
				} else {
					// Auto mode: replace if unconfigured initial bond, else add
					if (this.state.bonds.length <= 1 && !this.state.isConfigured) {
						this.state.bonds = [newBond];
						this.state.activeBondId = newBond.id;
						this.state.isConfigured = true;
						this.applyThemeAndDarkMode();
						await saveAppStateToStorage(this.state);
						targetBondId = newBond.id;
					} else {
						const added = await this.addBond(newBond);
						targetBondId = added.id;
					}
				}

				// A relay-shared photo (IMAGE_SHARING_PLAN.md, Stage 5) and an inline
				// backup `photo` are never expected to coexist on the same payload —
				// exportJSON() (compact, can carry sharedImage) and exportBackupJSON()
				// (file backups, can carry photo) are mutually exclusive export paths.
				// If they somehow did, the already-decoded inline photo wins rather
				// than being overwritten by a relay fetch.
				if (!newBond.photoBlob) {
					await this.attachSharedImageIfPresent(b.sharedImage, targetBondId);
				}

				return true;
			}

			// Case 3: V1 legacy single profile
			if (data.togetherSince && data.names) {
				const migratedBond: Bond = {
					id: `bond_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
					notificationsEnabled: true,
					...normalizeIncomingBond('romantic', data)
				};

				if (mode === 'replace' || (mode === 'auto' && (!this.state.isConfigured || this.state.bonds.length <= 1))) {
					await this.updateBond(this.state.activeBondId, migratedBond);
					await this.update({ isConfigured: true });
				} else {
					await this.addBond(migratedBond);
				}
				return true;
			}

			return false;
		} catch (error) {
			console.error('Failed to import profile JSON:', error);
			return false;
		}
	}

	/**
	 * Convenience wrapper around `importJSON()` for the common "user picked a
	 * .json file" case (Settings' restore button, onboarding's restore
	 * shortcut) — reads the file and imports it in one call so neither caller
	 * duplicates `file.text()` + read-failure handling. `importJSON()` already
	 * catches bad JSON internally; this adds the one failure mode it can't —
	 * `file.text()` itself throwing (a file-read I/O error).
	 */
	async importJSONFromFile(file: File, mode: 'auto' | 'replace' | 'add' = 'auto'): Promise<boolean> {
		try {
			const text = await file.text();
			return await this.importJSON(text, mode);
		} catch (error) {
			console.error('Failed to read backup file:', error);
			return false;
		}
	}
}

/**
 * Helper to safely extract incoming bond data for previews.
 *
 * Async: `decodeSharePayloadString()` needs an async gzip-decompress step
 * for the current share-link format — see its doc comment in utils/share.ts.
 */
export async function parseSharePayload(rawOrJson: string): Promise<Partial<Bond> | null> {
	try {
		const jsonString = await decodeSharePayloadString(rawOrJson);
		const data = JSON.parse(jsonString);

		if (data.isSingleBond && data.bond?.names && data.bond?.togetherSince) {
			const b = data.bond;
			return normalizeIncomingBond(b.type || 'romantic', b, data);
		} else if (data.togetherSince && data.names) {
			return normalizeIncomingBond('romantic', data);
		}
	} catch (err) {
		console.error('Failed to parse share payload:', err);
	}
	return null;
}

export const profileStore = new ProfileStore();

