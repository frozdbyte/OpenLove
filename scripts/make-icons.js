import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// Minimal pure-Node script to generate a solid gradient PNG with an SVG/heart emblem
function createPNG(width, height, r, g, b) {
	// Simple uncompressed or raw filtered RGBA image
	const rowSize = width * 4 + 1;
	const rawData = Buffer.alloc(rowSize * height);

	for (let y = 0; y < height; y++) {
		rawData[y * rowSize] = 0; // Filter: None
		for (let x = 0; x < width; x++) {
			const idx = y * rowSize + 1 + x * 4;
			// Simple circle radius check
			const cx = width / 2;
			const cy = height / 2;
			const dx = (x - cx) / (width / 2);
			const dy = (y - cy) / (height / 2);
			const dist = Math.sqrt(dx * dx + dy * dy);

			if (dist <= 0.85) {
				// Heart-ish / pink badge
				rawData[idx] = r;
				rawData[idx + 1] = g;
				rawData[idx + 2] = b;
				rawData[idx + 3] = 255;
			} else {
				rawData[idx] = 0;
				rawData[idx + 1] = 0;
				rawData[idx + 2] = 0;
				rawData[idx + 3] = 0;
			}
		}
	}

	const compressed = zlib.deflateSync(rawData);

	// PNG signature
	const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

	// IHDR chunk
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // color type: RGBA
	ihdr[10] = 0; // compression
	ihdr[11] = 0; // filter
	ihdr[12] = 0; // interlace

	const ihdrChunk = createChunk('IHDR', ihdr);
	const idatChunk = createChunk('IDAT', compressed);
	const iendChunk = createChunk('IEND', Buffer.alloc(0));

	return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
	const length = data.length;
	const chunk = Buffer.alloc(8 + length + 4);
	chunk.writeUInt32BE(length, 0);
	chunk.write(type, 4);
	data.copy(chunk, 8);
	const crc = crc32(chunk.subarray(4, 8 + length));
	chunk.writeInt32BE(crc, 8 + length);
	return chunk;
}

// Basic CRC32 table
const crcTable = [];
for (let n = 0; n < 256; n++) {
	let c = n;
	for (let k = 0; k < 8; k++) {
		if (c & 1) c = 0xedb88320 ^ (c >>> 1);
		else c = c >>> 1;
	}
	crcTable[n] = c;
}

function crc32(buf) {
	let crc = 0xffffffff;
	for (let i = 0; i < buf.length; i++) {
		crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) | 0;
}

const staticDir = path.resolve(process.cwd(), 'static');
if (!fs.existsSync(staticDir)) {
	fs.mkdirSync(staticDir, { recursive: true });
}

// Generate 192x192 and 512x512
const png192 = createPNG(192, 192, 225, 29, 72);
const png512 = createPNG(512, 512, 225, 29, 72);

fs.writeFileSync(path.join(staticDir, 'icon-192.png'), png192);
fs.writeFileSync(path.join(staticDir, 'icon-512.png'), png512);
fs.writeFileSync(path.join(staticDir, 'apple-touch-icon.png'), png192);
console.log('✅ Generated PWA icons in static/');
