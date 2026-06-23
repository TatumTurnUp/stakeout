// POST /api/scan  { scanId, target, group }  → one sweep result
// Gated: requires a valid, recent scan session (created by /api/scan-begin, which
// already charged the credit). Records a successful sweep so /api/scan-finish knows
// whether to refund.
import { sql } from "./_db.js";

export const config = { maxDuration: 60 }; // sweeps with web search can take a while

const MODEL = process.env.STAKEOUT_MODEL || "claude-haiku-4-5-20251001";

function buildPrompt(t, group) {
  const q = t.matchMode === "exact"
    ? (t.exactModel || "").trim()
    : [(t.query || "").trim(), ...((t.mustInclude) || [])].join(" ");

  return `You are a relentless PC-hardware deal scout sweeping a SPECIFIC set of sources. Dig past page one — chase the obscure listings.

PART: ${q}
MATCH MODE: ${t.matchMode}
${t.matchMode === "flexible"
    ? `Hard requirements: "${t.query}"${(t.mustInclude || []).length ? ` plus [${t.mustInclude.join(", ")}]` : ""}. Any other specs are acceptable.`
    : `Match this EXACT model only — reject near-matches.`}
CONDITION ALLOWED: ${t.conditionPref === "both" ? "new or used" : "new / open-box / refurbished only (no plain used)"}
SOURCES TO SEARCH (search them individually, don't stop at the first hit): ${group.sources}

Return up to 5 of the cheapest REAL listings found in THESE sources only.
${group.wantTypical ? "Also return typicalPrice = the current street/typical price in USD." : '"typicalPrice": null is fine.'}

Return ONLY minified JSON, no markdown:
{"typicalPrice":<number USD|null>,"listings":[{"source":"","sourceType":"retailer|used|auction|aggregator|refurb|other","title":"","price":<number>,"condition":"new|used|refurb|open_box|unknown","url":"","reliability":<1-5>,"risk":["short flag"]}],"summary":"one short sentence"}

Critical rules: only include a listing if you actually found it with a real, verifiable price AND a working URL — never estimate or invent a price. USD only. reliability 5 = top retailer with returns, 1 = no buyer protection / sketchy. titles <60 chars. JSON only.`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(500).json({ error: "server missing ANTHROPIC_API_KEY" }); return; }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const { scanId, target: t, group } = body || {};
  if (!scanId || !t || !group) { res.status(400).json({ error: "missing scanId/target/group" }); return; }

  // gate: the scan session must exist and be fresh (the credit was already spent at begin)
  try {
    const s = await sql`SELECT created_at FROM scans WHERE scan_id = ${scanId}`;
    if (!s.length) { res.status(403).json({ error: "invalid scan session" }); return; }
    const age = Date.now() - new Date(s[0].created_at).getTime();
    if (age > 5 * 60 * 1000) { res.status(403).json({ error: "scan session expired" }); return; }
  } catch {
    res.status(500).json({ error: "db error" });
    return;
  }

  const prompt = buildPrompt(t, group);

  let apiRes;
  try {
    apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }),
    });
  } catch (netErr) {
    res.status(502).json({ error: "Could not reach Anthropic: " + (netErr?.message || "network error") });
    return;
  }

  if (!apiRes.ok) {
    const txt = await apiRes.text().catch(() => "");
    res.status(502).json({ error: "Anthropic API " + apiRes.status + ": " + txt.slice(0, 300) });
    return;
  }

  const data = await apiRes.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  let clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{"), end = clean.lastIndexOf("}");

  let payload = { typicalPrice: null, listings: [], summary: "" };
  if (start !== -1 && end !== -1) {
    try { payload = JSON.parse(clean.slice(start, end + 1)); } catch {}
  }

  // the Anthropic call succeeded → this sweep counts (so a fully-failed scan can refund)
  try { await sql`UPDATE scans SET sweeps_ok = sweeps_ok + 1 WHERE scan_id = ${scanId}`; } catch {}

  res.status(200).json(payload);
}
