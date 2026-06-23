// GET /api/balance?token=...  → { credits }
import { getBalance } from "./_db.js";

export default async function handler(req, res) {
  const token = (req.query?.token || "").toString();
  if (!token) { res.status(400).json({ error: "missing token" }); return; }
  try {
    res.status(200).json({ credits: await getBalance(token) });
  } catch (e) {
    res.status(500).json({ error: "db error" });
  }
}
