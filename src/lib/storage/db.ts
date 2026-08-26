import { get, set, del } from 'idb-keyval';
import type { CoupleProfile } from '$lib/types/profile';

const PROFILE_KEY = 'openlove_profile_v1';
const PHOTO_KEY = 'openlove_photo_blob_v1';
const PUSH_SUB_KEY = 'openlove_push_sub_id';

export const DEFAULT_PROFILE: CoupleProfile = {
	names: 'Emma & Paul',
	togetherSince: new Date().toISOString().split('T')[0],
	photoBlob: null,
	photoUrl: undefined,
	uiTheme: 'modern',
	colorMode: 'system',
	colorPalette: 'rose',
	showSeconds: true,
	isConfigured: false,
	pushSubscribed: false,
	pushIntent: false,
	customMilestones: []
};

/**
 * Load couple profile and associated photo blob from IndexedDB.
 */
export async function loadProfileFromStorage(): Promise<CoupleProfile> {
	if (typeof window === 'undefined') {
		return { ...DEFAULT_PROFILE };
	}

	try {
		const rawProfile = await get<Partial<CoupleProfile>>(PROFILE_KEY);
		const photoBlob = await get<Blob>(PHOTO_KEY);

		if (!rawProfile) {
			return { ...DEFAULT_PROFILE };
		}

		let photoUrl: string | undefined = undefined;
		if (photoBlob) {
			photoUrl = URL.createObjectURL(photoBlob);
		}

		return {
			...DEFAULT_PROFILE,
			...rawProfile,
			photoBlob: photoBlob ?? null,
			photoUrl
		};
	} catch (error) {
		console.error('Failed to load profile from IndexedDB:', error);
		return { ...DEFAULT_PROFILE };
	}
}

/**
 * Save profile metadata and photo blob to IndexedDB.
 */
export async function saveProfileToStorage(profile: CoupleProfile): Promise<void> {
	if (typeof window === 'undefined') return;

	try {
		// Save metadata (cleanly serializing to plain JS object to unwrap Svelte 5 $state Proxy)
		const { photoBlob, photoUrl, ...metadata } = profile;
		const cleanMetadata = JSON.parse(JSON.stringify(metadata));
		await set(PROFILE_KEY, cleanMetadata);

		if (photoBlob) {
			await set(PHOTO_KEY, photoBlob);
		} else if (photoBlob === null) {
			await del(PHOTO_KEY);
		}
	} catch (error) {
		console.error('Failed to save profile to IndexedDB:', error);
	}
}

/**
 * Save photo blob specifically to IndexedDB and return an object URL.
 */
export async function savePhotoBlob(blob: Blob | null, oldUrl?: string): Promise<{ blob: Blob | null; url: string | undefined }> {
	if (typeof window === 'undefined') return { blob: null, url: undefined };

	if (oldUrl && oldUrl.startsWith('blob:')) {
		URL.revokeObjectURL(oldUrl);
	}

	if (blob) {
		await set(PHOTO_KEY, blob);
		const url = URL.createObjectURL(blob);
		return { blob, url };
	} else {
		await del(PHOTO_KEY);
		return { blob: null, url: undefined };
	}
}

/**
 * Clear all local profile and photo data from IndexedDB.
 */
export async function clearProfileStorage(currentPhotoUrl?: string): Promise<void> {
	if (typeof window === 'undefined') return;

	if (currentPhotoUrl && currentPhotoUrl.startsWith('blob:')) {
		URL.revokeObjectURL(currentPhotoUrl);
	}

	await del(PROFILE_KEY);
	await del(PHOTO_KEY);
	await del(PUSH_SUB_KEY);
	try {
		localStorage.removeItem('openlove_theme_mode');
		localStorage.removeItem('openlove_theme_palette');
		localStorage.removeItem('openlove_theme_ui');
	} catch {}
}

/**
 * Manage local push subscription ID
 */
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
