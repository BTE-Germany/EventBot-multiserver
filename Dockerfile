# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim

ENV NODE_ENV=production
# sharp ships its own Fontconfig, which otherwise finds no config file
# ("Fontconfig error: Cannot load default config file") and no fonts
ENV FONTCONFIG_PATH=/etc/fonts
WORKDIR /app

# openssl for Prisma; fontconfig + Noto fonts so the PNG cards render every supported language
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates fontconfig fonts-noto-core fonts-noto-cjk fonts-dejavu-core \
 && fc-cache -f \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev --foreground-scripts && npx prisma generate

COPY src ./src

EXPOSE 6969
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||6969)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Applies pending migrations, then starts the main thread (which spawns the shard threads)
CMD ["npm", "start"]
