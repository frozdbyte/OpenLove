import { APP_VERSION } from '$lib/version';

const LAST_SEEN_KEY = 'openlove_last_seen_version';

/**
 * Detects a version change since the last time this browser loaded the app, for a
 * passive "Updated to vX" toast. First-ever visit (nothing stored yet) is not an
 * update — it just seeds the key — otherwise every fresh install would show it.
 */
export function getJustUpdated(): boolean {
	try {
		const lastSeen = localStorage.getItem(LAST_SEEN_KEY);

		if (lastSeen === APP_VERSION) return false;

		localStorage.setItem(LAST_SEEN_KEY, APP_VERSION);
		return lastSeen !== null;
	} catch {
		return false;
	}
}
