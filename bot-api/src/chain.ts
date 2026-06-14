/**
 * On-chain wiring for the bot-api — the bridge to the real Governance contract on Base Sepolia.
 *
 * The server holds ONE signer (a funded, verified, deposited member) loaded from BOT_SIGNER_PK.
 * When that env var is set the API runs in on-chain mode: votes become real Governance.castVote
 * txs signed by this wallet. Without it, the server falls back to the in-memory sim (no chain,
 * no funds) so the API still runs standalone. Everything here is via @concordia/shared — the
 * same SDK the web's Live mode uses, so the contract interface lives in exactly one place.
 */
import {
  publicClient,
  walletClientFromKey,
  getCycle,
  castVote as scCastVote,
  type Alloc,
} from "@concordia/shared";

const PK = process.env.BOT_SIGNER_PK as `0x${string}` | undefined;

/** True when a signer key is configured — the API submits real on-chain votes. */
export const ONCHAIN = Boolean(PK && /^0x[0-9a-fA-F]{64}$/.test(PK));

// bot-api and shared can resolve separate (identical-version) viem copies; cast the public client
// to the shared read helpers' PublicClient type to bridge the nominal mismatch (as the web does).
export const pub = publicClient() as unknown as Parameters<typeof getCycle>[0];

let _wallet: ReturnType<typeof walletClientFromKey> | null = null;
export function signer() {
  if (!ONCHAIN) throw new Error("BOT_SIGNER_PK not set — on-chain mode is off");
  return (_wallet ??= walletClientFromKey(PK!));
}

/** The bot member's address (the wallet judges fund + the admin verifies). */
export const signerAddress = (): `0x${string}` => signer().account.address;

/** Real cycle id + phase straight from Governance. Countdowns aren't on-chain, so they're omitted. */
export async function realCycle(): Promise<{ cycle: number; phase: string; isOpen: boolean }> {
  const c = await getCycle(pub);
  return { cycle: Number(c.id), phase: c.state, isOpen: c.state === "OPEN" };
}

/** Submit a vote on-chain through Governance.castVote (msg.sender = the bot signer). */
export async function castVoteOnchain(allocs: Alloc[]): Promise<`0x${string}`> {
  // bot-api and shared can resolve separate (identical-version) viem copies; cast the client to
  // the shared write helper's WalletClient type to bridge the nominal mismatch (as the web does).
  return scCastVote(signer() as unknown as Parameters<typeof scCastVote>[0], allocs);
}
