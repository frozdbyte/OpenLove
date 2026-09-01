import raw from '../../../CHANGELOG.md?raw';

export interface ChangelogSection {
	heading: string;
	items: string[];
}

export interface ChangelogEntry {
	version: string;
	date: string | null;
	sections: ChangelogSection[];
}

/**
 * Parses the repo-root CHANGELOG.md (Keep a Changelog format) into structured
 * entries, so the in-app "What's New" list and the doc itself never drift —
 * this is the only reader of that file, not a second copy of its content.
 */
export function parseChangelog(source: string): ChangelogEntry[] {
	const entries: ChangelogEntry[] = [];
	const blocks = source.split(/\n(?=## \[)/);

	for (const block of blocks) {
		const header = block.match(/^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?/);
		if (!header) continue;
		const [, version, date] = header;

		const sections: ChangelogSection[] = [];
		for (const sectionBlock of block.split(/\n(?=### )/).slice(1)) {
			const sectionHeader = sectionBlock.match(/^### (.+)/);
			if (!sectionHeader) continue;
			const items = [...sectionBlock.matchAll(/^- (.+)$/gm)].map((m) => m[1].trim());
			if (items.length) sections.push({ heading: sectionHeader[1].trim(), items });
		}

		if (sections.length) entries.push({ version, date: date ?? null, sections });
	}

	return entries;
}

export const CHANGELOG: ChangelogEntry[] = parseChangelog(raw);
