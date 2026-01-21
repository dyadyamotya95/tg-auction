FROM node:24-bookworm-slim AS base

WORKDIR /app

# Install nginx for production web serving
RUN apt-get update && apt-get install -y nginx && rm -rf /var/lib/apt/lists/*

# Enable corepack so pnpm from packageManager field is used.
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .npmrc ./.npmrc

COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile

ENV NODE_ENV=production
