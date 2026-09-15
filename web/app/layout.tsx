import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import Nav from "@/components/Nav";
import { network, PROGRAM_ID } from "@/lib/chain";

const DESCRIPTION =
  "drop.chain locks the share developers promise to holders at launch and distributes it on-chain: program-owned escrow, verifiable rounds, claims by proof.";

export const metadata: Metadata = {
  title: { default: "drop.chain", template: "%s · drop.chain" },
  metadataBase: new URL("https://drop.chain"),
  openGraph: { title: "drop.chain", description: "Locks the share devs promise to holders. Distributes it on-chain.", type: "website" },
};
export const viewport: Viewport = { themeColor: "#0a0c10", width: "device-width", initialScale: 1 };

const REPO = "https://github.com/utterson26/escrow-distribution";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const net = network();
  return (
    <html lang="en">
      <head>
        {/* Pages render from chain state, so Next streams their metadata into the body; the
            description crawlers read from the initial <head> is set once here instead. */}
        <meta name="description" content={DESCRIPTION} />
      </head>
      <body>
        <header className="top">
          <div className="wrap">
            <Link href="/" className="brand" aria-label="drop.chain home">drop<i>.</i>chain</Link>
            <Nav />
            <div className="top-right">
              <span className={`pill${net.name === "localnet" ? " warn" : net.name === "mainnet" ? " on" : ""}`}
                  title={net.name === "localnet" ? "reading a local test validator" : `reading Solana ${net.name}`}>
              <span className="dot" aria-hidden="true" />{net.name}
              </span>
            </div>
            </div>
        </header>
        <main className="wrap">{children}</main>
        <footer>
          <div className="wrap">
            <span>© {new Date().getFullYear()} drop.chain · beta on Solana {net.name} · not audited</span>
            <span className="flex" style={{ gap: 16 }}>
              <a href={REPO} target="_blank" rel="noreferrer">Source</a>
              <a href={`${REPO}/blob/main/SECURITY_REVIEW.md`} target="_blank" rel="noreferrer">Security review</a>
              <a href={net.explorerAddress(PROGRAM_ID.toBase58())} target="_blank" rel="noreferrer">Program</a>
              <Link href="/docs">Docs</Link>
            </span>
            </div>
        </footer>
      </body>
    </html>
  );
}
