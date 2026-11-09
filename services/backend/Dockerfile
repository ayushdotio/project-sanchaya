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
EXPOSE 3000
CMD ["npm", "run", "dev"]

# # Stage 3: Builder for Production
# FROM base AS build
# COPY --from=dependencies /app/node_modules ./node_modules
# COPY . .
# RUN npm run build
# RUN npm prune --production

# # Stage 4: Production Runner
# FROM node:20-alpine AS production
# WORKDIR /app
# ENV NODE_ENV=production
# COPY --from=build /app/dist ./dist
# COPY --from=build /app/node_modules ./node_modules
# COPY --from=build /app/package.json ./package.json

# # Non-root user for security
# USER node
# EXPOSE 3000
# CMD ["node", "dist/server.js"]