import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import Wallet from "@/components/WalletProvider";

export const metadata = {
  title: "Airdrop Launchpad",
  description: "Escrowed pump.fun launches with automatic, verifiable airdrops",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
              <span className="pill" style={{ marginLeft: "auto" }}>devnet</span>
            </div>
          </header>
          <div className="wrap">{children}</div>
        </Wallet>
      </body>
    </html>
  );
}
