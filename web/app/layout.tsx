import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import Wallet from "@/components/WalletProvider";
import { network } from "@/lib/chain";

export const metadata = {
  title: "Airdrop Launchpad",
  description: "Escrowed pump.fun launches with automatic, verifiable airdrops",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const net = network();
  return (
    <html lang="en">
      <body>
        <Wallet>
          <header className="top">
            <div className="wrap">
              <h1>Airdrop Launchpad</h1>
              <nav>
                <a href="/">Coins</a>
                <a href="/feed">Recent airdrops</a>
              </nav>
              <span className={`pill${net.name === "localnet" ? " warn" : ""}`} style={{ marginLeft: "auto" }}
                    title={net.name === "localnet" ? "reading a local test validator" : undefined}>
                {net.name}
              </span>
            </div>
          </header>
          <div className="wrap">{children}</div>
        </Wallet>
      </body>
    </html>
  );
}
