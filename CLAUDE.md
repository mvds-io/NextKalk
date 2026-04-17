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

**All significant components are `'use client'`** — no Server Components beyond `layout.tsx`.

**Rendering flow:** `RootLayout` → `TableNamesProvider` (context for dynamic table names) → `AuthGuard` (blocks until authenticated) → `AuthenticatedApp` (fetches data, renders UI)

**Main components:**
- `MapContainer.tsx` (~154KB) — Leaflet map, markers, clustering, connections, routing, GPS, powerlines
- `Counter.tsx` — Top bar with counters, filters, auth controls, search, PDF export
- `ProgressPlan.tsx` — Right panel sortable task list (framer-motion `Reorder`)
- `MarkerDetailPanel.tsx` — Slide-in detail panel for selected markers
- `admin/page.tsx` — Multi-tab admin with shadcn/ui Tabs (Landingsplasser, Vann, Archive, Planning, Year Comparison)

### Map Setup

Leaflet loaded via CDN scripts in `layout.tsx` — accessed as `(window as any).L`, NOT via npm imports. The npm `leaflet` package is installed for types only. All Leaflet plugins (routing-machine, awesome-markers, markercluster) are CDN-only.

Mapbox GL is npm-imported only in `MapboxCoordinatePicker.tsx` (admin coordinate picker). `protomaps-leaflet` is npm-imported for rendering powerlines from local `.pmtiles`.

### Cross-Component Communication

Components communicate via `window.dispatchEvent(new CustomEvent(...))` for events like `mobileUIToggle`, `progressPlanToggle`, `fullscreenToggle`. The Leaflet map listens for these to call `invalidateSize()`.

### Database

Direct Supabase client (no ORM). All queries go through `queryWithRetry` wrapper in `supabase.ts`. Core tables:
- `vass_vann` — Water bodies (called "airports" in code — legacy naming, not actual airports)
- `vass_lasteplass` — Landing places
- `vass_info` — Info/comment markers
- `vass_associations` — Links between vann and landingsplass (has `distance_km`)
- `users` — Custom user table with `can_edit_priority` and `can_edit_markers` flags
- `user_action_logs` — Activity audit log (never year-prefixed)
- Image/document tables per marker type (e.g., `vass_vann_images`, `vass_lasteplass_documents`)
- `app_config` — Controls active year and table prefix (never year-prefixed)

**Year-based archival:** Tables can be prefixed by year (e.g., `2025_vass_vann`). `app_config` controls which year is active. `src/lib/tableNames.ts` resolves names dynamically via `TableNamesContext`. Most components use dynamic names from context; some still use hardcoded names from `src/lib/config.ts`.

**Pagination:** `loadAirports()` uses manual cursor-based pagination with 1000-record pages (Supabase row limit). Landing places load in a single query with batch-loaded associations and tonnage.

**Storage:** Images stored in Supabase Storage bucket `vass-images`.

### Auth

Supabase Auth with email/password. Custom `localStorage`-based session storage (workaround for IndexedDB issues in Edge/Chrome-Mac).

- **Main app:** `getSessionDirectly()` reads localStorage directly, bypassing `supabase.auth.getSession()` to avoid Vercel production hangs. `AuthGuard` auto-creates users in `users` table on first login.
- **Admin page:** Still uses `supabase.auth.getSession()` (known inconsistency).
- **API routes:** Verify JWT manually via `createClient` with `Authorization: Bearer <token>`.
- **`onAuthStateChange` is disabled** — uses `storage` event listener for cross-tab sync and `visibilitychange` for tab refocus instead.

### Connection Pool

Custom pool in `supabase.ts` limits concurrent Supabase requests to 12 with 15-second timeouts and exponential backoff retry. Auth requests bypass the pool.

### API Routes

- `GET /api/search?q=...` — Searches vann (name) and lasteplass (kode, lp). Any authenticated user.
- `GET/POST /api/archive-tables` — Archive management. Generates SQL (does NOT execute). Requires `can_edit_markers`.
- `GET /api/list-archives` — Discovers existing year-prefixed tables.

## Key Conventions

- **Path alias:** `@/*` maps to `./src/*`
- **CSS:** Hybrid approach — Bootstrap 5 (CDN in layout.tsx), extensive custom CSS in `globals.css` (~2800 lines), Tailwind v3 CSS variables for shadcn/ui components. Bootstrap classes used in main app, Tailwind/shadcn in admin.
- **Tailwind:** v3 with standard PostCSS config (`tailwindcss` + `autoprefixer`). Do NOT upgrade to Tailwind v4 / `@tailwindcss/postcss` — it causes infinite compilation hangs with this project's large component files.
- **shadcn/ui:** `new-york` style, configured in `components.json`, components in `src/components/ui/`
- **CDN-loaded at runtime:** Bootstrap, Leaflet + plugins, jsPDF (loaded on-demand via `window.jspdf` in `pdfExport.ts`)
- **Legacy naming:** Code uses "airports" for vann (water bodies) throughout — this is historical, not actual airports
- **State management:** React hooks only (useState/useEffect/useCallback/useRef), no external state library. `useTableNames()` context is the only React Context.
- **Animations:** framer-motion (loading screen, ProgressPlan drag reorder)
- **Action logging:** Mutations log to `user_action_logs` with `action_type`, `target_type`, `target_id`, and `action_details` JSONB
- **Types:** All interfaces in `src/types/index.ts` (Airport, Landingsplass, KalkInfo, User, etc.)
- **SQL files in repo root** (e.g., `database_schema.sql`, `fix_rls_policies.sql`) are reference documents — not applied automatically
- **Git LFS:** `*.pmtiles` and `*.geojson` tracked via LFS. `vercel.json` enables LFS for builds.

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
