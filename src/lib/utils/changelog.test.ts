import { describe, it, expect } from 'vitest';
import { parseChangelog } from './changelog';

const FIXTURE = `# Changelog

## [Unreleased]

## [1.1.0] - 2026-01-02

### Added

- Widget support
- Gadget support

### Fixed

- Crash on startup

## [1.0.0] - 2026-01-01

Initial release.

### Added

- Everything
`;

describe('parseChangelog', () => {
	it('skips empty entries like an [Unreleased] header with no sections yet', () => {
		const entries = parseChangelog(FIXTURE);
		expect(entries.map((e) => e.version)).toEqual(['1.1.0', '1.0.0']);
	});

	it('parses version, date, and section items in document order', () => {
		const [latest] = parseChangelog(FIXTURE);
		expect(latest.version).toBe('1.1.0');
		expect(latest.date).toBe('2026-01-02');
		expect(latest.sections).toEqual([
			{ heading: 'Added', items: ['Widget support', 'Gadget support'] },
			{ heading: 'Fixed', items: ['Crash on startup'] }
		]);
	});

	it('tolerates a version header with no date', () => {
		const entries = parseChangelog('## [1.0.0]\n\n### Added\n\n- Thing\n');
		expect(entries[0]).toEqual({
			version: '1.0.0',
			date: null,
			sections: [{ heading: 'Added', items: ['Thing'] }]
		});
	});
});
