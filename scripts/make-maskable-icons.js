import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

// Android's adaptive icon mask can crop up to ~20% off every edge, so maskable
// icons need their artwork confined to a safe-zone circle (recommended: fit
// within ~65-70% of the canvas, centered) and a fully opaque background —
// unlike our full-bleed transparent `icon-*.png`, which is fine for iOS/favicon
// use but gets clipped and shows a black splash background on Android when
// reused for the `maskable` manifest purpose.
const BACKGROUND = '#151323';
const SAFE_ZONE_RATIO = 0.65;

const staticDir = path.resolve(process.cwd(), 'static');

async function makeMaskable(size) {
	const src = path.join(staticDir, `icon-${size}.png`);
	const out = path.join(staticDir, `icon-${size}-maskable.png`);
	const artworkSize = Math.round(size * SAFE_ZONE_RATIO);

	const artwork = await sharp(src).resize(artworkSize, artworkSize, { fit: 'contain' }).toBuffer();

	await sharp({
		create: {
			width: size,
			height: size,
			channels: 4,
			background: BACKGROUND
		}
	})
		.composite([{ input: artwork, gravity: 'center' }])
		.png()
		.toFile(out);

	console.log(`✅ Generated ${path.relative(process.cwd(), out)}`);
}

await makeMaskable(192);
await makeMaskable(512);
