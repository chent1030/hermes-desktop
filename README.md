<img width="100%" alt="HERMES DESKTOP" src="https://github.com/user-attachments/assets/80585955-3bae-4aee-af90-a1e61757ccb8" />

<br/>
<p align="center">
  <a href="https://github.com/fathah/hermes-desktop/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License: MIT"></a>
  <a href="https://github.com/fathah/hermes-desktop/releases/"><img src="https://img.shields.io/badge/Download-Releases-FF6600?style=for-the-badge" alt="Releases"></a>
</p>

> **This project is in active development.** The current main direction is a platform-managed desktop runtime: tenant login, online initialization, platform-authorized models, platform skill catalog, and runtime audit.

`hermes-desktop` is now evolving from a local single-user GUI into a **platform-controlled desktop execution client**.

In the current branch direction, the desktop app no longer treats local install/setup as the primary product path. Instead, the primary flow is:

1. Tenant login
2. Online initialization from the platform
3. Auto-select a platform-authorized default model
4. Render global + tenant skill catalogs with local detection state
5. Run Hermes locally on the user's machine
6. Upload runtime audit events back to the platform

## Current Product Shape

This repository currently contains two closely related parts:

- **Desktop client**: Electron + React desktop runtime used by tenant users
- **Platform admin**: React + Rust + PostgreSQL management backend under `platform-admin/`

The current target architecture is:

- Single shared platform, multi-tenant
- Desktop client must be online
- Tokens and runtime config stay in memory only
- App restart requires re-login and re-initialization
- Platform is the only source of authorized models
- Skill page is based on platform catalog + local detection status
- Gateway is hidden in the desktop navigation for this phase

## Current Desktop Flow

On app start, the desktop client now follows the platform path:

1. Show tenant login
2. Exchange username/password for access + refresh tokens
3. Call platform initialization APIs:
   - `/api/desktop/bootstrap`
   - `/api/desktop/model-profiles`
   - `/api/desktop/skills/catalog`
4. Block workspace entry if:
   - bootstrap fails
   - no authorized models are returned
   - no default model is available
5. Enter the main workspace only after initialization succeeds
6. Keep refreshing the session in memory during runtime
7. Continue local chat/runtime execution while audit is buffered, but keep warning visible

## Desktop Features In This Phase

- **Tenant login only** — local standalone mode is no longer the primary path
- **Online initialization** — workspace access is gated by platform bootstrap
- **Platform-authorized model selection** — default model is auto-selected, users can switch only within the authorized list
- **Skill read-only catalog** — global and tenant skills are displayed together with local detection state
- **Manual skill download only** — the desktop app does not auto-install skills in this phase
- **In-memory session lifecycle** — refresh tokens are kept in memory only
- **Runtime audit pipeline** — login, initialization, chat, model switching, skill sync/download, and other runtime events are queued and uploaded to the platform
- **Audit degradation warnings** — chat can continue during temporary audit failures, with retry and re-auth handling
- **Bilingual UI** — English and Simplified Chinese are both supported

## Workspace Modules

The current workspace still reuses existing desktop modules, but the platformized flow is already wired into the key pages below:

| Screen | Current role in platform mode |
|--------|-------------------------------|
| **Chat** | Uses the platform-selected model context and emits runtime audit events |
| **Models** | Shows only platform-authorized models |
| **Skills** | Shows platform catalog merged with local detection state |
| **Settings** | Focuses on tenant/account/model/audit state and logout |
| **Gateway** | Hidden from desktop navigation in this phase |

## Platform Admin

The platform management system lives under `platform-admin/` and currently includes:

- Tenant and account bootstrap
- RBAC boundaries for super admin / tenant admin
- Model profile management
- Skill catalog management
- Desktop delivery APIs for bootstrap, models, skills, and audit ingestion
- Dockerized deployment skeleton
- PostgreSQL-backed persistence

For platform admin setup and API details, see `platform-admin/README.md`.

## Development

### Prerequisites

- Node.js and npm
- Rust toolchain
- PostgreSQL (for `platform-admin/backend`)
- Network access to the platform backend during desktop runtime testing

### Install dependencies

```bash
npm install
```

### Start the desktop app in development

```bash
npm run dev
```

By default the desktop runtime talks to:

- `HERMES_PLATFORM_URL=http://127.0.0.1:8080`

You can override it in your shell before starting the app.

### Start the platform admin stack

Frontend + backend live under `platform-admin/`.

Backend:

```bash
cd platform-admin/backend
cargo run
```

Frontend:

```bash
cd platform-admin/frontend
npm install
npm run dev
```

### Run checks

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Platform admin backend checks:

```bash
cd platform-admin/backend
cargo test
```

## Platform Runtime Test Focus

The current regression focus for the platformized desktop path is:

- tenant login
- online initialization
- default model auto-selection
- skill catalog rendering + local sync
- audit buffering and retry
- refresh token re-auth flow
- app remount requiring fresh login
- gateway hidden in desktop navigation

Relevant tests include:

- `tests/platform-runtime.test.ts`
- `src/renderer/src/platform/PlatformProvider.test.tsx`
- `tests/platform-skill-sync.test.ts`
- `tests/platform-audit.test.ts`
- `tests/platform-lifecycle-audit.test.ts`
- `tests/hermes-platform-audit.test.ts`

## Repository Structure

- `src/main/` — Electron main process, Hermes runtime integration, IPC handlers
- `src/preload/` — secure renderer bridge
- `src/renderer/src/` — React UI
- `src/shared/` — shared contracts and i18n resources
- `platform-admin/backend/` — Rust backend for platform admin + desktop delivery APIs
- `platform-admin/frontend/` — React admin UI
- `docs/superpowers/` — specs and implementation plans for the platformization work

## Notes

- The desktop app still runs Hermes locally on the user's machine.
- The current branch direction does **not** treat offline mode as a supported product mode.
- Skill upload/publish management is intentionally deferred; current desktop behavior is read-only display + manual download.
- Audit buffering is in-memory only; buffered events are lost if the process exits before upload succeeds.

## License

MIT
