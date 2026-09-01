import type { Bond, BondType } from '$lib/types/bonds';
import type { ColorPalette } from '$lib/types/profile';
import type { TimeBreakdown } from '$lib/types/time';
import { resolveQrColor, bondLogoDataUri } from './qrTheme';
import { formatLongDate } from './time';

export type ShareCardFormat = 'story' | 'square';
export type ShareCardStyle =
	| 'scrim'
	| 'framed'
	| 'bold'
	| 'polaroid'
	| 'constellation'
	| 'monograph'
	| 'botanical'
	| 'glass';

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

function hexToRgba(hex: string, alpha: number): string {
	const { r, g, b } = hexToRgb(hex);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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

/**
 * Loads an image from a Blob or URL into an HTMLImageElement using .decode(),
 * which works reliably across all browsers including iOS WebKit / Safari PWA.
 */
async function loadPhotoElement(
	photoBlob: Blob,
	fallbackUrl?: string
): Promise<{ image: HTMLImageElement; cleanup: () => void }> {
	let objectUrl: string | null = null;
	try {
		objectUrl = URL.createObjectURL(photoBlob);
		const img = new Image();
		img.src = objectUrl;
		await img.decode();
		return {
			image: img,
			cleanup: () => {
				if (objectUrl) {
					try {
						URL.revokeObjectURL(objectUrl);
					} catch {}
				}
			}
		};
	} catch (err) {
		if (objectUrl) {
			try {
				URL.revokeObjectURL(objectUrl);
			} catch {}
		}
		// If object URL decoding failed on the in-memory Blob and a fallback URL exists, try it
		if (fallbackUrl) {
			try {
				const img = new Image();
				img.src = fallbackUrl;
				await img.decode();
				return { image: img, cleanup: () => {} };
			} catch {}
		}
		throw err;
	}
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
	dh: number,
	fallbackUrl?: string
): Promise<void> {
	const { image, cleanup } = await loadPhotoElement(photoBlob, fallbackUrl);
	try {
		const naturalWidth = image.naturalWidth || image.width;
		const naturalHeight = image.naturalHeight || image.height;
		if (!naturalWidth || !naturalHeight) return;

		const rectRatio = dw / dh;
		const imageRatio = naturalWidth / naturalHeight;
		let sx = 0;
		let sy = 0;
		let sWidth = naturalWidth;
		let sHeight = naturalHeight;

		if (imageRatio > rectRatio) {
			sWidth = naturalHeight * rectRatio;
			sx = (naturalWidth - sWidth) / 2;
		} else {
			sHeight = naturalWidth / rectRatio;
			sy = (naturalHeight - sHeight) / 2;
		}

		ctx.drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dw, dh);
	} finally {
		cleanup();
	}
}

async function drawCoverPhoto(
	ctx: CanvasRenderingContext2D,
	photoBlob: Blob,
	width: number,
	height: number,
	fallbackUrl?: string
): Promise<void> {
	return drawCoverPhotoInRect(ctx, photoBlob, 0, 0, width, height, fallbackUrl);
}

