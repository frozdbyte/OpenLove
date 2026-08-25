#!/bin/sh
set -e

# Ensure data directory exists
mkdir -p /app/data

# Sync SQLite database schema
echo "📦 Running Prisma DB migrations..."
npx prisma db push --skip-generate

# Start SvelteKit Node server
echo "🚀 Starting OpenLove server on port ${PORT:-3000}..."
exec node build/index.js
