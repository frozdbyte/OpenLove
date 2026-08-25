import { spawnSync } from 'node:child_process';
import path from 'node:path';

const customVersion = process.argv[2] ? ` ${process.argv[2]}` : '';

console.log('🚀 Running full build and publish release pipeline...\n');

const buildRes = spawnSync(`node ${path.join('scripts', 'build-image.js')}${customVersion}`, {
	stdio: 'inherit',
	shell: true
});

if (buildRes.status !== 0) {
	console.error('\n❌ Release build failed. Aborting publish.');
	process.exit(buildRes.status || 1);
}

const publishRes = spawnSync(`node ${path.join('scripts', 'publish-image.js')}${customVersion}`, {
	stdio: 'inherit',
	shell: true
});

if (publishRes.status !== 0) {
	console.error('\n❌ Release publish failed.');
	process.exit(publishRes.status || 1);
}

console.log('\n✨ Full build & publish pipeline completed successfully!\n');
