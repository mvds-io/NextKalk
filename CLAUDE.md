# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kalk Planner — a Norwegian helicopter operations planning app for lake liming (kalking). Interactive map interface for managing water bodies (vann), helicopter landing places (landingsplasser), info markers, and their associations. UI is in Norwegian.

## Commands

```bash
npm run dev              # Dev server with Turbopack (default)
npm run dev:safari       # Dev server without Turbopack (Safari compatibility)
npm run dev:https        # HTTPS dev with local-ssl-proxy
npm run build            # Production build
npm run start            # Production server
npm run lint             # ESLint
```

Note: `npm install` automatically runs `scripts/download-powerlines.js` which downloads a 64MB `.pmtiles` file to `public/data/`. TypeScript and ESLint errors are ignored during builds (`next.config.ts`).

## Architecture

**Stack:** Next.js 15 (App Router) / React 19 / TypeScript / Supabase (PostgreSQL + Auth) / Leaflet / Bootstrap 5 + Tailwind v3 (shadcn/ui)

**Two routes:**
- `/` — Main app: map + side panels, protected by `AuthGuard`
- `/admin` — Admin panel: CRUD management, requires `can_edit_markers` permission

**Rendering flow:** `RootLayout` → `TableNamesProvider` (context for dynamic table names) → `AuthGuard` (blocks until authenticated) → `AuthenticatedApp` (fetches data, renders UI)

**Main components (all `'use client'`):**
- `MapContainer.tsx` (~154KB) — Leaflet map, markers, clustering, connections, routing, GPS
- `Counter.tsx` — Top bar with counters, filters, auth controls, search
- `ProgressPlan.tsx` — Right panel sortable task list (SortableJS)
- `MarkerDetailPanel.tsx` — Slide-in detail panel for selected markers
- `admin/page.tsx` — Multi-tab admin with shadcn/ui Tabs

**Map setup:** Leaflet loaded via CDN scripts in `layout.tsx` (accessed via `window.L`), NOT via dynamic imports. Mapbox GL used only for coordinate picker in admin and satellite tiles. Powerlines rendered from local `.pmtiles` via `protomaps-leaflet`.

### Database

Direct Supabase client (no ORM). Core tables:
- `vass_vann` — Water bodies (the "airports" in code, legacy naming)
- `vass_lasteplass` — Landing places
- `vass_info` — Info/comment markers
- `vass_associations` — Links between vann and landingsplass
- `users` — Accounts with `can_edit_priority` and `can_edit_markers` flags
- `user_action_logs` — Activity audit log
- Image/document tables per marker type (e.g., `airports_images`, `landingsplass_images`)
- `app_config` — Controls active year and table prefix

**Year-based archival:** Tables can be prefixed by year (e.g., `2025_vass_vann`). `app_config` controls which year is active. `src/lib/tableNames.ts` resolves names dynamically, but many components still use hardcoded names from `src/lib/config.ts`.

### Auth

Supabase Auth with email/password. Custom `localStorage`-based session storage (workaround for IndexedDB issues in Edge/Chrome-Mac). `getSessionDirectly()` in `supabase.ts` reads localStorage directly, bypassing `supabase.auth.getSession()` to avoid Vercel production hangs. API routes verify JWT manually via `createClient` with `Authorization: Bearer <token>`.

### Connection Pool

Custom connection pool in `supabase.ts` limits concurrent Supabase requests to 12 with 15-second timeouts and exponential backoff retry.

## Key Conventions

- **Path alias:** `@/*` maps to `./src/*`
- **CSS:** Hybrid approach — Bootstrap 5 (CDN), extensive custom CSS in `globals.css` (~70KB), Tailwind v3 CSS variables for shadcn/ui components
- **Tailwind:** v3 with standard PostCSS config (`tailwindcss` + `autoprefixer`). Do NOT upgrade to Tailwind v4 / `@tailwindcss/postcss` — it causes infinite compilation hangs with this project's large component files
- **shadcn/ui:** `new-york` style, configured in `components.json`, components in `src/components/ui/`
- **Legacy naming:** Code uses "airports" for vann (water bodies) in many places — this is historical, not actual airports
- **State management:** React hooks only (useState/useEffect/useCallback/useRef), no external state library
- **Animations:** framer-motion

## Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

Optional:
```
NEXT_PUBLIC_MAPBOX_TOKEN=<token>   # For admin coordinate picker and satellite tiles
```

## MCP Servers

Configured in `.mcp.json`: Supabase MCP (project ref: `dglqobtmahurgbpjrtpw`), shadcn-ui MCP, context7 MCP.
