import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import appCss from "../styles.css?url";
import "../styles.css";

const APP_NAME = "The Luminous Circuit";

const CRITICAL = `
html,body,#app{height:100%;margin:0;background:#070918;color:#e8eef8;font-family:system-ui,sans-serif}
.circuit-root{position:relative;width:100%;height:100dvh;height:100svh;background:#070918;overflow:hidden;color:#e8eef8;font-family:system-ui,sans-serif}
.circuit-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;background:#070918;touch-action:none}
`;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no",
      },
      { title: APP_NAME },
      { name: "theme-color", content: "#070918" },
      { name: "color-scheme", content: "dark" },
      { name: "format-detection", content: "telephone=no" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "mobile-web-app-capable", content: "yes" },
      {
        name: "description",
        content:
          "Thunderwolf Citadel — Pack HQ. Land the Circuit, open the Hall of Artifacts, or fly the constellation.",
      },
      {
        name: "agent-capabilities",
        content:
          "Open the Citadel hub. Land the Circuit. Open Hall of Artifacts. Toggle the constellation sky.",
      },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&family=Syne:wght@500;600;700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      { rel: "alternate", type: "text/plain", href: "/llms.txt", title: "LLM-readable information" },
      { rel: "alternate", type: "text/markdown", href: "/agent.md", title: "Grok Bot how-to" },
      { rel: "alternate", type: "application/json", href: "/.well-known/agents.json", title: "Agent actions" },
    ],
    styles: [{ children: CRITICAL }],
  }),
  component: () => (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
