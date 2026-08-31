import type { ColorPalette } from '$lib/types/profile';

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

/**
 * Lucide's `Heart` glyph (the app's de facto mark elsewhere — loading splash,
 * milestone icons), tinted to `color` and filled solid rather than stroke-only,
 * encoded as a data URI for the QR code's center image. Built at runtime instead
 * of shipped as a static asset so it always matches the active palette exactly;
 * the real logo (`static/favicon.svg`) is a multi-path illustration too complex
 * to tint cleanly at this size.
 */
export function heartLogoDataUri(color: string): string {
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">` +
		`<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/>` +
		`</svg>`;
	return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
