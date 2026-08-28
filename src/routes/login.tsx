import { createFileRoute } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";

export const Route = createFileRoute("/login")({
  ssr: false,
  component: Login,
});

function Login() {
  return (
    <main className="citadel" aria-label="Join the Pack">
      <img className="citadel-art" src="/citadel/hub.jpg" alt="" />
      <div className="citadel-veil" aria-hidden />
      <div className="citadel-sheet" role="dialog" aria-label="Connect">
        <div className="citadel-sheet-card">
          <p className="citadel-kicker">Boltverse</p>
          <h1 className="citadel-sheet-title">Join the Pack</h1>
          <p className="citadel-sheet-copy">Connect to keep your pack mark. Google or X.</p>
          {authEnabled ? (
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
          ) : (
            <p className="citadel-sheet-copy">Connection is dark.</p>
          )}
          <a className="citadel-sheet-back" href="/">
            Citadel
          </a>
        </div>
      </div>
    </main>
  );
}
