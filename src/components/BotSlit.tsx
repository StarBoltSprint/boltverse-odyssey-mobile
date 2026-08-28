import { useEffect, useRef, useState, type FormEvent } from "react";
import { ARTIFACTS } from "@/game/artifacts";
import { DOOR_TEMPLATE_URL } from "@/lib/bot/door-template";
import {
  connectBot,
  disconnectBot,
  fetchBotSession,
  sendBotChat,
  setBotSession,
  type GrokBotChoice,
  type SessionPayload,
} from "@/game/bot-session";

const TICK_MS = 250;
const BURST_MS = 250;
const BURST_FOR_MS = 20_000;
const CLOCK_MS = 1000;
const EMPTY: SessionPayload = {
  session: null,
  den: null,
  landables: [],
  bots: [],
  chat: [],
  door_template_url: DOOR_TEMPLATE_URL,
};
const OPEN_LANDABLE = ARTIFACTS.find((a) => a.open)?.id ?? "core-heart";

function circuitLandable(payload: SessionPayload) {
  return (
    payload.landables.find((l) => l.artifact_id === OPEN_LANDABLE && l.landable && !l.owned) ?? null
  );
}

function clockLabel(d = new Date()): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function lastBotAt(chat: SessionPayload["chat"]): string | null {
  let last: string | null = null;
  for (const line of chat ?? []) {
    if (line.from === "bot") last = line.at;
  }
  return last;
}

function actionLine(payload: SessionPayload): string {
  const session = payload.session;
  if (!session) return "idle";
  if (session.activity) return session.activity;
  if (session.mode === "travel") {
    const land = payload.landables.find((l) => l.artifact_id === session.current_artifact_id);
    return land ? `visiting ${land.name}` : "traveling";
  }
  return payload.den ? `staying in ${payload.den.name}` : "staying in Pack HQ";
}

