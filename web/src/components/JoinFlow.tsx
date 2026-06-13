"use client";

// JoinFlow — the two-step deposit form that mounts inside the Overview's
// .join-slot panel once World ID verification passes (Task B4).
//
// Step 1 "Get demo USDC" calls getDemoUSDC() (a no-op in mock — deposit()
// supplies the funds) and reveals a faucet balance. Step 2 "Deposit" calls
// deposit(amount), which mutates the shared mock position, so Overview's
// "Your position" chip (usePosition) updates on its own — no extra wiring.

import { useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { useFundActions, usePosition } from "@/lib/data";

// Demo faucet amount; deposit defaults to a slice of it.
const DEMO_USDC = 10_000;
const DEFAULT_DEPOSIT = 1_000;

export default function JoinFlow() {
  const { isVerified } = useAuth();
  const { getDemoUSDC, deposit } = useFundActions();
  const position = usePosition();

  const [funded, setFunded] = useState(false);
  const [funding, setFunding] = useState(false);
  const [amount, setAmount] = useState(String(DEFAULT_DEPOSIT));
  const [depositing, setDepositing] = useState(false);
  const [deposited, setDeposited] = useState(false);

  // Live in mock (isVerified === true). The unverified branch keeps the live
  // swap (B7) clean — the World ID step would gate the form here.
  if (!isVerified) {
    return (
      <p className="join-hint">
        {"Verify with World ID to continue…"}
      </p>
    );
  }

  const parsed = Number(amount);
  const amountValid = Number.isFinite(parsed) && parsed > 0;

  async function handleFund() {
    setFunding(true);
    try {
      await getDemoUSDC();
      setFunded(true);
    } finally {
      setFunding(false);
    }
  }

  async function handleDeposit() {
    if (!amountValid) return;
    setDepositing(true);
    try {
      await deposit(parsed);
      setDeposited(true);
    } finally {
      setDepositing(false);
    }
  }

  return (
    <div className="join-flow">
      <div className="join-step">
        <span className="join-num">1</span>
        {funded ? (
          <span className="vfy">
            {`${DEMO_USDC.toLocaleString()} demo USDC ready`}
          </span>
        ) : (
          <button
            className="ovl-join join-btn"
            onClick={handleFund}
            disabled={funding}
          >
            {funding ? "Minting…" : "Get demo USDC"}
          </button>
        )}
      </div>

      <div className="join-step">
        <span className="join-num">2</span>
        <div className="join-deposit">
          <span className="join-curr">$</span>
          <input
            className="join-input"
            type="number"
            inputMode="decimal"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label="Deposit amount in USDC"
          />
          <button
            className="ovl-join join-btn"
            onClick={handleDeposit}
            disabled={!funded || !amountValid || depositing}
          >
            {depositing ? "Depositing…" : "Deposit"}
          </button>
        </div>
      </div>

      {deposited && (
        <p className="join-done">
          {`Deposited $${position.costUsd.toLocaleString()} — ${position.shares.toLocaleString()} shares`}
        </p>
      )}
    </div>
  );
}
