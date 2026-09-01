import { get, set, del } from 'idb-keyval';
import type { CoupleProfile } from '$lib/types/profile';
import type { AppState, Bond, BondType } from '$lib/types/bonds';

const V1_PROFILE_KEY = 'openlove_profile_v1';
const V1_PHOTO_KEY = 'openlove_photo_blob_v1';
const BONDS_V2_KEY = 'openlove_bonds_v2';
const PHOTO_KEY_PREFIX = 'openlove_photo_blob_';
const PUSH_SUB_KEY = 'openlove_push_sub_id';

export const DEFAULT_PRIMARY_BOND_ID = 'primary_bond';

export const DEFAULT_PRIMARY_BOND: Bond = {
	id: DEFAULT_PRIMARY_BOND_ID,
	type: 'romantic',
	names: 'Emma & Paul',
	togetherSince: new Date().toISOString().split('T')[0],
	photoBlob: null,
	photoUrl: undefined,
	customMilestones: [],
	notificationsEnabled: true,
	milestonePrefs: {
		years: true,
		months: true,
		days: 'all',
		custom: true
	},
	uiTheme: 'modern',
	colorPalette: 'rose',
	colorMode: 'system',
	showSeconds: true,
	autoCelebrateMilestones: true
};


export const DEFAULT_APP_STATE: AppState = {
	activeBondId: DEFAULT_PRIMARY_BOND_ID,
	bonds: [{ ...DEFAULT_PRIMARY_BOND }],
	uiTheme: 'modern',
	colorMode: 'system',
	colorPalette: 'rose',
	showSeconds: true,
	isConfigured: false,
	pushSubscribed: false,
	pushIntent: false,
	notificationsPromptShown: false,
	autoCelebrateMilestones: true
};

export const DEFAULT_PROFILE: CoupleProfile = {
	names: DEFAULT_PRIMARY_BOND.names,
	togetherSince: DEFAULT_PRIMARY_BOND.togetherSince,
	photoBlob: null,
	photoUrl: undefined,
	uiTheme: DEFAULT_APP_STATE.uiTheme,
	colorMode: DEFAULT_APP_STATE.colorMode,
	colorPalette: DEFAULT_APP_STATE.colorPalette,
	showSeconds: DEFAULT_APP_STATE.showSeconds,
	isConfigured: DEFAULT_APP_STATE.isConfigured,
	pushSubscribed: DEFAULT_APP_STATE.pushSubscribed,
	pushIntent: DEFAULT_APP_STATE.pushIntent,
	customMilestones: [],
	autoCelebrateMilestones: DEFAULT_APP_STATE.autoCelebrateMilestones
};

/**
 * Load complete application state (multi-bonds and visual preferences) from IndexedDB.
 * Seamlessly auto-migrates V1 single-profile data without data loss.
 */
