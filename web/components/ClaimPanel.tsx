"use client";
import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  PublicKey, Transaction, TransactionInstruction, SystemProgram,
} from "@solana/web3.js";

const PROGRAM = new PublicKey("5iJybmLoueR89iFLp1abte7s75coVexn7LKkXUQtUGHe");
const PUMP = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const T22 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const ATA_PROG = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
// anchor discriminator for the claim_share instruction
const CLAIM_SHARE = Buffer.from([0x2a, 0x12, 0xa1, 0x0f, 0x81, 0x9b, 0xf0, 0x34]); // sha256("global:claim_share")[..8]
const pda = (s: (Buffer | Uint8Array)[], p: PublicKey) => PublicKey.findProgramAddressSync(s, p)[0];
const ata = (o: PublicKey, m: PublicKey) =>
  PublicKey.findProgramAddressSync([o.toBuffer(), T22.toBuffer(), m.toBuffer()], ATA_PROG)[0];
const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const u64 = (v: bigint) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(v); return b; };

export default function ClaimPanel({ mint, escrow }: { mint: string; escrow: string }) {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey) { setData(null); return; }
    setMsg("Rebuilding the snapshot from chain history…");
    fetch(`/api/claim/${mint}?wallet=${publicKey.toBase58()}&escrow=${escrow}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setMsg(null); })
      .catch((e) => setMsg(String(e)));
  }, [publicKey, mint, escrow]);

  const claim = useCallback(async (c: any) => {
    if (!publicKey) return;
    setBusy(true); setMsg(null);
    try {
      const mintPk = new PublicKey(mint);
      const escrowPk = new PublicKey(escrow);
      const round = pda([Buffer.from("round"), escrowPk.toBuffer(), u32(c.roundIndex)], PROGRAM);
      const receipt = pda([Buffer.from("receipt"), round.toBuffer(), publicKey.toBuffer()], PROGRAM);
      const proof = c.proof.map((h: string) => Buffer.from(h, "hex"));
      const data = Buffer.concat([
        CLAIM_SHARE, u32(c.leafIndex), u64(BigInt(c.balance)), u64(BigInt(c.amount)),
        u32(proof.length), ...proof,
      ]);
      const ro = (pubkey: PublicKey) => ({ pubkey, isWritable: false, isSigner: false });
      const rw = (pubkey: PublicKey) => ({ pubkey, isWritable: true, isSigner: false });
      const ix = new TransactionInstruction({
        programId: PROGRAM, data,
        keys: [
          { pubkey: publicKey, isWritable: true, isSigner: true },
          rw(escrowPk), rw(round), rw(receipt), ro(mintPk),
          rw(ata(escrowPk, mintPk)), rw(ata(publicKey, mintPk)),
          ro(pda([Buffer.from("bonding-curve"), mintPk.toBuffer()], PUMP)),
          ro(T22), ro(SystemProgram.programId),
        ],
      });
      const sig = await sendTransaction(new Transaction().add(ix), connection);
      setMsg(`Sent: ${sig}`);
    } catch (e: any) {
      setMsg(String(e?.message ?? e));
    } finally { setBusy(false); }
  }, [publicKey, sendTransaction, connection, mint, escrow]);

  if (!publicKey) {
    return (
      <div className="card">
        <div className="k">Your share</div>
        <div className="note">Connect a wallet to see whether this coin owes you anything.</div>
        <div style={{ marginTop: 10 }}><WalletMultiButton /></div>
      </div>
    );
  }
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="k">Your share</div><WalletMultiButton />
      </div>
      {msg && <div className="note">{msg}</div>}
      {data?.error && <div className="note">Error: {data.error}</div>}
      {data && !data.error && (
        <>
          {data.claimable.length === 0 && (
            <div className="note">
              Nothing to claim. Checked {data.reproducible} of {data.rounds} round(s)
              {data.claimed?.length > 0 && `; already claimed round(s) ${data.claimed.join(", ")}`}.
              {data.opaque?.length > 0 &&
                ` Round(s) ${data.opaque.join(", ")} could not be rebuilt from chain history — the operator has not published that snapshot.`}
            </div>
          )}
          {data.claimable.map((c: any) => (
            <div key={c.roundIndex}
                 style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10 }}>
              <div style={{ flex: 1 }}>
                <div className="v">{(Number(c.amount) / 1e6).toLocaleString("en-US")} tokens</div>
                <div className="k">round #{c.roundIndex} · your share {c.sharePct}% (cap 10%)</div>
              </div>
              <button className="btn" disabled={busy} onClick={() => claim(c)}>
                {busy ? "Claiming…" : "Claim"}
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
