import { describe, it, expect } from 'vitest';
import { encryptBlob, decryptToBlob } from './imageCrypto';

describe('encryptBlob / decryptToBlob', () => {
	it('round-trips a Blob through encryption and decryption', async () => {
		const bytes = new Uint8Array([1, 2, 3, 4, 5, 250, 251, 252]);
		const blob = new Blob([bytes], { type: 'image/png' });

		const { ciphertext, key, iv } = await encryptBlob(blob);
		expect(typeof ciphertext).toBe('string');
		expect(typeof key).toBe('string');
		expect(typeof iv).toBe('string');
		// Ciphertext must not just be the plaintext re-encoded.
		expect(ciphertext).not.toBe(btoa(String.fromCharCode(...bytes)));

		const restored = await decryptToBlob(ciphertext, key, iv, 'image/png');
		expect(restored.type).toBe('image/png');
		const restoredBytes = new Uint8Array(await restored.arrayBuffer());
		expect(Array.from(restoredBytes)).toEqual(Array.from(bytes));
	});

	it('generates a fresh key/iv/ciphertext on every call, even for identical input', async () => {
		const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
		const a = await encryptBlob(blob);
		const b = await encryptBlob(blob);

		expect(a.key).not.toBe(b.key);
		expect(a.iv).not.toBe(b.iv);
		expect(a.ciphertext).not.toBe(b.ciphertext);
	});

	it('rejects when decrypting with the wrong key (AES-GCM auth tag mismatch)', async () => {
		const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
		const encrypted = await encryptBlob(blob);
		const other = await encryptBlob(blob);

		await expect(decryptToBlob(encrypted.ciphertext, other.key, encrypted.iv, 'image/png')).rejects.toThrow();
	});

	it('rejects when decrypting with the wrong iv', async () => {
		const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
		const encrypted = await encryptBlob(blob);
		const other = await encryptBlob(blob);

		await expect(decryptToBlob(encrypted.ciphertext, encrypted.key, other.iv, 'image/png')).rejects.toThrow();
	});

	it('round-trips content larger than one internal base64 chunk (0x8000 bytes)', async () => {
		const bytes = new Uint8Array(0x8000 + 500);
		for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
		const blob = new Blob([bytes], { type: 'image/jpeg' });

		const { ciphertext, key, iv } = await encryptBlob(blob);
		const restored = await decryptToBlob(ciphertext, key, iv, 'image/jpeg');
		const restoredBytes = new Uint8Array(await restored.arrayBuffer());

		expect(restoredBytes.length).toBe(bytes.length);
		expect(Array.from(restoredBytes)).toEqual(Array.from(bytes));
	});

	it('falls back to application/octet-stream when no mime type is given on decrypt', async () => {
		const blob = new Blob([new Uint8Array([1])], { type: 'image/png' });
		const { ciphertext, key, iv } = await encryptBlob(blob);
		const restored = await decryptToBlob(ciphertext, key, iv, '');
		expect(restored.type).toBe('application/octet-stream');
	});
});
