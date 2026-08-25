import { PrismaClient } from '$lib/generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const globalForPrisma = globalThis as unknown as {
	prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
	const dbUrl = process.env.DATABASE_URL || 'file:./data/openlove.db';
	const rawPath = dbUrl.startsWith('file:') ? dbUrl.slice(5) : dbUrl;
	const resolvedPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);

	const dir = path.dirname(resolvedPath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

	const adapter = new PrismaBetterSqlite3({
		url: resolvedPath
	});

	return new PrismaClient({
		adapter,
		log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error']
	});
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
	globalForPrisma.prisma = prisma;
}
