import { useState } from "react";
import { setLive } from "@/game/bolt-brain";
import {
  buildChange,
  grokBuildChangeBrief,
  loadChangePreview,
  loadChanges,
  markChangeLive,
  pushChangeRemote,
  refuseChange,
  setChangePreview,
  voteChange,
  type CityChange,
} from "@/game/city-change";

export function SubmitChangeSheet({
  engine,
  px,
  pz,
  onClose,
}: {
  engine: {
    previewVision?: (pieces: CityChange["pieces"]) => void;
    previewGraphic?: (graphic: CityChange["graphic"]) => void;
    applyBrainPack?: (pack: CityChange["pack"]) => void;
    acceptPieces?: (pieces: CityChange["pieces"], line: string) => void;
    clearVision?: () => void;
  } | null;
  px: number;
  pz: number;
  onClose: () => void;
}) {
  const [wish, setWish] = useState("");
  const [author, setAuthor] = useState("walker");
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [queue, setQueue] = useState(() => loadChanges());
  const [preview, setPrev] = useState(() => loadChangePreview());

  function applyPreview(row: CityChange) {
    setChangePreview(row);
    setPrev(row);
    if (row.pieces.length) engine?.previewVision?.(row.pieces);
    engine?.previewGraphic?.(row.graphic);
    if (row.pack) engine?.applyBrainPack?.(row.pack);
  }

  function clearPreview() {
    setChangePreview(null);
    setPrev(null);
    engine?.clearVision?.();
    engine?.applyBrainPack?.(null);
  }

  async function submit(source: CityChange["source"]) {
    setErr("");
    const made = buildChange(author, wish, source, { x: px, z: pz });
    if (!made.ok) {
      setErr(made.error);
      return;
    }
    await pushChangeRemote(made.row);
    setQueue(loadChanges());
    applyPreview(made.row);
  }

  async function copyBrief() {
    const text = grokBuildChangeBrief();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* samsung */
      }
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  }

  const pending = queue.filter((r) => r.status === "pending");

  return (
    <div className="inhabit-veil pointer-events-auto" role="dialog" aria-label="Submit a change">
      <div className="inhabit-sheet">
        <div className="inhabit-head">
          <p className="hud-slim-name">Submit a change</p>
          <button type="button" className="hud-slim-textbtn" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="inhabit-note">
          Any change — dens, light, law, Bolt brain, HUD. Iterate in <strong>Grok Build / SuperGrok</strong> (no Bot quota) or send once with <strong>Grok Bot</strong> <code>submit_change</code>. Preview first. Pack votes what goes live.
        </p>
        {preview ? (
          <p className="inhabit-note" style={{ color: "var(--color-accent)" }}>
            PREVIEW on · {preview.author}: {preview.wish.slice(0, 80)}
          </p>
        ) : null}

        <label className="inhabit-note" htmlFor="chg-author">
          Your name
        </label>
        <input
          id="chg-author"
          className="inhabit-input"
          maxLength={24}
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
        />
        <label className="inhabit-note" htmlFor="chg-wish">
          The change (paste Grok Build output, or write it)
        </label>
        <input
          id="chg-wish"
          className="inhabit-input"
          maxLength={800}
          placeholder="A canal of leftover Howl west of the plaza. Never chrome."
          value={wish}
          onChange={(e) => setWish(e.target.value)}
        />
        {err ? <p className="inhabit-note">{err}</p> : null}

        <div className="hud-slim-row inhabit-crew">
          <button type="button" className="hud-slim-textbtn inhabit-go" onClick={() => void copyBrief()}>
            {copied ? "Copied — paste in Grok Build" : "Copy Grok Build (no Bot quota)"}
          </button>
          <button type="button" className="hud-slim-textbtn inhabit-go" onClick={() => void submit("sheet")}>
            Submit + preview
          </button>
          {preview ? (
            <button type="button" className="hud-slim-textbtn" onClick={clearPreview}>
              End preview
            </button>
          ) : null}
        </div>

        <p className="hud-slim-name" style={{ marginTop: 16 }}>
          Waiting on the Pack
        </p>
        <p className="inhabit-note">Preview the city with the change. Vote Chat: go live. Then Put live.</p>
        <ul className="inhabit-list">
          {pending.length === 0 ? (
            <li className="inhabit-note">Nothing waiting. Submit one.</li>
          ) : (
            pending.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="inhabit-folk"
                  data-on={preview?.id === r.id ? "true" : undefined}
                  onClick={() => applyPreview(r)}
                >
                  {r.kind} · {r.author}
                  <span>
                    {r.wish} · {r.votes} vote{r.votes === 1 ? "" : "s"} · {r.source}
                  </span>
                </button>
                <div className="hud-slim-row inhabit-crew">
                  <button type="button" className="hud-slim-textbtn" onClick={() => applyPreview(r)}>
                    Preview
                  </button>
                  <button
                    type="button"
                    className="hud-slim-textbtn"
                    onClick={() => {
                      voteChange(r.id);
                      setQueue(loadChanges());
                    }}
                  >
                    Chat: go live
                  </button>
                  <button
                    type="button"
                    className="hud-slim-textbtn inhabit-go"
                    onClick={() => {
                      const live = markChangeLive(r.id);
                      if (!live) return;
                      if (live.pieces.length) engine?.acceptPieces?.(live.pieces, live.wish);
                      if (live.pack) setLive(live.pack);
                      engine?.applyBrainPack?.(live.pack);
                      engine?.clearVision?.();
                      setQueue(loadChanges());
                      setPrev(null);
                    }}
                  >
                    Put live
                  </button>
                  <button
                    type="button"
                    className="hud-slim-textbtn"
                    onClick={() => {
                      refuseChange(r.id);
                      setQueue(loadChanges());
                      if (preview?.id === r.id) clearPreview();
                    }}
                  >
                    Refuse
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
