#!/usr/bin/env node
/**
 * Converts the repo-root CHANGELOG.md into docs/changelog.json for the static
 * landing page's "What's New" section, run by the deploy-pages workflow before
 * publishing. Mirrors the parsing rules in `src/lib/utils/changelog.ts` — kept
 * as a small standalone copy (like the rest of scripts/*.js) rather than a
 * shared module, since this file is built and run outside the SvelteKit app.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const source = readFileSync(`${ROOT}/CHANGELOG.md`, 'utf8');

function parseChangelog(text) {
	const entries = [];
	const blocks = text.split(/\n(?=## \[)/);

	for (const block of blocks) {
		const header = block.match(/^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?/);
		if (!header) continue;
		const [, version, date] = header;

		const sections = [];
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

const entries = parseChangelog(source).slice(0, 8);
writeFileSync(`${ROOT}/docs/changelog.json`, JSON.stringify(entries, null, 2));
console.log(`Wrote docs/changelog.json (${entries.length} entries)`);
