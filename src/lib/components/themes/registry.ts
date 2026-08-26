import type { Component } from 'svelte';
import type { ThemeProps, UIThemeId } from '$lib/types/profile';
import ModernTheme from './ModernTheme.svelte';
import CoverTheme from './CoverTheme.svelte';
import TraditionalTheme from './TraditionalTheme.svelte';

export interface ThemeDefinition {
	id: UIThemeId;
	name: string;
	description: string;
	previewTag: string;
	component: Component<ThemeProps>;
}

export const THEME_REGISTRY: ThemeDefinition[] = [
	{
		id: 'modern',
		name: 'Modern (Default)',
		description: 'Glassmorphic cards, glowing couple avatar, live metrics and progress tracker.',
		previewTag: 'Recommended',
		component: ModernTheme
	},
	{
		id: 'cover',
		name: 'Modern (Cover Image)',
		description: 'Full-bleed cover photo, top header names, glassmorphic cards and live metrics.',
		previewTag: 'Cover Photo',
		component: CoverTheme
	},
	{
		id: 'traditional',
		name: 'Traditional (My Love)',
		description: 'Classic crimson bar, edge-to-edge photo with date banner and stacked serif typography.',
		previewTag: 'Classic',
		component: TraditionalTheme
	}
];

export function getThemeDefinition(id: UIThemeId): ThemeDefinition {
	const found = THEME_REGISTRY.find((t) => t.id === id);
	return found ?? THEME_REGISTRY[0];
}

export function getThemeComponent(id: UIThemeId): Component<ThemeProps> {
	return getThemeDefinition(id).component;
}
