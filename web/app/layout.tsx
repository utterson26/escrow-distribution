import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import Wallet from "@/components/WalletProvider";
import { network } from "@/lib/chain";

export const metadata = {
  title: "escrow-distribution",
  description: "pump.fun launches with a locked, program-owned escrow that is distributed to holders automatically and verifiably",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const net = network();
  return (
    <html lang="en">
      <body>
        <Wallet>
          <header className="top">
            <div className="wrap">
              <h1>escrow-distribution</h1>
              <nav>
                <a href="/">Coins</a>
                <a href="/feed">Activity</a>
              </nav>
              <span className={`pill${net.name === "localnet" ? " warn" : ""}`} style={{ marginLeft: "auto" }}
                    title={net.name === "localnet" ? "reading a local test validator" : undefined}>
                {net.name}
              </span>
            </div>
          </header>
          <div className="wrap">
            <div className="note" style={{ margin: "10px 0 16px", padding: "8px 12px", border: "1px solid var(--line, #ddd)", borderRadius: 8 }}>
              <b>Beta.</b> This program has not been audited yet. Each coin may lock at most a capped value
              at launch (50 SOL today; the live figure and whether launches are paused are shown on the
              <a href="/">Coins</a> page), and the platform can pause new launches; claims and distributions
              never pause. Source, tests and the security review are public.
            </div>
            {children}
          </div>
        </Wallet>
      </body>
    </html>
  );
}
