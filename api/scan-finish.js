// POST /api/scan-finish  { scanId, token }  → { credits, refunded }
// Refunds the credit ONLY if no sweep succeeded — and the conditional flip
// (sweeps_ok = 0 AND refunded = false) is atomic, so it can't double-refund and
// the client can't trigger a refund on a scan that actually returned results.
import { sql, getBalance } from "./_db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const scanId = body?.scanId;
  const token = body?.token;
  if (!scanId || !token) { res.status(400).json({ error: "missing scanId/token" }); return; }

  try {
    const flipped = await sql`
      UPDATE scans SET refunded = true
      WHERE scan_id = ${scanId} AND token = ${token} AND sweeps_ok = 0 AND refunded = false
      RETURNING token`;

    if (flipped.length) {
      await sql`
        WITH inc AS (
          UPDATE accounts SET credits = credits + 1 WHERE token = ${token} RETURNING credits
        )
        INSERT INTO ledger (token, delta, reason) SELECT ${token}, 1, 'refund' FROM inc`;
    }

    res.status(200).json({ credits: await getBalance(token), refunded: flipped.length > 0 });
  } catch (e) {
    res.status(500).json({ error: "db error" });
  }
}
