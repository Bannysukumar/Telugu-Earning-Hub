/** Build a UPI deep link (scannable as QR and opened by Pay Now). */
export function buildUpiPaymentUri(params: {
  vpa: string;
  payeeName: string;
  amount: number;
  note?: string;
}): string {
  const pa = params.vpa.trim();
  const am = params.amount.toFixed(2);
  const pn = params.payeeName.trim() || "Telugu Earning Hub";
  const tn = (params.note?.trim() || "Wallet deposit").slice(0, 80);
  const q = new URLSearchParams({ pa, pn, am, cu: "INR", tn });
  return `upi://pay?${q.toString()}`;
}

export function normalizeUpiId(raw: string): string {
  return raw.trim().toLowerCase();
}

export function sanitizeUpiIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const id = normalizeUpiId(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function pickRandomUpiId(ids: string[]): string | null {
  const list = sanitizeUpiIds(ids);
  if (list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)]!;
}
