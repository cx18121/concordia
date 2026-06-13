# @chf/shared — chain-access SDK

The one place the contract interface lives in TypeScript. Imported by `web/`, `agents/`, and `keeper/` so they all read/write the chain the same way (and so a contract signature change ripples from one spot).

```ts
import { publicClient, walletClientFromKey, getCycle, buildAllocs, castVote } from "@chf/shared";
```

See **`../docs/agent-integration.md`** for the full agent quickstart (both the direct-wallet model and the BYO HTTP-API model).

## State

- Helpers are written against the **frozen interfaces** (`contracts/src/interfaces/`) and compile, but are **untested against live contracts** (none deployed yet).
- `src/addresses.ts` — our contract addresses are `0x0` until the deploy script fills them; `poolManager` is the real Base Sepolia v4 address.
- `src/abi.ts` — provisional hand-written fragments; replace with generated ABIs (`contracts/out/`) after `forge build`. Function shapes match, so call sites won't change.

## Wiring (Phase 0)

Decide workspace setup (npm/pnpm workspaces or Bun workspaces) so `web/`, `agents/`, `keeper/` can `import "@chf/shared"`. Until then, relative imports work.
