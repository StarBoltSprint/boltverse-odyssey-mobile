import { useState } from "react";
import { loadNames } from "@/game/civic";
import { loadChanges } from "@/game/city-change";
import type { SessionPayload } from "@/game/bot-session";
import { GrokBotSignIn } from "./GrokBotSignIn";
import { SubmitChangeSheet } from "./SubmitChangeSheet";

type Tab = "map" | "lineage" | "remix" | "bot" | null;

export function RaisingDock({
  lookX,
  lookZ,
  onBotSession,
}: {
  lookX: number;
  lookZ: number;
  onBotSession?: (next: SessionPayload) => void;
}) {
  const [tab, setTab] = useState<Tab>(null);

  function toggle(next: Tab) {
    setTab((cur) => (cur === next ? null : next));
  }

  return (
    <>
      <nav className="raising-dock" aria-label="Game">
        <button
          type="button"
          className="raising-tab"
          data-on={tab === "map" ? "true" : undefined}
          onClick={() => toggle("map")}
        >
          <span className="raising-tab-face">
            <img src="/ui/tab-map.jpg" alt="" />
          </span>
          Map
        </button>
        <button
          type="button"
          className="raising-tab"
          data-on={tab === "lineage" ? "true" : undefined}
          onClick={() => toggle("lineage")}
        >
          <span className="raising-tab-face">
            <img src="/ui/tab-lineage.jpg" alt="" />
          </span>
          Lineage
        </button>
        <button
          type="button"
          className="raising-tab"
          data-on={tab === "remix" ? "true" : undefined}
          onClick={() => toggle("remix")}
        >
          <span className="raising-tab-face">
            <img src="/ui/tab-remix.jpg" alt="" />
          </span>
          Remix
        </button>
        <button
          type="button"
          className="raising-tab"
          data-on={tab === "bot" ? "true" : undefined}
          onClick={() => toggle("bot")}
        >
          <span className="raising-tab-face">
            <img src="/ui/tab-grok.jpg" alt="" />
          </span>
          Grok
        </button>
      </nav>

      {tab === "map" && (
        <div className="raising-sheet" role="dialog" aria-label="Map">
          <button type="button" className="raising-sheet-scrim" aria-label="Close map" onClick={() => setTab(null)} />
          <div className="raising-sheet-card">
            <header className="raising-sheet-head">
              <p>Map</p>
              <button type="button" className="raising-sheet-x" onClick={() => setTab(null)}>
                Close
              </button>
            </header>
            <Year0Map lookX={lookX} lookZ={lookZ} />
            <p className="raising-sheet-note">Year 0. One island. The Core Spire is the whole land.</p>
          </div>
        </div>
      )}

      {tab === "lineage" && (
        <div className="raising-sheet" role="dialog" aria-label="Lineage">
          <button type="button" className="raising-sheet-scrim" aria-label="Close lineage" onClick={() => setTab(null)} />
          <div className="raising-sheet-card">
            <header className="raising-sheet-head">
              <p>Lineage</p>
              <button type="button" className="raising-sheet-x" onClick={() => setTab(null)}>
                Close
              </button>
            </header>
            <LineageBody />
          </div>
        </div>
      )}

      {tab === "remix" && (
        <SubmitChangeSheet engine={null} px={lookX} pz={lookZ} onClose={() => setTab(null)} />
      )}

      {tab === "bot" && <GrokBotSignIn onClose={() => setTab(null)} onSession={onBotSession} />}
    </>
  );
}

function Year0Map({ lookX, lookZ }: { lookX: number; lookZ: number }) {
  const k = 1.85;
  const youX = 50 + Math.max(-36, Math.min(36, lookX * k));
  const youY = 50 + Math.max(-36, Math.min(36, lookZ * k));
  return (
    <svg className="raising-map" viewBox="0 0 100 100" aria-hidden>
      <polygon
        points="50,8 86,29 86,71 50,92 14,71 14,29"
        fill="#3d8a4a"
        stroke="#2a6234"
        strokeWidth="1.6"
      />
      <polygon points="50,22 72,35 72,61 50,74 28,61 28,35" fill="#34843c" />
      <circle cx="50" cy="50" r="18" fill="none" stroke="#c4a06a" strokeWidth="3.2" />
      <circle cx="50" cy="50" r="12" fill="#8a8498" stroke="#f0c24a" strokeWidth="1.4" />
      <polygon points="50,28 54,48 50,62 46,48" fill="#4ec8e8" />
      <polygon points="50,22 53.2,28 50,31 46.8,28" fill="#f0c24a" />
      <circle cx={youX} cy={youY} r="2.4" fill="#e8eef8" stroke="#081018" strokeWidth="0.7" />
    </svg>
  );
}

function LineageBody() {
  const names = loadNames();
  const remixes = loadChanges().slice(-8).reverse();
  return (
    <ul className="raising-line">
      <li>
        <span>Year 0</span>
        <em>The first raising. No city yet.</em>
      </li>
      <li>
        <span>Core Spire</span>
        <em>Crystal heart on a grass island.</em>
      </li>
      <li>
        <span>Parent star</span>
        <em>West light. The walk starts here.</em>
      </li>
      {remixes.map((r) => (
        <li key={r.id}>
          <span>{r.author}</span>
          <em>
            {r.status} · {r.wish.slice(0, 72)}
          </em>
        </li>
      ))}
      {names.map((n, i) => (
        <li key={`${n.at}-${i}`}>
          <span>{n.keeper}</span>
          <em>{n.text}</em>
        </li>
      ))}
      {remixes.length === 0 && names.length === 0 && (
        <li>
          <span>No names yet</span>
          <em>Remix to write the first line of the pack.</em>
        </li>
      )}
    </ul>
  );
}
