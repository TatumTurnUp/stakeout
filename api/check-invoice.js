// POST /api/check-invoice  { paymentHash, token }  → { paid, credits }
// The frontend polls this while the invoice QR is showing. We ask Alby/NWC directly
// whether the invoice settled (server→wallet, fully trusted — no webhook signature
// needed), and if so credit idempotently: the CTE only fires if the purchase row was
// still 'pending', so polling many times can't double-credit.
import { sql, getBalance } from "./_db.js";
import { nwcClient } from "./_lightning.js";

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const paymentHash = body?.paymentHash;
  const token = body?.token;
  if (!paymentHash || !token) { res.status(400).json({ error: "missing paymentHash/token" }); return; }

  let client, settled = false;
  try {
    client = nwcClient();
    const tx = await client.lookupInvoice({ payment_hash: paymentHash });
    settled = !!(tx && (tx.settled_at || tx.preimage || tx.state === "settled"));
  } catch (e) {
    res.status(502).json({ error: "lookup failed: " + (e?.message || e) });
    return;
  } finally {
    try { client?.close?.(); } catch {}
  }

  if (!settled) {
    res.status(200).json({ paid: false, credits: await getBalance(token) });
    return;
  }

  try {
    await sql`
      WITH flip AS (
        UPDATE purchases SET status='paid', paid_at=now()
        WHERE charge_id = ${paymentHash} AND status='pending'
        RETURNING token, credits
      ), acct AS (
        INSERT INTO accounts (token, credits)
        SELECT token, credits FROM flip
        ON CONFLICT (token) DO UPDATE SET credits = accounts.credits + EXCLUDED.credits
        RETURNING token
      )
      INSERT INTO ledger (token, delta, reason, charge_id)
      SELECT token, credits, 'purchase', ${paymentHash} FROM flip`;
    res.status(200).json({ paid: true, credits: await getBalance(token) });
  } catch (e) {
    res.status(500).json({ error: "db error" });
  }
}
