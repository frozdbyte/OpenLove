import type { ColorPalette } from '$lib/types/profile';
import type { ShareCardFormat, ShareCardStyle } from './shareCardImage';

export interface ShareProgressPrefs {
	format: ShareCardFormat;
	style: ShareCardStyle;
	colorPalette: ColorPalette;
}

const KEY_PREFIX = 'openlove_share_progress_prefs_';

const VALID_FORMATS: ShareCardFormat[] = ['story', 'square'];
const VALID_STYLES: ShareCardStyle[] = ['scrim', 'framed', 'bold'];
const VALID_PALETTES: ColorPalette[] = ['rose', 'lavender', 'terracotta', 'sage', 'midnight'];

/**
 * Last-used Share Progress format/style/color for `bondId`, stored per-bond
 * (not per-device-wide) since different bonds may reasonably favor different
 * looks — e.g. a friendship bond skipping the "Together for" romantic
 * framing entirely isn't handled here, but a different accent color per bond
 * is common. Device-local only (`localStorage`), never synced — purely a
 * convenience so reopening the panel doesn't reset to the defaults every
 * time. Returns `{}` (not `null`) on first-ever use, a corrupted/old-shape
 * value, or a disabled/unavailable `localStorage` (private browsing on some
 * browsers), so callers can just spread over their own defaults.
 */
export function loadShareProgressPrefs(bondId: string): Partial<ShareProgressPrefs> {
	try {
		const raw = localStorage.getItem(KEY_PREFIX + bondId);
		if (!raw) return {};
		const parsed = JSON.parse(raw);
		const prefs: Partial<ShareProgressPrefs> = {};
		if (VALID_FORMATS.includes(parsed?.format)) prefs.format = parsed.format;
		if (VALID_STYLES.includes(parsed?.style)) prefs.style = parsed.style;
		if (VALID_PALETTES.includes(parsed?.colorPalette)) prefs.colorPalette = parsed.colorPalette;
		return prefs;
	} catch {
		return {};
	}
}

export function saveShareProgressPrefs(bondId: string, prefs: ShareProgressPrefs): void {
	try {
		localStorage.setItem(KEY_PREFIX + bondId, JSON.stringify(prefs));
	} catch {
		// Best-effort — a share still works fine without persisted prefs.
	}
}