export async function loadAppStateFromStorage(): Promise<AppState> {
	if (typeof window === 'undefined') {
		return JSON.parse(JSON.stringify(DEFAULT_APP_STATE));
	}

	try {
		// 1. Check for V2 state
		const rawState = await get<Partial<AppState>>(BONDS_V2_KEY);

		if (rawState && Array.isArray(rawState.bonds) && rawState.bonds.length > 0) {
			const bonds: Bond[] = await Promise.all(
				rawState.bonds.map(async (rawBond) => {
					const photoBlob = (await get<Blob>(`${PHOTO_KEY_PREFIX}${rawBond.id}`)) ?? null;
					let photoUrl: string | undefined = undefined;
					if (photoBlob && typeof URL !== 'undefined') {
						photoUrl = URL.createObjectURL(photoBlob);
					}

					return {
						id: rawBond.id || `bond_${Date.now()}`,
						type: rawBond.type || 'romantic',
						names: rawBond.names || 'Emma & Paul',
						togetherSince: rawBond.togetherSince || new Date().toISOString().split('T')[0],
						photoBlob,
						photoUrl,
						customMilestones: Array.isArray(rawBond.customMilestones) ? rawBond.customMilestones : [],
						notificationsEnabled: rawBond.notificationsEnabled ?? true,
						milestonePrefs: {
							years: rawBond.milestonePrefs?.years ?? true,
							months: rawBond.milestonePrefs?.months ?? (rawBond.type === 'friendship' ? false : true),
							days: rawBond.milestonePrefs?.days ?? (rawBond.type === 'friendship' ? 'major' : 'all'),
							custom: rawBond.milestonePrefs?.custom ?? true
						},
						uiTheme: rawBond.uiTheme || rawState.uiTheme || 'modern',
						colorPalette: rawBond.colorPalette || rawState.colorPalette || 'rose',
						colorMode: rawBond.colorMode || rawState.colorMode || 'system',
						showSeconds: rawBond.showSeconds ?? rawState.showSeconds ?? true,
						autoCelebrateMilestones: rawBond.autoCelebrateMilestones ?? true
					};
				})
			);

			const activeBondId = bonds.some((b) => b.id === rawState.activeBondId)
				? rawState.activeBondId!
				: bonds[0].id;

			return {
				...DEFAULT_APP_STATE,
				...rawState,
				activeBondId,
				bonds
			};
		}

		// 2. Fallback / Migration: Check for legacy V1 single profile
		const legacyProfile = await get<Partial<CoupleProfile>>(V1_PROFILE_KEY);
		if (legacyProfile) {
			const legacyPhotoBlob = (await get<Blob>(V1_PHOTO_KEY)) ?? null;
			const primaryBondId = DEFAULT_PRIMARY_BOND_ID;

			let photoUrl: string | undefined = undefined;
			if (legacyPhotoBlob && typeof URL !== 'undefined') {
				photoUrl = URL.createObjectURL(legacyPhotoBlob);
				// Save under new key
				await set(`${PHOTO_KEY_PREFIX}${primaryBondId}`, legacyPhotoBlob);
			}

			const migratedBond: Bond = {
				id: primaryBondId,
				type: 'romantic',
				names: legacyProfile.names || DEFAULT_PRIMARY_BOND.names,
				togetherSince: legacyProfile.togetherSince || DEFAULT_PRIMARY_BOND.togetherSince,
				photoBlob: legacyPhotoBlob,
				photoUrl,
				customMilestones: Array.isArray(legacyProfile.customMilestones) ? legacyProfile.customMilestones : [],
				notificationsEnabled: true,
				milestonePrefs: { ...DEFAULT_PRIMARY_BOND.milestonePrefs },
				uiTheme: legacyProfile.uiTheme || 'modern',
				colorPalette: legacyProfile.colorPalette || 'rose',
				colorMode: legacyProfile.colorMode || 'system',
				showSeconds: legacyProfile.showSeconds ?? true,
				autoCelebrateMilestones: true
			};


			const migratedState: AppState = {
				activeBondId: primaryBondId,
				bonds: [migratedBond],
				uiTheme: legacyProfile.uiTheme || 'modern',
				colorMode: legacyProfile.colorMode || 'system',
				colorPalette: legacyProfile.colorPalette || 'rose',
				showSeconds: legacyProfile.showSeconds ?? true,
				isConfigured: legacyProfile.isConfigured ?? false,
				pushSubscribed: legacyProfile.pushSubscribed ?? false,
				pushIntent: legacyProfile.pushIntent ?? false,
				notificationsPromptShown: false,
				autoCelebrateMilestones: true
			};

			// Persist migrated V2 state
			await saveAppStateToStorage(migratedState);
			return migratedState;
		}

		return JSON.parse(JSON.stringify(DEFAULT_APP_STATE));
	} catch (error) {
		console.error('Failed to load app state from IndexedDB:', error);
		return JSON.parse(JSON.stringify(DEFAULT_APP_STATE));
	}
}

