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

export default function ClaimPanel({ mint, escrow, cluster }: { mint: string; escrow: string; cluster: string }) {
  const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=${cluster}`;
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "info"; text: string; sig?: string } | null>(null);
  const [done, setDone] = useState<number[]>([]);

  useEffect(() => {
    if (!publicKey) { setData(null); setMsg(null); return; }
    setLoading(true); setMsg(null);
    fetch(`/api/claim/${mint}?wallet=${publicKey.toBase58()}&escrow=${escrow}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch((e) => setMsg({ kind: "err", text: String(e) }))
      .finally(() => setLoading(false));
  }, [publicKey, mint, escrow]);

  const claim = useCallback(async (c: any) => {
    if (!publicKey) return;
    setBusy(c.roundIndex); setMsg(null);
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
      setMsg({ kind: "info", text: "Claim sent, waiting for confirmation…", sig });
      const bh = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
      setDone((d) => [...d, c.roundIndex]);
      setMsg({ kind: "ok", text: `Round #${c.roundIndex} claimed.`, sig });
    } catch (e: any) {
      setMsg({ kind: "err", text: String(e?.message ?? e) });
    } finally { setBusy(null); }
  }, [publicKey, sendTransaction, connection, mint, escrow]);

  if (!publicKey) {
    return (
      <div className="card flex between">
        <div>
          <h3>Check your claims</h3>
          <p className="note">Connect a wallet to see what every round of this coin has set aside for you.</p>
        </div>
        <WalletMultiButton>Connect wallet</WalletMultiButton>
      </div>
    );
  }
  const claimable = (data?.claimable ?? []).filter((c: any) => !done.includes(c.roundIndex));
  return (
    <div className="card">
      <div className="flex between">
        <h3>Your claims</h3>
        <WalletMultiButton />
      </div>
      {loading && (
        <div className="note mt" aria-live="polite">
          Rebuilding each round&apos;s allocation from chain history and checking it against the on-chain root…
          <div className="bar thin"><i style={{ width: "40%" }} /></div>
        </div>
      )}
      {msg && (
        <div className={`alert mt ${msg.kind === "err" ? "err" : msg.kind === "ok" ? "ok" : ""}`} role="status">
          {msg.text}{msg.sig && <> <a href={explorerTx(msg.sig)} target="_blank" rel="noreferrer">view transaction ↗</a></>}
        </div>
      )}
      {data?.error && <div className="alert err mt" role="alert">{data.error}</div>}
      {data && !data.error && !loading && (
        <>
          {claimable.map((c: any) => (
            <div key={c.roundIndex} className="flex between mt" style={{ padding: "14px 16px", background: "var(--bg2)", borderRadius: 10, border: "1px solid var(--line)" }}>
              <div>
                <div className="v sm num">{(Number(c.amount) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })} tokens</div>
                <div className="sub">round #{c.roundIndex} · {c.sharePct}% of the round</div>
              </div>
              <button className="btn" disabled={busy !== null} onClick={() => claim(c)}>
                {busy === c.roundIndex ? "Claiming…" : "Claim"}
              </button>
            </div>
          ))}
          {claimable.length === 0 && (
            <p className="note mt">
              Nothing to claim right now. Checked {data.reproducible} of {data.rounds} round{data.rounds === 1 ? "" : "s"}
              {data.claimed?.length > 0 && <>; already claimed round{data.claimed.length === 1 ? "" : "s"} {data.claimed.join(", ")}</>}.
              {data.opaque?.length > 0 && <> Round{data.opaque.length === 1 ? "" : "s"} {data.opaque.join(", ")} could not be rebuilt from chain history yet.</>}
            </p>
          )}
        </>
      )}
    </div>
  );
}
