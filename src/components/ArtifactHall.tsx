import { useEffect, useRef, useState } from "react";
import { ARTIFACTS, PODIUM_ORDER, artifactById, type Artifact, type ArtifactId } from "@/game/artifacts";

const PODIUM = PODIUM_ORDER.map((id) => artifactById(id)).filter((a): a is Artifact => !!a);
const MORE = ARTIFACTS.filter((a) => !a.podium);

type Props = {
  onLand: (id: ArtifactId) => void;
  onConstellation: () => void;
  onHome: () => void;
};

export function ArtifactHall({ onLand, onConstellation, onHome }: Props) {
  const heroRef = useRef<HTMLElement | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    heroRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, []);

  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(null), 2800);
    return () => window.clearTimeout(t);
  }, [note]);

  function tap(a: Artifact) {
    if (a.open) {
      onLand(a.id);
      return;
    }
    setNote(`${a.name} is sealed. Example world.`);
  }

  return (
    <section className="hall" aria-label="Hall of Artifacts">
      <header className="hall-head">
        <button type="button" className="hall-back" onClick={onHome}>
          Citadel
        </button>
        <p className="hall-kicker">Boltverse</p>
        <h1 className="hall-title">Hall of Artifacts</h1>
        <p className="hall-sub">Player worlds. Land one to raise.</p>
      </header>

      <div className="hall-stage">
        <div className="hall-ring" aria-hidden />
        <p className="hall-stage-label">Podium · Year 0</p>
        <div className="hall-podium" role="list">
          {PODIUM.map((a) => (
            <article
              key={a.id}
              ref={a.hero ? heroRef : undefined}
              role="listitem"
              className="hall-card"
              data-artifact={a.id}
              data-hero={a.hero ? "true" : undefined}
              data-open={a.open ? "true" : undefined}
            >
              <button type="button" className="hall-card-hit" onClick={() => tap(a)} aria-label={a.name}>
                <span className="hall-card-art">
                  <img src={a.cover} alt="" />
                  <span className="hall-ribbon">{a.ribbon}</span>
                  <span className="hall-badge" data-open={a.open ? "true" : undefined}>
                    {a.badge}
                  </span>
                  <span className="hall-res">Res {a.res}</span>
                </span>
                <span className="hall-card-name">{a.name}</span>
                <span className="hall-card-line">{a.line}</span>
                <span className="hall-card-maker">
                  <img src={a.face} alt="" />
                  <span>By {a.maker}</span>
                </span>
              </button>
              {a.open ? (
                <button type="button" className="hall-land" onClick={() => onLand(a.id)}>
                  Land
                </button>
              ) : (
                <p className="hall-sealed">Sealed</p>
              )}
            </article>
          ))}
        </div>
      </div>

      <div className="hall-more">
        <p className="hall-more-label">More worlds</p>
        <div className="hall-more-row" role="list">
          {MORE.map((a) => (
            <button
              key={a.id}
              type="button"
              role="listitem"
              className="hall-more-card"
              data-artifact={a.id}
              aria-label={`${a.name}, sealed`}
              onClick={() => tap(a)}
            >
              <img src={a.cover} alt="" />
              <span>
                <strong>{a.name}</strong>
                <em>By {a.maker}</em>
              </span>
              <b>Sealed</b>
            </button>
          ))}
        </div>
      </div>

      {note && (
        <p className="hall-note" role="status">
          {note}
        </p>
      )}

      <footer className="hall-foot">
        <div className="hall-index">
          <p>Hall of Artifacts</p>
          <span>Living index · {ARTIFACTS.length} worlds</span>
        </div>
        <div className="raising-toggle hall-toggle pointer-events-auto" role="tablist" aria-label="Hall view">
          <button type="button" role="tab" aria-selected="false" onClick={onHome}>
            Citadel
          </button>
          <button type="button" role="tab" aria-selected="false" onClick={onConstellation}>
            Stars
          </button>
        </div>
      </footer>
    </section>
  );
}
