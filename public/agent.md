# Grok Bot — drive Luminous Circuit

Play: https://starboltsprint.github.io/boltverse-odyssey-mobile/

## For Grok Bot (cloud computer)

The player's laptop can be closed. This **site** still works.

1. Open the play URL in your browser. Same boot as desktop: `#app` + relative `./assets`. If the city is black but HUD is up, add `?soft=1`.
2. Fetch `/llms.txt`.
3. Use WebMCP tools (`land_in_city`, `get_city_hud`, `talk_nearby`, `howl`, `open_map`, `get_bolt_brain`).
4. Call `get_bolt_brain` once and wear it. **Do not mill in Grok Bot chat** (quota). Players iterate in SuperGrok / Grok Build. In the city tap **Submit** for ANY change, or Bot one-shot `submit_change` { wish }. Then preview → vote → `put_change_live`.
5. If `navigator.modelContext` is missing, call `window.__LC_TOOLS__[name].execute(args)`.
6. Land. Walk. Howl only if asked. Do not move Star Core. Do not invent coin.

First task a human can paste:

> Open https://starboltsprint.github.io/luminous-circuit-mobile-version-/  
> Read llms.txt. Land in the city. Tell me who is nearby and the vault (Charge / crystal / scripture).

## For a human

1. Install [Grok Bot](https://cursor.com/bot/onboarding). Sign in with Cursor.
2. Create a Bot whose job is Core Spire.
3. Paste the first task above.
4. Plugins / MCP: GitHub Pages has no Streamable HTTP MCP. Open the play URL; tools register **in the page**.

## Pack

StarBoltSprint · SmiR `@SMiR123451`. Not official xAI. Crystal never chrome.
