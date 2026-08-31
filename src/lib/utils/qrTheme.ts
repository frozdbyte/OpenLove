import type { ColorPalette } from '$lib/types/profile';
import type { BondType } from '$lib/types/bonds';

/**
 * Light-mode primary hex per palette — mirrors the `[data-theme="X"]` (non-`.dark`)
 * blocks in `app.css`. Deliberately not read from the live computed `--primary-color`:
 * this app's dark-mode primary colors are tuned for contrast against a dark
 * background, not the QR code's necessarily-white one (dark/colored QR backgrounds
 * are a real scan-reliability risk), and some — e.g. lavender's `#a78bfa` — don't
 * have enough contrast against white to scan reliably. The QR always uses the
 * light-mode hex regardless of which mode the app itself is in.
 */
const PALETTE_QR_COLOR: Record<ColorPalette, string> = {
	rose: '#e11d48',
	lavender: '#8b5cf6',
	terracotta: '#ea580c',
	sage: '#059669',
	midnight: '#2563eb'
};

export function resolveQrColor(palette: ColorPalette): string {
	return PALETTE_QR_COLOR[palette] ?? PALETTE_QR_COLOR.rose;
}

// Lucide glyph paths, reused verbatim so the QR-center mark matches the app's
// own iconography exactly — `Heart` (loading splash, milestone icons) for
// romantic bonds, `Sparkles` (BondTypeSelector.svelte, BondFallbackIcon.svelte)
// for friendship bonds, the same pairing used everywhere else bond type
// decides an icon.
const HEART_PATHS =
	'<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/>';

const SPARKLES_PATHS =
	'<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/>' +
	'<path d="M20 2v4"/>' +
	'<path d="M22 4h-4"/>' +
	'<circle cx="4" cy="20" r="2"/>';

/**
 * Renders `pathMarkup` as a single-color glyph, filled solid rather than
 * stroke-only (matches how this app already renders these same icons
 * elsewhere, e.g. the loading splash's `fill-primary` heart), encoded as a
 * data URI for the QR code's center image. Built at runtime instead of shipped
 * as a static asset so it always matches the active palette exactly; the real
 * logo (`static/favicon.svg`) is a multi-path illustration too complex to tint
 * cleanly at this size.
 */
function glyphLogoDataUri(pathMarkup: string, color: string): string {
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">` +
		pathMarkup +
		`</svg>`;
	return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function heartLogoDataUri(color: string): string {
	return glyphLogoDataUri(HEART_PATHS, color);
}

export function sparklesLogoDataUri(color: string): string {
	return glyphLogoDataUri(SPARKLES_PATHS, color);
}

/** Picks the same icon `BondTypeSelector.svelte`/`BondFallbackIcon.svelte` use
 *  for this bond type, tinted to `color`, for the QR code's center image. */
export function bondLogoDataUri(bondType: BondType, color: string): string {
	return bondType === 'friendship' ? sparklesLogoDataUri(color) : heartLogoDataUri(color);
}
