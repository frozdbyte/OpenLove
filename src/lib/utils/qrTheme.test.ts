import { describe, it, expect } from 'vitest';
import { resolveQrColor, heartLogoDataUri } from './qrTheme';
import type { ColorPalette } from '$lib/types/profile';

describe('resolveQrColor', () => {
	it('returns a distinct hex for every palette', () => {
		const palettes: ColorPalette[] = ['rose', 'lavender', 'terracotta', 'sage', 'midnight'];
		const colors = palettes.map(resolveQrColor);
		expect(new Set(colors).size).toBe(palettes.length);
		for (const color of colors) {
			expect(color).toMatch(/^#[0-9a-f]{6}$/i);
		}
	});

	it('falls back to rose for an unknown palette', () => {
		expect(resolveQrColor('made-up' as ColorPalette)).toBe(resolveQrColor('rose'));
	});
});

describe('heartLogoDataUri', () => {
	it('embeds the given color as both fill and stroke', () => {
		const uri = heartLogoDataUri('#059669');
		expect(uri.startsWith('data:image/svg+xml;utf8,')).toBe(true);

		const svg = decodeURIComponent(uri.slice('data:image/svg+xml;utf8,'.length));
		expect(svg).toContain('fill="#059669"');
		expect(svg).toContain('stroke="#059669"');
		expect(svg).toContain('<svg');
		expect(svg).toContain('<path');
	});

	it('produces a different data URI per color', () => {
		expect(heartLogoDataUri('#e11d48')).not.toBe(heartLogoDataUri('#2563eb'));
	});
});
