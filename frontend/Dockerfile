# syntax=docker/dockerfile:1

# --- Build stage ---
FROM node:24-alpine AS build
WORKDIR /app

# Allow overriding API/WS URLs at build time (Vite reads VITE_* at build)
ARG VITE_API_URL=/api
ARG VITE_WS_URL=
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_WS_URL=${VITE_WS_URL}

COPY package*.json ./
RUN npm ci
COPY . .
# Which build this is, shown in Settings and by /healthz (deploy.sh passes
# them; without, the version comes from package.json). Declared after the
# dependency install so a new commit doesn't redo it.
ARG GIT_COMMIT=
ARG BUILD_DATE=
ENV GIT_COMMIT=${GIT_COMMIT} BUILD_DATE=${BUILD_DATE}
RUN npm run build

# --- Runtime stage ---
FROM nginx:1.30-alpine AS runtime

# Nginx config serves SPA and proxies API + Socket.IO to backend
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]