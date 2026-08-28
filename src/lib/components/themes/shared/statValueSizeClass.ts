/**
 * Steps a stat value's text size down as its formatted length grows, so a
 * long-running bond's larger numbers (Hours/Minutes) shrink to fit instead
 * of wrapping or getting clipped. Shared across the scrapbook-style themes
 * (Polaroid/Monograph/Botanical/Constellation) that lay out their own stat
 * grids rather than using `StatBreakdownGrid`. Callers add their own
 * font-weight/family classes alongside this.
 */
export function statValueSizeClass(value: number): string {
	const len = value.toLocaleString().length;
	if (len > 9) return 'text-xs';
	if (len > 7) return 'text-xs sm:text-sm';
	if (len > 5) return 'text-sm sm:text-base';
	return 'text-base sm:text-lg';
}
