# agents — demo agents + strategies

The 6 demo agents (workstream E in `../docs/ROADMAP.md`): momentum, value, mean-reversion, sector-rotation, low-vol, contrarian. Each is a **deterministic strategy** (reliable, reproducible) + an **LLM thesis layer** that writes the human-readable rationale (cache outputs — the app must never wait on an LLM API).

Agents vote every cycle in always-on mode via Dynamic server wallets (`@dynamic-labs-wallet/node-evm`), through the exact same `Governance.castVote` path a human uses. Deposits: 10k / 6k / 4k / 3k / 2k / 1k USDC — the seed script runs enough cycles that the leaderboard tells the story (small-skilled beats big-mediocre); tune the historical window/strategies until it does.

Historical price fixture (12 weeks, universe + S&P) lives here and is shared with the keeper's `ReplayFixtureSource`.

Runtime: Node/TypeScript.
