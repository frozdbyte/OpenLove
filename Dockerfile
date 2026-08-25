# ==========================================
# Stage 1: Build dependencies & application
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Install build essentials & tools
RUN apk add --no-cache openssl libc6-compat
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package manifests & prisma schema
COPY package.json pnpm-lock.yaml .npmrc* ./
COPY prisma ./prisma/

# Install dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy application source code
COPY . .

# Generate Prisma Client & Build SvelteKit production bundle
ENV NODE_ENV=production
RUN pnpm run prisma:generate
RUN pnpm run build
RUN pnpm prune --prod

# ==========================================
# Stage 2: Production runtime
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

# Install runtime dependencies for SQLite & Prisma
RUN apk add --no-cache openssl libc6-compat ca-certificates

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATABASE_URL="file:/app/data/openlove.db"

# Copy built app and dependencies from builder
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/entrypoint.sh ./entrypoint.sh

# Make entrypoint executable
RUN chmod +x ./entrypoint.sh

# Persistent storage volume for SQLite DB & VAPID keys
VOLUME ["/app/data"]

EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
