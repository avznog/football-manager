# Production image for the Next.js app, plus a `tools` stage that can run the db scripts.
#
# Four stages:
#   deps    — every dependency, dev included, installed once from the lockfile
#   tools   — deps + the source tree, so `npm run db:migrate` / `db:bootstrap` can run (target it
#             from compose; it is never the default)
#   builder — `next build` with `output: "standalone"` switched on by NEXT_OUTPUT_STANDALONE
#   runner  — the standalone server alone, no npm, no dev dependencies
#
# Node 22 matches the version CI uses. The slim Debian base is deliberate: `@node-rs/argon2` ships
# prebuilt glibc binaries, and Alpine's musl would send it to a source build.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS tools
WORKDIR /app
COPY . .
# `next build` has not run here, and must not: this stage exists for `tsx db/*.ts` only.

FROM deps AS builder
WORKDIR /app
COPY . .
# Traced standalone output rather than the whole node_modules tree. See decision 076.
ENV NEXT_OUTPUT_STANDALONE=1
ENV NEXT_TELEMETRY_DISABLED=1
# No DATABASE_URL here on purpose: decision 075 says a build must not need a database.
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# `next build` writes the standalone server, its traced dependencies, and nothing else.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# The base image already carries an unprivileged `node` user.
USER node
EXPOSE 3000
CMD ["node", "server.js"]
