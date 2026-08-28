import { useEffect, useRef, useState, type ReactNode } from "react";
import { Castle, Flame, Music, Music2, Star, Volume2 } from "lucide-react";
import { createCitadelTheme, type CitadelTheme } from "@/game/citadel-theme";
import { GrokBotSlit } from "./GrokBotSlit";
import { HowlSheet } from "./HowlSheet";
import { PackChip, PackSheet } from "./PackMark";

type Props = {
  onHall: () => void;
  onConstellation: () => void;
  onLand: () => void;
};

export function CitadelHub({ onHall, onConstellation, onLand }: Props) {
  const [howl, setHowl] = useState(false);
  const [packOpen, setPackOpen] = useState(false);
  const [forgeOpen, setForgeOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [reduce, setReduce] = useState(false);
  const [muted, setMuted] = useState(false);
  const themeRef = useRef<CitadelTheme | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const theme = createCitadelTheme();
    themeRef.current = theme;
    setMuted(theme.muted());
    return () => {
      theme.stop();
      theme.dispose();
      themeRef.current = null;
    };
  }, []);

  useEffect(() => {
    function wake(ev?: Event) {
      const t = themeRef.current;
      if (!t) return;
      t.unlock();
      const el = ev?.target as HTMLElement | null;
      if (el?.closest?.(".citadel-song")) return;
      if (!t.muted()) t.start();
    }
    window.addEventListener("pointerdown", wake, { capture: true });
    window.addEventListener("keydown", wake);
    const onVis = () => {
      if (document.visibilityState === "visible") wake();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pointerdown", wake, { capture: true });
      window.removeEventListener("keydown", wake);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(null), 2400);
    return () => window.clearTimeout(t);
  }, [note]);

  useEffect(() => {
    if (!howl) return;
    const t = window.setTimeout(() => setHowl(false), 1100);
    return () => window.clearTimeout(t);
  }, [howl]);

  function sendHowl() {
    setHowl(true);
    themeRef.current?.howl();
    setPackOpen(false);
    setForgeOpen(false);
    setNote("Howl sent. The citadel answers.");
  }

  function openForge() {
    setPackOpen(false);
    setForgeOpen(true);
  }

  function toggleSong() {
    const t = themeRef.current;
    if (!t) return;
    t.unlock();
    if (t.playing()) {
      t.setMuted(true);
      t.stop();
      setMuted(true);
      return;
    }
    t.setMuted(false);
    setMuted(false);
    t.start();
  }

  return (
    <section
      className="citadel"
      data-howl={howl ? "true" : undefined}
      data-song={muted ? undefined : "on"}
      aria-label="Thunderwolf Citadel"
    >
      <img className="citadel-art" src="/citadel/hub.jpg" alt="" hidden={live} />
      {!reduce && (
        <video
          className="citadel-art citadel-live"
          src="/citadel/hub.mp4"
          poster="/citadel/hub.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          onPlaying={() => setLive(true)}
        />
      )}
      <div className="citadel-aurora" aria-hidden />
      <div className="citadel-bloom" aria-hidden />
      <div className="citadel-veil" aria-hidden />
      <div className="citadel-sparks" aria-hidden>
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
      {howl && <div className="citadel-howl" aria-hidden />}

      <PackChip
        onOpen={() => {
          setForgeOpen(false);
          setPackOpen(true);
        }}
      />

      <div className="citadel-rail citadel-rail-l">
        <Door icon={<Castle strokeWidth={2.4} />} label="Hall" onClick={onHall} />
        <Door icon={<Volume2 strokeWidth={2.4} />} label="Howl" onClick={sendHowl} />
        <button
          type="button"
          className="citadel-song"
          aria-pressed={!muted}
          aria-label={muted ? "Play song" : "Mute song"}
          onClick={toggleSong}
        >
          {muted ? <Music2 strokeWidth={2.4} /> : <Music strokeWidth={2.4} />}
        </button>
      </div>
      <div className="citadel-rail citadel-rail-r">
        <Door icon={<Star strokeWidth={2.4} />} label="Stars" onClick={onConstellation} />
        <Door icon={<Flame strokeWidth={2.4} />} label="Forge" onClick={openForge} />
      </div>

      <footer className="citadel-foot">
        <button type="button" className="citadel-land" onClick={onLand}>
          Land
        </button>
        {/* GROK_BOT_SLIT — live pane under LAND. Not a modal. */}
        <GrokBotSlit />
      </footer>

      {note && (
        <p className="citadel-note" role="status">
          {note}
        </p>
      )}

      {packOpen && <PackSheet onClose={() => setPackOpen(false)} />}

      {forgeOpen && (
        <HowlSheet
          onClose={() => setForgeOpen(false)}
          onLand={() => {
            setForgeOpen(false);
            onLand();
          }}
        />
      )}
    </section>
  );
}

function Door({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="citadel-door" onClick={onClick} aria-label={label}>
      <span className="citadel-door-ico">{icon}</span>
      <span className="citadel-door-lab">{label}</span>
    </button>
  );
}
