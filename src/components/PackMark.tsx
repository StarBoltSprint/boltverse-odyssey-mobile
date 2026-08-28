import { useState } from "react";
import { GROK_PROVIDERS, authEnabled, signIn, signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

function markName(name: string | null | undefined) {
  const n = (name ?? "").trim();
  return n || "Walker";
}

function crestLetter(name: string) {
  const ch = name.replace(/[^A-Za-z0-9]/g, "").charAt(0);
  return (ch || "P").toUpperCase();
}

export function PackChip({ onOpen }: { onOpen: () => void }) {
  const { user, isPending } = useCurrentUserState();
  const connected = !!user && !user.isDevFallback;
  const name = markName(user?.displayName || user?.primaryEmail);
  const letter = crestLetter(connected ? name : "P");
  const label = isPending ? "…" : connected ? name.split(/\s+/)[0] : "Join";
  const sub = isPending ? "PACK" : connected ? "PACK MARK" : "CONNECT";

  return (
    <button type="button" className="citadel-pack" onClick={onOpen} aria-label="Pack profile and connection">
      <span className="citadel-pack-crest" data-on={connected ? "true" : undefined}>
        {connected && user?.profileImageUrl ? <img src={user.profileImageUrl} alt="" /> : letter}
      </span>
      <span className="citadel-pack-meta">
        <strong>{label}</strong>
        <em>{sub}</em>
      </span>
    </button>
  );
}

export function PackSheet({ onClose }: { onClose: () => void }) {
  const { user, isPending } = useCurrentUserState();
  const [signingOut, setSigningOut] = useState(false);
  const connected = !!user && !user.isDevFallback;
  const name = markName(user?.displayName || user?.primaryEmail);
  const letter = crestLetter(connected ? name : "P");

  return (
    <div className="citadel-sheet" role="dialog" aria-label="The Pack">
      <div className="citadel-sheet-card">
        <p className="citadel-kicker">Boltverse</p>
        <h2 className="citadel-sheet-title">The Pack</h2>
        <div className="citadel-pack-card">
          <span className="citadel-pack-crest" data-on={connected ? "true" : undefined}>
            {connected && user?.profileImageUrl ? <img src={user.profileImageUrl} alt="" /> : letter}
          </span>
          <span className="citadel-pack-meta">
            <strong>{isPending ? "…" : connected ? name : "No mark yet"}</strong>
            <em>{connected ? "Connected" : "Tap Google or X"}</em>
          </span>
        </div>
        {connected ? (
          <p className="citadel-sheet-copy">Your pack mark lives with this connection. Hall and Circuit keep your walk.</p>
        ) : (
          <p className="citadel-sheet-copy">Connect to keep your pack mark across devices. Google or X.</p>
        )}
        {!connected && authEnabled && (
          <div className="citadel-connect">
            {GROK_PROVIDERS.map((p) => (
              <button
                key={p.providerId}
                type="button"
                className="citadel-sheet-close"
                onClick={() => signIn(p.providerId, { callbackURL: "/" })}
              >
                Continue with {p.label}
              </button>
            ))}
          </div>
        )}
        {connected && authEnabled && (
          <button
            type="button"
            className="citadel-sheet-back"
            disabled={signingOut}
            onClick={() => {
              setSigningOut(true);
              void signOut().catch(() => setSigningOut(false));
            }}
          >
            {signingOut ? "Leaving…" : "Sign out"}
          </button>
        )}
        <button type="button" className="citadel-sheet-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
