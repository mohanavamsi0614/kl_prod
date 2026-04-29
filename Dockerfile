# ============================================
# Stage 1: Build Frontend
# ============================================
FROM node:20-bullseye-slim AS frontend-builder

# Allow passing the production API URL at build time so Vite embeds it
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

WORKDIR /app/frontend

# Install dependencies for the frontend and build. Use lowercase `frontend` directory.
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build


# ============================================
# Stage 2: Build Backend
# ============================================
FROM node:20-bullseye-slim AS backend-builder

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build:server


# ============================================
# Stage 3: Production Image
# ============================================
FROM node:20-bullseye-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY --from=backend-builder /app/dist ./dist
COPY --from=backend-builder /app/prisma ./prisma

RUN npx prisma generate

COPY --from=frontend-builder /app/frontend/dist ./public

# Default to Cloud Run's expected port; override via runtime env if needed
ENV PORT=4000
EXPOSE 4000
CMD ["node", "dist/server.js"]
