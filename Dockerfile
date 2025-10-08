# syntax=docker/dockerfile:1

# --- Build frontend ---
FROM node:20 AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend .
RUN npm run build

# --- Install backend production deps ---
FROM node:20-slim AS backend-deps
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev

# --- Runtime image ---
FROM node:20-slim
ENV NODE_ENV=production
WORKDIR /app/backend

# Copy backend deps and source
COPY --from=backend-deps /app/backend/node_modules ./node_modules
COPY backend .

# Copy built frontend into public directory to be served by Express
COPY --from=frontend-build /app/frontend/dist ./public

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "src/index.js"]