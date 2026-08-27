import { bytesToBase64, base64ToBytes } from './imageBase64';

/**
 * Client-side AES-GCM encrypt/decrypt for photos relayed through the server
 * for a QR/link share (IMAGE_SHARING_PLAN.md, Stage 5). Built on
 * `crypto.subtle` — no new dependency, consistent with this codebase's
 * existing preference for native/hand-rolled over a library (the same
 * instinct that avoided `workbox-background-sync`). Pure functions; no DOM
 * dependency beyond `crypto`/`Blob`, both available in Vitest's Node
 * environment too.
 *
 * Every value on the wire (`ciphertext`, `key`, `iv`) is base64, matching
 * what actually travels: `ciphertext` is POSTed/GET as JSON
 * (`shareImage.ts`), and `key`/`iv` travel only inside the share payload
 * itself (QR/link) — never sent to the server. See AGENTS.md Invariant 11.
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH_BITS = 256;
/** 96 bits — the IV size AES-GCM is specified and optimized for. */
const IV_LENGTH_BYTES = 12;

export interface EncryptedBlob {
	ciphertext: string;
	key: string;
	iv: string;
}

/** Encrypt a Blob with a freshly generated, single-use AES-GCM key. */
export async function encryptBlob(blob: Blob): Promise<EncryptedBlob> {
	const key = await crypto.subtle.generateKey({ name: ALGORITHM, length: KEY_LENGTH_BITS }, true, [
		'encrypt',
		'decrypt'
	]);
	const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
	const plaintext = await blob.arrayBuffer();

	const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, plaintext);
	const rawKey = await crypto.subtle.exportKey('raw', key);

	return {
		ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
		key: bytesToBase64(new Uint8Array(rawKey)),
		iv: bytesToBase64(iv)
	};
}

/**
 * Inverse of `encryptBlob`. `mimeType` travels alongside the share payload
 * separately (it isn't part of the ciphertext — AES-GCM carries no
 * metadata), same convention as `imageBase64.ts`'s `base64ToBlob`. Throws
 * if `key`/`iv` don't match the ciphertext (AES-GCM's authentication tag
 * check fails) — callers that need a fail-soft contract catch this
 * themselves; see `shareImage.ts`'s `fetchSharedImage()`.
 */
export async function decryptToBlob(
	ciphertext: string,
	key: string,
	iv: string,
	mimeType: string
): Promise<Blob> {
	const cryptoKey = await crypto.subtle.importKey(
		'raw',
		base64ToBytes(key),
		{ name: ALGORITHM, length: KEY_LENGTH_BITS },
		false,
		['decrypt']
	);
	const plaintext = await crypto.subtle.decrypt(
		{ name: ALGORITHM, iv: base64ToBytes(iv) },
		cryptoKey,
		base64ToBytes(ciphertext)
	);
	return new Blob([plaintext], { type: mimeType || 'application/octet-stream' });
}
