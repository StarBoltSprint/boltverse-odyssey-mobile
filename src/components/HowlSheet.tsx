import { useState } from "react";
import { MAX_REMIX, MAX_WISH, type ForgeTheme, type RemixBuilding, type RemixWorld } from "@/game/forged";
import { loadForge, writeForge } from "@/game/forge-save";

type Tab = "pick" | "remix" | "engine";
type Draft = {
  theme?: ForgeTheme;
  name?: string;
  line?: string;
  lore?: string;
  buildings: RemixBuilding[];
  log: string[];
};

type Props = {
  onClose: () => void;
  onLand: () => void;
};

export function HowlSheet({ onClose, onLand }: Props) {
  const bag = loadForge();
  const [tab, setTab] = useState<Tab>("pick");
  const [wish, setWish] = useState("");
  const [engineWish, setEngineWish] = useState("");
  const [phase, setPhase] = useState<"ask" | "build" | "done">("ask");
  const [draft, setDraft] = useState<Draft>({ buildings: [], log: [] });
  const [world, setWorld] = useState<RemixWorld | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kept, setKept] = useState(false);
  const full = bag.remixes.length >= MAX_REMIX;

  async function strike() {
    const howl = wish.trim();
    if (howl.length < 4 || full) return;
    setError(null);
    setPhase("build");
    setDraft({ buildings: [], log: ["$ grok build remix --circuit"] });
    try {
      const res = await fetch("/api/forge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wish: howl }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "The anvil went cold." }));
        setError(String((err as { error?: string }).error || "The anvil went cold."));
        setPhase("ask");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let live: Draft = { buildings: [], log: ["$ grok build remix --circuit"] };
      let sealed: RemixWorld | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split("\n\n");
        buf = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line.startsWith("data:")) continue;
          try {
            const ev = JSON.parse(line.slice(5).trim()) as {
              t?: string;
              v?: unknown;
              world?: RemixWorld;
            };
            if (ev.t === "error") {
              setError(String(ev.v || "The remix would not hold."));
              setPhase("ask");
              return;
            }
            if (ev.t === "world" && ev.world) {
              sealed = ev.world;
              live = {
                theme: ev.world.theme,
                name: ev.world.name,
                line: ev.world.line,
                lore: ev.world.lore,
                buildings: ev.world.buildings,
                log: ev.world.log,
              };
              setDraft(live);
              continue;
            }
            if (ev.t === "theme" && typeof ev.v === "string") live = { ...live, theme: ev.v as ForgeTheme };
            if (ev.t === "name" && typeof ev.v === "string") live = { ...live, name: ev.v };
            if (ev.t === "line" && typeof ev.v === "string") live = { ...live, line: ev.v };
            if (ev.t === "lore" && typeof ev.v === "string") live = { ...live, lore: ev.v };
            if (ev.t === "log" && typeof ev.v === "string") live = { ...live, log: [...live.log, ev.v].slice(-10) };
            if (ev.t === "building" && ev.v && typeof ev.v === "object") {
              const b = ev.v as RemixBuilding;
              if (live.buildings.length < 6) {
                live = {
                  ...live,
                  buildings: [
                    ...live.buildings,
                    { name: String(b.name || "Den"), kind: String(b.kind || "den"), line: String(b.line || "") },
                  ],
                };
              }
            }
            setDraft({ ...live, buildings: [...live.buildings], log: [...live.log] });
          } catch {
            /* skip */
          }
        }
      }
      if (!sealed) {
        setError("The remix would not hold.");
        setPhase("ask");
        return;
      }
      const next = loadForge();
      writeForge({ ...next, remixes: [sealed, ...next.remixes].slice(0, MAX_REMIX) });
      setWorld(sealed);
      setPhase("done");
    } catch {
      setError("The star core went quiet.");
      setPhase("ask");
    }
  }

  function keepEngine() {
    const line = engineWish.trim();
    if (line.length < 4) return;
    const next = loadForge();
    writeForge({ ...next, engineWishes: [...next.engineWishes, line].slice(-12) });
    setKept(true);
  }

  return (
    <div className="citadel-sheet" role="dialog" aria-label="Forge">
      <div className="citadel-sheet-card">
        {tab === "pick" && (
          <>
            <div className="forge-crest-wrap" aria-hidden>
              <img className="forge-crest" src="/forge/kiln.jpg" alt="" />
            </div>
            <p className="citadel-kicker">Kiln</p>
            <h2 className="citadel-sheet-title">Forge</h2>
            <p className="citadel-sheet-copy">Pick a door. Remix walks Circuit. A new engine waits until it is in the pack.</p>
            <div className="forge-doors">
              <button type="button" className="forge-door" data-open="true" onClick={() => setTab("remix")}>
                <span className="forge-door-art">
                  <img src="/forge/remix.jpg" alt="" />
                  <span className="hall-ribbon">Open</span>
                  <span className="hall-badge" data-open="true">
                    Land
                  </span>
                </span>
                <strong>Remix</strong>
                <em>Circuit city file</em>
              </button>
              <button type="button" className="forge-door" onClick={() => setTab("engine")}>
                <span className="forge-door-art">
                  <img src="/forge/engine.jpg" alt="" />
                  <span className="hall-ribbon">Sealed</span>
                  <span className="hall-badge">Howl</span>
                </span>
                <strong>New Engine</strong>
                <em>Not in the pack yet</em>
              </button>
            </div>
            <button type="button" className="citadel-sheet-close" onClick={onClose}>
              Close
            </button>
          </>
        )}

        {tab === "remix" && phase === "ask" && (
          <form
            className="forge-inner"
            onSubmit={(e) => {
              e.preventDefault();
              void strike();
            }}
          >
            <div className="forge-inner-art" aria-hidden>
              <img src="/forge/remix.jpg" alt="" />
            </div>
            <p className="citadel-kicker">Remix · Circuit</p>
            <h2 className="citadel-sheet-title">Howl a city</h2>
            <p className="citadel-sheet-copy">Same engine. New dens. You Land it here.</p>
            <textarea
              className="citadel-wish"
              rows={3}
              maxLength={MAX_WISH}
              value={wish}
              onChange={(e) => setWish(e.target.value)}
              placeholder="Year 0, but a second kiln and a west dock of cyan glass…"
            />
            {error && <p className="citadel-sheet-copy">{error}</p>}
            {full && <p className="citadel-sheet-copy">The Hall holds eight remixes.</p>}
            <button type="submit" className="citadel-sheet-close" disabled={wish.trim().length < 4 || full}>
              Strike remix
            </button>
            <button type="button" className="citadel-sheet-back" onClick={() => setTab("pick")}>
              Back
            </button>
          </form>
        )}

        {tab === "remix" && phase !== "ask" && (
          <div className="forge-inner">
            <div className="forge-inner-art" data-live="true" aria-hidden>
              <img src="/forge/remix.jpg" alt="" />
              <span className="forge-heat" />
            </div>
            <p className="citadel-kicker">{draft.theme || "remixing"} · circuit</p>
            <h2 className="citadel-sheet-title">{draft.name || "Raising dens…"}</h2>
            {draft.line && <p className="citadel-sheet-copy">{draft.line}</p>}
            <ul className="citadel-sheet-list">
              {draft.buildings.map((b) => (
                <li key={b.name}>
                  <strong>{b.name}</strong>
                  <span>{b.kind}</span>
                </li>
              ))}
            </ul>
            <div className="citadel-sheet-log">
              {draft.log.slice(-4).map((ln, i) => (
                <p key={`${i}-${ln}`}>{ln}</p>
              ))}
            </div>
            {phase === "done" && world && (
              <button type="button" className="citadel-sheet-close" onClick={onLand}>
                Land remix
              </button>
            )}
            <button type="button" className="citadel-sheet-back" onClick={onClose}>
              Citadel
            </button>
          </div>
        )}

        {tab === "engine" && (
          <div className="forge-inner">
            <div className="forge-inner-art" aria-hidden>
              <img src="/forge/engine.jpg" alt="" />
            </div>
            <p className="citadel-kicker">New Engine</p>
            <h2 className="citadel-sheet-title">Sealed kiln</h2>
            <p className="citadel-sheet-copy">
              A new engine is a new mode in this pack — slash, racer, anything that is not Circuit. Forge cannot compile one. Howl it. We keep it until Grok Build adds it here.
            </p>
            {kept ? (
              <p className="citadel-sheet-copy">Kept. When that engine lands in the pack, Remix can play it.</p>
            ) : (
              <>
                <textarea
                  className="citadel-wish"
                  rows={3}
                  maxLength={MAX_WISH}
                  value={engineWish}
                  onChange={(e) => setEngineWish(e.target.value)}
                  placeholder="Diablo-style slash, Bolt as hero…"
                />
                <button type="button" className="citadel-sheet-close" disabled={engineWish.trim().length < 4} onClick={keepEngine}>
                  Keep this howl
                </button>
              </>
            )}
            <button type="button" className="citadel-sheet-back" onClick={() => setTab("pick")}>
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
