// Port of products/service.py pure validators (trust boundary: form free text).
export const VALID_CATEGORIES = ["Mobile", "Laptop", "Tablet", "Accessory"] as const;
export const VALID_CONDITIONS = ["New", "Used", "Refurbished"] as const;
export const VALID_TAGS = [
  "clearance", "trending", "best_camera", "long_battery", "gaming", "budget",
  "premium", "high_margin", "staff_pick", "new_arrival", "limited_stock",
] as const;

export function parsePrice(raw: string, field: string): number {
  const n = Number((raw ?? "").trim());
  if (!Number.isFinite(n) || n < 0) throw new Error(`${field} must be a number ≥ 0.`);
  return Math.round(n * 100) / 100;
}

export function parseQuantity(raw: string): number {
  const n = Number((raw ?? "").trim());
  if (!Number.isInteger(n) || n < 0) throw new Error("Quantity must be a whole number ≥ 0.");
  return n;
}

/** "camera: 108MP\nram: 12GB" → {camera: "108MP", ram: "12GB"}. Bad lines are named. */
export function parseSpecs(raw: string): Record<string, string> {
  const specs: Record<string, string> = {};
  for (const line of (raw ?? "").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const i = t.indexOf(":");
    if (i <= 0 || !t.slice(i + 1).trim()) throw new Error(`Specs must be "key: value" — got "${t}".`);
    specs[t.slice(0, i).trim().toLowerCase()] = t.slice(i + 1).trim();
  }
  return specs;
}

export function parseNonEmpty(raw: string, field: string): string {
  const t = (raw ?? "").trim();
  if (!t) throw new Error(`${field} cannot be empty.`);
  return t;
}
