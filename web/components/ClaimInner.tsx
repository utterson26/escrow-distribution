"use client";
import Wallet from "./WalletProvider";
import ClaimPanel from "./ClaimPanel";
import DistributePanel, { DistributeProps } from "./DistributePanel";

/** One wallet context for everything on a coin page that signs: claims, and on a Manual coin the dev's releases. */
export default function ClaimInner(props: { mint: string; escrow: string; cluster: string; distribute?: DistributeProps }) {
  return (
    <Wallet>
      <ClaimPanel mint={props.mint} escrow={props.escrow} cluster={props.cluster} />
      {props.distribute && <div className="mt"><DistributePanel {...props.distribute} /></div>}
    </Wallet>
  );
}
