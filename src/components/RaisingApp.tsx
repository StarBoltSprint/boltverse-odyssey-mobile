import { useEffect, useRef, useState } from "react";
import { ARTIFACTS, type ArtifactId } from "@/game/artifacts";
import type { RaisingHandle, RaisingHud } from "@/game/raising-engine";
import type { SkyHandle, SkyHud } from "@/game/constellation-engine";
import { fetchBotSession, type SessionPayload } from "@/game/bot-session";
import { ArtifactHall } from "./ArtifactHall";
import { CitadelHub } from "./CitadelHub";
import { RaisingDock } from "./RaisingDock";

const EMPTY: RaisingHud = { mode: "title", toast: null, lookX: 0, lookZ: 0 };
const SKY_EMPTY: SkyHud = { pick: null, toast: null, view: "constellation" };

type Place = "citadel" | "hall" | "sky" | "circuit";

export function RaisingApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<RaisingHandle | null>(null);
  const skyRef = useRef<SkyHandle | null>(null);
  const [place, setPlace] = useState<Place>("citadel");
  const [hud, setHud] = useState<RaisingHud>(EMPTY);
  const [skyHud, setSkyHud] = useState<SkyHud>(SKY_EMPTY);
  const [bootError, setBootError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [bot, setBot] = useState<SessionPayload>({ session: null, den: null, landables: [], bots: [], door_template_url: null });

  useEffect(() => {
    void fetchBotSession().then(setBot);
  }, []);

  useEffect(() => {
    if (place === "citadel" || place === "hall") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bag = window as unknown as {
      __LC_ENGINE?: { dispose: () => void };
      __LC_BOOTED?: boolean;
      __LC_LAND?: () => void;
      __RAISING?: boolean;
    };
    let disposed = false;
    if (bag.__LC_ENGINE) {
      try {
        bag.__LC_ENGINE.dispose();
      } catch {
        /* leftover */
      }
      bag.__LC_ENGINE = undefined;
      bag.__LC_BOOTED = false;
      bag.__RAISING = false;
    }
    engineRef.current = null;
    skyRef.current = null;

    if (place === "sky") {
      import("@/game/constellation-engine")
        .then(({ startSky }) => {
          if (disposed || !canvasRef.current) return;
          try {
            const handle = startSky(canvasRef.current, setSkyHud, () => setPlace("circuit"));
            skyRef.current = handle;
            bag.__LC_ENGINE = handle;
            bag.__LC_BOOTED = true;
            bag.__RAISING = true;
            setBootError(null);
          } catch (err) {
            setBootError(err instanceof Error ? err.message : "The sky failed to wake.");
          }
        })
        .catch((err) => {
          if (!disposed) setBootError(err instanceof Error ? err.message : "The sky failed to wake.");
        });
    } else {
      import("@/game/raising-engine")
        .then(({ startRaising }) => {
          if (disposed || !canvasRef.current) return;
          try {
            const handle = startRaising(canvasRef.current, setHud);
            engineRef.current = handle;
            bag.__LC_ENGINE = handle;
            bag.__LC_BOOTED = true;
            bag.__RAISING = true;
            bag.__LC_LAND = () => handle.land();
            setBootError(null);
            handle.land();
            handle.audio.setMuted(muted);
          } catch (err) {
            engineRef.current = null;
            setBootError(err instanceof Error ? err.message : "The raising failed to wake.");
          }
        })
        .catch((err) => {
          if (!disposed) setBootError(err instanceof Error ? err.message : "The raising failed to wake.");
        });
    }

    return () => {
      disposed = true;
      try {
        bag.__LC_ENGINE?.dispose();
      } catch {
        /* unmount */
      }
      bag.__LC_ENGINE = undefined;
    };
  }, [place]);

  const playing = place === "circuit" && hud.mode === "play";
  const paused = place === "circuit" && hud.mode === "pause";
  const onSky = place === "sky" && !bootError;
  const pick = skyHud.pick;

  function landFromHall(_id: ArtifactId) {
    setPlace("circuit");
  }

  return (
    <div className="circuit-root raising-root">
      {(place === "sky" || place === "circuit") && (
        <canvas
          ref={canvasRef}
          className="circuit-canvas z-0"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            display: "block",
            background: "#070918",
            touchAction: "none",
            pointerEvents: onSky || playing || paused ? "auto" : "none",
          }}
        />
      )}

      {place === "citadel" && !bootError && (
        <CitadelHub
          onHall={() => setPlace("hall")}
          onConstellation={() => setPlace("sky")}
          onLand={() => setPlace("circuit")}
        />
      )}

      {place === "hall" && !bootError && (
        <ArtifactHall
          onLand={landFromHall}
          onConstellation={() => setPlace("sky")}
          onHome={() => setPlace("citadel")}
        />
      )}

      {onSky && (
        <div className="pointer-events-none absolute inset-0 z-10 hud-safe flex flex-col">
          <header className="raising-head raising-head-hall">
            <p className="raising-kicker">Boltverse</p>
            <div className="raising-toggle hall-toggle pointer-events-auto" role="tablist" aria-label="Sky view">
              <button type="button" role="tab" aria-selected={false} onClick={() => setPlace("citadel")}>
                Citadel
              </button>
              <button type="button" role="tab" aria-selected="true" data-on="true">
                Stars
              </button>
            </div>
          </header>
          <div className="flex-1 relative min-h-0">
            {skyHud.toast && <p className="raising-toast">{skyHud.toast}</p>}
          </div>
          <div className="raising-sky-card pointer-events-auto">
            <div className="raising-relics" role="listbox" aria-label="Worlds">
              {ARTIFACTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="option"
                  aria-selected={pick?.id === a.id}
                  aria-label={a.name}
                  data-id={a.id}
                  data-on={pick?.id === a.id ? "true" : undefined}
                  data-open={a.open ? "true" : undefined}
                  className="raising-relic"
                  onClick={() => skyRef.current?.select(a.id)}
                >
                  <span className="raising-relic-dot" data-id={a.id} />
                </button>
              ))}
            </div>
            <p className="raising-sky-name">{pick?.name ?? "Constellation"}</p>
            <p className="raising-sky-line">{pick?.line ?? "Swipe the sky. Tap a star."}</p>
            {pick?.open ? (
              <button type="button" className="raising-play" onClick={() => setPlace("circuit")}>
                Land
              </button>
            ) : (
              <p className="raising-sky-wait">Sealed</p>
            )}
          </div>
        </div>
      )}

      {playing && (
        <div className="pointer-events-none absolute inset-0 z-10 hud-safe flex flex-col">
          <header className="raising-head">
            <button type="button" className="raising-mute pointer-events-auto" onClick={() => setPlace("citadel")}>
              Citadel
            </button>
            <p className="raising-title">Core Spire</p>
            <button
              type="button"
              className="raising-mute pointer-events-auto"
              aria-label={muted ? "Unmute" : "Mute"}
              onClick={() => {
                const next = !muted;
                setMuted(next);
                engineRef.current?.audio.setMuted(next);
              }}
            >
              {muted ? "Sound" : "Mute"}
            </button>
          </header>
          <div className="flex-1 relative min-h-0">
            {hud.toast && <p className="raising-toast">{hud.toast}</p>}
            {bot.session ? (
              <p className="hud-slim-duty">{bot.session.activity}</p>
            ) : null}
          </div>
        </div>
      )}

      {playing && <RaisingDock lookX={hud.lookX} lookZ={hud.lookZ} onBotSession={setBot} />}

      {bootError && (
        <div className="raising-gate">
          <div className="raising-gate-copy">
            <p className="raising-gate-kicker">Boltverse</p>
            <h1 className="raising-gate-title">The hall failed</h1>
            <p className="raising-gate-sub">{bootError}</p>
          </div>
          <div className="raising-gate-actions">
            <button type="button" className="raising-play" onClick={() => location.reload()}>
              Retry
            </button>
          </div>
        </div>
      )}

      {paused && (
        <div className="pause-veil">
          <div className="pause-sheet">
            <div className="panel w-[min(92%,22rem)] px-6 py-6">
              <h2 className="hud-title text-2xl">Paused</h2>
              <div className="mt-5 flex flex-col gap-2">
                <button
                  type="button"
                  className="hud-chip h-11 rounded-lg bg-fg text-bg font-medium"
                  onClick={() => engineRef.current?.setMode("play")}
                >
                  Resume
                </button>
                <button type="button" className="hud-chip h-11 rounded-lg" onClick={() => setPlace("citadel")}>
                  Citadel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
