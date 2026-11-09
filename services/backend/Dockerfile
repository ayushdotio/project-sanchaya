# Stage 1: Base & Dependencies
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./

FROM base AS dependencies
RUN npm ci

# Stage 2: Development (Used by Docker Compose in local dev)
FROM base AS development
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
EXPOSE 5000
CMD ["npm", "run", "dev"]

# Stage 3: Builder for Production
FROM base AS build
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build
RUN npm prune --omit=dev

# Stage 4: Production Runner
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# Copy compiled distribution, production dependencies, and package.json with non-root ownership
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/package.json ./package.json

# Non-root user for security (Rule 5 compliance)
USER node

EXPOSE 5000

CMD ["node", "dist/server.js"]
