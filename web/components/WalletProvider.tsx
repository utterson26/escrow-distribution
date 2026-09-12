"use client";
import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";

export default function Wallet({ children }: { children: React.ReactNode }) {
  // the browser never sees the Helius key; reads go through our own API routes.
  // NEXT_PUBLIC_RPC_URL points the wallet at a local validator when testing.
  const endpoint = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
  // Phantom, Solflare and friends announce themselves through the Wallet
  // Standard, so no explicit adapter list is needed — and this keeps the
  // WalletConnect bundle out of the app entirely.
  const wallets = useMemo(() => [], []);
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
