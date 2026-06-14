# Frozen interfaces — the contract between workstreams

These four interfaces are the **agreed boundary** every workstream builds against. They were transcribed from `docs/CONTRACTS.md`. Import these from minute one — don't wait for implementations.

| Interface | Implemented by | Consumed by |
|---|---|---|
| `IPriceOracle` | A (core) | keeper (writes), Vault + Governance (read) |
| `IFundVault` | A (core) | users, Governance, frontend (D) |
| `IGovernance` | A (core) | users, keeper (lifecycle), frontend (D), forum |
| `IUniswapExecutor` | B (execution) | Vault (A) |

## Rules

- **Change only by team agreement.** Editing a signature here ripples into every workstream. If you must change one, announce it and note it in `docs/internal/ISSUES.md`.
- Signatures are intentionally close to `docs/CONTRACTS.md`; that doc remains the source of truth for *behavior* (state, math, access control, the CRE on/off-chain boundary).
- Pending real `forge init` (Foundry not yet installed when these were written): once the project is initialized from `Uniswap/v4-template`, these files live under `src/interfaces/` and compile as-is. Add `IReceiver` (CRE's `onReport(bytes,bytes)`) on the Governance consumer side per CONTRACTS.md §6.
- Generate + commit ABIs (`forge build` → `out/`) once compiling, so the frontend/keeper can wire against them.

## Scales (no floats on-chain)

prices `E8` · weights/percentages `bps` (1e4 = 100%) · accuracy signed `E4`.
