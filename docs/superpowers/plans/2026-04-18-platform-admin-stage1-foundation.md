# Platform Admin Stage 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first runnable foundation of the platform admin system with a Rust backend, React frontend, PostgreSQL deployment skeleton, and Docker-based local/production bootstrap.

**Architecture:** Add an independent `platform-admin/` subtree inside the repository. The backend starts as a small Rust HTTP service with a `/api/health` endpoint and environment-driven config. The frontend starts as a small React shell that clearly marks the platform admin console and its phase-1 modules. Docker Compose wires PostgreSQL, backend, and frontend together so later RBAC, tenant, and config-center work can land on a stable base.

**Tech Stack:** Rust (std-first skeleton), React + TypeScript, Vite, Docker, PostgreSQL.

---

### Task 1: Scaffold the platform admin repository layout

**Files:**
- Create: `platform-admin/README.md`
- Create: `platform-admin/.env.example`
- Create: `platform-admin/docker-compose.yml`
- Create: `platform-admin/backend/Dockerfile`
- Create: `platform-admin/frontend/Dockerfile`

- [ ] **Step 1: Write the docs and environment skeleton**
- [ ] **Step 2: Review the compose service boundaries and image responsibilities**
- [ ] **Step 3: Commit scaffold files**

### Task 2: Add the Rust backend health service

**Files:**
- Create: `platform-admin/backend/Cargo.toml`
- Create: `platform-admin/backend/src/lib.rs`
- Create: `platform-admin/backend/src/main.rs`
- Test: `platform-admin/backend/src/lib.rs`

- [ ] **Step 1: Write failing Rust tests for health payload and HTTP response formatting**
- [ ] **Step 2: Run `cargo test` in `platform-admin/backend` and verify failure**
- [ ] **Step 3: Implement the minimal health service and env config**
- [ ] **Step 4: Run `cargo test` in `platform-admin/backend` and verify pass**
- [ ] **Step 5: Commit backend slice**

### Task 3: Add the React admin shell

**Files:**
- Create: `platform-admin/frontend/package.json`
- Create: `platform-admin/frontend/tsconfig.json`
- Create: `platform-admin/frontend/index.html`
- Create: `platform-admin/frontend/src/main.tsx`
- Create: `platform-admin/frontend/src/App.tsx`
- Create: `platform-admin/frontend/src/app.css`
- Test: `tests/platform-admin-frontend.test.tsx`

- [ ] **Step 1: Write the failing frontend smoke test**
- [ ] **Step 2: Run `npm run test -- tests/platform-admin-frontend.test.tsx` and verify failure**
- [ ] **Step 3: Implement the minimal React shell**
- [ ] **Step 4: Run `npm run test -- tests/platform-admin-frontend.test.tsx` and verify pass**
- [ ] **Step 5: Commit frontend slice**

### Task 4: Verify the first vertical slice

**Files:**
- Modify: `platform-admin/README.md`

- [ ] **Step 1: Document local run commands for backend/frontend/compose**
- [ ] **Step 2: Run `cargo test` in `platform-admin/backend`**
- [ ] **Step 3: Run `npm run test -- tests/platform-admin-frontend.test.tsx`**
- [ ] **Step 4: Run repository-wide `npm run test`, `npm run typecheck`, `npm run build`**
- [ ] **Step 5: Commit verification/documentation updates**
