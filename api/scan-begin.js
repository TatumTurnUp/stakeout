// POST /api/scan-begin  { token }  → { scanId, credits }  (or 402 if broke)
// Atomically spends ONE credit and opens a short-lived scan session. The single
// CTE means the decrement, the ledger row, and the session row all happen together,
// and the WHERE credits >= 1 guard prevents negative balances and double-spends.
import crypto from "node:crypto";
import { sql, getBalance } from "./_db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const token = (body?.token || "").toString();
  if (!token) { res.status(400).json({ error: "missing token" }); return; }

  const scanId = crypto.randomUUID();
  try {
    const rows = await sql`
      WITH dec AS (
        UPDATE accounts SET credits = credits - 1
        WHERE token = ${token} AND credits >= 1
        RETURNING credits
      ), led AS (
        INSERT INTO ledger (token, delta, reason)
        SELECT ${token}, -1, 'scan' FROM dec
      ), sess AS (
        INSERT INTO scans (scan_id, token)
        SELECT ${scanId}, ${token} FROM dec
      )
      SELECT credits FROM dec`;

    if (!rows.length) {
      res.status(402).json({ error: "insufficient credits", credits: await getBalance(token) });
      return;
    }
    res.status(200).json({ scanId, credits: rows[0].credits });
  } catch (e) {
    res.status(500).json({ error: "db error" });
  }
}
