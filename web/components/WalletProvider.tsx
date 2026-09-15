"use client";
import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";

export default function Wallet({ children }: { children: React.ReactNode }) {
  // The browser talks to the chain through our own /api/rpc pass-through, so
  // the server's RPC key never ships to the client. NEXT_PUBLIC_RPC_URL still
  // overrides it (a local validator when testing).
  const endpoint = useMemo(() => {
    if (process.env.NEXT_PUBLIC_RPC_URL) return process.env.NEXT_PUBLIC_RPC_URL;
    if (typeof window !== "undefined") return `${window.location.origin}/api/rpc`;
    return "https://api.devnet.solana.com";
  }, []);
  // Phantom, Solflare and friends announce themselves through the Wallet
  // Standard, so no explicit adapter list is needed — and this keeps the
  // WalletConnect bundle out of the app entirely.
  const wallets = useMemo(() => [], []);
  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
