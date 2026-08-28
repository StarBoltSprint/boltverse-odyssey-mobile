import { useEffect, useState } from "react";
import { connectBot, disconnectBot, fetchBotSession, type GrokBotChoice, type SessionPayload } from "@/game/bot-session";

export function GrokBotSignIn({
  onClose,
  onSession,
}: {
  onClose: () => void;
  onSession?: (next: SessionPayload) => void;
}) {
  const [payload, setPayload] = useState<SessionPayload>({ session: null, den: null, landables: [], bots: [], door_template_url: null });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function publish(next: SessionPayload) {
    setPayload(next);
    onSession?.(next);
  }

  useEffect(() => {
    let stop = false;
    void fetchBotSession().then((next) => {
      if (!stop) publish(next);
    });
    return () => {
      stop = true;
    };
  }, []);

  async function connect(bot: GrokBotChoice) {
    setBusy(true);
    setErr("");
    try {
      const next = await connectBot({ bot_id: bot.id, bot_name: bot.name });
      if (next.error) {
        setErr(next.error);
        return;
      }
      if (next.oauth_url) {
        window.location.assign(next.oauth_url);
        return;
      }
      publish(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Connect failed.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setErr("");
    try {
      const out = await disconnectBot();
      if (!out.ok) setErr(out.error || "Disconnect failed.");
      publish({ session: null, den: payload.den, landables: payload.landables, bots: payload.bots });
    } finally {
      setBusy(false);
    }
  }

  const session = payload.session;

  return (
    <div className="pause-veil" role="dialog" aria-label="Connect Grok Bot">
      <div className="pause-sheet">
        <div className="panel w-[min(94%,26rem)] px-6 py-6 text-left">
          <h2 className="hud-title text-2xl">{session ? "Grok Bot" : "Connect Grok Bot"}</h2>
          <p className="mt-1 text-sm text-muted">
            Community Boltverse — not an official xAI or Grok product. Your bot stays in your den, or travels as a guest. It never asks for a personal API key.
          </p>
          {err ? <p className="mt-3 text-sm text-danger">{err}</p> : null}

          {session ? (
            <>
              <p className="mt-4 text-sm text-accent">
                {session.bot_name} · {session.mode === "stay" ? "Stay" : "Travel"}
              </p>
              <p className="mt-1 text-sm text-muted">{session.activity}</p>
              <div className="mt-5 flex flex-col gap-2">
                <button type="button" className="hud-chip h-11 rounded-lg border border-border text-fg" disabled={busy} onClick={() => void disconnect()}>
                  Disconnect
                </button>
                <button type="button" className="hud-chip h-11 rounded-lg bg-fg text-bg font-medium" onClick={onClose}>
                  Close
                </button>
              </div>
            </>
          ) : (
            <div className="mt-5 flex flex-col gap-2">
              {(payload.bots ?? []).map((bot) => (
                <button
                  key={bot.id}
                  type="button"
                  className="grok-bot-btn"
                  style={{ marginTop: 0, width: "100%" }}
                  disabled={busy}
                  onClick={() => void connect(bot)}
                >
                  {busy ? "Connecting…" : bot.name}
                </button>
              ))}
              <button type="button" className="hud-chip h-11 rounded-lg border border-border text-fg" onClick={onClose}>
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
