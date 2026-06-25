# Stakeout

A hardware deal watchlist. You tell it which PC parts you're hunting for, and on demand
it sweeps retailers, used marketplaces, auctions/government surplus, and refurb outlets,
then surfaces the cheapest *trustworthy* listing and flags the sketchy ones — so a Newegg
flash sale gets caught, but a too-good-to-be-true marketplace post comes with a warning
instead of a recommendation. 

Live at **stakeout-alpha.vercel.app**.

---

## How to use it

### 1. Lock a target (the target builder)

A "target" is one part you want watched. The builder at the top is where you define it.
Building targets is **free** — you only spend credits when you actually scan.

Here's every control, top to bottom:

**Match mode — `Flexible match` vs `Exact model`**
This is the most important choice. It decides how picky Stakeout is.
- **Flexible match** — you care about the core part but not the exact model. Stakeout treats
  your core requirement (plus any "must include" chips) as hard requirements and accepts *any*
  listing that meets them. Use this for *"any RX 7800, I don't care which board partner."*
- **Exact model** — you want one specific model and nothing else. Stakeout matches that exact
  string and rejects near-matches. Use this for *"this exact Ryzen 7 7800X3D, no substitutes."*

**Category dropdown**
Tags the target (GPU, CPU, Motherboard, RAM, Storage, PSU, Case, CPU Cooler, Other). It helps
aim the search and keeps your watchlist organized.

**The part field**
- In **Flexible** mode this is your *core requirement* — the must-have spec, e.g.
  `AMD Radeon RX 7800`.
- In **Exact** mode it's the *full model name*, e.g. `AMD Ryzen 7 7800X3D 4.2 GHz 8-Core`.

**Must also include (Flexible mode only)**
Optional extra requirements, added as chips. Type an attribute like `16GB` or `XT`, then press
**Enter** or click **Add**. Every chip becomes a hard filter — a listing has to match *all* of
them to count. Click the **×** on any chip to drop it. Use these to tighten a flexible search
without locking to one exact model.

**Add button**
Just commits whatever's typed in the "must include" box as a chip (same as pressing Enter).

**Condition — `New only` vs `New or used`**
- **New only** — excludes plain used listings. Keeps new, open-box, and refurbished.
- **New or used** — also pulls in used/marketplace listings. Those still get flagged as risky
  and are never quietly presented as your best price.

**Alert price (the optional `$` field)**
Your target price. If a *trustworthy* listing lands at or below it, the target lights up as a
🔥 **FIRE SALE**. Leave it blank if you just want the cheapest price with no threshold.
(Even without a target price, Stakeout still flags a deal when the best price is well under the
typical street price.)

**Lock target**
Saves the target to your watchlist below.

**Save changes / Cancel (edit mode only)**
When you're editing an existing target, "Lock target" becomes **Save changes**, and **Cancel**
discards your edits. Heads-up: if you change the actual *spec* (the part, match mode, or
category), the old scan result is cleared since it no longer applies — but tweaking just the
alert price or condition keeps your last scan.

Tip: the **"Lock a new target"** bar itself is a toggle — click it to collapse or expand the
whole builder.

### 2. Scan a target

Scanning is what costs **credits** — **1 credit = one full target scan.** Behind the scenes a
single scan runs four separate sweeps (retailers → used marketplaces → auctions/surplus →
refurb/niche), which is why the progress bar fills in four real steps and why it takes a bit.

- **Scan now / Re-scan** (on a target card) scans that one target for **1 credit**.
- **Scan all targets** (top bar) scans your whole list — **1 credit per target**.
- Either way you get a **confirmation** first (e.g. *"Scan all 5 targets for 5 credits?"*) so
  nothing spends without your okay. If a target's scan fails completely, that credit is refunded.

### 3. Read the results

After a scan, a target card shows:
- **The big price** — the cheapest listing from a *vetted* source (a real retailer with buyer
  protection). This is the headline number, and the **View** button opens that listing.
- **🔥 FIRE SALE** — appears when the best price is at/below your alert price, or well under the
  typical street price.
- **typical ~$X** — the going street price, so you can see how good the deal actually is.
- **cheapest risky: $X** — the lowest used/marketplace/auction find, flagged separately. It's
  shown for your awareness but never picked as the headline.
- **View all N listings** — expands the full list, with a reliability rating (dots) on each and a
  red shield on the risky ones.
- **N/4 sweeps · scanned Xm ago** — confirms how many of the four sweeps actually completed.

Always click through to verify a price before buying — listings move, and scans are live, so the
exact number can shift between runs.

### 4. Manage targets

Each card has a **pencil** (edit) and **trash** (remove) icon in its top-right corner.

### 5. Credits

Your credit balance lives top-right, next to a **Buy** button.
- **Buy** opens the credit bundles (5 / 20 / 50 credits) and a Lightning payment screen.
- *Note:* the Lightning payment is currently a **demo placeholder** — the real invoice + the
  server-side balance are the next milestone. For now "Simulate payment" tops you up so you can
  test the flow.

### 6. Extras

- **Bell icon (top-right)** — toggles browser deal alerts (in addition to the in-app banners).
- **donate** (next to the title) — reveals a Lightning address to tip the project.
- **Feedback button (bottom-right, always visible)** — expands into **Suggestion** and
  **Report bug**. A bug report captures a snapshot of your session (your targets, results, and
  any errors) to make problems easy to diagnose.

---

## How scanning decides what's "best"

Stakeout separates two things: *where it looks* (the four source sweeps) and *how it judges*
(reliability). A listing is treated as **reliable** only if it's from a real retailer/aggregator
with decent buyer protection. The headline "best price" is always picked from that reliable pool;
used, auction, surplus, and low-trust listings are surfaced and flagged, never chosen silently.
A deal flag fires when the best reliable price beats your alert price or comes in well below the
typical street price.

---

## Development & deploy

This is a Vite + React app (static frontend) plus one serverless function (`api/scan.js`) that
holds the API key and runs scans server-side.

```
npm install         # one-time
npm run dev         # local frontend (use `vercel dev` to also run the /api function)
npm run build       # production build to /dist
```

- Secret config lives in environment variables, never in code. Local dev: copy `.env.example`
  to `.env.local` and set `ANTHROPIC_API_KEY`. Production: set it in the Vercel dashboard
  (Settings → Environment Variables).
- Deploys are automatic: every push to GitHub triggers a Vercel rebuild of the live site.
- The default scan model is cheap Haiku; override with `STAKEOUT_MODEL` if you want Sonnet.

**Heads-up on cost:** until the credit gate is enforced server-side, scans run on your API key
with no paywall, so keep a hard spend cap set in the Anthropic Console and keep the URL private
to testers.

---

## Roadmap

- Server-side credit balance + real Lightning invoices (replacing the demo payment)
- Per-sweep breakdown in scan results
- Credit history / receipts
- Nostr login
- Longer term: OSINT-driven source discovery, so scans keep finding new niche deal sites over time

---

Built by **Tatum Turn Up**. Listings are not recommendations — verify everything yourself; any
purchase is at your own risk.
