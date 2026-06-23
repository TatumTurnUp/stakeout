// POST /api/create-invoice  { token, bundleId }  → { paymentHash, credits, sats, bolt11 }
// Mints a Lightning invoice through your Alby wallet (NWC) and records a PENDING
// purchase. Credits are only granted later, by /api/check-invoice, once the payment
// is confirmed settled.
import { sql } from "./_db.js";
import { BUNDLES } from "./_config.js";
import { nwcClient, usdToSats } from "./_lightning.js";

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const token = (body?.token || "").toString();
  const bundle = BUNDLES[body?.bundleId];
  if (!token || !bundle) { res.status(400).json({ error: "missing token or bundle" }); return; }

  let client;
  try {
    const sats = await usdToSats(bundle.amountUsd);
    client = nwcClient();
    // NIP-47 make_invoice takes the amount in millisatoshis.
    const inv = await client.makeInvoice({
      amount: sats * 1000,
      description: `Stakeout — ${bundle.credits} credits`,
    });
    const bolt11 = inv?.invoice;
    const paymentHash = inv?.payment_hash;
    if (!bolt11 || !paymentHash) { res.status(502).json({ error: "invoice creation failed" }); return; }

    await sql`
      INSERT INTO purchases (charge_id, token, credits, amount_usd, status)
      VALUES (${paymentHash}, ${token}, ${bundle.credits}, ${bundle.amountUsd}, 'pending')
      ON CONFLICT (charge_id) DO NOTHING`;

    res.status(200).json({ paymentHash, credits: bundle.credits, sats, bolt11, checkoutUrl: "" });
  } catch (e) {
    res.status(502).json({ error: "invoice create failed: " + (e?.message || e) });
  } finally {
    try { client?.close?.(); } catch {}
  }
}
