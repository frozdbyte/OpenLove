# ==========================================
# Stage 1: Build dependencies & application (Native speed on host)
# ==========================================
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS builder

WORKDIR /app

# Set build environment variables
ENV DATABASE_URL="file:./data/openlove.db"

# Install native tools for build stage
RUN apt-get update -y && apt-get install -y openssl ca-certificates python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@9

# Copy package manifests & prisma schema
COPY package.json pnpm-lock.yaml* .npmrc* ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# Install dependencies and compile native addons
RUN pnpm install --frozen-lockfile && pnpm rebuild

# Copy application source code
COPY . .

# Generate SvelteKit types (tsconfig.json extends .svelte-kit/tsconfig.json)
RUN pnpm exec svelte-kit sync

# Generate Prisma Client & Build SvelteKit production bundle
RUN pnpm exec prisma generate
RUN NODE_ENV=production pnpm exec vite build

# ==========================================
# Intermediate: Provide openssl binary for the target platform (no RUN needed)
# ==========================================
FROM node:22-bookworm AS openssl-src

# ==========================================
# Stage 2: Production runtime (Zero RUN steps for 100% reliable cross-arch assembly)
# ==========================================
FROM node:22-bookworm-slim AS runner

# Provide openssl so Prisma can detect the libssl version (bookworm-slim lacks openssl + libssl3)
COPY --from=openssl-src /usr/bin/openssl /usr/bin/openssl
COPY --from=openssl-src /usr/lib/*/libssl.so.3 /usr/lib/
COPY --from=openssl-src /usr/lib/*/libcrypto.so.3 /usr/lib/

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATABASE_URL="file:/app/data/openlove.db"
# adapter-node's own request-body ceiling defaults to 512K, well below a
# typical phone photo relayed by the shared-image feature. Disabled here in
# favor of the app's own explicit MAX_SHARED_IMAGE_BYTES check
# (src/lib/server/sharedImage.ts), which is the single source of truth for
# that limit — see the share-import-safety skill.
ENV BODY_SIZE_LIMIT=Infinity

# Copy built application, config and dependencies from builder
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/entrypoint.sh ./entrypoint.sh

# Persistent storage volume for SQLite DB & VAPID keys
VOLUME ["/app/data"]

EXPOSE 3000

# Execute entrypoint via shell (avoids needing chmod +x inside foreign architectures)
ENTRYPOINT ["sh", "./entrypoint.sh"]
