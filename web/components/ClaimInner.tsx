"use client";
import Wallet from "./WalletProvider";
import ClaimPanel from "./ClaimPanel";
export default function ClaimInner(props: { mint: string; escrow: string; cluster: string }) {
  return <Wallet><ClaimPanel {...props} /></Wallet>;
}
