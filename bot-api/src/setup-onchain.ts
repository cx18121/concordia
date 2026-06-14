/**
 * One-time setup so the bot signer can vote on-chain. Run once before the demo:
 *
 *   BOT_SIGNER_PK=0x... [ADMIN_PK=0x...] [BOT_DEPOSIT=5000] npm run setup:onchain
 *
 * Steps:
 *   1. (admin) Vault.verify(bot) — the proof arg is ignored on-chain, so any admin can attest the
 *      bot wallet for the demo. Skipped (with instructions) if ADMIN_PK isn't provided.
 *   2. (bot)   mint demo USDC, then deposit it — depositing registers the bot as a Governance
 *      member and gives it capital. Voting power is snapshot at the NEXT cycle open, so deposit
 *      BEFORE the cycle you want the bot to vote in opens.
 *
 * After this, start the API with BOT_SIGNER_PK set and POST /v1/votes casts real txs.
 */
import {
  addresses,
  vaultAbi,
  publicClient,
  walletClientFromKey,
  deposit as scDeposit,
  getDemoUSDC as scGetDemoUSDC,
} from "@concordia/shared";

const BOT_PK = process.env.BOT_SIGNER_PK as `0x${string}` | undefined;
const ADMIN_PK = process.env.ADMIN_PK as `0x${string}` | undefined;
const DEPOSIT_USDC = Number(process.env.BOT_DEPOSIT ?? 5000);

if (!BOT_PK || !/^0x[0-9a-fA-F]{64}$/.test(BOT_PK)) {
  console.error("Set BOT_SIGNER_PK to a 0x-prefixed 32-byte private key.");
  process.exit(1);
}

const pub = publicClient();
const bot = walletClientFromKey(BOT_PK);
const botAddr = bot.account.address;

async function main() {
  console.log(`bot signer: ${botAddr}`);

  // 1. Verify (admin-gated; proof ignored).
  const alreadyVerified = await pub.readContract({
    address: addresses.vault,
    abi: vaultAbi,
    functionName: "verified",
    args: [botAddr],
  });
  if (alreadyVerified) {
    console.log("✓ already verified");
  } else if (ADMIN_PK && /^0x[0-9a-fA-F]{64}$/.test(ADMIN_PK)) {
    const admin = walletClientFromKey(ADMIN_PK);
    const h = await admin.writeContract({
      address: addresses.vault,
      abi: vaultAbi,
      functionName: "verify",
      args: [botAddr, "0x"],
      account: admin.account,
      chain: admin.chain,
    });
    await pub.waitForTransactionReceipt({ hash: h });
    console.log(`✓ verified (admin tx ${h})`);
  } else {
    console.log(`! not verified and no ADMIN_PK — ask the contract admin to call:`);
    console.log(`    vault.verify(${botAddr}, 0x)   on ${addresses.vault}`);
    console.log(`  then re-run this script (or just the deposit step).`);
    return;
  }

  // 2. Mint demo USDC + deposit (registers membership + capital).
  const amount = BigInt(DEPOSIT_USDC) * 1_000_000n; // USDC has 6 decimals
  console.log(`minting ${DEPOSIT_USDC} demo USDC…`);
  const mintHash = await scGetDemoUSDC(bot, amount);
  await pub.waitForTransactionReceipt({ hash: mintHash });

  console.log(`depositing ${DEPOSIT_USDC} USDC…`);
  const depHash = await scDeposit(bot, amount, pub);
  await pub.waitForTransactionReceipt({ hash: depHash });
  console.log(`✓ deposited (tx ${depHash})`);

  console.log(`\nDone. Voting power is snapshot at the next cycle open.`);
  console.log(`Start the API with BOT_SIGNER_PK set and POST /v1/votes to cast real votes.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
