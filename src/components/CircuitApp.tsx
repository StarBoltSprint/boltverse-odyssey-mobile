import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Bug,
  Eye,
  Gem,
  Menu,
  MessageCircle,
  Pause,
  Play,
  Scale,
  ScrollText,
  Volume2,
  VolumeX,
  Zap,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";
import type { EngineHandle, HudSnap } from "@/game/engine";
import { briefCircuit } from "@/game/ask-agent";
import { LogSheet, type LogTab } from "./LogSheet";
import { TradingSheet } from "./TradingSheet";
import { DISTRICTS } from "@/game/lore";
import { civicForZone, civicBrief, enactCivic, howlVerb } from "@/game/civic";
import { FOLK_SKILLS, CREW_PICK, canBirthToday, loadFolkBook, interpretGrow, type FolkPost } from "@/game/inhabit";
import { loreCheck, visionKind, graphicPreview } from "@/game/lore-gate";
import { CircuitLive } from "./CircuitLive";
import { fetchVisions, proposeVision, decideVision, type Vision } from "@/game/visions";
import { buzz } from "@/game/haptics";
import { loadChain, needleDeg, talkWitness } from "@/game/play";
import { bindAgentHandle, installWebMcp } from "@/game/webmcp";
import { fetchBotSession, type SessionPayload } from "@/game/bot-session";
import { GrokBotSignIn } from "./GrokBotSignIn";
import { BotRelay } from "./BotRelay";
import { BrainSheet } from "./BrainSheet";
import { SubmitChangeSheet } from "./SubmitChangeSheet";
import { loadPreview } from "@/game/bolt-brain";
import { loadChangePreview } from "@/game/city-change";

const EMPTY: HudSnap = {
  zone: null,
  zoneTag: null,
  resonance: 12,
  howls: 0,
  nearby: null,
  howlProgress: 0,
  atHub: false,
  toast: null,
  heading: 0,
  visited: [],
  talked: 0,
  talkTotal: 8,
  builds: [],
  structures: 0,
  lastCode: "",
  log: [],
  living: [],
  folk: { total: 0, walking: 0, building: 0, idle: 0 },
  px: 9,
  pz: 16,
  crystal: [],
  people: [],
  stock: { charge: 18, crystal: 6, scripture: 0, rate: 3, bids: 0, line: "" },
  live: [],
  crew: null,
  kilns: [],
  reading: null,
  mode: "title",
  eye: "city",
  eyeKeeper: "veyra",
  debug: { fps: 0, bug: "", citizens: 0, building: 0, structures: 0 },
  away: null,
};

