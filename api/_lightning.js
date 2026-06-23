// api/_lightning.js — Nostr Wallet Connect (NWC) helper, powered by your Alby wallet.
// No KYC, no business account: you paste one connection string (NWC_URL) and the
// backend can mint invoices and check payments. Files starting with "_" aren't routes.

// Node serverless has no global WebSocket (until Node 22); NWC needs one.
import WebSocket from "ws";
if (!globalThis.WebSocket) globalThis.WebSocket = WebSocket;

import { nwc } from "@getalby/sdk";

export function nwcClient() {
  const url = process.env.NWC_URL;
  if (!url) throw new Error("server missing NWC_URL");
  return new nwc.NWCClient({ nostrWalletConnectUrl: url });
}

// Live USD→sats so a credit always costs the same in dollars regardless of BTC price.
export async function usdToSats(usd) {
  const r = await fetch("https://api.coinbase.com/v2/prices/BTC-USD/spot");
  const d = await r.json();
  const btc = parseFloat(d?.data?.amount);
  if (!btc || !isFinite(btc)) throw new Error("BTC price unavailable");
  return Math.max(1, Math.round((usd / btc) * 1e8));
}
