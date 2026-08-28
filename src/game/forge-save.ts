import { MAX_REMIX, sanitizeList, type RemixWorld } from "./forged";

const KEY = "bv-forge-v1";

export type ForgeSave = {
  remixes: RemixWorld[];
  engineWishes: string[];
};

function empty(): ForgeSave {
  return { remixes: [], engineWishes: [] };
}

export function loadForge(): ForgeSave {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<ForgeSave>;
    return {
      remixes: sanitizeList(parsed.remixes),
      engineWishes: Array.isArray(parsed.engineWishes)
        ? parsed.engineWishes.map((w) => String(w).slice(0, 240)).filter(Boolean).slice(-12)
        : [],
    };
  } catch {
    return empty();
  }
}

export function writeForge(data: ForgeSave) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        remixes: data.remixes.slice(0, MAX_REMIX),
        engineWishes: data.engineWishes.slice(-12),
      }),
    );
  } catch {
    /* private mode */
  }
}
