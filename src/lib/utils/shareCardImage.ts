import type { Bond, BondType } from '$lib/types/bonds';
import type { ColorPalette } from '$lib/types/profile';
import type { TimeBreakdown } from '$lib/types/time';
import { resolveQrColor, bondLogoDataUri } from './qrTheme';

export type ShareCardFormat = 'story' | 'square';
export type ShareCardStyle = 'scrim' | 'framed' | 'bold';

interface Dimensions {
	width: number;
	height: number;
}

const DIMENSIONS: Record<ShareCardFormat, Dimensions> = {
	story: { width: 1080, height: 1920 },
	square: { width: 1080, height: 1080 }
};

/* -------------------------------------------------------------------------
 * Shared helpers — color, text, and photo drawing used by every style below.
 * ---------------------------------------------------------------------- */

/**
 * Short hero label for the card, e.g. "2 Months" or "1 Year" — deliberately
 * distinct from `TimeBreakdown.primaryFormatted`'s longer compound string
 * ("2 months and 3 days"), which reads fine in-app but is too dense to serve
 * as the single big headline of a story image.
 */
function formatShortMilestone(breakdown: TimeBreakdown): string {
	if (breakdown.years > 0) return `${breakdown.years} ${breakdown.years === 1 ? 'Year' : 'Years'}`;
	if (breakdown.months > 0) return `${breakdown.months} ${breakdown.months === 1 ? 'Month' : 'Months'}`;
	return `${breakdown.days} ${breakdown.days === 1 ? 'Day' : 'Days'}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
	const normalized = hex.replace('#', '');
	const value = parseInt(normalized, 16);
	return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

/** Mixes `hex` toward black by `amount` (0-1). */
function darken(hex: string, amount: number): string {
	const { r, g, b } = hexToRgb(hex);
	const mix = (channel: number) => Math.round(channel * (1 - amount));
	return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/** Mixes `hex` toward white by `amount` (0-1) — a soft pastel panel out of
 * the bond's own accent color, same idea as `BondFallbackIcon.svelte`'s
 * light gradient backgrounds (`from-rose-100 to-rose-200` etc). */
function lighten(hex: string, amount: number): string {
	const { r, g, b } = hexToRgb(hex);
	const mix = (channel: number) => Math.round(channel + (255 - channel) * amount);
	return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/** Resolves the accent color to render with: an explicit share-time override
 * if given, else the bond's own saved palette. The override never touches
 * the bond itself — it's a one-off customization for this card only. */
function resolveCardColor(bond: Bond, colorPaletteOverride?: ColorPalette): string {
	return resolveQrColor(colorPaletteOverride ?? bond.colorPalette ?? 'rose');
}

/**
 * Canvas text has no built-in "shrink to fit" — this steps the font size
 * down until `text` fits `maxWidth`, or bottoms out at `minSize`. Cheap
 * enough at these sizes (at most a few dozen iterations) not to bother with
 * a smarter search.
 */
function fitFontSize(
	ctx: CanvasRenderingContext2D,
	text: string,
	fontFamily: string,
	weight: number,
	maxSize: number,
	minSize: number,
	maxWidth: number
): number {
	let size = maxSize;
	while (size > minSize) {
		ctx.font = `${weight} ${size}px "${fontFamily}"`;
		if (ctx.measureText(text).width <= maxWidth) return size;
		size -= 2;
	}
	return minSize;
}

/** A bold serif/sans-serif glyph's cap-height/ascender can run well past a
 * crude "font-size * 0.75" guess — which is exactly what once produced the
 * badge pill overlapping the milestone headline (fixed fractions for both
 * didn't account for how tall the headline *actually* rendered at its max
 * size). `actualBoundingBoxAscent`/`actualBoundingBoxDescent` measure the
 * real rendered glyphs of `text` at the currently-set `ctx.font`, so
 * stacking by them can't drift out of sync with what's actually drawn. */
function measuredAscent(ctx: CanvasRenderingContext2D, text: string, fallbackFontSize: number): number {
	const metrics = ctx.measureText(text);
	return metrics.actualBoundingBoxAscent || fallbackFontSize * 0.8;
}

function measuredDescent(ctx: CanvasRenderingContext2D, text: string, fallbackFontSize: number): number {
	const metrics = ctx.measureText(text);
	return metrics.actualBoundingBoxDescent || fallbackFontSize * 0.25;
}

/**
 * Canvas `fillText` rasterizes with whatever font state the document already
 * has loaded at call time — it does not itself trigger a font load the way
 * DOM text does. Without this, the very first share card a session generates
 * can silently fall back to the browser's default serif/sans-serif before
 * the variable fonts finish loading, even though `app.css` already
 * `@import`s them (that import doesn't force an eager load either).
 */
async function ensureFontsLoaded(): Promise<void> {
	if (typeof document === 'undefined' || !('fonts' in document)) return;
	try {
		await Promise.all([
			document.fonts.load('800 100px "Playfair Display Variable"'),
			document.fonts.load('700 48px "Plus Jakarta Sans Variable"'),
			document.fonts.load('600 32px "Plus Jakarta Sans Variable"')
		]);
		await document.fonts.ready;
	} catch {
		// Falls back to whichever font is already available (or the system
		// default) — a share image in the wrong typeface beats one that
		// never renders.
	}
}

/** Loads an `<img>` (used for the SVG data-URI bond glyph) via `.decode()`
 * so it's guaranteed fully decoded before being drawn to canvas. */
function loadImage(src: string): Promise<HTMLImageElement> {
	const img = new Image();
	img.src = src;
	return img.decode().then(() => img);
}

/** Draws `photoBlob` into an arbitrary destination rect, cropped (never
 * letterboxed) to cover it exactly — same "fill the frame, crop the
 * overflow" behavior as the app's own `object-cover` photo treatment
 * elsewhere. Caller is responsible for any clipping (circle, rounded rect). */
async function drawCoverPhotoInRect(
	ctx: CanvasRenderingContext2D,
	photoBlob: Blob,
	dx: number,
	dy: number,
	dw: number,
	dh: number
): Promise<void> {
	const bitmap = await createImageBitmap(photoBlob);
	try {
		const rectRatio = dw / dh;
		const imageRatio = bitmap.width / bitmap.height;
		let sx = 0;
		let sy = 0;
		let sWidth = bitmap.width;
		let sHeight = bitmap.height;

		if (imageRatio > rectRatio) {
			sWidth = bitmap.height * rectRatio;
			sx = (bitmap.width - sWidth) / 2;
		} else {
			sHeight = bitmap.width / rectRatio;
			sy = (bitmap.height - sHeight) / 2;
		}

		ctx.drawImage(bitmap, sx, sy, sWidth, sHeight, dx, dy, dw, dh);
	} finally {
		bitmap.close();
	}
}

async function drawCoverPhoto(ctx: CanvasRenderingContext2D, photoBlob: Blob, width: number, height: number): Promise<void> {
	return drawCoverPhotoInRect(ctx, photoBlob, 0, 0, width, height);
}

/** Circle-clipped cover photo — the "Bold" style's small avatar. */
async function drawCircularPhoto(ctx: CanvasRenderingContext2D, photoBlob: Blob, cx: number, cy: number, radius: number): Promise<void> {
	ctx.save();
	ctx.beginPath();
	ctx.arc(cx, cy, radius, 0, Math.PI * 2);
	ctx.clip();
	await drawCoverPhotoInRect(ctx, photoBlob, cx - radius, cy - radius, radius * 2, radius * 2);
	ctx.restore();
}

/** Rounded-rect-clipped cover photo — the "Framed" style's inset photo. */
async function drawFramedPhoto(
	ctx: CanvasRenderingContext2D,
	photoBlob: Blob,
	x: number,
	y: number,
	w: number,
	h: number,
	radius: number
): Promise<void> {
	ctx.save();
	ctx.beginPath();
	ctx.roundRect(x, y, w, h, radius);
	ctx.clip();
	await drawCoverPhotoInRect(ctx, photoBlob, x, y, w, h);
	ctx.restore();
}

/** Photo-less fallback: the same heart/sparkles glyph `BondFallbackIcon.svelte`
 * and the QR code's center mark use, solid-filled in a colored circle. */
async function drawBondGlyph(
	ctx: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	radius: number,
	bondType: BondType,
	color: string
): Promise<void> {
	ctx.beginPath();
	ctx.arc(cx, cy, radius, 0, Math.PI * 2);
	ctx.fillStyle = color;
	ctx.fill();

	const icon = await loadImage(bondLogoDataUri(bondType, '#ffffff'));
	const iconSize = radius * 1.1;
	ctx.drawImage(icon, cx - iconSize / 2, cy - iconSize / 2, iconSize, iconSize);
}

function drawGradientBackground(ctx: CanvasRenderingContext2D, color: string, width: number, height: number): void {
	const gradient = ctx.createLinearGradient(0, 0, width, height);
	gradient.addColorStop(0, color);
	gradient.addColorStop(1, darken(color, 0.72));
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, width, height);
}

/** Bottom-anchored dark scrim so white text stays legible over any photo —
 * independent of the bond's palette, since an arbitrary user photo's own
 * colors already vary too much for a tinted scrim to reliably read well. */
function drawScrim(ctx: CanvasRenderingContext2D, width: number, height: number, scrimStart: number): void {
	const startY = height * scrimStart;
	const gradient = ctx.createLinearGradient(0, startY, 0, height);
	gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
	gradient.addColorStop(0.55, 'rgba(0, 0, 0, 0.55)');
	gradient.addColorStop(1, 'rgba(0, 0, 0, 0.88)');
	ctx.fillStyle = gradient;
	ctx.fillRect(0, startY, width, height - startY);
}

/* -------------------------------------------------------------------------
 * Bottom-anchored text stack — shared by the Scrim and Framed styles, whose
 * text sits at the bottom of the card, badge-then-milestone-then-names-
 * then-watermark. Stacks upward from a fixed bottom margin using *measured*
 * glyph heights (see `measuredAscent`) rather than guessed fractions, so it
 * can't silently drift out of sync the way the old fixed-fraction layout did.
 * ---------------------------------------------------------------------- */

interface TextStackSizing {
	bottomMarginFrac: number;
	gapFrac: number;
	maxTextWidthFrac: number;
	milestoneMaxFrac: number;
	milestoneMinFrac: number;
	namesMaxFrac: number;
	namesMinFrac: number;
}

const DEFAULT_STACK_SIZING: TextStackSizing = {
	bottomMarginFrac: 0.085,
	gapFrac: 0.045,
	maxTextWidthFrac: 0.84,
	milestoneMaxFrac: 0.15,
	milestoneMinFrac: 0.08,
	namesMaxFrac: 0.058,
	namesMinFrac: 0.03
};

// Framed also has a photo card to fit above the text, so its type runs
// smaller than Scrim's (which has the whole frame to itself) to leave the
// two regions comfortable room, especially in the shorter Square format.
const FRAMED_STACK_SIZING: TextStackSizing = {
	...DEFAULT_STACK_SIZING,
	bottomMarginFrac: 0.07,
	milestoneMaxFrac: 0.105,
	milestoneMinFrac: 0.065,
	namesMaxFrac: 0.046,
	namesMinFrac: 0.026
};

function drawBottomTextStack(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	options: { names: string; isFriendship: boolean; milestone: string; color: string },
	sizing: TextStackSizing
): void {
	const maxTextWidth = width * sizing.maxTextWidthFrac;
	const gap = width * sizing.gapFrac;

	ctx.textAlign = 'center';
	ctx.textBaseline = 'alphabetic';

	// Stack bottom-up from a fixed safe-zone margin (clear of Instagram's
	// bottom UI chrome — reply bar / swipe-up affordance).
	let cursorY = height - height * sizing.bottomMarginFrac;

	// Small watermark (lowest line).
	const watermarkFontSize = width * 0.024;
	ctx.font = `600 ${watermarkFontSize}px "Plus Jakarta Sans Variable"`;
	ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
	ctx.fillText('OPEN LOVE', width / 2, cursorY);
	cursorY -= measuredAscent(ctx, 'OPEN LOVE', watermarkFontSize) + gap * 0.6;

	// Bond names.
	const namesFontSize = fitFontSize(
		ctx,
		options.names,
		'Plus Jakarta Sans Variable',
		700,
		width * sizing.namesMaxFrac,
		width * sizing.namesMinFrac,
		maxTextWidth
	);
	ctx.font = `700 ${namesFontSize}px "Plus Jakarta Sans Variable"`;
	ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
	ctx.fillText(options.names, width / 2, cursorY);
	cursorY -= measuredAscent(ctx, options.names, namesFontSize) + gap;

	// Big milestone headline — the card's whole reason for existing.
	const milestoneFontSize = fitFontSize(
		ctx,
		options.milestone,
		'Playfair Display Variable',
		800,
		width * sizing.milestoneMaxFrac,
		width * sizing.milestoneMinFrac,
		maxTextWidth
	);
	ctx.font = `800 ${milestoneFontSize}px "Playfair Display Variable"`;
	ctx.fillStyle = '#ffffff';
	ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
	ctx.shadowBlur = width * 0.02;
	ctx.fillText(options.milestone, width / 2, cursorY);
	ctx.shadowBlur = 0;
	cursorY -= measuredAscent(ctx, options.milestone, milestoneFontSize) + gap * 1.3;

	drawBadgePill(ctx, width, cursorY, options.isFriendship, options.color, 'above');
}

/**
 * The "Together for" / "Friends for" pill, tinted with the bond's own accent
 * color. `anchorEdge` says which side of the pill sits at `anchorY`: 'above'
 * places the pill's *bottom* edge there (stacking upward, as in the bottom
 * text stack), 'below' places its *top* edge there (stacking downward, as in
 * the Bold style).
 */
function drawBadgePill(
	ctx: CanvasRenderingContext2D,
	width: number,
	anchorY: number,
	isFriendship: boolean,
	color: string,
	anchorEdge: 'above' | 'below'
): number {
	const badgeLabel = (isFriendship ? 'Friends for' : 'Together for').toUpperCase();
	const badgeFontSize = width * 0.032;
	ctx.font = `700 ${badgeFontSize}px "Plus Jakarta Sans Variable"`;
	if ('letterSpacing' in ctx) ctx.letterSpacing = `${badgeFontSize * 0.2}px`;
	const badgeTextWidth = ctx.measureText(badgeLabel).width;
	const pillPaddingX = badgeFontSize * 1.3;
	const pillHeight = badgeFontSize * 2.1;
	const pillWidth = badgeTextWidth + pillPaddingX * 2;
	const pillCenterY = anchorEdge === 'above' ? anchorY - pillHeight / 2 : anchorY + pillHeight / 2;

	ctx.beginPath();
	ctx.roundRect(width / 2 - pillWidth / 2, pillCenterY - pillHeight / 2, pillWidth, pillHeight, pillHeight / 2);
	ctx.fillStyle = color;
	ctx.fill();
	ctx.fillStyle = '#ffffff';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(badgeLabel, width / 2, pillCenterY);
	if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
	ctx.textBaseline = 'alphabetic';

	return anchorEdge === 'above' ? pillCenterY - pillHeight / 2 : pillCenterY + pillHeight / 2;
}

/* -------------------------------------------------------------------------
 * Style: Scrim (the original/default) — full-bleed photo (or a palette
 * gradient with no photo), a bottom scrim for legibility, text overlaid.
 * ---------------------------------------------------------------------- */

const SCRIM_START: Record<ShareCardFormat, number> = { story: 0.46, square: 0.32 };

async function renderScrimStyle(
	ctx: CanvasRenderingContext2D,
	format: ShareCardFormat,
	dims: Dimensions,
	bond: Bond,
	milestone: string,
	color: string
): Promise<void> {
	if (bond.photoBlob) {
		await drawCoverPhoto(ctx, bond.photoBlob, dims.width, dims.height);
	} else {
		drawGradientBackground(ctx, color, dims.width, dims.height);
	}

	drawScrim(ctx, dims.width, dims.height, SCRIM_START[format]);
	drawBottomTextStack(
		ctx,
		dims.width,
		dims.height,
		{ names: bond.names, isFriendship: bond.type === 'friendship', milestone, color },
		DEFAULT_STACK_SIZING
	);
}

/* -------------------------------------------------------------------------
 * Style: Framed — a bordered, inset photo card (Polaroid-esque) on a solid
 * palette background, with the same bottom text stack below it.
 * ---------------------------------------------------------------------- */

const FRAMED_ANCHORS: Record<ShareCardFormat, { topFrac: number; sizeFrac: number }> = {
	story: { topFrac: 0.09, sizeFrac: 0.8 },
	square: { topFrac: 0.06, sizeFrac: 0.46 }
};

async function renderFramedStyle(
	ctx: CanvasRenderingContext2D,
	format: ShareCardFormat,
	dims: Dimensions,
	bond: Bond,
	milestone: string,
	color: string
): Promise<void> {
	const { width, height } = dims;
	drawGradientBackground(ctx, color, width, height);

	const anchor = FRAMED_ANCHORS[format];
	const frameSize = width * anchor.sizeFrac;
	const frameX = (width - frameSize) / 2;
	const frameY = height * anchor.topFrac;
	const frameRadius = width * 0.045;
	const borderWidth = width * 0.02;

	// White border "frame" behind the photo/glyph panel.
	ctx.beginPath();
	ctx.roundRect(frameX - borderWidth, frameY - borderWidth, frameSize + borderWidth * 2, frameSize + borderWidth * 2, frameRadius + borderWidth);
	ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
	ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
	ctx.shadowBlur = width * 0.025;
	ctx.fill();
	ctx.shadowBlur = 0;

	if (bond.photoBlob) {
		await drawFramedPhoto(ctx, bond.photoBlob, frameX, frameY, frameSize, frameSize, frameRadius);
	} else {
		ctx.beginPath();
		ctx.roundRect(frameX, frameY, frameSize, frameSize, frameRadius);
		ctx.fillStyle = lighten(color, 0.85);
		ctx.fill();
		await drawBondGlyph(ctx, frameX + frameSize / 2, frameY + frameSize / 2, frameSize * 0.2, bond.type, color);
	}

	drawBottomTextStack(
		ctx,
		width,
		height,
		{ names: bond.names, isFriendship: bond.type === 'friendship', milestone, color },
		FRAMED_STACK_SIZING
	);
}

/* -------------------------------------------------------------------------
 * Style: Bold — a poster-style typographic card. A small avatar (photo or
 * glyph) up top, then the milestone as the biggest text of any style,
 * vertically centered on a solid palette background. No scrim needed since
 * nothing sits over a photo.
 * ---------------------------------------------------------------------- */

const BOLD_AVATAR_CENTER: Record<ShareCardFormat, number> = { story: 0.3, square: 0.21 };

async function renderBoldStyle(
	ctx: CanvasRenderingContext2D,
	format: ShareCardFormat,
	dims: Dimensions,
	bond: Bond,
	milestone: string,
	color: string
): Promise<void> {
	const { width, height } = dims;
	drawGradientBackground(ctx, color, width, height);

	const isFriendship = bond.type === 'friendship';
	const maxTextWidth = width * 0.86;
	const gap = width * 0.045;

	const avatarRadius = width * 0.13;
	const avatarCy = height * BOLD_AVATAR_CENTER[format];
	if (bond.photoBlob) {
		await drawCircularPhoto(ctx, bond.photoBlob, width / 2, avatarCy, avatarRadius);
		ctx.beginPath();
		ctx.arc(width / 2, avatarCy, avatarRadius, 0, Math.PI * 2);
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
		ctx.lineWidth = width * 0.008;
		ctx.stroke();
	} else {
		await drawBondGlyph(ctx, width / 2, avatarCy, avatarRadius, bond.type, darken(color, 0.35));
	}

	ctx.textAlign = 'center';
	ctx.textBaseline = 'alphabetic';

	// Downward stack, starting just below the avatar.
	let cursorY = avatarCy + avatarRadius + gap * 1.3;
	cursorY = drawBadgePill(ctx, width, cursorY, isFriendship, color, 'below') + gap * 1.4;

	// Milestone — the biggest headline of any style, since there's no photo
	// competing for visual weight.
	const milestoneFontSize = fitFontSize(ctx, milestone, 'Playfair Display Variable', 800, width * 0.2, width * 0.11, maxTextWidth);
	ctx.font = `800 ${milestoneFontSize}px "Playfair Display Variable"`;
	const milestoneBaseline = cursorY + measuredAscent(ctx, milestone, milestoneFontSize);
	ctx.fillStyle = '#ffffff';
	ctx.fillText(milestone, width / 2, milestoneBaseline);
	cursorY = milestoneBaseline + measuredDescent(ctx, milestone, milestoneFontSize) + gap;

	// Bond names.
	const namesFontSize = fitFontSize(ctx, bond.names, 'Plus Jakarta Sans Variable', 700, width * 0.058, width * 0.03, maxTextWidth);
	ctx.font = `700 ${namesFontSize}px "Plus Jakarta Sans Variable"`;
	const namesBaseline = cursorY + measuredAscent(ctx, bond.names, namesFontSize);
	ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
	ctx.fillText(bond.names, width / 2, namesBaseline);

	// Watermark — pinned near the bottom edge regardless of how tall the
	// centered block above ended up.
	const watermarkFontSize = width * 0.024;
	ctx.font = `600 ${watermarkFontSize}px "Plus Jakarta Sans Variable"`;
	ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
	ctx.fillText('OPEN LOVE', width / 2, height - height * 0.06);
}

/* -------------------------------------------------------------------------
 * Public entry point.
 * ---------------------------------------------------------------------- */

export interface GenerateShareCardOptions {
	bond: Bond;
	timeBreakdown: TimeBreakdown;
	format: ShareCardFormat;
	style: ShareCardStyle;
	/** Overrides the bond's own saved `colorPalette` for this card only —
	 * never written back to the bond. */
	colorPalette?: ColorPalette;
}

/**
 * Renders a shareable "relationship progress" card for `bond` in one of
 * three styles (Scrim: full-bleed photo + overlay; Framed: bordered inset
 * photo card; Bold: poster-style typography) and one of two sizes (a
 * Story/9:16 or a square feed post).
 *
 * Pure client-side: draws into an in-memory canvas and resolves a PNG blob.
 * Never touches the server — unlike the partner-invite QR flow's photo
 * relay (`shareImage.ts`), there's no encryption or upload step here at all.
 */
export async function generateShareCardImage({ bond, timeBreakdown, format, style, colorPalette }: GenerateShareCardOptions): Promise<Blob> {
	const dims = DIMENSIONS[format];
	const color = resolveCardColor(bond, colorPalette);
	const milestone = formatShortMilestone(timeBreakdown);

	const canvas = document.createElement('canvas');
	canvas.width = dims.width;
	canvas.height = dims.height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas 2D context unavailable');

	await ensureFontsLoaded();

	if (style === 'framed') {
		await renderFramedStyle(ctx, format, dims, bond, milestone, color);
	} else if (style === 'bold') {
		await renderBoldStyle(ctx, format, dims, bond, milestone, color);
	} else {
		await renderScrimStyle(ctx, format, dims, bond, milestone, color);
	}

	const blob = await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode share card image'))), 'image/png');
	});

	// Zeroing the canvas forces its backing store to be released immediately
	// rather than waiting on GC — mobile Safari in particular has a hard cap
	// on total canvas pixel memory and won't reliably reclaim detached
	// canvases (like this one, never attached to the DOM) promptly, so a
	// session generating several of these full-bleed 1080x1920 canvases back
	// to back can otherwise start silently failing to allocate new ones.
	canvas.width = 0;
	canvas.height = 0;

	return blob;
}
