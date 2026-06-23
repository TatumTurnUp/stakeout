import { useState, useEffect, useRef } from "react";
import {
  Crosshair, Plus, Flame, ShieldAlert, Trash2, ExternalLink,
  Loader2, Target, ChevronDown, ChevronUp, Bell, BellOff, Radar, X, Scan, Pencil, Check,
  Bitcoin, Zap, Coins, Bug, MessageSquare, Copy, AlertTriangle, Lightbulb, ArrowLeft
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

/* ---------- palette (gruvbox material dark) ---------- */
const C = {
  bg: "#121516", panel: "#1b1f21", panelHi: "#232829", border: "#2e3436",
  text: "#e8e3d3", muted: "#928374", amber: "#fe8019", amberSoft: "#e78a4e",
  green: "#a9b665", aqua: "#89b482", red: "#ea6962", yellow: "#d8a657", blue: "#7daea3",
};

const CATEGORIES = ["GPU", "CPU", "Motherboard", "RAM", "Storage", "PSU", "Case", "CPU Cooler", "Other"];

/* ---------- source sweeps (each is one real API call) ---------- */
const GROUPS = [
  { key: "retail",  label: "retailers & deal trackers", sources: "Newegg, Amazon, B&H Photo, Micro Center, Best Buy, Slickdeals, Reddit r/buildapcsales", wantTypical: true },
  { key: "used",    label: "used marketplaces",         sources: "eBay, Reddit r/hardwareswap, Mercari, OfferUp, Craigslist (where indexed)" },
  { key: "auction", label: "auctions & gov surplus",    sources: "GovDeals, PublicSurplus, GSA Auctions, liquidation.com, eBay auctions" },
  { key: "refurb",  label: "refurb & niche outlets",    sources: "ServerMonkey, Jawa, Back Market, manufacturer-refurbished outlets, specialist resellers" },
];

/* ---------- storage (browser localStorage; each visitor keeps their own list) ---------- */
const KEY = "stakeout:watchlist:v1";
function loadList() {
  try {
    const r = localStorage.getItem(KEY);
    return r ? JSON.parse(r) : [];
  } catch { return []; }
}
function saveList(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { console.error("save failed", e); }
}

/* ---------- credits / bundles / identity ----------
   Credits are SERVER-AUTHORITATIVE. The browser only holds an anonymous credit
   token; the real balance lives in the backend DB and changes only via verified
   Lightning payment (webhook) or an atomic scan decrement. */
const APP_VERSION = "0.3.0-proto";
const VERSION = "v2"; // shown under the crosshair top-left; bump this on each release
const ALBY = "tatumturnup@getalby.com";
const CASHTAG = "$tatumturnup";

// Display only — the server defines the real price per bundle (see api/_config.js).
const BUNDLES = [
  { id: "small",  credits: 5,  usd: 1.60 },
  { id: "medium", credits: 20, usd: 5.80 },
  { id: "large",  credits: 50, usd: 13.50 },
];

// Anonymous identity: a random token kept in this browser. It grants nothing on
// its own — the balance is keyed to it on the server.
const TOKEN_KEY = "stakeout:token:v1";
function getToken() {
  try {
    let t = localStorage.getItem(TOKEN_KEY);
    if (!t) {
      const a = new Uint8Array(32);
      (window.crypto || crypto).getRandomValues(a);
      t = Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(TOKEN_KEY, t);
    }
    return t;
  } catch { return "anon-" + Math.random().toString(36).slice(2); }
}
async function apiBalance(token) {
  try {
    const r = await fetch("/api/balance?token=" + encodeURIComponent(token));
    const d = await r.json();
    return typeof d.credits === "number" ? d.credits : 0;
  } catch { return 0; }
}

/* ---------- brand logos (icon-only link buttons) ---------- */
const XLogo = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);
const LinkedInLogo = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
  </svg>
);
const YoutubeLogo = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

/* ---------- scan one source group via Claude + web search ---------- */
function buildQuery(t) {
  if (t.matchMode === "exact") return t.exactModel.trim();
  return [t.query.trim(), ...(t.mustInclude || [])].join(" ");
}

async function scanGroup(t, group, scanId) {
  // One sweep. Hits our backend (/api/scan), which holds the API key and validates
  // the paid scan session (scanId) before spending anything.
  let res;
  try {
    res = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scanId,
        target: t,
        group: { key: group.key, label: group.label, sources: group.sources, wantTypical: !!group.wantTypical },
      }),
    });
  } catch (netErr) {
    throw new Error("connection blocked (" + (netErr?.message || "fetch failed") + ")");
  }
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  if (data && data.error) throw new Error(data.error);
  return data; // { typicalPrice, listings, summary }
}

/* ---------- merge + result logic ---------- */
function dedupe(listings) {
  const map = new Map();
  for (const l of listings) {
    const k = (l.url || "").trim().toLowerCase() || `${l.source}|${l.title}`.toLowerCase();
    const ex = map.get(k);
    if (!ex || l.price < ex.price) map.set(k, l);
  }
  return [...map.values()];
}

function isReliableListing(l) {
  if (l.reliability >= 3 && ["retailer", "aggregator"].includes(l.sourceType)) return true;
  if (l.reliability >= 4 && l.sourceType === "refurb") return true;
  return false;
}

function computeResult({ typicalPrice, listings }, t, sourcesChecked) {
  const tp = typeof typicalPrice === "number" ? typicalPrice : null;
  let ls = listings.filter((l) => typeof l.price === "number" && l.price > 0);
  if (t.conditionPref !== "both") ls = ls.filter((l) => l.condition !== "used");
  const byPrice = (a, b) => a.price - b.price;
  const reliable = ls.filter(isReliableListing).sort(byPrice);
  const risky = ls.filter((l) => !isReliableListing(l)).sort(byPrice);
  const best = reliable[0] || null;
  const bestRisky = risky[0] || null;
  const all = ls.slice().sort(byPrice);
  let hasDeal = false, dealPct = null, dealReason = "";
  if (best) {
    if (tp) dealPct = Math.round((1 - best.price / tp) * 100);
    if (t.targetPrice && best.price <= t.targetPrice) { hasDeal = true; dealReason = `at or below your $${t.targetPrice} target`; }
    else if (tp && best.price <= tp * 0.9) { hasDeal = true; dealReason = `${dealPct}% under typical`; }
  }
  return {
    timestamp: Date.now(), typicalPrice: tp, best, bestRisky, all,
    hasDeal, dealPct, dealReason, summary: "", sourcesChecked,
    onlyRisky: !best && !!bestRisky,
  };
}

