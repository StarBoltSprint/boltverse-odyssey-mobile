export const FORGE_THEMES = ["crystal", "ember", "tide", "void", "grove", "storm"] as const;
export type ForgeTheme = (typeof FORGE_THEMES)[number];

export type RemixBuilding = {
  name: string;
  kind: string;
  line: string;
};

export type RemixWorld = {
  id: string;
  name: string;
  line: string;
  lore: string;
  theme: ForgeTheme;
  engine: "circuit";
  buildings: RemixBuilding[];
  log: string[];
  wish: string;
  at: number;
};

export const MAX_REMIX = 8;
export const MAX_WISH = 240;

function clip(s: unknown, n: number) {
  return String(s ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, n);
}

export function sanitizeRemix(raw: unknown, wish = ""): RemixWorld | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const name = clip(o.name, 28);
  const line = clip(o.line, 90);
  if (name.length < 2) return null;
  const buildings: RemixBuilding[] = (Array.isArray(o.buildings) ? o.buildings : [])
    .slice(0, 6)
    .map((b) => {
      const row = b && typeof b === "object" ? (b as Record<string, unknown>) : {};
      return {
        name: clip(row.name, 22) || "Den",
        kind: clip(row.kind, 16) || "den",
        line: clip(row.line, 80) || "A quiet post.",
      };
    });
  while (buildings.length < 3) buildings.push({ name: "Unnamed den", kind: "den", line: "Still raising." });
  const theme = FORGE_THEMES.includes(o.theme as ForgeTheme) ? (o.theme as ForgeTheme) : "crystal";
  const log = (Array.isArray(o.log) ? o.log : []).map((l) => clip(l, 88)).filter(Boolean).slice(0, 12);
  const id =
    clip(o.id, 40).replace(/[^a-zA-Z0-9_-]/g, "") ||
    `remix-${name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12)}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    id,
    name,
    line: line || "A remix of Luminous Circuit.",
    lore: clip(o.lore, 280) || line,
    theme,
    engine: "circuit",
    buildings,
    log: log.length ? log : ["$ grok build remix --circuit", "sealing dens…"],
    wish: clip(o.wish, MAX_WISH) || clip(wish, MAX_WISH),
    at: Number(o.at) || Date.now(),
  };
}

export function sanitizeList(raw: unknown): RemixWorld[] {
  if (!Array.isArray(raw)) return [];
  const out: RemixWorld[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    const w = sanitizeRemix(row);
    if (!w || seen.has(w.id)) continue;
    seen.add(w.id);
    out.push(w);
    if (out.length >= MAX_REMIX) break;
  }
  return out;
}