/** GROK_BOT_SLIT — Citadel Door chat. Fullscreen on phone when talking. */
export function BotSlit() {
  const [payload, setPayload] = useState<SessionPayload>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState("");
  const [clock, setClock] = useState(() => clockLabel());
  const [listening, setListening] = useState(false);
  const [burstGen, setBurstGen] = useState(0);
  const [hallOpen, setHallOpen] = useState(false);
  const listeningRef = useRef(false);
  const listenMarkRef = useRef<string | null>(null);
  const endRef = useRef<HTMLLIElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  listeningRef.current = listening;
  const session = payload.session;
  const guest = Boolean(session && session.mode === "travel");
  const landable = circuitLandable(payload);
  const canTravel = Boolean(session && session.mode === "stay" && landable);
  const bots = payload.bots ?? [];
  const lines = payload.chat ?? [];
  const full = Boolean((picking && !session) || (session && hallOpen));

  useEffect(() => {
    const id = window.setInterval(() => setClock(clockLabel()), CLOCK_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    const sync = () => {
      const kb = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      root.style.setProperty("--slit-kb", `${kb}px`);
    };
    sync();
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    return () => {
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      root.style.removeProperty("--slit-kb");
    };
  }, [full]);

  useEffect(() => {
    let stop = false;
    const tick = () => {
      if (listeningRef.current) return;
      void fetchBotSession()
        .then((next) => {
          if (!stop) setPayload(next);
        })
        .catch(() => {});
    };
    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!listening) return;
    let stop = false;
    const deadline = Date.now() + BURST_FOR_MS;
    const mark = listenMarkRef.current;
    const tick = () => {
      void fetchBotSession()
        .then((next) => {
          if (stop) return;
          setPayload(next);
          const latest = lastBotAt(next.chat);
          if ((latest && latest !== mark) || Date.now() >= deadline) {
            setListening(false);
          }
        })
        .catch(() => {});
    };
    tick();
    const id = window.setInterval(tick, BURST_MS);
    const to = window.setTimeout(() => {
      if (!stop) setListening(false);
    }, BURST_FOR_MS);
    return () => {
      stop = true;
      window.clearInterval(id);
      window.clearTimeout(to);
    };
  }, [listening, burstGen]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [lines.length, listening, full]);

  function onImportDoor() {
    const url = payload.door_template_url;
    if (!url) return;
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) window.location.assign(url);
  }

  async function onConnect(bot: GrokBotChoice) {
    setBusy(true);
    try {
      const next = await connectBot({ bot_id: bot.id, bot_name: bot.name });
      if (next.oauth_url) {
        window.location.assign(next.oauth_url);
        return;
      }
      if (!next.error) {
        setPayload(next);
        setPicking(false);
        setHallOpen(true);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onDisconnect() {
    setBusy(true);
    try {
      const cut = await disconnectBot();
      if (cut.ok) {
        const next = await fetchBotSession();
        setPayload(next);
        setPicking(false);
        setHallOpen(false);
        setDraft("");
        setListening(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onTravel() {
    if (!landable) return;
    const next = await setBotSession("travel", landable.artifact_id);
    if (!next.error) setPayload(next);
  }

  async function onSend(ev: FormEvent) {
    ev.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const next = await sendBotChat(text);
      if (!next.error) {
        setPayload(next);
        setDraft("");
        listenMarkRef.current = lastBotAt(next.chat);
        setListening(true);
        setBurstGen((n) => n + 1);
        inputRef.current?.focus();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside
      className="citadel-slit citadel-slit-corner"
      data-grok-bot-slit
      data-mode={session ? session.mode : "off"}
      data-guest={guest ? "true" : undefined}
      data-present={session && session.activity && session.activity !== "not in the room" ? "true" : undefined}
      data-pick={picking && !session ? "true" : undefined}
      data-talk={session && hallOpen ? "true" : undefined}
      data-listen={listening ? "true" : undefined}
      data-full={full ? "true" : undefined}
      aria-label="Grok Bot"
    >
      {!session ? (
        picking ? (
          <div className="citadel-slit-pick">
            <header className="citadel-slit-hall-head">
              <div className="citadel-slit-hall-bar">
                <p className="citadel-slit-kicker">Boltverse</p>
                <button type="button" className="citadel-slit-icon" disabled={busy} onClick={() => setPicking(false)}>
                  Close
                </button>
              </div>
              <h2 className="citadel-slit-title">Citadel Door</h2>
              <p className="citadel-slit-sub">Add the Door bot, then talk here. No API keys.</p>
            </header>
            {payload.door_template_url ? (
              <button type="button" className="citadel-slit-import" onClick={onImportDoor}>
                <b>Import door bot</b>
                <span>Citadel Door by SmiR</span>
              </button>
            ) : (
              <p className="citadel-slit-import is-pending">
                <b>Import door bot</b>
                <span>Citadel Door</span>
                <small>Import link pending</small>
              </p>
            )}
            <p className="citadel-slit-hint" data-from="game" role="note">
              After Import, allow the Door chat line once. Then connect below.
            </p>
            <ul className="citadel-slit-names">
              {bots.map((bot) => (
                <li key={bot.id}>
                  <button type="button" disabled={busy} onClick={() => void onConnect(bot)}>
                    Connect {bot.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            <span className="citadel-slit-who">Door</span>
            <button type="button" className="citadel-slit-go" disabled={busy} onClick={() => setPicking(true)}>
              {busy ? "…" : "Talk"}
            </button>
          </>
        )
      ) : hallOpen ? (
        <div className="citadel-slit-on">
          <header className="citadel-slit-hall-head">
            <div className="citadel-slit-hall-bar">
              <span className="citadel-slit-dot" aria-hidden />
              <div className="citadel-slit-live">
                <strong>{session.bot_name || "Citadel Door"}</strong>
                <em>
                  {actionLine(payload)}
                  {listening ? " · listening" : ""}
                  {guest ? <span className="citadel-slit-guest">guest</span> : null}
                  <time className="citadel-slit-clock" dateTime={clock}>
                    {clock}
                  </time>
                </em>
              </div>
              <button type="button" className="citadel-slit-icon" onClick={() => setHallOpen(false)}>
                Door
              </button>
            </div>
          </header>
          <div className="citadel-slit-actions">
            {canTravel && landable ? (
              <button type="button" className="citadel-slit-travel" onClick={() => void onTravel()}>
                Walk the Circuit
              </button>
            ) : null}
            <button type="button" className="citadel-slit-cut" disabled={busy} onClick={() => void onDisconnect()}>
              Disconnect
            </button>
          </div>
          <ol className="citadel-slit-lines">
            <li data-from="game">
              <b>Door</b>
              <span>Import Citadel Door, allow the Door chat line once, then talk here. Same as before — no MCP.</span>
            </li>
            {lines.map((line, i) => (
              <li key={`${line.at}-${i}`} data-from={line.from}>
                <b>{line.from === "player" ? "You" : session.bot_name}</b>
                <span>{line.text}</span>
              </li>
            ))}
            {listening ? (
              <li data-from="bot" data-wait="true">
                <b>{session.bot_name}</b>
                <span className="citadel-slit-wait">…</span>
              </li>
            ) : null}
            <li ref={endRef} aria-hidden className="citadel-slit-end" />
          </ol>
          <form className="citadel-slit-form" onSubmit={(ev) => void onSend(ev)}>
            <input
              ref={inputRef}
              type="text"
              name="line"
              maxLength={240}
              autoComplete="off"
              enterKeyHint="send"
              placeholder={`Message ${session.bot_name || "Citadel Door"}`}
              value={draft}
              disabled={busy}
              onChange={(ev) => setDraft(ev.target.value)}
              aria-label={`Message ${session.bot_name || "Grok Bot"}`}
            />
            <button type="submit" disabled={busy || !draft.trim()}>
              Send
            </button>
          </form>
        </div>
      ) : (
        <>
          <span className="citadel-slit-dot" aria-hidden />
          <span className="citadel-slit-who">{session.bot_name || "Door"}</span>
          <button type="button" className="citadel-slit-go" onClick={() => setHallOpen(true)}>
            Open
          </button>
        </>
      )}
    </aside>
  );
}
