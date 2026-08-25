import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const packageJsonPath = path.resolve(process.cwd(), 'package.json');
if (!fs.existsSync(packageJsonPath)) {
	console.error('❌ Error: package.json not found in current working directory.');
	process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = process.argv[2] || pkg.version;
const imageRepo = process.env.IMAGE_REPO || 'docker.io/frozdbyte/openlove';
const versionTag = `${imageRepo}:${version}`;
const latestTag = `${imageRepo}:latest`;

console.log(`\n🚀 OpenLove Container Publish`);
console.log(`──────────────────────────────────────────`);
console.log(`🏷️  Version Tag: ${versionTag}`);
console.log(`🏷️  Latest Tag:  ${latestTag}`);
console.log(`──────────────────────────────────────────\n`);

function runCommand(command, args) {
	console.log(`▶ ${command} ${args.join(' ')}`);
	const result = spawnSync(command, args, {
		stdio: 'inherit',
		shell: true
	});

	if (result.status !== 0) {
		console.error(`\n❌ Command failed with exit code ${result.status}: ${command} ${args.join(' ')}`);
		process.exit(result.status || 1);
	}
}

// 1. Tag manifest list as latest
console.log(`🏷️  Tagging ${versionTag} as ${latestTag}...`);
runCommand('podman', ['tag', versionTag, latestTag]);

// 2. Push versioned manifest
console.log(`\n📤 Pushing versioned manifest: ${versionTag}...`);
runCommand('podman', ['manifest', 'push', '--all', versionTag, `docker://${versionTag}`]);

// 3. Push latest manifest
console.log(`\n📤 Pushing latest manifest: ${latestTag}...`);
runCommand('podman', ['manifest', 'push', '--all', latestTag, `docker://${latestTag}`]);

console.log(`\n🎉 Successfully published multi-arch images!`);
console.log(`  👉 ${versionTag}`);
console.log(`  👉 ${latestTag}\n`);
