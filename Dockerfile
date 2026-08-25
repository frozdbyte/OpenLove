# ==========================================
# Stage 1: Build dependencies & application (Native speed on host)
# ==========================================
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS builder

WORKDIR /app

# Install native tools for build stage
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@9

# Copy package manifests & prisma schema
COPY package.json pnpm-lock.yaml* .npmrc* ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# Install dependencies for build
RUN pnpm install --frozen-lockfile

# Copy application source code
COPY . .

# Generate Prisma Client & Build SvelteKit production bundle
ENV NODE_ENV=production
RUN npx prisma generate
RUN npx vite build

# ==========================================
# Stage 2: Production runtime (Zero RUN steps for 100% reliable cross-arch assembly)
# ==========================================
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATABASE_URL="file:/app/data/openlove.db"

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
