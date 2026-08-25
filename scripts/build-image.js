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
const imageTag = `${imageRepo}:${version}`;
const platforms = process.env.PLATFORMS || 'linux/amd64,linux/arm64';

console.log(`\n📦 OpenLove Container Build`);
console.log(`──────────────────────────────────────────`);
console.log(`🏷️  Version:   ${version}`);
console.log(`🖼️  Image:     ${imageTag}`);
console.log(`🌐 Platforms: ${platforms}`);
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

// 1. Remove existing local manifest if already present (ignore failure if not present)
spawnSync('podman', ['manifest', 'rm', imageTag], { stdio: 'ignore', shell: true });

// 2. Create manifest
console.log(`📋 Creating Podman manifest for ${imageTag}...`);
runCommand('podman', ['manifest', 'create', imageTag]);

// 3. Build multi-arch image
console.log(`\n🚀 Building multi-arch container images (${platforms})...`);
runCommand('podman', [
	'build',
	'--platform', platforms,
	'--manifest', imageTag,
	'.'
]);

console.log(`\n✅ Build complete! Manifest created: ${imageTag}\n`);
