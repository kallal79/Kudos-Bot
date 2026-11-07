# syntax=docker/dockerfile:1
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Copy source files
COPY package.json ./
COPY kudos-bot/ ./kudos-bot/

# Run as non-root user
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["node", "kudos-bot/server.mjs"]
