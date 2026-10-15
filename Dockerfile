FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm run check:server
RUN npm prune --omit=dev

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production SERVE_STATIC=true PORT=8080
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/dist ./dist
COPY NOTICE ./dist/NOTICE
USER node
EXPOSE 8080
CMD ["node", "server/index.ts"]
