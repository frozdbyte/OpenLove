import { describe, it, expect } from 'vitest';
import { blobToBase64, base64ToBlob, bytesToBase64, base64ToBytes } from './imageBase64';

describe('bytesToBase64 / base64ToBytes', () => {
	it('round-trips raw bytes, including a chunk-boundary-crossing length', () => {
		const bytes = new Uint8Array(0x8000 + 3);
		for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) % 256;

		const restored = base64ToBytes(bytesToBase64(bytes));
		expect(Array.from(restored)).toEqual(Array.from(bytes));
	});

	it('round-trips an empty array', () => {
		expect(Array.from(base64ToBytes(bytesToBase64(new Uint8Array(0))))).toEqual([]);
	});
});

describe('blobToBase64 / base64ToBlob', () => {
	it('round-trips small binary content and preserves the mime type', async () => {
		const bytes = new Uint8Array([0, 1, 2, 253, 254, 255, 137, 80, 78, 71]);
		const blob = new Blob([bytes], { type: 'image/png' });

		const base64 = await blobToBase64(blob);
		const restored = base64ToBlob(base64, 'image/png');

		expect(restored.type).toBe('image/png');
		expect(restored.size).toBe(bytes.length);
		const restoredBytes = new Uint8Array(await restored.arrayBuffer());
		expect(Array.from(restoredBytes)).toEqual(Array.from(bytes));
	});

	it('round-trips content larger than the internal chunk size (0x8000 bytes)', async () => {
		const bytes = new Uint8Array(0x8000 + 137);
		for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
		const blob = new Blob([bytes], { type: 'image/jpeg' });

		const base64 = await blobToBase64(blob);
		const restored = base64ToBlob(base64, 'image/jpeg');
		const restoredBytes = new Uint8Array(await restored.arrayBuffer());

		expect(restoredBytes.length).toBe(bytes.length);
		expect(Array.from(restoredBytes)).toEqual(Array.from(bytes));
	});

	it('falls back to application/octet-stream when no mime type is given', () => {
		const restored = base64ToBlob(btoa('abc'), '');
		expect(restored.type).toBe('application/octet-stream');
	});
});