/* ---------- small ui bits ---------- */
function Dots({ n }) {
  return (
    <span style={{ letterSpacing: 1 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{ color: i <= n ? C.aqua : C.border }}>●</span>
      ))}
    </span>
  );
}
const money = (n) => "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
const ago = (ts) => {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};

function ListingRow({ l }) {
  const risky = !isReliableListing(l);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderTop: `1px solid ${C.border}`, fontSize: 13 }}>
      <span className="mono" style={{ color: C.text, fontWeight: 600, width: 74 }}>{money(l.price)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ color: C.text, fontWeight: 600 }}>{l.source}</span>
          <Dots n={l.reliability} />
          {risky && <ShieldAlert size={13} style={{ color: C.red }} />}
        </div>
        <div style={{ color: C.muted, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {l.condition !== "new" && <span style={{ color: C.yellow, textTransform: "uppercase", marginRight: 6 }}>{l.condition}</span>}
          {l.title}
          {(l.risk || []).length > 0 && <span style={{ color: C.red }}> · {l.risk.join(", ")}</span>}
        </div>
      </div>
      {l.url && (
        <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ color: C.aqua, display: "flex" }}>
          <ExternalLink size={15} />
        </a>
      )}
    </div>
  );
}

function ScanProgress({ progress }) {
  const done = progress?.done ?? 0;
  const total = progress?.total ?? GROUPS.length;
  const pct = Math.max(6, Math.round((done / total) * 100));
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12.5, color: C.amber, marginBottom: 7 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Loader2 size={14} className="spin" /> Sweeping {progress?.label || "sources"}…
        </span>
        <span className="mono" style={{ color: C.muted }}>{done}/{total}</span>
      </div>
      <div style={{ height: 7, borderRadius: 4, background: C.bg, border: `1px solid ${C.border}`, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${C.amberSoft}, ${C.amber})`, borderRadius: 4, transition: "width .45s ease" }} />
      </div>
    </div>
  );
}

/* ---------- target card ---------- */
function TargetCard({ t, scanning, progress, error, onScan, onRemove, onEdit }) {
  const [open, setOpen] = useState(false);
  const r = t.lastScan;
  const deal = r && r.hasDeal;
  return (
    <div className={deal ? "deal-card" : ""} style={{
      background: C.panel, border: `1px solid ${deal ? C.amber : C.border}`,
      borderRadius: 10, overflow: "hidden",
      boxShadow: deal ? `0 0 0 1px ${C.amber}55, 0 6px 22px -10px ${C.amber}66` : "none",
    }}>
      <div style={{ padding: "13px 15px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, opacity: scanning ? 0.4 : 1, transition: "opacity .3s" }}>
          <div style={{ flexShrink: 0, marginTop: 1 }}>
            {deal
              ? <Crosshair size={18} className="reticle" style={{ color: C.amber }} />
              : <Target size={18} style={{ color: C.green }} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="mono" style={{ fontSize: 10, color: C.aqua, border: `1px solid ${C.border}`, padding: "1px 6px", borderRadius: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{t.category}</span>
              <span className="mono" style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>{t.matchMode}</span>
            </div>
            <div style={{ color: C.text, fontWeight: 600, marginTop: 4, lineHeight: 1.3 }}>{buildQuery(t)}</div>
            <div style={{ display: "flex", gap: 12, marginTop: 3, fontSize: 11.5, color: C.muted }}>
              <span>{t.conditionPref === "both" ? "new or used" : "new only"}</span>
              {t.targetPrice ? <span>alert ≤ <span className="mono" style={{ color: C.yellow }}>{money(t.targetPrice)}</span></span> : <span>no target set</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => onEdit(t)} disabled={scanning} title="Edit target"
              style={{ background: "none", border: "none", color: C.muted, cursor: scanning ? "default" : "pointer", padding: 2 }}>
              <Pencil size={15} />
            </button>
            <button onClick={() => onRemove(t.id)} title="Remove target"
              style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", padding: 2 }}>
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* result / progress */}
        <div style={{ marginTop: 12 }}>
          {scanning ? (
            <ScanProgress progress={progress} />
          ) : error ? (
            <div style={{ background: `${C.red}12`, border: `1px solid ${C.red}55`, borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <span style={{ color: C.red, fontSize: 12.5, fontWeight: 600 }}>Scan couldn't complete</span>
                <ScanBtn onClick={() => onScan(t.id)} label="Retry" />
              </div>
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6, lineHeight: 1.55 }}>
                The scan server had trouble completing this sweep. Give it another shot — if it keeps failing, it's on our end, not yours.
              </div>
              {typeof error === "string" && (
                <div className="mono" style={{ fontSize: 10.5, color: C.red, marginTop: 6, opacity: 0.85 }}>detail: {error}</div>
              )}
            </div>
          ) : !r ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ color: C.muted, fontSize: 12.5 }}>Not scanned yet.</span>
              <ScanBtn onClick={() => onScan(t.id)} label="Scan now" />
            </div>
          ) : (
            <div>
              {r.best ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 8, background: deal ? `${C.amber}14` : C.panelHi, border: `1px solid ${deal ? C.amber + "55" : C.border}` }}>
                  <div>
                    <div className="mono" style={{ fontSize: 23, fontWeight: 700, color: deal ? C.amber : C.text, lineHeight: 1 }}>{money(r.best.price)}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{r.best.source} · <Dots n={r.best.reliability} /></div>
                  </div>
                  <div style={{ flex: 1 }}>
                    {deal && (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 5, color: C.amber, fontWeight: 700, fontSize: 12.5 }}>
                        <Flame size={14} /> FIRE SALE — {r.dealReason}
                      </div>
                    )}
                    {!deal && r.typicalPrice && (
                      <div style={{ fontSize: 12, color: C.muted }}>
                        typical ~<span className="mono" style={{ color: C.text }}>{money(r.typicalPrice)}</span>
                        {r.dealPct > 0 && <span style={{ color: C.green }}> · {r.dealPct}% under</span>}
                      </div>
                    )}
                  </div>
                  {r.best.url && (
                    <a href={r.best.url} target="_blank" rel="noopener noreferrer"
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, color: C.bg, background: deal ? C.amber : C.aqua, fontWeight: 600, fontSize: 12, padding: "6px 11px", borderRadius: 6, textDecoration: "none" }}>
                      View <ExternalLink size={13} />
                    </a>
                  )}
                </div>
              ) : (
                <div style={{ padding: "9px 11px", borderRadius: 8, background: C.panelHi, border: `1px solid ${C.border}`, fontSize: 12.5, color: C.yellow }}>
                  {r.onlyRisky ? "Only used / marketplace listings found — flagged below." : "No matching listings found this sweep."}
                </div>
              )}

              {r.bestRisky && (
                <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: C.muted }}>
                  <ShieldAlert size={13} style={{ color: C.red }} />
                  cheapest risky: <span className="mono" style={{ color: C.red }}>{money(r.bestRisky.price)}</span> @ {r.bestRisky.source}
                </div>
              )}

              {r.all.length > 0 && (
                <button onClick={() => setOpen((v) => !v)}
                  style={{ marginTop: 9, background: "none", border: "none", color: C.aqua, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 4, padding: 0 }}>
                  {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {open ? "Hide" : `View all ${r.all.length} listings`}
                </button>
              )}
              {open && (
                <div style={{ marginTop: 8, background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
                  {r.all.map((l, i) => <ListingRow key={i} l={l} />)}
                </div>
              )}

              <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, color: C.muted }}>
                  {r.sourcesChecked}/{GROUPS.length} sweeps · scanned {ago(r.timestamp)}
                </span>
                <ScanBtn onClick={() => onScan(t.id)} label="Re-scan" subtle />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ScanBtn({ onClick, label, subtle }) {
  return (
    <button onClick={onClick}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer",
        background: subtle ? "transparent" : C.aqua, color: subtle ? C.aqua : C.bg,
        border: subtle ? `1px solid ${C.border}` : "none",
        fontWeight: 600, fontSize: 12, padding: "6px 11px", borderRadius: 6 }}>
      <Scan size={13} /> {label}
    </button>
  );
}

/* ---------- add / edit form ---------- */
function TargetForm({ editTarget, onAdd, onUpdate, onCancelEdit }) {
  const isEdit = !!editTarget;
  const [open, setOpen] = useState(true);
  const [mode, setMode] = useState("flexible");
  const [category, setCategory] = useState("GPU");
  const [query, setQuery] = useState("");
  const [exactModel, setExactModel] = useState("");
  const [chips, setChips] = useState([]);
  const [chipInput, setChipInput] = useState("");
  const [cond, setCond] = useState("new");
  const [target, setTarget] = useState("");

  const reset = () => {
    setMode("flexible"); setCategory("GPU"); setQuery(""); setExactModel("");
    setChips([]); setChipInput(""); setCond("new"); setTarget("");
  };

  useEffect(() => {
    if (editTarget) {
      setOpen(true);
      setMode(editTarget.matchMode);
      setCategory(editTarget.category);
      setQuery(editTarget.query || "");
      setExactModel(editTarget.exactModel || "");
      setChips(editTarget.mustInclude || []);
      setCond(editTarget.conditionPref);
      setTarget(editTarget.targetPrice ? String(editTarget.targetPrice) : "");
    }
  }, [editTarget?.id]);

  const valid = mode === "flexible" ? query.trim() : exactModel.trim();
  const addChip = () => {
    const v = chipInput.trim();
    if (v && !chips.includes(v)) setChips([...chips, v]);
    setChipInput("");
  };
  const submit = () => {
    if (!valid) return;
    const payload = {
      category, matchMode: mode, query: query.trim(), exactModel: exactModel.trim(),
      mustInclude: mode === "flexible" ? chips : [],
      conditionPref: cond, targetPrice: target ? Number(target) : null,
    };
    if (isEdit) { onUpdate({ ...editTarget, ...payload }); reset(); }
    else { onAdd({ id: crypto.randomUUID(), ...payload, lastScan: null }); reset(); }
  };
  const cancel = () => { reset(); onCancelEdit(); };

  const inputStyle = { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, color: C.text, padding: "9px 11px", fontSize: 13.5, width: "100%", outline: "none" };
  const pill = (active) => ({ cursor: "pointer", padding: "6px 12px", borderRadius: 7, fontSize: 12.5, fontWeight: 600, border: `1px solid ${active ? C.aqua : C.border}`, background: active ? `${C.aqua}1f` : "transparent", color: active ? C.aqua : C.muted });

  return (
    <div style={{ background: C.panel, border: `1px solid ${isEdit ? C.amber : C.border}`, borderRadius: 10, overflow: "hidden" }}>
      <button onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "13px 15px", background: "none", border: "none", cursor: "pointer", color: C.text }}>
        {isEdit ? <Pencil size={16} style={{ color: C.amber }} /> : <Crosshair size={16} style={{ color: C.amber }} />}
        <span className="display" style={{ fontWeight: 600, fontSize: 14, letterSpacing: 0.3 }}>{isEdit ? "Edit target" : "Lock a new target"}</span>
        <span style={{ marginLeft: "auto" }}>{open ? <ChevronUp size={16} style={{ color: C.muted }} /> : <ChevronDown size={16} style={{ color: C.muted }} />}</span>
      </button>

      {open && (
        <div style={{ padding: "0 15px 15px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={pill(mode === "flexible")} onClick={() => setMode("flexible")}>Flexible match</button>
            <button style={pill(mode === "exact")} onClick={() => setMode("exact")}>Exact model</button>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...inputStyle, width: 150, cursor: "pointer" }}>
              {CATEGORIES.map((c) => <option key={c} value={c} style={{ background: C.panel }}>{c}</option>)}
            </select>
            {mode === "flexible" ? (
              <input style={inputStyle} placeholder='Core requirement — e.g. "AMD Radeon RX 7800"' value={query} onChange={(e) => setQuery(e.target.value)} />
            ) : (
              <input style={inputStyle} placeholder='Exact model — e.g. "AMD Ryzen 7 7800X3D 4.2 GHz 8-Core"' value={exactModel} onChange={(e) => setExactModel(e.target.value)} />
            )}
          </div>

          {mode === "flexible" && (
            <div>
              <div style={{ display: "flex", gap: 8 }}>
                <input style={inputStyle} placeholder="Must also include — e.g. 16GB, XT (Enter to add)"
                  value={chipInput} onChange={(e) => setChipInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addChip(); } }} />
                <button onClick={addChip} style={{ ...pill(false), border: `1px solid ${C.border}` }}>Add</button>
              </div>
              {chips.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {chips.map((c) => (
                    <span key={c} className="mono" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: C.green, background: `${C.green}1a`, border: `1px solid ${C.green}44`, padding: "3px 8px", borderRadius: 5 }}>
                      {c}<X size={12} style={{ cursor: "pointer" }} onClick={() => setChips(chips.filter((x) => x !== c))} />
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button style={pill(cond === "new")} onClick={() => setCond("new")}>New only</button>
            <button style={pill(cond === "both")} onClick={() => setCond("both")}>New or used</button>
            <div style={{ position: "relative", marginLeft: "auto" }}>
              <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.muted, fontSize: 13 }}>$</span>
              <input style={{ ...inputStyle, width: 150, paddingLeft: 22 }} type="number" placeholder="Alert price (opt.)" value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {isEdit && (
              <button onClick={cancel} style={{ ...pill(false), border: `1px solid ${C.border}`, padding: "11px 16px" }}>Cancel</button>
            )}
            <button onClick={submit} disabled={!valid}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                background: valid ? C.amber : C.border, color: valid ? C.bg : C.muted,
                border: "none", borderRadius: 8, padding: "11px", fontWeight: 700, fontSize: 13.5,
                cursor: valid ? "pointer" : "not-allowed" }}>
              {isEdit ? <><Check size={16} /> Save changes</> : <><Plus size={16} /> Lock target</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- modals & chrome ---------- */
function Modal({ children, onClose, width }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.62)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, width: "100%", maxWidth: width || 420, maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 64px -24px #000" }}>
        {children}
      </div>
    </div>
  );
}

function ConfirmModal({ confirm, credits, onConfirm, onCancel, onBuy }) {
  const { cost, isAll, name } = confirm;
  const enough = credits >= cost;
  return (
    <Modal onClose={onCancel} width={400}>
      <div style={{ padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
          <Crosshair size={18} style={{ color: C.amber }} />
          <span className="display" style={{ fontSize: 16, fontWeight: 700 }}>{enough ? "Confirm scan" : "Not enough credits"}</span>
        </div>
        {enough ? (
          <p style={{ fontSize: 13.5, color: C.text, lineHeight: 1.55, margin: 0 }}>
            {isAll
              ? <>Scan <strong>all {cost} target{cost > 1 ? "s" : ""}</strong> for <strong style={{ color: C.amber }}>{cost} credit{cost > 1 ? "s" : ""}</strong>?</>
              : <>Scan <strong>{name}</strong> for <strong style={{ color: C.amber }}>1 credit</strong>?</>}
            <br /><span style={{ color: C.muted, fontSize: 12.5 }}>You have {credits} — you'll have {credits - cost} left.</span>
          </p>
        ) : (
          <p style={{ fontSize: 13.5, color: C.text, lineHeight: 1.55, margin: 0 }}>
            This needs <strong style={{ color: C.amber }}>{cost} credit{cost > 1 ? "s" : ""}</strong>, but you have <strong>{credits}</strong>.
            <br /><span style={{ color: C.muted, fontSize: 12.5 }}>Top up to run the scan.</span>
          </p>
        )}
        <div style={{ display: "flex", gap: 9, marginTop: 18 }}>
          <button onClick={onCancel} style={{ flex: 1, background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          {enough ? (
            <button onClick={onConfirm} style={{ flex: 1, background: C.amber, border: "none", color: C.bg, borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Scan size={15} /> Scan</button>
          ) : (
            <button onClick={onBuy} style={{ flex: 1, background: C.amber, border: "none", color: C.bg, borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Zap size={15} /> Buy credits</button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function BuyCreditsModal({ token, onClose, onPaid }) {
  const [sel, setSel] = useState(null);
  const [inv, setInv] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [paid, setPaid] = useState(false);
  const pollRef = useRef(null);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const choose = async (b) => {
    setSel(b); setErr(""); setInv(null); setLoading(true); setPaid(false);
    try {
      const r = await fetch("/api/create-invoice", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, bundleId: b.id }),
      });
      const d = await r.json();
      if (!r.ok || !d.bolt11) { setErr(d.error || "couldn't create invoice"); setLoading(false); return; }
      setInv(d); setLoading(false);
      pollRef.current = setInterval(async () => {
        try {
          const cr = await fetch("/api/check-invoice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paymentHash: d.paymentHash, token }) });
          const cd = await cr.json();
          if (cd.paid) { clearInterval(pollRef.current); setPaid(true); onPaid(cd.credits); }
        } catch {}
      }, 3000);
    } catch { setErr("network error — try again"); setLoading(false); }
  };
  const back = () => { if (pollRef.current) clearInterval(pollRef.current); setSel(null); setInv(null); setErr(""); setPaid(false); };
  const copy = () => { if (!inv?.bolt11) return; navigator.clipboard?.writeText(inv.bolt11).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); };

  return (
    <Modal onClose={onClose} width={440}>
      <div style={{ padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Zap size={18} style={{ color: C.amber }} />
            <span className="display" style={{ fontSize: 16, fontWeight: 700 }}>{sel ? "Pay with Lightning" : "Buy scan credits"}</span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer" }}><X size={18} /></button>
        </div>

        {!sel ? (
          <div>
            <p style={{ fontSize: 12.5, color: C.muted, margin: "0 0 14px", lineHeight: 1.5 }}>1 credit = one full target scan (all {GROUPS.length} source sweeps). Pick a bundle:</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {BUNDLES.map((b) => (
                <button key={b.id} onClick={() => choose(b)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C.panelHi, border: `1px solid ${C.border}`, borderRadius: 9, padding: "12px 14px", cursor: "pointer", textAlign: "left" }}>
                  <div>
                    <div className="mono" style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{b.credits} credits</div>
                    <div style={{ fontSize: 11, color: C.muted }}>${(b.usd / b.credits).toFixed(2)} / scan</div>
                  </div>
                  <div className="mono" style={{ display: "flex", alignItems: "center", gap: 6, color: C.amber, fontWeight: 700 }}>${b.usd.toFixed(2)}</div>
                </button>
              ))}
            </div>
            <p style={{ fontSize: 11, color: C.muted, marginTop: 12, lineHeight: 1.5, textAlign: "center" }}>Paid in Bitcoin over the Lightning Network. The sats amount is computed live at the current price.</p>
          </div>
        ) : (
          <div>
            <button onClick={back} style={{ background: "none", border: "none", color: C.aqua, cursor: "pointer", fontSize: 12.5, display: "flex", alignItems: "center", gap: 5, padding: 0, marginBottom: 12 }}><ArrowLeft size={14} /> bundles</button>
            {loading ? (
              <div style={{ textAlign: "center", padding: "34px 0", color: C.muted }}><Loader2 size={26} className="spin" /><div style={{ fontSize: 12.5, marginTop: 10 }}>Generating invoice…</div></div>
            ) : err ? (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <div style={{ color: C.red, fontSize: 13, lineHeight: 1.5 }}>{err}</div>
                <button onClick={() => choose(sel)} style={{ marginTop: 12, background: C.aqua, border: "none", color: C.bg, borderRadius: 7, padding: "8px 14px", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>Retry</button>
              </div>
            ) : paid ? (
              <div style={{ textAlign: "center", padding: "28px 0" }}>
                <Check size={42} style={{ color: C.green }} />
                <div className="display" style={{ fontSize: 16, fontWeight: 700, marginTop: 10 }}>Payment received</div>
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>{inv?.credits} credits added to your balance.</div>
                <button onClick={onClose} style={{ marginTop: 16, background: C.amber, border: "none", color: C.bg, borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Done</button>
              </div>
            ) : inv ? (
              <div style={{ textAlign: "center" }}>
                <div style={{ width: 184, height: 184, margin: "0 auto", borderRadius: 10, background: "#fff", padding: 8, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <QRCodeSVG value={inv.bolt11} size={168} />
                </div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: C.amber, marginTop: 12 }}>{Number(inv.sats).toLocaleString()} sats</div>
                <div style={{ fontSize: 12, color: C.muted }}>for {inv.credits} credits</div>
                <button onClick={copy} className="mono" style={{ marginTop: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: "8px 10px", color: C.muted, fontSize: 11, cursor: "pointer", width: "100%" }}>
                  {copied ? "copied invoice!" : (inv.bolt11.slice(0, 42) + "…")}
                </button>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <a href={"lightning:" + inv.bolt11} style={{ flex: 1, background: C.amber, color: C.bg, borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Zap size={14} /> Open wallet</a>
                  {inv.checkoutUrl && <a href={inv.checkoutUrl} target="_blank" rel="noopener noreferrer" style={{ flex: 1, background: "transparent", border: `1px solid ${C.border}`, color: C.aqua, borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>Checkout <ExternalLink size={12} /></a>}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 12, fontSize: 11.5, color: C.muted }}>
                  <Loader2 size={13} className="spin" /> waiting for payment…
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </Modal>
  );
}

function FeedbackModal({ mode: initialMode, buildSnapshot, onClose }) {
  const [mode, setMode] = useState(initialMode);
  const [text, setText] = useState("");
  const [report, setReport] = useState("");
  const [copied, setCopied] = useState(false);
  const tab = (m, label, Icon) => (
    <button onClick={() => setMode(m)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: `1px solid ${mode === m ? C.aqua : C.border}`, background: mode === m ? `${C.aqua}1f` : "transparent", color: mode === m ? C.aqua : C.muted }}>
      <Icon size={14} /> {label}
    </button>
  );
  const submit = () => {
    const payload = { type: mode, message: text.trim(), version: APP_VERSION, ts: new Date().toISOString(), ...(mode === "bug" ? { snapshot: buildSnapshot() } : {}) };
    setReport(JSON.stringify(payload, null, 2));
  };
  const copy = () => { navigator.clipboard?.writeText(report).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); };
  return (
    <Modal onClose={onClose} width={460}>
      <div style={{ padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <span className="display" style={{ fontSize: 16, fontWeight: 700 }}>{report ? "Report ready" : "Send feedback"}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer" }}><X size={18} /></button>
        </div>
        {!report ? (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {tab("suggestion", "Suggestion", Lightbulb)}
              {tab("bug", "Bug report", Bug)}
            </div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5}
              placeholder={mode === "bug" ? "What went wrong? What were you doing when it happened?" : "What would make Stakeout better?"}
              style={{ width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: "10px 12px", fontSize: 13.5, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
            {mode === "bug" && (
              <p style={{ fontSize: 11, color: C.muted, marginTop: 8, lineHeight: 1.5, display: "flex", alignItems: "center", gap: 6 }}>
                <AlertTriangle size={13} style={{ color: C.yellow }} /> A snapshot of your session (targets, scan results, errors) is attached to help debug.
              </p>
            )}
            <button onClick={submit} disabled={!text.trim()} style={{ width: "100%", marginTop: 14, background: text.trim() ? C.amber : C.border, border: "none", color: text.trim() ? C.bg : C.muted, borderRadius: 8, padding: "11px", fontSize: 13.5, fontWeight: 700, cursor: text.trim() ? "pointer" : "not-allowed" }}>
              {mode === "bug" ? "Build report" : "Submit"}
            </button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 12.5, color: C.muted, margin: "0 0 10px", lineHeight: 1.5 }}>Once the backend's live this sends straight to Tatum. For now, copy it and share it so he can dig in.</p>
            <pre className="mono" style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, fontSize: 10.5, color: C.text, maxHeight: 220, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{report}</pre>
            <button onClick={copy} style={{ width: "100%", marginTop: 12, background: C.aqua, border: "none", color: C.bg, borderRadius: 8, padding: "11px", fontSize: 13.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
              <Copy size={15} /> {copied ? "Copied!" : "Copy report"}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

function FeedbackLauncher({ onOpen }) {
  const [open, setOpen] = useState(false);
  const sec = { display: "flex", alignItems: "center", gap: 7, background: C.panel, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", boxShadow: "0 6px 18px -8px #000" };
  return (
    <div style={{ position: "fixed", right: 16, bottom: 16, zIndex: 40, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 9 }}>
      {open && (
        <>
          <button style={sec} onClick={() => { onOpen("suggestion"); setOpen(false); }}><Lightbulb size={15} style={{ color: C.yellow }} /> Suggestion</button>
          <button style={sec} onClick={() => { onOpen("bug"); setOpen(false); }}><Bug size={15} style={{ color: C.red }} /> Report bug</button>
        </>
      )}
      <button onClick={() => setOpen((o) => !o)} title="Feedback"
        style={{ alignSelf: "flex-end", width: 48, height: 48, borderRadius: 24, background: C.amber, border: "none", color: C.bg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 22px -8px #000" }}>
        {open ? <X size={20} /> : <MessageSquare size={20} />}
      </button>
    </div>
  );
}

function DonateLink() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = (e) => { e.stopPropagation(); navigator.clipboard?.writeText(ALBY).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); };
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button onClick={() => setOpen((o) => !o)}
        style={{ background: "none", border: "none", color: open ? C.amberSoft : C.amber, cursor: "pointer", fontSize: 12.5, fontWeight: 700, padding: 0, letterSpacing: 0.3 }}>donate</button>
      {open && (
        <button onClick={copy} title="Copy Lightning address" className="mono"
          style={{ position: "absolute", top: "calc(100% + 7px)", left: 0, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 5, background: C.panelHi, border: `1px solid ${C.amber}66`, color: C.amber, cursor: "pointer", fontSize: 11.5, fontWeight: 600, padding: "5px 9px", borderRadius: 6, zIndex: 6, boxShadow: "0 8px 20px -8px #000" }}>
          <Bitcoin size={13} /> {copied ? "copied!" : ALBY}
        </button>
      )}
    </span>
  );
}

function Footer() {
  const [c1, setC1] = useState(false);
  const [c2, setC2] = useState(false);
  const copyAddr = (v, set) => { navigator.clipboard?.writeText(v).then(() => { set(true); setTimeout(() => set(false), 1500); }).catch(() => {}); };
  const card = { flex: 1, minWidth: 240, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px" };
  const chip = { display: "inline-flex", alignItems: "center", gap: 6, background: C.panelHi, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: "pointer", color: C.text, whiteSpace: "nowrap", alignSelf: "flex-start" };
  const label = { fontSize: 10.5, color: "#a89e8b", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 7 };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 22 }}>
      <div style={card}>
        <div className="mono" style={label}>About</div>
        <p style={{ margin: 0, fontSize: 13.5, color: "#cdc6b4", lineHeight: 1.6 }}>
          Stakeout is a small project built by <span style={{ color: C.text }}>Tatum Turn Up</span> for fun. None of these listings are recommendations — verify everything yourself, and any purchase is at your own risk. It's just a tool for sniffing out deals.
        </p>
        <div style={{ display: "flex", gap: 15, marginTop: 14, alignItems: "center" }}>
          <a href="https://x.com/tatumturnup" target="_blank" rel="noopener noreferrer" className="social" title="X"><XLogo size={16} /></a>
          <a href="https://www.linkedin.com/in/tatumturnup/" target="_blank" rel="noopener noreferrer" className="social" title="LinkedIn"><LinkedInLogo size={17} /></a>
          <a href="https://www.youtube.com/@TatumTurnUp" target="_blank" rel="noopener noreferrer" className="social" title="YouTube"><YoutubeLogo size={18} /></a>
        </div>
      </div>
      <div style={card}>
        <div className="mono" style={label}>Support the stakeout</div>
        <p style={{ margin: "0 0 10px", fontSize: 13.5, color: "#cdc6b4", lineHeight: 1.6 }}>
          The only cost to use Stakeout is credits — I'm covering the backend out of pocket to keep it running. I'd love to build something better over time; a few sats keeps the lights on and means a lot.
        </p>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
          <span style={chip} className="mono" onClick={() => copyAddr(ALBY, setC1)}><Bitcoin size={13} style={{ color: C.amber }} /> {c1 ? "copied!" : ALBY}</span>
          <span style={chip} className="mono" onClick={() => copyAddr(CASHTAG, setC2)}><span style={{ color: C.green, fontWeight: 700 }}>$</span> {c2 ? "copied!" : CASHTAG}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- app ---------- */
export default function App() {
  const [list, setList] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [scanningIds, setScanningIds] = useState({});
  const [scanProgress, setScanProgress] = useState({});
  const [errors, setErrors] = useState({});
  const [globalScan, setGlobalScan] = useState(false);
  const [notify, setNotify] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [credits, setCredits] = useState(0);
  const [token] = useState(() => getToken());
  const [confirm, setConfirm] = useState(null);
  const [buyOpen, setBuyOpen] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const formRef = useRef(null);

  useEffect(() => {
    setList(loadList());
    setLoaded(true);
    apiBalance(token).then(setCredits);
  }, [token]);
  const persist = (next) => { setList(next); saveList(next); };

  const addTarget = (t) => persist([t, ...list]);
  const removeTarget = (id) => persist(list.filter((t) => t.id !== id));
  const startEdit = (t) => { setEditTarget(t); formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const updateTarget = (updated) => {
    const prev = list.find((x) => x.id === updated.id);
    const specChanged = prev && (prev.category !== updated.category || prev.matchMode !== updated.matchMode ||
      prev.query !== updated.query || prev.exactModel !== updated.exactModel ||
      JSON.stringify(prev.mustInclude) !== JSON.stringify(updated.mustInclude));
    const merged = { ...updated, lastScan: specChanged ? null : prev?.lastScan };
    persist(list.map((x) => x.id === updated.id ? merged : x));
    setEditTarget(null);
  };

  const setProg = (id, obj) => setScanProgress((p) => ({ ...p, [id]: obj }));
  const clearProg = (id) => setScanProgress((p) => { const n = { ...p }; delete n[id]; return n; });

  const fireNotice = (title, body) => {
    try {
      if (notify && typeof Notification !== "undefined" && Notification.permission === "granted")
        new Notification(title, { body });
    } catch {}
  };

  const refreshBalance = () => apiBalance(token).then(setCredits);

  const runScans = async (ids, isAll) => {
    if (isAll) setGlobalScan(true);
    for (const id of ids) { await doScan(id); }
    if (isAll) setGlobalScan(false);
    refreshBalance();
  };
  const requestScan = (id) => {
    const t = list.find((x) => x.id === id);
    setConfirm({ isAll: false, ids: [id], cost: 1, name: t ? buildQuery(t) : "this target" });
  };
  const requestScanAll = () => {
    if (!list.length) return;
    setConfirm({ isAll: true, ids: list.map((t) => t.id), cost: list.length });
  };
  const confirmScan = () => {
    if (!confirm) return;
    const { ids, cost, isAll } = confirm;
    if (credits < cost) { setConfirm(null); setBuyOpen(true); return; }
    setConfirm(null);
    runScans(ids, isAll); // credits are spent server-side per target (scan-begin)
  };

  const doScan = async (id) => {
    const t = list.find((x) => x.id === id);
    if (!t) return false;
    setScanningIds((s) => ({ ...s, [id]: true }));
    setErrors((e) => ({ ...e, [id]: null }));
    const total = GROUPS.length;
    setProg(id, { done: 0, total, label: GROUPS[0].label });

    // open a paid scan session — the server decrements 1 credit here, atomically
    let scanId;
    try {
      const r = await fetch("/api/scan-begin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const d = await r.json();
      if (typeof d.credits === "number") setCredits(d.credits);
      if (!r.ok || !d.scanId) {
        setErrors((er) => ({ ...er, [id]: d.error || "couldn't start scan" }));
        setScanningIds((s) => ({ ...s, [id]: false })); clearProg(id);
        if (r.status === 402) setBuyOpen(true);
        return false;
      }
      scanId = d.scanId;
    } catch {
      setErrors((er) => ({ ...er, [id]: "couldn't reach the scan server" }));
      setScanningIds((s) => ({ ...s, [id]: false })); clearProg(id);
      return false;
    }

    let merged = [], typical = null, fails = 0, lastErr = "";
    for (let i = 0; i < GROUPS.length; i++) {
      const g = GROUPS[i];
      setProg(id, { done: i, total, label: g.label });
      try {
        const r = await scanGroup(t, g, scanId);
        if (g.wantTypical && typeof r.typicalPrice === "number") typical = r.typicalPrice;
        if (Array.isArray(r.listings)) merged.push(...r.listings.filter((l) => typeof l.price === "number" && l.price > 0));
      } catch (e) { console.error(g.key, e); fails++; lastErr = e?.message || "unknown error"; }
      setProg(id, { done: i + 1, total, label: i + 1 < total ? GROUPS[i + 1].label : "compiling" });
    }

    // close the session — the server refunds the credit if every sweep failed
    try {
      const r = await fetch("/api/scan-finish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scanId, token }) });
      const d = await r.json();
      if (typeof d.credits === "number") setCredits(d.credits);
    } catch {}

    if (fails === total) {
      setErrors((er) => ({ ...er, [id]: lastErr || "all sweeps failed" }));
      setScanningIds((s) => ({ ...s, [id]: false }));
      clearProg(id);
      return false;
    }
    const result = computeResult({ typicalPrice: typical, listings: dedupe(merged) }, t, total - fails);
    setList((prev) => {
      const next = prev.map((x) => x.id === id ? { ...x, lastScan: result, typicalPrice: result.typicalPrice ?? x.typicalPrice } : x);
      saveList(next); return next;
    });
    if (result.hasDeal) fireNotice("🔥 Deal acquired", `${buildQuery(t)} — ${money(result.best.price)} (${result.dealReason})`);
    setScanningIds((s) => ({ ...s, [id]: false }));
    clearProg(id);
    return true;
  };

  const buildSnapshot = () => ({
    app: "stakeout", version: APP_VERSION, ts: new Date().toISOString(), credits,
    targetCount: list.length,
    targets: list.map((t) => ({
      category: t.category, mode: t.matchMode, query: buildQuery(t),
      condition: t.conditionPref, targetPrice: t.targetPrice,
      lastScan: t.lastScan ? {
        ts: t.lastScan.timestamp, typicalPrice: t.lastScan.typicalPrice,
        best: t.lastScan.best ? { price: t.lastScan.best.price, source: t.lastScan.best.source, reliability: t.lastScan.best.reliability } : null,
        listings: t.lastScan.all?.length || 0, sourcesChecked: t.lastScan.sourcesChecked, hasDeal: t.lastScan.hasDeal,
      } : null,
    })),
    errors: Object.entries(errors).filter(([, v]) => v).map(([id, v]) => ({ id, error: String(v) })),
    env: typeof navigator !== "undefined" ? { ua: navigator.userAgent, viewport: `${window.innerWidth}x${window.innerHeight}` } : {},
  });

  const toggleNotify = async () => {
    if (notify) { setNotify(false); return; }
    try {
      if (typeof Notification === "undefined") { setNotify(true); return; }
      await Notification.requestPermission();
      setNotify(true);
    } catch { setNotify(true); }
  };

  const dealCount = list.filter((t) => t.lastScan?.hasDeal).length;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');
        .mono{font-family:'JetBrains Mono',ui-monospace,Menlo,monospace}
        .display{font-family:'Space Grotesk',system-ui,sans-serif}
        .spin{animation:sp 1s linear infinite}
        @keyframes sp{to{transform:rotate(360deg)}}
        .reticle{animation:pulse 1.6s ease-in-out infinite}
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.55;transform:scale(1.18)}}
        .scan-line{position:absolute;left:0;right:0;top:0;height:1px;background:linear-gradient(90deg,transparent,${C.amber},transparent);animation:scan 4s linear infinite;opacity:.5}
        @keyframes scan{0%{top:0}100%{top:100%}}
        select option{color:${C.text}}
        @media(prefers-reduced-motion:reduce){.reticle,.scan-line,.spin{animation:none}}
        input::placeholder{color:${C.muted}}
        .social{color:${C.muted};transition:color .15s ease;display:inline-flex}
        .social:hover{color:${C.text}}
      `}</style>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 16px 60px" }}>
        {/* header */}
        <div style={{ position: "relative", overflow: "hidden", borderBottom: `1px solid ${C.border}`, padding: "26px 0 20px", marginBottom: 18 }}>
          <div className="scan-line" />
          <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, marginTop: 1, flexShrink: 0 }}>
              <Crosshair size={26} style={{ color: C.amber }} />
              <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: C.amber, opacity: 0.85, letterSpacing: 0.5, lineHeight: 1 }}>{VERSION}</span>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <div className="display" style={{ fontSize: 24, fontWeight: 700, letterSpacing: 1, lineHeight: 1 }}>STAKEOUT</div>
                <span className="display" style={{ fontSize: 13, fontWeight: 500, color: C.muted, letterSpacing: 0.2 }}>by Tatum Turn Up</span>
                <span style={{ color: C.border }}>·</span>
                <DonateLink />
              </div>
              <div className="mono" style={{ fontSize: 11, color: C.muted, marginTop: 3, letterSpacing: 0.5 }}>hardware deal watchlist · deep on-demand sweeps</div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", alignSelf: "center" }}>
              <div className="mono" title="Scan credits" style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${C.border}`, borderRadius: 7, padding: "6px 10px", fontSize: 12.5 }}>
                <Coins size={14} style={{ color: C.yellow }} />
                <span style={{ color: C.text, fontWeight: 700 }}>{credits}</span>
                <span style={{ color: C.muted }}>credits</span>
              </div>
              <button onClick={() => setBuyOpen(true)} style={{ background: `${C.amber}1f`, border: `1px solid ${C.amber}`, color: C.amber, borderRadius: 7, padding: "6px 11px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Buy</button>
              <button onClick={toggleNotify} title="Toggle deal alerts"
                style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 9px", cursor: "pointer", color: notify ? C.green : C.muted }}>
                {notify ? <Bell size={15} /> : <BellOff size={15} />}
              </button>
            </div>
          </div>

          {list.length > 0 && (
            <div style={{ display: "flex", gap: 16, marginTop: 16, alignItems: "center" }}>
              <Stat label="watching" value={list.length} color={C.green} />
              <Stat label="live deals" value={dealCount} color={dealCount ? C.amber : C.muted} flame={dealCount > 0} />
              <button onClick={requestScanAll} disabled={globalScan}
                style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, background: C.amber, color: C.bg, border: "none", borderRadius: 8, padding: "9px 15px", fontWeight: 700, fontSize: 13, cursor: globalScan ? "wait" : "pointer", opacity: globalScan ? 0.7 : 1 }}>
                {globalScan ? <Loader2 size={15} className="spin" /> : <Radar size={15} />}
                {globalScan ? "Sweeping all…" : "Scan all targets"}
              </button>
            </div>
          )}
        </div>

        {dealCount > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 9, background: `${C.amber}16`, border: `1px solid ${C.amber}55`, borderRadius: 9, padding: "11px 14px", marginBottom: 16 }}>
            <Flame size={17} style={{ color: C.amber }} />
            <span style={{ fontSize: 13.5 }}>
              <strong style={{ color: C.amber }}>{dealCount} target{dealCount > 1 ? "s" : ""}</strong> {dealCount > 1 ? "are" : "is"} on sale right now — check the highlighted cards.
            </span>
          </div>
        )}

        <div ref={formRef} style={{ marginBottom: 18, scrollMarginTop: 12 }}>
          <TargetForm editTarget={editTarget} onAdd={addTarget} onUpdate={updateTarget} onCancelEdit={() => setEditTarget(null)} />
        </div>

        {!loaded ? null : list.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 20px", color: C.muted }}>
            <Target size={32} style={{ color: C.border, display: "block", margin: "0 auto 12px" }} />
            <div style={{ fontSize: 14 }}>No targets yet. Lock your first part above to start the stakeout.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            {list.map((t) => (
              <TargetCard key={t.id} t={t}
                scanning={!!scanningIds[t.id]} progress={scanProgress[t.id]} error={errors[t.id]}
                onScan={requestScan} onRemove={removeTarget} onEdit={startEdit} />
            ))}
          </div>
        )}

        <div className="mono" style={{ marginTop: 28, fontSize: 11, color: C.muted, textAlign: "center", lineHeight: 1.7 }}>
          Each scan runs {GROUPS.length} live source sweeps on demand. Best price = cheapest listing from a vetted source;<br />
          used / auction / surplus / low-trust listings are flagged, never picked silently. Always click through to verify the price.
        </div>

        <Footer />
      </div>

      {confirm && (
        <ConfirmModal confirm={confirm} credits={credits}
          onConfirm={confirmScan} onCancel={() => setConfirm(null)}
          onBuy={() => { setConfirm(null); setBuyOpen(true); }} />
      )}
      {buyOpen && (
        <BuyCreditsModal token={token} onClose={() => setBuyOpen(false)} onPaid={(c) => setCredits(c)} />
      )}
      {feedback && (
        <FeedbackModal mode={feedback} buildSnapshot={buildSnapshot} onClose={() => setFeedback(null)} />
      )}
      <FeedbackLauncher onOpen={(m) => setFeedback(m)} />
    </div>
  );
}

function Stat({ label, value, color, flame }) {
  return (
    <div>
      <div className="mono" style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1, display: "flex", alignItems: "center", gap: 5 }}>
        {flame && <Flame size={16} />}{value}
      </div>
      <div className="mono" style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 3 }}>{label}</div>
    </div>
  );
}