/**
 * Save complete application state to IndexedDB.
 * (Photos are saved individually via `saveBondPhoto` on mutation to prevent
 * expensive and destructive re-serialization of binary blobs on every setting change).
 */
export async function saveAppStateToStorage(state: AppState): Promise<void> {
	if (typeof window === 'undefined') return;

	try {
		// Clean metadata for IndexedDB by removing Blobs / object URLs and unwrapping Svelte 5 Proxies
		const sanitizedBonds = state.bonds.map(({ photoBlob, photoUrl, ...meta }) => ({ ...meta }));
		const { bonds, ...globalState } = state;

		const cleanPayload = JSON.parse(
			JSON.stringify({
				...globalState,
				bonds: sanitizedBonds
			})
		);

		await set(BONDS_V2_KEY, cleanPayload);
	} catch (error) {
		console.error('Failed to save app state to IndexedDB:', error);
	}
}

/**
 * Save or replace a bond photo Blob specifically.
 */
export async function saveBondPhoto(
	bondId: string,
	blob: Blob | null,
	oldUrl?: string
): Promise<{ blob: Blob | null; url: string | undefined }> {
	if (typeof window === 'undefined') return { blob: null, url: undefined };

	if (oldUrl && oldUrl.startsWith('blob:')) {
		URL.revokeObjectURL(oldUrl);
	}

	const key = `${PHOTO_KEY_PREFIX}${bondId}`;
	if (blob) {
		await set(key, blob);
		const url = URL.createObjectURL(blob);
		return { blob, url };
	} else {
		await del(key);
		return { blob: null, url: undefined };
	}
}

/**
 * DOM-free lookup for the Service Worker during push events.
 * Resolves bond names and type from IndexedDB.
 */
export async function getBondSummaryForPush(
	bondId: string
): Promise<{ names: string; type: BondType; totalBonds: number } | null> {
	try {
		const state = await get<Partial<AppState>>(BONDS_V2_KEY);
		if (state?.bonds && Array.isArray(state.bonds)) {
			const totalBonds = state.bonds.length;
			const found = state.bonds.find((b) => b.id === bondId) || state.bonds[0];
			if (found) {
				return {
					names: found.names || '',
					type: found.type || 'romantic',
					totalBonds
				};
			}
		}

		// Check legacy profile fallback
		const legacy = await get<Partial<CoupleProfile>>(V1_PROFILE_KEY);
		if (legacy) {
			return {
				names: legacy.names || '',
				type: 'romantic',
				totalBonds: 1
			};
		}
	} catch (err) {
		console.error('[sw-db] Failed to lookup bond summary for push:', err);
	}
	return null;
}


/**
 * Clear all local data from IndexedDB.
 */
export async function clearAllStorage(photoUrls: string[] = []): Promise<void> {
	if (typeof window === 'undefined') return;

	for (const url of photoUrls) {
		if (url && url.startsWith('blob:')) {
			URL.revokeObjectURL(url);
		}
	}

	try {
		const state = await get<Partial<AppState>>(BONDS_V2_KEY);
		if (state?.bonds) {
			for (const b of state.bonds) {
				await del(`${PHOTO_KEY_PREFIX}${b.id}`);
			}
		}
	} catch {}

	await del(BONDS_V2_KEY);
	await del(V1_PROFILE_KEY);
	await del(V1_PHOTO_KEY);
	await del(PUSH_SUB_KEY);

	try {
		localStorage.removeItem('openlove_theme_mode');
		localStorage.removeItem('openlove_theme_palette');
		localStorage.removeItem('openlove_theme_ui');
	} catch {}
}

export async function getStoredPushSubId(): Promise<string | undefined> {
	if (typeof window === 'undefined') return undefined;
	return await get<string>(PUSH_SUB_KEY);
}

export async function setStoredPushSubId(id: string | null): Promise<void> {
	if (typeof window === 'undefined') return;
	if (id) {
		await set(PUSH_SUB_KEY, id);
	} else {
		await del(PUSH_SUB_KEY);
	}
}
