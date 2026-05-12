# AWG Dashboard Design System

## Direction

The dashboard is an operations surface for Agent Working Group: calm, dense enough for senior operators, and clear under incident pressure. It should feel like a control room rather than a marketing landing page. In production it is expected to run behind the local FastAPI service supervised by the repository launchd helper, with `/api/status` serving as the health boundary.

## Principles

- Prioritize scan speed: status, ownership, age, and route must be visible without opening detail pages.
- Use strong information hierarchy: oversized page titles, compact mono metadata, and high-contrast status pills.
- Keep visual effects purposeful: atmospheric background, glass panels, and tight hover elevation only where they improve orientation.
- Mobile remains operational: navigation wraps, cards become single-column, and details avoid horizontal overflow.
- Avoid vendor-inspired naming. Tailwind 4 theme tokens describe product intent, not another brand.

## Visual Language

- Canvas: warm stone gradient with muted green/blue/orange ambient light.
- Primary accent: operational green for healthy/active states and focused actions.
- Secondary accents: amber for waiting/stale, red for errors, blue for streaming/processing context.
- Surfaces: translucent panels with hairline borders and soft shadows.
- Typography: Geist Mono is the dashboard voice across interface hierarchy, IDs, routes, timestamps, sessions, and terminal output.

## Components

- Sidebar: persistent desktop rail, compact wrapped navigation on mobile.
- Hero panel: summarizes root, queue volume, and attention count.
- KPI card: label, large value, optional hint.
- Queue card: kind/state/time first, body preview second, routing metadata last.
- Worker card: session identity, liveness status, uptime/windows/status metrics.
- Detail pages: structured key-value metadata followed by code blocks for body/refs/raw payload.
- Liveness rows: status pill, agent/session identity, age/timeout metadata.
- Status health: surface root safety, queue-path availability, tmux availability, and watcher freshness without requiring operators to inspect server logs first.

## Accessibility Notes

- Status is represented by text plus color, never color alone.
- Large click targets are used for navigation and cards.
- Mono text is reserved for machine identifiers to reduce cognitive load.
- Responsive breakpoints preserve all content without relying on hover-only affordances.
