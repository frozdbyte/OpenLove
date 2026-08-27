import { describe, it, expect } from 'vitest';
import { decodeSharePayloadString } from './share';

describe('decodeSharePayloadString', () => {
	it('decodes a full share URL containing #import=<uri-encoded-base64-json>', () => {
		const json = JSON.stringify({ names: 'Emma & Paul' });
		const url = `https://example.com/#import=${encodeURIComponent(btoa(json))}`;
		expect(decodeSharePayloadString(url)).toBe(json);
	});

	it('passes raw JSON through unchanged', () => {
		const json = '{"names":"Emma & Paul"}';
		expect(decodeSharePayloadString(json)).toBe(json);
	});

	it('decodes a bare base64 sync code', () => {
		const json = JSON.stringify({ names: 'Emma & Paul' });
		expect(decodeSharePayloadString(btoa(json))).toBe(json);
	});

	it('falls back to the raw string when it is neither a #import= URL, JSON, nor valid base64', () => {
		const garbage = 'not valid base64 !!! ###';
		expect(decodeSharePayloadString(garbage)).toBe(garbage);
	});
});
