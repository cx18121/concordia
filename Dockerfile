# Keeper heartbeat (always-on cycle loop, keeper/scripts/run.ts) for Railway.
# Built from the repo root so the `file:../shared` workspace dep resolves; we copy only
# shared/ + keeper/ to keep the image small.
#
# Runs on Node + tsx, NOT Bun: a fresh `bun install` on Linux lays @noble/hashes (a viem dep)
# into a `.cache/...@@@1` store and runs it from there, where its self-referencing
# `@noble/hashes/crypto` subpath import can't resolve (ENOENT). tsx executes the TS directly
# and Node's resolver handles the package fine. The heartbeat is plain viem + TS (no CRE SDK).
FROM node:22-slim
WORKDIR /app
COPY shared/ ./shared/
COPY keeper/ ./keeper/
# shared/ is linked (file:../shared) at its real path, so Node resolves its viem dep from
# shared/node_modules — install it there too, not just in keeper/.
RUN cd shared && npm install --no-package-lock
WORKDIR /app/keeper
# bun.lock is for Bun; let npm resolve fresh (it ignores it). tsx runs the .ts entrypoint.
RUN npm install --no-package-lock && npm install --no-save tsx@^4
CMD ["npx", "tsx", "scripts/run.ts"]