/** Circle-clipped cover photo — the "Bold" style's small avatar. */
async function drawCircularPhoto(
	ctx: CanvasRenderingContext2D,
	photoBlob: Blob,
	cx: number,
	cy: number,
	radius: number,
	fallbackUrl?: string
): Promise<void> {
	ctx.save();
	ctx.beginPath();
	ctx.arc(cx, cy, radius, 0, Math.PI * 2);
	ctx.clip();
	await drawCoverPhotoInRect(ctx, photoBlob, cx - radius, cy - radius, radius * 2, radius * 2, fallbackUrl);
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
	radius: number,
	fallbackUrl?: string
): Promise<void> {
	ctx.save();
	ctx.beginPath();
	ctx.roundRect(x, y, w, h, radius);
	ctx.clip();
	await drawCoverPhotoInRect(ctx, photoBlob, x, y, w, h, fallbackUrl);
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
	let drewPhoto = false;
	if (bond.photoBlob) {
		try {
			await drawCoverPhoto(ctx, bond.photoBlob, dims.width, dims.height, bond.photoUrl);
			drewPhoto = true;
		} catch (err) {
			console.warn('Failed to draw photo in scrim style, falling back to gradient:', err);
		}
	}
	if (!drewPhoto) {
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

	let drewPhoto = false;
	if (bond.photoBlob) {
		try {
			await drawFramedPhoto(ctx, bond.photoBlob, frameX, frameY, frameSize, frameSize, frameRadius, bond.photoUrl);
			drewPhoto = true;
		} catch (err) {
			console.warn('Failed to draw framed photo, falling back to glyph:', err);
		}
	}
	if (!drewPhoto) {
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
	let drewPhoto = false;
	if (bond.photoBlob) {
		try {
			await drawCircularPhoto(ctx, bond.photoBlob, width / 2, avatarCy, avatarRadius, bond.photoUrl);
			ctx.beginPath();
			ctx.arc(width / 2, avatarCy, avatarRadius, 0, Math.PI * 2);
			ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
			ctx.lineWidth = width * 0.008;
			ctx.stroke();
			drewPhoto = true;
		} catch (err) {
			console.warn('Failed to draw circular photo in bold style, falling back to glyph:', err);
		}
	}
	if (!drewPhoto) {
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
 * Style: Polaroid (Scrapbook) — a warm textured paper background with a
 * tilted instant photo card pinned by washi tape, handwritten-feel chin text,
 * and warm details below.
 * ---------------------------------------------------------------------- */

async function renderPolaroidStyle(
	ctx: CanvasRenderingContext2D,
	format: ShareCardFormat,
	dims: Dimensions,
	bond: Bond,
	milestone: string,
	color: string
): Promise<void> {
	const { width, height } = dims;

	// Warm neutral paper background with soft tone
	const bgGradient = ctx.createLinearGradient(0, 0, width, height);
	bgGradient.addColorStop(0, '#faf7f2');
	bgGradient.addColorStop(1, lighten(color, 0.93));
	ctx.fillStyle = bgGradient;
	ctx.fillRect(0, 0, width, height);

	// Subtle warm radial vignette
	const vignette = ctx.createRadialGradient(width / 2, height / 2, width * 0.3, width / 2, height / 2, width * 0.85);
	vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
	vignette.addColorStop(1, 'rgba(40, 30, 20, 0.06)');
	ctx.fillStyle = vignette;
	ctx.fillRect(0, 0, width, height);

	const isStory = format === 'story';
	const cardW = isStory ? width * 0.78 : width * 0.64;
	const cardPadding = isStory ? width * 0.045 : width * 0.038;
	const photoSize = cardW - cardPadding * 2;
	const bottomChin = isStory ? width * 0.16 : width * 0.13;
	const cardH = cardPadding + photoSize + bottomChin;

	const cx = width / 2;
	const cy = isStory ? height * 0.40 : height * 0.38;
	const angle = isStory ? -2.4 * (Math.PI / 180) : -1.8 * (Math.PI / 180);

	ctx.save();
	ctx.translate(cx, cy);
	ctx.rotate(angle);

	// Polaroid card drop shadow
	ctx.shadowColor = 'rgba(40, 30, 20, 0.16)';
	ctx.shadowBlur = width * 0.04;
	ctx.shadowOffsetY = width * 0.02;
	ctx.fillStyle = '#ffffff';
	ctx.beginPath();
	ctx.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, width * 0.01);
	ctx.fill();
	ctx.shadowColor = 'transparent';
	ctx.shadowBlur = 0;

	// Photo area
	const photoX = -cardW / 2 + cardPadding;
	const photoY = -cardH / 2 + cardPadding;

	let drewPhoto = false;
	if (bond.photoBlob) {
		ctx.save();
		ctx.beginPath();
		ctx.rect(photoX, photoY, photoSize, photoSize);
		ctx.clip();
		try {
			await drawCoverPhotoInRect(ctx, bond.photoBlob, photoX, photoY, photoSize, photoSize, bond.photoUrl);
			drewPhoto = true;
		} catch (err) {
			console.warn('Failed to draw polaroid photo, falling back to glyph:', err);
		}
		ctx.restore();
	}
	if (!drewPhoto) {
		ctx.fillStyle = lighten(color, 0.88);
		ctx.fillRect(photoX, photoY, photoSize, photoSize);
		await drawBondGlyph(ctx, photoX + photoSize / 2, photoY + photoSize / 2, photoSize * 0.22, bond.type, color);
	}

	// 1px subtle inner border around photo
	ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)';
	ctx.lineWidth = 2;
	ctx.strokeRect(photoX, photoY, photoSize, photoSize);

	// Handwritten / elegant milestone on bottom chin
	const polMilestoneSize = fitFontSize(
		ctx,
		milestone,
		'Playfair Display Variable',
		700,
		isStory ? width * 0.065 : width * 0.052,
		width * 0.035,
		photoSize * 0.92
	);
	ctx.font = `700 ${polMilestoneSize}px "Playfair Display Variable"`;
	ctx.fillStyle = '#221f1e';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	const chinCenterY = -cardH / 2 + cardPadding + photoSize + bottomChin * 0.52;
	ctx.fillText(milestone, 0, chinCenterY);

	// Subtle accent colored washi tape strip pinned at the top center
	const tapeW = cardW * 0.34;
	const tapeH = width * 0.045;
	const tapeY = -cardH / 2 - tapeH * 0.45;
	ctx.fillStyle = hexToRgba(color, 0.55);
	ctx.beginPath();
	ctx.roundRect(-tapeW / 2, tapeY, tapeW, tapeH, 2);
	ctx.fill();
	ctx.strokeStyle = hexToRgba(color, 0.8);
	ctx.lineWidth = 1.5;
	ctx.stroke();

	ctx.restore();

	// Text below the polaroid
	ctx.textAlign = 'center';
	ctx.textBaseline = 'alphabetic';

	const gap = width * 0.035;
	let cursorY = cy + cardH / 2 + (isStory ? height * 0.05 : height * 0.04);

	const namesFontSize = fitFontSize(ctx, bond.names, 'Plus Jakarta Sans Variable', 700, width * 0.056, width * 0.03, width * 0.82);
	ctx.font = `700 ${namesFontSize}px "Plus Jakarta Sans Variable"`;
	ctx.fillStyle = '#2c2523';
	const namesBaseline = cursorY + measuredAscent(ctx, bond.names, namesFontSize);
	ctx.fillText(bond.names, width / 2, namesBaseline);
	cursorY = namesBaseline + measuredDescent(ctx, bond.names, namesFontSize) + gap;

	// Anniversary date pill with subtle accent color tint
	const dateStr = `${bond.type === 'friendship' ? 'Friends' : 'Together'} since ${formatLongDate(bond.togetherSince)}`;
	const dateFontSize = width * 0.028;
	ctx.font = `600 ${dateFontSize}px "Plus Jakarta Sans Variable"`;
	const pillTextW = ctx.measureText(dateStr).width;
	const pillH = dateFontSize * 2.1;
	const pillW = pillTextW + dateFontSize * 2.4;

	ctx.beginPath();
	ctx.roundRect(width / 2 - pillW / 2, cursorY, pillW, pillH, pillH / 2);
	ctx.fillStyle = hexToRgba(color, 0.12);
	ctx.fill();
	ctx.strokeStyle = hexToRgba(color, 0.3);
	ctx.lineWidth = 1;
	ctx.stroke();

	ctx.fillStyle = darken(color, 0.25);
	ctx.textBaseline = 'middle';
	ctx.fillText(dateStr, width / 2, cursorY + pillH / 2);
	ctx.textBaseline = 'alphabetic';

	// Watermark
	const watermarkFontSize = width * 0.022;
	ctx.font = `600 ${watermarkFontSize}px "Plus Jakarta Sans Variable"`;
	ctx.fillStyle = '#a8a29e';
	ctx.fillText('OPEN LOVE', width / 2, isStory ? height - height * 0.055 : height - height * 0.035);
}

/* -------------------------------------------------------------------------
 * Style: Constellation (Starlight) — deep midnight cosmic gradient with
 * sparkling starfield, glowing constellation geometry, celestial halo ring,
 * and golden starlight typography adhering to the selected palette.
 * ---------------------------------------------------------------------- */

async function renderConstellationStyle(
	ctx: CanvasRenderingContext2D,
	format: ShareCardFormat,
	dims: Dimensions,
	bond: Bond,
	milestone: string,
	color: string
): Promise<void> {
	const { width, height } = dims;

	// Deep space midnight sky blended into selected accent color
	const sky = ctx.createLinearGradient(0, 0, width, height);
	sky.addColorStop(0, '#050713');
	sky.addColorStop(0.4, '#090e24');
	sky.addColorStop(0.75, darken(color, 0.8));
	sky.addColorStop(1, darken(color, 0.7));
	ctx.fillStyle = sky;
	ctx.fillRect(0, 0, width, height);

	// Ambient cosmic nebula glow in the accent color
	const nebula = ctx.createRadialGradient(width * 0.5, height * 0.4, 0, width * 0.5, height * 0.4, width * 0.65);
	nebula.addColorStop(0, hexToRgba(color, 0.22));
	nebula.addColorStop(1, 'rgba(0, 0, 0, 0)');
	ctx.fillStyle = nebula;
	ctx.fillRect(0, 0, width, height);

	// Deterministic starfield (~110 stars) with accent-tinted stars
	for (let i = 0; i < 110; i++) {
		const sx = (i * 397.13 + 73.19) % width;
		const sy = (i * 683.41 + 149.83) % height;
		const r = 1.0 + ((i * 17) % 22) / 10;
		const alpha = 0.25 + ((i * 31) % 70) / 100;
		const isAccent = i % 5 === 0;

		ctx.beginPath();
		ctx.arc(sx, sy, r, 0, Math.PI * 2);
		ctx.fillStyle = isAccent ? hexToRgba(lighten(color, 0.5), alpha) : `rgba(255, 255, 255, ${alpha})`;
		if (i % 9 === 0) {
			ctx.shadowColor = isAccent ? color : '#ffffff';
			ctx.shadowBlur = width * 0.012;
			ctx.fill();
			ctx.shadowBlur = 0;
		} else {
			ctx.fill();
		}
	}

	// Constellation lines tinted with accent color
	const constellations = [
		[
			{ x: width * 0.12, y: height * 0.12 },
			{ x: width * 0.22, y: height * 0.08 },
			{ x: width * 0.32, y: height * 0.14 },
			{ x: width * 0.24, y: height * 0.22 }
		],
		[
			{ x: width * 0.72, y: height * 0.1 },
			{ x: width * 0.86, y: height * 0.15 },
			{ x: width * 0.8, y: height * 0.24 },
			{ x: width * 0.9, y: height * 0.28 }
		]
	];

	for (const chain of constellations) {
		ctx.beginPath();
		ctx.moveTo(chain[0].x, chain[0].y);
		for (let j = 1; j < chain.length; j++) {
			ctx.lineTo(chain[j].x, chain[j].y);
		}
		ctx.strokeStyle = hexToRgba(lighten(color, 0.3), 0.35);
		ctx.lineWidth = 1.5;
		ctx.stroke();

		for (const pt of chain) {
			ctx.beginPath();
			ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
			ctx.fillStyle = lighten(color, 0.6);
			ctx.shadowColor = color;
			ctx.shadowBlur = 10;
			ctx.fill();
			ctx.shadowBlur = 0;
		}
	}

	const isStory = format === 'story';
	const avatarCy = isStory ? height * 0.33 : height * 0.29;
	const avatarRadius = isStory ? width * 0.2 : width * 0.16;

	// Glowing celestial halo in accent color
	ctx.beginPath();
	ctx.arc(width / 2, avatarCy, avatarRadius + width * 0.026, 0, Math.PI * 2);
	ctx.strokeStyle = hexToRgba(lighten(color, 0.4), 0.75);
	ctx.lineWidth = width * 0.005;
	ctx.shadowColor = color;
	ctx.shadowBlur = width * 0.05;
	ctx.stroke();
	ctx.shadowBlur = 0;

	// 4 cardinal star markers on halo ring in accent color
	const haloR = avatarRadius + width * 0.026;
	const cardinals = [
		{ x: width / 2, y: avatarCy - haloR },
		{ x: width / 2 + haloR, y: avatarCy },
		{ x: width / 2, y: avatarCy + haloR },
		{ x: width / 2 - haloR, y: avatarCy }
	];
	for (const pt of cardinals) {
		ctx.beginPath();
		ctx.arc(pt.x, pt.y, width * 0.008, 0, Math.PI * 2);
		ctx.fillStyle = lighten(color, 0.6);
		ctx.shadowColor = color;
		ctx.shadowBlur = 10;
		ctx.fill();
		ctx.shadowBlur = 0;
	}

	// Avatar Photo / Glyph
	let drewPhoto = false;
	if (bond.photoBlob) {
		try {
			await drawCircularPhoto(ctx, bond.photoBlob, width / 2, avatarCy, avatarRadius, bond.photoUrl);
			ctx.beginPath();
			ctx.arc(width / 2, avatarCy, avatarRadius, 0, Math.PI * 2);
			ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
			ctx.lineWidth = width * 0.006;
			ctx.stroke();
			drewPhoto = true;
		} catch (err) {
			console.warn('Failed to draw constellation photo, falling back to glyph:', err);
		}
	}
	if (!drewPhoto) {
		await drawBondGlyph(ctx, width / 2, avatarCy, avatarRadius, bond.type, darken(color, 0.3));
	}

	ctx.textAlign = 'center';
	ctx.textBaseline = 'alphabetic';

	const gap = width * 0.038;
	let cursorY = avatarCy + avatarRadius + gap * 1.5;

	// Starlight pill header adhering to accent color
	const starTag = '✦ WRITTEN IN THE STARS ✦';
	const starTagSize = width * 0.028;
	ctx.font = `700 ${starTagSize}px "Plus Jakarta Sans Variable"`;
	if ('letterSpacing' in ctx) ctx.letterSpacing = `${starTagSize * 0.15}px`;
	ctx.fillStyle = lighten(color, 0.75);
	const tagBaseline = cursorY + measuredAscent(ctx, starTag, starTagSize);
	ctx.fillText(starTag, width / 2, tagBaseline);
	if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
	cursorY = tagBaseline + measuredDescent(ctx, starTag, starTagSize) + gap;

	// Milestone headline with glowing accent aura
	const milestoneFontSize = fitFontSize(ctx, milestone, 'Playfair Display Variable', 800, width * 0.18, width * 0.09, width * 0.86);
	ctx.font = `800 ${milestoneFontSize}px "Playfair Display Variable"`;
	ctx.fillStyle = '#ffffff';
	ctx.shadowColor = color;
	ctx.shadowBlur = width * 0.04;
	const milestoneBaseline = cursorY + measuredAscent(ctx, milestone, milestoneFontSize);
	ctx.fillText(milestone, width / 2, milestoneBaseline);
	ctx.shadowBlur = 0;
	cursorY = milestoneBaseline + measuredDescent(ctx, milestone, milestoneFontSize) + gap * 0.9;

	// Bond names (proper baseline clearance)
	const namesFontSize = fitFontSize(ctx, bond.names, 'Plus Jakarta Sans Variable', 700, width * 0.055, width * 0.03, width * 0.84);
	ctx.font = `700 ${namesFontSize}px "Plus Jakarta Sans Variable"`;
	ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
	const namesBaseline = cursorY + measuredAscent(ctx, bond.names, namesFontSize);
	ctx.fillText(bond.names, width / 2, namesBaseline);
	cursorY = namesBaseline + measuredDescent(ctx, bond.names, namesFontSize) + gap * 0.8;

	// Anniversary date (bright starlight text with subtle glow for dark cosmic contrast)
	const dateText = `✦ ${formatLongDate(bond.togetherSince)} ✦`;
	const dateFontSize = width * 0.028;
	ctx.font = `600 ${dateFontSize}px "Plus Jakarta Sans Variable"`;
	ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
	const dateBaseline = cursorY + measuredAscent(ctx, dateText, dateFontSize);
	ctx.fillText(dateText, width / 2, dateBaseline);

	// Watermark (crisp semi-transparent white on dark cosmic background)
	ctx.font = `600 ${width * 0.022}px "Plus Jakarta Sans Variable"`;
	ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
	ctx.fillText('✦ OPEN LOVE ✦', width / 2, isStory ? height - height * 0.055 : height - height * 0.035);
}

/* -------------------------------------------------------------------------
 * Style: Monograph (Editorial) — high-fashion magazine cover spread with
 * masthead, volume & issue numbering, delicate keyline borders, and bold
 * serif typography.
 * ---------------------------------------------------------------------- */

async function renderMonographStyle(
	ctx: CanvasRenderingContext2D,
	format: ShareCardFormat,
	dims: Dimensions,
	bond: Bond,
	milestone: string,
	color: string,
	timeBreakdown: TimeBreakdown
): Promise<void> {
	const { width, height } = dims;

	let drewPhoto = false;
	if (bond.photoBlob) {
		try {
			await drawCoverPhoto(ctx, bond.photoBlob, width, height, bond.photoUrl);
			drewPhoto = true;
		} catch (err) {
			console.warn('Failed to draw monograph photo, falling back to gradient:', err);
		}
	}
	if (!drewPhoto) {
		const bg = ctx.createLinearGradient(0, 0, width, height);
		bg.addColorStop(0, '#141416');
		bg.addColorStop(1, darken(color, 0.8));
		ctx.fillStyle = bg;
		ctx.fillRect(0, 0, width, height);
	}

	// Editorial top & bottom scrims
	const topScrim = ctx.createLinearGradient(0, 0, 0, height * 0.22);
	topScrim.addColorStop(0, 'rgba(0, 0, 0, 0.8)');
	topScrim.addColorStop(1, 'rgba(0, 0, 0, 0)');
	ctx.fillStyle = topScrim;
	ctx.fillRect(0, 0, width, height * 0.22);

	const botScrim = ctx.createLinearGradient(0, height * 0.52, 0, height);
	botScrim.addColorStop(0, 'rgba(0, 0, 0, 0)');
	botScrim.addColorStop(0.5, 'rgba(0, 0, 0, 0.65)');
	botScrim.addColorStop(1, 'rgba(0, 0, 0, 0.92)');
	ctx.fillStyle = botScrim;
	ctx.fillRect(0, height * 0.52, width, height * 0.48);

	// Inner rectangular keyline border
	const inset = width * 0.04;
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
	ctx.lineWidth = 1;
	ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);

	// Top Masthead
	const mastheadY = height * 0.075;
	const mastheadSize = width * 0.04;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.font = `800 ${mastheadSize}px "Plus Jakarta Sans Variable"`;
	if ('letterSpacing' in ctx) ctx.letterSpacing = `${mastheadSize * 0.35}px`;
	ctx.fillStyle = '#ffffff';
	ctx.fillText('M O N O G R A P H', width / 2, mastheadY);
	if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

	// Hairline rule below masthead
	const ruleY = mastheadY + mastheadSize * 0.85;
	ctx.beginPath();
	ctx.moveTo(inset + width * 0.04, ruleY);
	ctx.lineTo(width - inset - width * 0.04, ruleY);
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
	ctx.lineWidth = 1;
	ctx.stroke();

	// Issue details bar
	const issueY = ruleY + width * 0.035;
	const issueSize = width * 0.02;
	ctx.font = `600 ${issueSize}px "Plus Jakarta Sans Variable"`;
	ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';

	const volText = `VOL. ${timeBreakdown.years > 0 ? timeBreakdown.years : 1}`;
	const issueText = `ISSUE NO. ${timeBreakdown.totalDays}`;
	const dateText = formatLongDate(bond.togetherSince).toUpperCase();

	ctx.textAlign = 'left';
	ctx.fillText(volText, inset + width * 0.04, issueY);
	ctx.textAlign = 'center';
	ctx.fillText(issueText, width / 2, issueY);
	ctx.textAlign = 'right';
	ctx.fillText(dateText, width - inset - width * 0.04, issueY);

	// Bottom Editorial Section
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';
	const leftMargin = inset + width * 0.04;
	const maxTextW = width - leftMargin * 2;

	const isStory = format === 'story';
	let bottomCursor = isStory ? height - height * 0.08 : height - height * 0.06;

	// Bottom footnote / barcode info
	ctx.font = `600 ${width * 0.02}px "Plus Jakarta Sans Variable"`;
	ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
	ctx.fillText('OPEN LOVE SPECIAL EDITION • ALL RIGHTS RESERVED', leftMargin, bottomCursor);
	bottomCursor -= width * 0.045;

	// Subtitle line
	const subText = `${bond.type === 'friendship' ? 'A Lifelong Friendship' : 'A Love Story'} in ${milestone}`;
	const subTextSize = width * 0.032;
	ctx.font = `500 ${subTextSize}px "Plus Jakarta Sans Variable"`;
	ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
	ctx.fillText(subText, leftMargin, bottomCursor);
	bottomCursor -= measuredAscent(ctx, subText, subTextSize) + width * 0.035;

	// Headline milestone / names
	const mainHeadline = bond.names;
	const headlineSize = fitFontSize(ctx, mainHeadline, 'Playfair Display Variable', 800, width * 0.11, width * 0.06, maxTextW);
	ctx.font = `800 ${headlineSize}px "Playfair Display Variable"`;
	ctx.fillStyle = '#ffffff';
	ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
	ctx.shadowBlur = width * 0.02;
	ctx.fillText(mainHeadline, leftMargin, bottomCursor);
	ctx.shadowBlur = 0;
	bottomCursor -= measuredAscent(ctx, mainHeadline, headlineSize) + width * 0.025;

	// Small category tag
	ctx.font = `700 ${width * 0.024}px "Plus Jakarta Sans Variable"`;
	if ('letterSpacing' in ctx) ctx.letterSpacing = `${width * 0.005}px`;
	ctx.fillStyle = color;
	ctx.fillText('FEATURED RELATIONSHIP', leftMargin, bottomCursor);
	if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

/* -------------------------------------------------------------------------
 * Style: Botanical (Zen) — serene earth tones, organic arch photo frame,
 * canvas leaf foliage, and calm natural elegance with subtle color accents.
 * ---------------------------------------------------------------------- */

async function renderBotanicalStyle(
	ctx: CanvasRenderingContext2D,
	format: ShareCardFormat,
	dims: Dimensions,
	bond: Bond,
	milestone: string,
	color: string
): Promise<void> {
	const { width, height } = dims;

	// Soothing sage / sand organic background with subtle accent wash
	const bg = ctx.createLinearGradient(0, 0, width, height);
	bg.addColorStop(0, '#f4f6f4');
	bg.addColorStop(0.5, '#ecf0ec');
	bg.addColorStop(1, lighten(color, 0.93));
	ctx.fillStyle = bg;
	ctx.fillRect(0, 0, width, height);

	const isStory = format === 'story';
	const archW = isStory ? width * 0.72 : width * 0.58;
	const archH = isStory ? height * 0.45 : height * 0.43;
	const archX = (width - archW) / 2;
	const archY = isStory ? height * 0.1 : height * 0.06;
	const archR = archW / 2;

	// Helper for arch path (semicircle top, rectangle bottom)
	function createArchPath() {
		ctx.beginPath();
		ctx.moveTo(archX, archY + archH);
		ctx.lineTo(archX, archY + archR);
		ctx.arc(archX + archR, archY + archR, archR, Math.PI, 0);
		ctx.lineTo(archX + archW, archY + archH);
		ctx.closePath();
	}

	// Arch drop shadow & background fill
	ctx.save();
	createArchPath();
	ctx.shadowColor = 'rgba(50, 70, 55, 0.12)';
	ctx.shadowBlur = width * 0.04;
	ctx.shadowOffsetY = width * 0.015;
	ctx.fillStyle = '#ffffff';
	ctx.fill();
	ctx.restore();

	// Draw photo inside arch
	let drewPhoto = false;
	if (bond.photoBlob) {
		ctx.save();
		createArchPath();
		ctx.clip();
		try {
			await drawCoverPhotoInRect(ctx, bond.photoBlob, archX, archY, archW, archH, bond.photoUrl);
			drewPhoto = true;
		} catch (err) {
			console.warn('Failed to draw botanical arch photo, falling back to glyph:', err);
		}
		ctx.restore();
	}
	if (!drewPhoto) {
		ctx.save();
		createArchPath();
		ctx.clip();
		ctx.fillStyle = lighten(color, 0.88);
		ctx.fill();
		await drawBondGlyph(ctx, archX + archW / 2, archY + archH / 2, archW * 0.2, bond.type, color);
		ctx.restore();
	}

	// Outer arch delicate stroke + subtle accent color keyline
	createArchPath();
	ctx.strokeStyle = hexToRgba(color, 0.3);
	ctx.lineWidth = 2.5;
	ctx.stroke();

	// Botanical Leaf Sprigs outside arch top corners with subtle accent tone berries
	function drawLeafSprig(startX: number, startY: number, angle: number, scale: number) {
		ctx.save();
		ctx.translate(startX, startY);
		ctx.rotate(angle);
		ctx.scale(scale, scale);

		ctx.beginPath();
		ctx.moveTo(0, 0);
		ctx.quadraticCurveTo(30, -40, 70, -80);
		ctx.strokeStyle = 'rgba(74, 94, 78, 0.45)';
		ctx.lineWidth = 2;
		ctx.stroke();

		// Paired leaves
		const leafNodes = [
			{ t: 0.25, side: 1 },
			{ t: 0.25, side: -1 },
			{ t: 0.55, side: 1 },
			{ t: 0.55, side: -1 },
			{ t: 0.85, side: 1 },
			{ t: 0.85, side: -1 },
			{ t: 1.0, side: 0 }
		];

		for (const node of leafNodes) {
			const x = 70 * node.t;
			const y = -80 * node.t;
			ctx.beginPath();
			ctx.ellipse(x + node.side * 12, y - 5, 12, 6, node.side * 0.6, 0, Math.PI * 2);
			ctx.fillStyle = 'rgba(90, 115, 95, 0.35)';
			ctx.fill();

			// Accent berry dot
			if (node.side !== 0) {
				ctx.beginPath();
				ctx.arc(x + node.side * 4, y - 2, 2.5, 0, Math.PI * 2);
				ctx.fillStyle = hexToRgba(color, 0.55);
				ctx.fill();
			}
		}
		ctx.restore();
	}

	drawLeafSprig(archX - width * 0.02, archY + archR * 0.4, -0.4, width * 0.0014);
	drawLeafSprig(archX + archW + width * 0.02, archY + archR * 0.4, 0.4 + Math.PI / 2, width * 0.0014);

	// Typography below arch
	ctx.textAlign = 'center';
	ctx.textBaseline = 'alphabetic';

	const gap = width * 0.035;
	let cursorY = archY + archH + gap * 1.3;

	// Botanical header tag with subtle accent
	const bioTag = '✦ TOGETHER IN HARMONY ✦';
	const bioTagSize = width * 0.026;
	ctx.font = `700 ${bioTagSize}px "Plus Jakarta Sans Variable"`;
	if ('letterSpacing' in ctx) ctx.letterSpacing = `${bioTagSize * 0.15}px`;
	ctx.fillStyle = darken(color, 0.15);
	const tagBaseline = cursorY + measuredAscent(ctx, bioTag, bioTagSize);
	ctx.fillText(bioTag, width / 2, tagBaseline);
	if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
	cursorY = tagBaseline + measuredDescent(ctx, bioTag, bioTagSize) + gap * 0.8;

	// Milestone headline
	const milestoneFontSize = fitFontSize(ctx, milestone, 'Playfair Display Variable', 800, width * 0.14, width * 0.075, width * 0.84);
	ctx.font = `800 ${milestoneFontSize}px "Playfair Display Variable"`;
	ctx.fillStyle = '#233226';
	const milestoneBaseline = cursorY + measuredAscent(ctx, milestone, milestoneFontSize);
	ctx.fillText(milestone, width / 2, milestoneBaseline);
	cursorY = milestoneBaseline + measuredDescent(ctx, milestone, milestoneFontSize) + gap * 0.8;

	// Bond names (proper baseline clearance)
	const namesFontSize = fitFontSize(ctx, bond.names, 'Plus Jakarta Sans Variable', 700, width * 0.052, width * 0.03, width * 0.82);
	ctx.font = `700 ${namesFontSize}px "Plus Jakarta Sans Variable"`;
	ctx.fillStyle = '#3d4e41';
	const namesBaseline = cursorY + measuredAscent(ctx, bond.names, namesFontSize);
	ctx.fillText(bond.names, width / 2, namesBaseline);
	cursorY = namesBaseline + measuredDescent(ctx, bond.names, namesFontSize) + gap * 0.8;

	// Together since date pill with accent tint
	const dateText = `Since ${formatLongDate(bond.togetherSince)}`;
	const dateFontSize = width * 0.028;
	ctx.font = `600 ${dateFontSize}px "Plus Jakarta Sans Variable"`;
	const pillTextW = ctx.measureText(dateText).width;
	const pillH = dateFontSize * 2.1;
	const pillW = pillTextW + dateFontSize * 2.4;

	ctx.beginPath();
	ctx.roundRect(width / 2 - pillW / 2, cursorY, pillW, pillH, pillH / 2);
	ctx.fillStyle = hexToRgba(color, 0.12);
	ctx.fill();
	ctx.strokeStyle = hexToRgba(color, 0.3);
	ctx.lineWidth = 1;
	ctx.stroke();

	ctx.fillStyle = darken(color, 0.3);
	ctx.textBaseline = 'middle';
	ctx.fillText(dateText, width / 2, cursorY + pillH / 2);
	ctx.textBaseline = 'alphabetic';

	// Watermark
	ctx.font = `600 ${width * 0.022}px "Plus Jakarta Sans Variable"`;
	ctx.fillStyle = '#7a8e7e';
	ctx.fillText('🌿 OPEN LOVE', width / 2, isStory ? height - height * 0.055 : height - height * 0.035);
}

/* -------------------------------------------------------------------------
 * Style: Glass (Frosted Glassmorphism) — ultra-modern floating frosted glass
 * card over ambient background with ambient color orbs, glowing avatar
 * ring, and crisp modern metrics.
 * ---------------------------------------------------------------------- */

async function renderGlassStyle(
	ctx: CanvasRenderingContext2D,
	format: ShareCardFormat,
	dims: Dimensions,
	bond: Bond,
	milestone: string,
	color: string
): Promise<void> {
	const { width, height } = dims;

	// Background: dark base + ambient photo or gradients
	ctx.fillStyle = '#080c16';
	ctx.fillRect(0, 0, width, height);

	if (bond.photoBlob) {
		ctx.save();
		ctx.globalAlpha = 0.28;
		try {
			await drawCoverPhoto(ctx, bond.photoBlob, width, height, bond.photoUrl);
		} catch (err) {
			console.warn('Failed to draw glass ambient photo:', err);
		}
		ctx.restore();
	}

	// Ambient glowing radial color orbs
	const orb1 = ctx.createRadialGradient(width * 0.2, height * 0.25, 0, width * 0.2, height * 0.25, width * 0.55);
	orb1.addColorStop(0, color);
	orb1.addColorStop(1, 'rgba(0, 0, 0, 0)');
	ctx.save();
	ctx.globalAlpha = 0.4;
	ctx.fillStyle = orb1;
	ctx.fillRect(0, 0, width, height);

	const orb2 = ctx.createRadialGradient(width * 0.8, height * 0.75, 0, width * 0.8, height * 0.75, width * 0.55);
	orb2.addColorStop(0, darken(color, 0.4));
	orb2.addColorStop(1, 'rgba(0, 0, 0, 0)');
	ctx.fillStyle = orb2;
	ctx.fillRect(0, 0, width, height);
	ctx.restore();

	// Floating Frosted Glass Card
	const isStory = format === 'story';
	const cardW = width * 0.86;
	const cardH = isStory ? height * 0.76 : height * 0.84;
	const cardX = (width - cardW) / 2;
	const cardY = isStory ? height * 0.11 : height * 0.08;
	const cardRadius = width * 0.06;

	// Drop shadow
	ctx.save();
	ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
	ctx.shadowBlur = width * 0.05;
	ctx.shadowOffsetY = width * 0.025;
	ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
	ctx.beginPath();
	ctx.roundRect(cardX, cardY, cardW, cardH, cardRadius);
	ctx.fill();
	ctx.restore();

	// Frosted fill inside
	ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
	ctx.beginPath();
	ctx.roundRect(cardX, cardY, cardW, cardH, cardRadius);
	ctx.fill();

	// Glass Border Gradient Stroke
	const strokeGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
	strokeGrad.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
	strokeGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)');
	strokeGrad.addColorStop(1, 'rgba(255, 255, 255, 0.35)');
	ctx.strokeStyle = strokeGrad;
	ctx.lineWidth = width * 0.0035;
	ctx.stroke();

	// Top Specular Highlight
	ctx.beginPath();
	ctx.moveTo(cardX + cardRadius, cardY + 1.5);
	ctx.lineTo(cardX + cardW - cardRadius, cardY + 1.5);
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
	ctx.lineWidth = 2;
	ctx.stroke();

	// Inner Avatar
	const avatarCy = cardY + cardH * (isStory ? 0.22 : 0.2);
	const avatarRadius = width * 0.13;

	let drewAvatar = false;
	if (bond.photoBlob) {
		try {
			await drawCircularPhoto(ctx, bond.photoBlob, width / 2, avatarCy, avatarRadius, bond.photoUrl);
			ctx.beginPath();
			ctx.arc(width / 2, avatarCy, avatarRadius, 0, Math.PI * 2);
			ctx.strokeStyle = color;
			ctx.lineWidth = width * 0.007;
			ctx.shadowColor = color;
			ctx.shadowBlur = width * 0.03;
			ctx.stroke();
			ctx.shadowBlur = 0;
			drewAvatar = true;
		} catch (err) {
			console.warn('Failed to draw glass avatar photo, falling back to glyph:', err);
		}
	}
	if (!drewAvatar) {
		await drawBondGlyph(ctx, width / 2, avatarCy, avatarRadius, bond.type, color);
	}

	ctx.textAlign = 'center';
	ctx.textBaseline = 'alphabetic';

	const gap = width * 0.036;
	let cursorY = avatarCy + avatarRadius + gap * 1.2;

	// Pill badge
	const badgeLabel = (bond.type === 'friendship' ? 'Friends for' : 'Together for').toUpperCase();
	const badgeSize = width * 0.028;
	ctx.font = `700 ${badgeSize}px "Plus Jakarta Sans Variable"`;
	const pillTextW = ctx.measureText(badgeLabel).width;
	const pillH = badgeSize * 2.1;
	const pillW = pillTextW + badgeSize * 2.4;

	ctx.beginPath();
	ctx.roundRect(width / 2 - pillW / 2, cursorY, pillW, pillH, pillH / 2);
	ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
	ctx.fill();
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
	ctx.lineWidth = 1;
	ctx.stroke();

	// Dot in pill
	ctx.beginPath();
	ctx.arc(width / 2 - pillTextW / 2 - badgeSize * 0.3, cursorY + pillH / 2, badgeSize * 0.3, 0, Math.PI * 2);
	ctx.fillStyle = color;
	ctx.fill();

	ctx.fillStyle = '#ffffff';
	ctx.textBaseline = 'middle';
	ctx.fillText(badgeLabel, width / 2 + badgeSize * 0.2, cursorY + pillH / 2);
	ctx.textBaseline = 'alphabetic';
	cursorY += pillH + gap * 0.9;

	// Big Modern Milestone Headline
	const milestoneFontSize = fitFontSize(ctx, milestone, 'Playfair Display Variable', 800, width * 0.17, width * 0.09, cardW * 0.88);
	ctx.font = `800 ${milestoneFontSize}px "Playfair Display Variable"`;
	ctx.fillStyle = '#ffffff';
	ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
	ctx.shadowBlur = width * 0.02;
	const milestoneBaseline = cursorY + measuredAscent(ctx, milestone, milestoneFontSize);
	ctx.fillText(milestone, width / 2, milestoneBaseline);
	ctx.shadowBlur = 0;
	cursorY = milestoneBaseline + measuredDescent(ctx, milestone, milestoneFontSize) + gap * 0.8;

	// Bond Names (proper baseline clearance)
	const namesFontSize = fitFontSize(ctx, bond.names, 'Plus Jakarta Sans Variable', 700, width * 0.054, width * 0.03, cardW * 0.85);
	ctx.font = `700 ${namesFontSize}px "Plus Jakarta Sans Variable"`;
	ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
	const namesBaseline = cursorY + measuredAscent(ctx, bond.names, namesFontSize);
	ctx.fillText(bond.names, width / 2, namesBaseline);
	cursorY = namesBaseline + measuredDescent(ctx, bond.names, namesFontSize) + gap * 0.8;

	// Date Pill
	const dateText = `✦ ${formatLongDate(bond.togetherSince)} ✦`;
	const dateFontSize = width * 0.028;
	ctx.font = `500 ${dateFontSize}px "Plus Jakarta Sans Variable"`;
	const datePillTextW = ctx.measureText(dateText).width;
	const datePillH = dateFontSize * 2.0;
	const datePillW = datePillTextW + dateFontSize * 2.4;

	ctx.beginPath();
	ctx.roundRect(width / 2 - datePillW / 2, cursorY, datePillW, datePillH, datePillH / 2);
	ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
	ctx.fill();
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
	ctx.lineWidth = 1;
	ctx.stroke();

	ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
	ctx.textBaseline = 'middle';
	ctx.fillText(dateText, width / 2, cursorY + datePillH / 2);
	ctx.textBaseline = 'alphabetic';

	// Card Footer Watermark
	ctx.font = `600 ${width * 0.022}px "Plus Jakarta Sans Variable"`;
	ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
	ctx.fillText('OPEN LOVE', width / 2, cardY + cardH - width * 0.04);
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
 * eight styles (Scrim, Framed, Bold, Polaroid, Constellation, Monograph,
 * Botanical, Glass) and one of two sizes (Story/9:16 or square feed post).
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
	} else if (style === 'polaroid') {
		await renderPolaroidStyle(ctx, format, dims, bond, milestone, color);
	} else if (style === 'constellation') {
		await renderConstellationStyle(ctx, format, dims, bond, milestone, color);
	} else if (style === 'monograph') {
		await renderMonographStyle(ctx, format, dims, bond, milestone, color, timeBreakdown);
	} else if (style === 'botanical') {
		await renderBotanicalStyle(ctx, format, dims, bond, milestone, color);
	} else if (style === 'glass') {
		await renderGlassStyle(ctx, format, dims, bond, milestone, color);
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
