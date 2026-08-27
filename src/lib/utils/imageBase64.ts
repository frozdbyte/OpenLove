/**
 * Base64 conversion helpers for the image-sharing feature. `bytesToBase64`/
 * `base64ToBytes` are the byte-level primitives — also used directly by
 * `imageCrypto.ts` to encode/decode raw key/iv/ciphertext bytes from
 * `crypto.subtle`, not just whole `Blob`s. `blobToBase64`/`base64ToBlob`
 * (used by `profileStore.exportBackupJSON()`/`importJSON()` for inline
 * *unencrypted* backup photos) are thin `Blob` convenience wrappers around
 * them. Kept separate from `utils/base64.ts` (VAPID key decoding,
 * service-worker-safe) since this is a different concern with no reason to
 * be loaded by the service worker.
 */

/** Avoids `String.fromCharCode(...hugeArray)` blowing the call stack on a large photo. */
const CHUNK_SIZE = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
		binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
	}
	return btoa(binary);
}

/**
 * Return type pinned to `Uint8Array<ArrayBuffer>` (not the wider default
 * `Uint8Array<ArrayBufferLike>`, which also covers `SharedArrayBuffer`) —
 * `Blob`'s constructor and `crypto.subtle`'s `BufferSource` params both
 * require the narrower type; `new Uint8Array(length)` always allocates a
 * fresh, non-shared buffer, so this is purely a type annotation, not a
 * behavior change.
 */
export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

export async function blobToBase64(blob: Blob): Promise<string> {
	return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
	return new Blob([base64ToBytes(base64)], { type: mimeType || 'application/octet-stream' });
}
