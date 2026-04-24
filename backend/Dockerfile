# ---------- build stage ----------
FROM node:20-alpine AS builder
WORKDIR /app

# Install all deps (including dev) for building
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ---------- production stage ----------
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production

# Install production deps only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Back4App sets PORT automatically; bind to whatever it gives us
EXPOSE 4000
CMD ["node", "dist/main"]
