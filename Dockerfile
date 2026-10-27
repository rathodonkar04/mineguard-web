# ==============================================================================
# MineGuard Production Multi-Stage Dockerfile
# Smart India Hackathon 2026 (Problem Statement 26025)
# "AI-enabled Real-Time Mine Subsidence Monitoring & Early Warning System"
# ==============================================================================

# STAGE 1: Frontend Build Environment
FROM node:22-alpine AS frontend-builder
WORKDIR /app

# Copy package manifests
COPY package.json package-lock.json ./
RUN npm ci

# Copy frontend source and build static bundle
COPY vite.config.js index.html ./
COPY public/ ./public/
COPY src/ ./src/
RUN npm run build

# STAGE 2: Backend Production Runtime
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000

# Install production dependencies for backend
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --omit=dev

# Copy backend code, AI models, and database migrations
COPY backend/ ./backend/
COPY firmware/ ./firmware/
COPY ai/models/ ./ai/models/

# Copy compiled frontend production bundle from stage 1 into backend public root
COPY --from=frontend-builder /app/dist ./backend/public

# Expose SCADA service port
EXPOSE 5000

# Health check probe against live /api/health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

# Launch production server
WORKDIR /app/backend
CMD ["node", "server.js"]
