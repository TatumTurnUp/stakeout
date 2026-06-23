// api/_config.js — server-side source of truth for pricing.
// Files starting with "_" are NOT exposed as API routes by Vercel.

// One credit = one full target scan (4 backend sweeps). Priced in USD so the
// sat amount tracks BTC live at invoice time. Tune the per-credit price by
// editing the amountUsd values below.
export const BUNDLES = {
  small:  { id: "small",  credits: 5,  amountUsd: 1.60 },  // $0.32/credit
  medium: { id: "medium", credits: 20, amountUsd: 5.80 },  // $0.29/credit
  large:  { id: "large",  credits: 50, amountUsd: 13.50 }, // $0.27/credit
};