function Joystick({ label, onChange }: { label: string; onChange: (x: number, y: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const pid = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const release = useCallback(() => {
    pid.current = null;
    setKnob({ x: 0, y: 0 });
    onChange(0, 0);
  }, [onChange]);
  const moveTo = useCallback(
    (clientX: number, clientY: number) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = (clientX - (r.left + r.width / 2)) / (r.width / 2);
      const y = (clientY - (r.top + r.height / 2)) / (r.height / 2);
      const m = Math.hypot(x, y);
      const nx = m > 1 ? x / m : x;
      const ny = m > 1 ? y / m : y;
      setKnob({ x: nx, y: ny });
      onChange(nx, -ny);
    },
    [onChange],
  );
  return (
    <div
      ref={ref}
      className="stick-base pointer-events-auto"
      aria-label={label}
      onPointerDown={(e) => {
        pid.current = e.pointerId;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        moveTo(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (pid.current !== e.pointerId) return;
        moveTo(e.clientX, e.clientY);
      }}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div className="stick-knob" style={{ transform: `translate(calc(-50% + ${knob.x * 28}px), calc(-50% + ${knob.y * 28}px))` }} />
    </div>
  );
}

function ResourceChip({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: number; tone: "charge" | "crystal" | "resonance" | "scripture" }) {
  return (
    <div className={`res-chip res-${tone}`}>
      <Icon className="res-icon" strokeWidth={2.25} aria-hidden />
      <div className="res-copy">
        <span className="res-label">{label}</span>
        <span className="res-value">{Math.round(value)}</span>
      </div>
    </div>
  );
}

export function CircuitApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<EngineHandle | null>(null);
  const [hud, setHud] = useState<HudSnap>(EMPTY);
  const [booted, setBooted] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootGen, setBootGen] = useState(0);
  const pendingLand = useRef(false);
  const [wantLand, setWantLand] = useState(false);
  const [muted, setMuted] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logTab, setLogTab] = useState<LogTab>("now");
  const [agentId, setAgentId] = useState<string | null>(null);
  const [playerKey, setPlayerKey] = useState("");
  const [cityMind, setCityMind] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [awayOpen, setAwayOpen] = useState(true);
  const [joinOpen, setJoinOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [botOpen, setBotOpen] = useState(false);
  const [bot, setBot] = useState<SessionPayload>({ session: null, den: null, landables: [], bots: [], door_template_url: null });
  const [brainOpen, setBrainOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [inhabitOpen, setInhabitOpen] = useState(false);
  const [folkName, setFolkName] = useState("");
  const [folkCrew, setFolkCrew] = useState("veyra");
  const [folkPick, setFolkPick] = useState<string | null>(null);
  const [folkWish, setFolkWish] = useState("");
  const [briefCopied, setBriefCopied] = useState(false);
  const [liveLine, setLiveLine] = useState("Solo land");
  const [visionsOpen, setVisionsOpen] = useState(false);
  const [visions, setVisions] = useState<Vision[]>([]);
  const [visionPick, setVisionPick] = useState<string | null>(null);
  const [visionNote, setVisionNote] = useState("");
  const [folkBook, setFolkBook] = useState<FolkPost[]>([]);
  const zoomHold = useRef<number | null>(null);
  const holdZoom = (dir: number) => {
    engineRef.current?.zoomBy(dir);
    if (zoomHold.current) window.clearInterval(zoomHold.current);
    zoomHold.current = window.setInterval(() => engineRef.current?.zoomBy(dir), 70);
  };
  const endZoom = () => {
    if (zoomHold.current) {
      window.clearInterval(zoomHold.current);
      zoomHold.current = null;
    }
  };

  useEffect(() => {
    try {
      (window as unknown as { __LC_HYDRATED?: boolean }).__LC_HYDRATED = true;
      const retry = document.getElementById("lc-retry");
      if (retry) retry.remove();
      const stored = loadPlayerKey();
      if (stored) setPlayerKey(stored);
      if (/[?&]land=/.test(window.location.search)) {
        pendingLand.current = true;
        setWantLand(true);
      }
    } catch {
      /* samsung */
    }
    void fetchBotSession().then(setBot);
  }, []);

  useEffect(() => {
    engineRef.current?.setGrokLayer(cityMind && keyLooksValid(playerKey));
  }, [cityMind, playerKey, booted]);

  useEffect(() => {
    if (!cityMind || !keyLooksValid(playerKey) || hud.mode !== "play") return;
    let dead = false;
    let inflight = false;
    const fire = async () => {
      const eng = engineRef.current;
      if (!eng || inflight || dead) return;
      inflight = true;
      try {
        const snap = eng.mindSnap();
        const brief = await briefCircuit({ data: { ...snap, playerKey: playerKey.trim() } });
        if (!dead && brief.ok) eng.applyGrokMind(brief.line, brief.orders);
      } catch {
        /* local */
      } finally {
        inflight = false;
      }
    };
    const first = window.setTimeout(fire, 8000);
    const t = window.setInterval(fire, 90_000);
    return () => {
      dead = true;
      window.clearTimeout(first);
      window.clearInterval(t);
    };
  }, [cityMind, playerKey, hud.mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bag = window as unknown as {
      __LC_ENGINE?: EngineHandle;
      __LC_BOOTED?: boolean;
      __LC_LAND?: () => void;
    };
    let disposed = false;
    const adopt = (handle: EngineHandle) => {
      engineRef.current = handle;
      bag.__LC_ENGINE = handle;
      bag.__LC_BOOTED = true;
      setBootError(null);
      setBooted(true);
      try {
        const boot = document.getElementById("lc-static-boot");
        if (boot) boot.style.display = "none";
      } catch {
        /* samsung */
      }
      pendingLand.current = true;
      try { handle.land(); } catch { /* samsung */ }
    };
    if (bag.__LC_ENGINE) {
      adopt(bag.__LC_ENGINE);
      return;
    }
    const start = () => {
      if (disposed) return;
      if (bag.__LC_ENGINE) {
        adopt(bag.__LC_ENGINE);
        return;
      }
      import("@/game/engine")
        .then(({ startEngine }) => {
          if (disposed || !canvasRef.current) return;
          if (bag.__LC_ENGINE) {
            adopt(bag.__LC_ENGINE);
            return;
          }
          try {
            adopt(startEngine(canvasRef.current, setHud));
          } catch (err) {
            engineRef.current = null;
            setBooted(false);
            setBootError(err instanceof Error ? err.message : "City failed to wake.");
          }
        })
        .catch((err) => {
          if (!disposed) {
            setBooted(false);
            setBootError(err instanceof Error ? err.message : "City failed to wake.");
          }
        });
    };
    const id = window.setTimeout(start, 30);
    const watchdog = window.setTimeout(() => {
      if (!disposed && !bag.__LC_ENGINE) {
        setBootError("The Core Spire is slow to wake. Tap to retry.");
      }
    }, 8000);
    return () => {
      disposed = true;
      window.clearTimeout(id);
      window.clearTimeout(watchdog);
    };
  }, [bootGen]);

  const onMove = useCallback((x: number, y: number) => engineRef.current?.input.setMoveStick(x, y), []);
  const onLook = useCallback((x: number, y: number) => engineRef.current?.input.setLookStick(x, y), []);
  const playing = hud.mode === "play";
  const paused = hud.mode === "pause";
  const inCity = playing || paused;
  const title = !!bootError || !inCity;

  useEffect(() => {
    if (!booted || inCity) return;
    pendingLand.current = true;
    setWantLand(true);
    try { engineRef.current?.land(); } catch { /* samsung */ }
  }, [booted, inCity]);

  const landNow = useCallback(() => {
    try {
      if (bootError) {
        pendingLand.current = true;
        setWantLand(true);
        setBooted(false);
        setBootError(null);
        setBootGen((n) => n + 1);
        return;
      }
      setWantLand(true);
      pendingLand.current = true;
      engineRef.current?.land();
    } catch {
      pendingLand.current = true;
      setWantLand(true);
    }
  }, [bootError]);

  useEffect(() => {
    try {
      (window as unknown as { __LC_LAND?: () => void }).__LC_LAND = landNow;
    } catch {
      /* samsung */
    }
    return () => {
      try {
        delete (window as unknown as { __LC_LAND?: () => void }).__LC_LAND;
      } catch {
        /* samsung */
      }
    };
  }, [landNow]);

  useEffect(() => {
    void installWebMcp();
    bindAgentHandle({
      land: () => landNow(),
      talk: () => {
        const eng = engineRef.current;
        if (!eng) return;
        eng.input.setTalkHeld(true);
        window.setTimeout(() => eng.input.setTalkHeld(false), 80);
      },
      howl: (held) => engineRef.current?.input.setHowl(held),
      openMap: () => {
        /* Map is removed — Core Spire only. */
      },
      hud: () => ({
        mode: hud.mode,
        zone: hud.zone,
        toast: hud.toast,
        nearby: hud.nearby,
        stock: hud.stock,
      }),
    });
    return () => bindAgentHandle(null);
  }, [landNow, hud]);

  useEffect(() => {
    if (!wantLand || bootError || inCity) return;
    try {
      engineRef.current?.land();
    } catch {
      /* samsung — overlay stays until play */
    }
  }, [wantLand, booted, hud.mode, bootError, inCity]);

  useEffect(() => {
    if (!title) return;
    const tap = () => landNow();
    const key = (e: KeyboardEvent) => {
      if (e.code === "Enter" || e.code === "Space") {
        e.preventDefault();
        landNow();
      }
    };
    window.addEventListener("pointerup", tap);
    window.addEventListener("pointerdown", tap);
    window.addEventListener("touchend", tap, { passive: true });
    window.addEventListener("keyup", key);
    return () => {
      window.removeEventListener("pointerup", tap);
      window.removeEventListener("pointerdown", tap);
      window.removeEventListener("touchend", tap);
      window.removeEventListener("keyup", key);
    };
  }, [title, landNow]);

  function askDuty(keeper: string) {
    const eng = engineRef.current;
    if (!eng) return;
    const den = DISTRICTS.find((d) => d.keeper === keeper);
    const x = den?.x ?? hud.px;
    const z = den?.z ?? hud.pz;
    const job = enactCivic(keeper, x, z);
    if (!job.pieces.length) return;
    eng.grow(keeper, job.pieces, job.line, job.code);
    try { eng.audio.grow(); } catch { /* samsung */ }
    buzz("grow");
  }

  const zoneAsk = civicForZone(hud.zone);
  const brief = civicBrief(hud.stock ?? { charge: 0, crystal: 0, scripture: 0, bids: 0 }, hud.zone);
  const need = (brief.line.split(".")[0] || brief.line).trim();
  const walkLine = brief.here ? "Hold Howl, release on gold" : `Walk ${brief.walk}`;
  const stood = Math.max(0, Math.floor(Number((hud as { stood?: number }).stood) || 0));
  const howlP = hud.howlProgress || 0;
  const howlSweet = howlP >= 0.92 && howlP <= 1.18;
  const howlOver = howlP > 1.18;
  const den = DISTRICTS.find((d) => d.id === brief.zoneId);
  const dutyDeg = needleDeg(hud.px, hud.pz, den?.x ?? 0, den?.z ?? 0, hud.heading);
  const dutyNear = Boolean(brief.here) || Math.abs(dutyDeg) < 18;
  const witnessed = Boolean((hud as { witness?: boolean }).witness) || talkWitness(hud.nearby?.id ?? null, brief.keeper);
  const still = (hud as { still?: boolean }).still;
  const standStill = Boolean(brief.here && howlP > 0.04 && !still);
  const talkFirst = Boolean(brief.here && hud.nearby?.id === brief.keeper && !witnessed);
  const howlThis = brief.here && walkLine && hud.reading?.title ? `Howl this ${hud.reading.title}` : null;
  const hintLines: string[] = [];
  if (standStill) hintLines.push("Stand still");
  if (talkFirst) hintLines.push("Talk, then Howl — they will know you.");
  if (howlThis && hintLines.length < 2) hintLines.push(howlThis);
  const onChain = brief.keeper === "seln" || brief.keeper === "orren" || brief.keeper === "voss";
  if (!brief.here && onChain && hintLines.length < 2) {
    const need = ["seln", "orren", "voss"] as const;
    let i = 0;
    for (const s of loadChain()) {
      if (i < need.length && s === need[i]) i += 1;
    }
    const chainHint = i < 1 ? "Sit: Tend → Kiln → Join" : i < 2 ? "Next: Kiln" : i < 3 ? "Next: Join" : "";
    if (chainHint) hintLines.push(chainHint);
  }

  return (
    <div className="circuit-root" style={{ position: "relative", width: "100%", height: "100dvh", background: "#070910" }}>
      <canvas
        ref={canvasRef}
        className="circuit-canvas z-0"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", background: "#020308", touchAction: "none", pointerEvents: title ? "none" : "auto" }}
      />

      <div className="pointer-events-none absolute inset-0 z-10 hud-safe flex flex-col">
        {!title && (
          <header className="hud-slim pointer-events-auto">
            <p className="hud-slim-stats">
              {Math.round(hud.stock?.charge ?? 0)}c
              <span className="hud-slim-dot">·</span>
              {Math.round(hud.stock?.crystal ?? 0)}x
              <span className="hud-slim-dot">·</span>
              <span className="hud-slim-live">{liveLine}</span>
            </p>
            <p className="hud-slim-zone">{hud.zone ?? "Circuit"}</p>
            {playing ? (
              <button
                type="button"
                className="hud-slim-textbtn"
                aria-label="Submit a change"
                onClick={() => { setMoreOpen(false); setSubmitOpen(true); }}
              >
                Submit
              </button>
            ) : null}
            <button
              type="button"
              className="hud-slim-more"
              aria-label="Menu"
              aria-expanded={moreOpen}
              onClick={() => { setMoreOpen((v) => !v); setLogOpen(false); setJoinOpen(false); }}
            >
              <Menu className="size-4" />
            </button>
          </header>
        )}

        {moreOpen && !title && (
          <div className="hud-more pointer-events-auto">
            <button type="button" className="hud-more-item" onClick={() => { setMoreOpen(false); setSubmitOpen(true); }}>Submit a change</button>
            <button type="button" className="hud-more-item" onClick={() => { setMoreOpen(false); setInhabitOpen(true); setFolkBook(engineRef.current?.folkBook() ?? loadFolkBook()); }}>Inhabit</button>
            <button type="button" className="hud-more-item" onClick={async () => {
              setMoreOpen(false);
              setVisionsOpen(true);
              setVisions(await fetchVisions());
            }}>Visions</button>
            <button type="button" className="hud-more-item" onClick={() => { setMoreOpen(false); setJoinOpen(false); setLogOpen(true); }}>Log</button>
            <button type="button" className="hud-more-item" onClick={() => { setMoreOpen(false); setLogOpen(false); setJoinOpen(true); }}>Join</button>
            <button type="button" className="hud-more-item" onClick={() => { const next = !muted; setMuted(next); engineRef.current?.audio.setMuted(next); }}>{muted ? "Sound" : "Mute"}</button>
            <button type="button" className="hud-more-item" onClick={() => engineRef.current?.setMode(playing ? "pause" : "play")}>{paused ? "Resume" : "Pause"}</button>
            <button type="button" className="hud-more-item" onClick={() => { setMoreOpen(false); setBotOpen(true); }}>Connect Grok Bot</button>
            <button type="button" className="hud-more-item" onClick={() => { setMoreOpen(false); setBrainOpen(true); }}>Bolt Brain</button>
          </div>
        )}

        {playing && !logOpen && !joinOpen && !moreOpen && !hud.toast && (
          <p className="hud-slim-duty">
            {bot.session?.activity
              || (loadChangePreview()
                ? `PREVIEW · ${loadChangePreview()?.author}: ${loadChangePreview()?.wish.slice(0, 48)}`
                : loadPreview()
                  ? `PREVIEW · ${loadPreview()?.author}'s Bolt brain · not live`
                  : walkLine)}
          </p>
        )}

        <div className="flex-1 relative pointer-events-none min-h-0">
          {hud.toast && !title && (
            <p className="hud-slim-toast">{hud.toast}</p>
          )}
          {playing && awayOpen && hud.away && !logOpen && !joinOpen && !moreOpen && (
            <div className="hud-slim-card">
              <p>{hud.away}</p>
              <button type="button" className="hud-slim-textbtn" onClick={() => setAwayOpen(false)}>Heard</button>
            </div>
          )}
          {hud.nearby && playing && !logOpen && !joinOpen && !moreOpen && (
            <div className="hud-slim-card">
              <p className="hud-slim-name">{hud.nearby.name.split(" ")[0]}</p>
              <div className="hud-slim-row">
                <button
                  type="button"
                  className="hud-slim-textbtn"
                  onPointerDown={(e) => { e.preventDefault(); engineRef.current?.input.setTalkHeld(true); }}
                  onPointerUp={() => engineRef.current?.input.setTalkHeld(false)}
                  onPointerCancel={() => engineRef.current?.input.setTalkHeld(false)}
                >
                  Talk
                </button>
                <button type="button" className="hud-slim-textbtn" onClick={() => engineRef.current?.bindEye(hud.nearby!.id)}>
                  Eye
                </button>
              </div>
            </div>
          )}
        </div>

        {playing && !logOpen && !joinOpen && !moreOpen && !inhabitOpen && (
          <footer className="hud-dock hud-dock-slim pointer-events-none">
            <Joystick label="Move" onChange={onMove} />
            <div className="hud-dock-core pointer-events-auto">
              <button
                type="button"
                className="action-talk hud-eye hud-eye-quiet"
                data-eye={hud.eye ?? "city"}
                aria-label={hud.eye === "keeper" ? "City eye" : "Keeper eye"}
                onClick={() => engineRef.current?.toggleEye()}
              >
                <Eye className="size-4" />
              </button>
              <button
                type="button"
                className="action-howl"
                data-held={howlP > 0.04 ? "true" : undefined}
                data-sweet={howlSweet ? "true" : undefined}
                aria-label={howlVerb(zoneAsk?.keeper ?? null)}
                onPointerDown={(e) => { e.preventDefault(); engineRef.current?.input.setHowl(true); }}
                onPointerUp={() => engineRef.current?.input.setHowl(false)}
                onPointerCancel={() => engineRef.current?.input.setHowl(false)}
              >
                {howlVerb(zoneAsk?.keeper ?? null)}
                <span
                  className="howl-meter"
                  data-sweet={howlSweet ? "true" : undefined}
                  data-over={howlOver ? "true" : undefined}
                  aria-hidden
                >
                  <span style={{ width: `${howlP <= 0.01 ? 0 : Math.min(100, Math.max(4, Math.round(howlP * 100)))}%` }} />
                </span>
              </button>
            </div>
            <Joystick label="Look" onChange={onLook} />
          </footer>
        )}
      </div>

      {playing && <CircuitLive engine={engineRef.current} onHud={setLiveLine} />}
      {playing && <BotRelay engine={engineRef.current} hud={hud} />}

      {bootError && (
        <button
          type="button"
          aria-label="Retry land"
          className="title-land"
          onPointerDown={(e) => {
            if (e.button !== 0 && e.pointerType === "mouse") return;
            landNow();
          }}
          onClick={landNow}
        >
          <span className="title-kicker">Luminous Circuit</span>
          <span className="title-hero">Tap to retry</span>
          <span className="title-sub">{bootError}</span>
          <span
            className="grok-bot-btn"
            role="button"
            onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); setBotOpen(true); }}
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setBotOpen(true); }}
          >
            Connect Grok Bot
          </span>
        </button>
      )}

      {paused && (
        <div className="pause-veil">
          <div className="pause-sheet">
            <div className="panel w-[min(92%,24rem)] px-6 py-6">
              <h2 className="hud-title text-2xl">Paused</h2>
              <p className="mt-1 text-sm text-muted">Walkers freeze. Pause is sacred.</p>
              <div className="mt-5 flex flex-col gap-2">
                <button type="button" className="hud-chip h-11 rounded-lg bg-fg text-bg font-medium" onClick={() => engineRef.current?.setMode("play")}>Resume</button>
                <button type="button" className="hud-chip pause-reland h-11 rounded-lg border border-border text-fg" onClick={() => { engineRef.current?.reset(); engineRef.current?.setMode("play"); }}>Reland at plaza</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {logOpen && !title && (
        <LogSheet
          hud={hud}
          tab={logTab}
          onTab={setLogTab}
          selectedId={agentId}
          onSelect={setAgentId}
          onClose={() => setLogOpen(false)}
          playerKey={playerKey}
          onPlayerKey={setPlayerKey}
          cityMind={cityMind}
          onCityMind={setCityMind}
          onGrow={(id, pieces, line, code) => engineRef.current?.grow(id, pieces, line, code)}
          onSpeak={(id, line) => engineRef.current?.speak(id, line)}
        />
      )}
      {joinOpen && !title && (
        <TradingSheet hud={hud} onClose={() => setJoinOpen(false)} onDuty={() => askDuty("voss")} />
      )}
      {inhabitOpen && !title && (
        <div className="inhabit-veil pointer-events-auto">
          <div className="inhabit-sheet">
            <div className="inhabit-head">
              <p className="hud-slim-name">Inhabit</p>
              <button type="button" className="hud-slim-textbtn" onClick={() => setInhabitOpen(false)}>Close</button>
            </div>
            <p className="inhabit-note">
              {canBirthToday() ? "One new inhabitant today. On the live land they stand for everyone. Then dawn." : "Today’s post is already stood. Dawn opens the next."}
            </p>
            {canBirthToday() && (
              <div className="inhabit-birth">
                <input
                  className="inhabit-input"
                  maxLength={24}
                  placeholder="Name"
                  value={folkName}
                  onChange={(e) => setFolkName(e.target.value)}
                />
                <div className="hud-slim-row inhabit-crew">
                  {CREW_PICK.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="hud-slim-textbtn"
                      data-on={folkCrew === c.id ? "true" : undefined}
                      onClick={() => setFolkCrew(c.id)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="hud-slim-textbtn inhabit-go"
                  onClick={() => {
                    const r = engineRef.current?.birthFolk(folkName, folkCrew);
                    setFolkBook(engineRef.current?.folkBook() ?? loadFolkBook());
                    if (r?.id) setFolkPick(r.id);
                    setFolkName("");
                  }}
                >
                  Stand them
                </button>
              </div>
            )}
            <ul className="inhabit-list">
              {folkBook.map((p) => (
                <li key={p.id}>
                  <button type="button" className="inhabit-folk" data-on={folkPick === p.id ? "true" : undefined} onClick={() => setFolkPick(p.id)}>
                    {p.name}
                    <span>{p.wish ? p.wish : p.skill ?? "no skill"}{p.plugged ? " · iterating" : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
            {folkPick && (
              <div className="inhabit-teach">
                <p className="inhabit-note">Skill — craft they will walk</p>
                <div className="hud-slim-row inhabit-crew">
                  {FOLK_SKILLS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="hud-slim-textbtn"
                      onClick={() => {
                        engineRef.current?.teachFolk(folkPick, s.id);
                        setFolkBook(engineRef.current?.folkBook() ?? loadFolkBook());
                      }}
                    >
                      {s.id}
                    </button>
                  ))}
                </div>
                <p className="inhabit-note">Iterate a craft they walk now. Submit merge: any lore-respecting change (crystal, light, law). Ghost/tint preview — live land unchanged until you Accept or merge the PR.</p>
                <input
                  className="inhabit-input"
                  maxLength={800}
                  placeholder="Craft, place, light, or a new law…"
                  value={folkWish}
                  onChange={(e) => setFolkWish(e.target.value)}
                />
                <button
                  type="button"
                  className="hud-slim-textbtn inhabit-go"
                  onClick={() => {
                    const wish = folkWish.trim();
                    if (!wish) return;
                    engineRef.current?.iterateFolk(folkPick, wish);
                    engineRef.current?.growFromWish(wish, "self");
                    setFolkBook(engineRef.current?.folkBook() ?? loadFolkBook());
                    setFolkWish("");
                  }}
                >
                  Iterate
                </button>
                <button
                  type="button"
                  className="hud-slim-textbtn inhabit-go"
                  onClick={async () => {
                    const wish = folkWish.trim();
                    const text = engineRef.current?.iterateBrief(folkPick, wish || undefined) ?? "";
                    if (!text) return;
                    try {
                      await navigator.clipboard.writeText(text);
                    } catch {
                      const ta = document.createElement("textarea");
                      ta.value = text;
                      document.body.appendChild(ta);
                      ta.select();
                      try { document.execCommand("copy"); } catch { /* samsung */ }
                      ta.remove();
                    }
                    setBriefCopied(true);
                    window.setTimeout(() => setBriefCopied(false), 2200);
                  }}
                >
                  {briefCopied ? "Copied — paste in Grok Build" : "Copy Grok Build"}
                </button>
                <button
                  type="button"
                  className="hud-slim-textbtn inhabit-go"
                  onClick={async () => {
                    const wish = folkWish.trim();
                    if (!wish) return;
                    const gate = loreCheck(wish);
                    if (!gate.ok) {
                      setVisionNote(gate.reason);
                      return;
                    }
                    const kind = visionKind(wish);
                    const grown = interpretGrow(wish, hud.px, hud.pz);
                    const pieces = grown?.pieces ?? [];
                    const graphic = kind === "graphic" ? graphicPreview(wish) : null;
                    if (pieces.length) engineRef.current?.previewVision(pieces);
                    engineRef.current?.previewGraphic(graphic);
                    let author = "walker";
                    try {
                      author = localStorage.getItem("lc-vision-author") || `w-${Math.random().toString(36).slice(2, 8)}`;
                      localStorage.setItem("lc-vision-author", author);
                    } catch { /* samsung */ }
                    const sent = await proposeVision({
                      author,
                      wish,
                      line: grown?.line || wish.slice(0, 180),
                      pieces,
                      kind,
                      graphic,
                    });
                    setVisionNote(
                      sent.error
                        ? sent.error
                        : sent.pr
                          ? "Draft PR opened. Preview is on. Live land untouched. You merge — or not."
                          : sent.ok
                            ? "Preview is on. GitHub PR could not open — Visions still holds it."
                            : "Could not submit the vision.",
                    );
                    if (sent.pr) {
                      try { window.open(sent.pr, "_blank", "noopener"); } catch { /* samsung */ }
                    }
                    setFolkWish("");
                  }}
                >
                  Submit merge to GitHub
                </button>
                {visionNote ? <p className="inhabit-note">{visionNote}</p> : null}
              </div>
            )}
          </div>
        </div>
      )}
      {visionsOpen && !title && (
        <div className="inhabit-veil pointer-events-auto">
          <div className="inhabit-sheet">
            <div className="inhabit-head">
              <p className="hud-slim-name">Visions</p>
              <button type="button" className="hud-slim-textbtn" onClick={() => { setVisionsOpen(false); engineRef.current?.clearVision(); }}>Close</button>
            </div>
            <p className="inhabit-note">Each request has a preview. Crystal = ghost. Light = tint. Law = the PR. None of it is live until you Accept or merge.</p>
            <ul className="inhabit-list">
              {visions.length === 0 ? <li className="inhabit-note">No pending visions.</li> : visions.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    className="inhabit-folk"
                    data-on={visionPick === v.id ? "true" : undefined}
                    onClick={() => {
                      setVisionPick(v.id);
                      engineRef.current?.clearVision();
                      if (v.pieces.length) engineRef.current?.previewVision(v.pieces);
                      engineRef.current?.previewGraphic(v.graphic ?? null);
                    }}
                  >
                    {v.wish}
                    <span>{v.kind || "law"} · {v.author}{v.pr_url ? " · GitHub PR" : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
            {visionPick && (
              <div className="hud-slim-row inhabit-crew">
                {visions.find((x) => x.id === visionPick)?.pr_url && (
                  <a
                    className="hud-slim-textbtn inhabit-go"
                    href={visions.find((x) => x.id === visionPick)?.pr_url || "#"}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open GitHub PR
                  </a>
                )}
                {(liveLine.startsWith("Live host") || liveLine.startsWith("Solo")) && (
                  <>
                    <button
                      type="button"
                      className="hud-slim-textbtn inhabit-go"
                      onClick={async () => {
                        const v = visions.find((x) => x.id === visionPick);
                        if (!v) return;
                        engineRef.current?.acceptPieces(v.pieces, v.line);
                        await decideVision(v.id, "accept");
                        setVisions(await fetchVisions());
                        setVisionPick(null);
                      }}
                    >
                      Accept into live land
                    </button>
                    <button
                      type="button"
                      className="hud-slim-textbtn inhabit-go"
                      onClick={async () => {
                        await decideVision(visionPick, "refuse");
                        engineRef.current?.clearVision();
                        setVisions(await fetchVisions());
                        setVisionPick(null);
                      }}
                    >
                      Refuse
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {botOpen && <GrokBotSignIn onClose={() => setBotOpen(false)} onSession={setBot} />}
      {brainOpen && <BrainSheet engine={engineRef.current} onClose={() => setBrainOpen(false)} />}
      {submitOpen && (
        <SubmitChangeSheet
          engine={engineRef.current}
          px={hud.px ?? 0}
          pz={hud.pz ?? 78}
          onClose={() => setSubmitOpen(false)}
        />
      )}
      {debugOpen && !title && <DebugSheet hud={hud} onClose={() => setDebugOpen(false)} />}
    </div>
  );
}

function DebugSheet({ hud, onClose }: { hud: HudSnap; onClose: () => void }) {
  const d = hud.debug ?? { fps: 0, bug: "", citizens: 0, building: 0, structures: 0 };
  return (
    <div className="debug-sheet absolute inset-0 z-50 flex flex-col bg-bg/95 hud-safe">
      <header className="pointer-events-auto flex items-center justify-between px-4">
        <h3 className="hud-title text-lg">City health</h3>
        <button type="button" className="debug-close hud-chip min-h-11 px-3" onClick={onClose}>Close</button>
      </header>
      <div className="pointer-events-auto px-4 text-sm">
        <p className={d.bug ? "text-danger" : "text-accent"}>{d.bug || "No crash. Loop is holding."}</p>
        <p className="mt-2 text-muted">FPS {d.fps} · {d.citizens} inhabitants · {d.building} growing · {d.structures} standing</p>
      </div>
    </div>
  );
}

const KEY_STORE = "lc-player-xai";
function loadPlayerKey() {
  try { return String(localStorage.getItem(KEY_STORE) ?? ""); } catch { return ""; }
}
function keyLooksValid(k: string) {
  return /^xai-[A-Za-z0-9_-]{16,}$/.test(k.trim());
}
