#!/usr/bin/env node
/**
 * Post-build guard for the service worker's precache manifest.
 *
 * The original offline bug failed *silently*: the service worker threw during
 * evaluation because `/` was missing from the precache manifest, registration
 * rejected, a `.catch()` swallowed it, and the app shipped for months claiming
 * offline support while caching literally nothing.
 *
 * Nothing about that is visible in build output, so it gets asserted here instead.
 * If this script fails, the build is not offline-capable — do not ship it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const SW_PATH = resolve(process.cwd(), 'build/client/service-worker.js');

/** Entries that must be precached for a cold offline start to work. */
const REQUIRED_URLS = ['/', 'manifest.webmanifest'];

/** Emitted-but-useless entries that indicate a misconfigured glob. */
const FORBIDDEN_URLS = ['service-worker.js', 'registerSW.js'];

function fail(message) {
	console.error(`\n[31m✖ precache check failed[0m — ${message}\n`);
	process.exit(1);
}

if (!existsSync(SW_PATH)) {
	fail(`no service worker at build/client/service-worker.js.
  The PWA plugin did not emit one. Check \`strategies: 'injectManifest'\` and
  \`filename: 'service-worker.ts'\` in vite.config.ts.`);
}

const source = readFileSync(SW_PATH, 'utf8');
const urls = [...source.matchAll(/"url":\s*"([^"]*)"/g)].map((match) => match[1]);

if (urls.length === 0) {
	fail(`the precache manifest is empty.
  \`self.__WB_MANIFEST\` was not injected, so nothing will ever be cached.`);
}

const missing = REQUIRED_URLS.filter((url) => !urls.includes(url));
if (missing.length > 0) {
	fail(`the precache manifest is missing ${missing.map((u) => `"${u}"`).join(', ')}.
  Without "/" the navigation route throws at evaluation time and the whole service
  worker dies — taking push notifications down with it. Most likely the root route
  stopped being prerendered: check \`export const prerender = true\` in
  src/routes/+layout.ts and that build/prerendered/index.html exists.
  Manifest currently holds ${urls.length} entr${urls.length === 1 ? 'y' : 'ies'}.`);
}

const forbidden = FORBIDDEN_URLS.filter((url) => urls.includes(url));
if (forbidden.length > 0) {
	fail(`the precache manifest contains ${forbidden.map((u) => `"${u}"`).join(', ')}.
  A service worker must not precache itself. Check \`globPatterns\`/\`globIgnores\`.`);
}

const assets = urls.filter((url) => url.startsWith('_app/immutable/'));
const fonts = urls.filter((url) => url.endsWith('.woff2'));

if (assets.length === 0) {
	fail(`no _app/immutable/* assets are precached, so the app cannot boot offline.`);
}
if (fonts.length === 0) {
	fail(`no .woff2 files are precached — both themes would fall back to system fonts
  offline. Check that the @fontsource-variable imports in src/app.css are intact.`);
}

/**
 * The service worker may only import DOM-free modules (AGENTS.md Invariant 7).
 * Pulling in anything that touches `document` — `profileStore`, a Svelte component —
 * makes it throw at evaluation time, which takes precaching *and* push down with it.
 * Bundled code is checked rather than the import list, so an indirect import is
 * caught too.
 */
const DOM_MARKERS = ['document.', 'profileStore', 'svelte/internal'];
const leaked = DOM_MARKERS.filter((marker) => source.includes(marker));
if (leaked.length > 0) {
	fail(`the service worker bundle references ${leaked.map((m) => `\`${m}\``).join(', ')}.
  A service worker has no DOM. Something in its import graph reaches window-only code —
  most likely $lib/sync/index.ts or $lib/push/client.ts, neither of which it may import.
  Keep it to $lib/sync/core.ts, $lib/storage/outbox.ts and $lib/utils/base64.ts.`);
}

console.log(
	`[32m✔ precache ok[0m — ${urls.length} entries ` +
		`(shell + ${assets.length} app assets + ${fonts.length} fonts), service worker is DOM-free`
);
