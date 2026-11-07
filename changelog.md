# Changelog

Current version: **1.2**

## Instructions for future updates

When a contributor asks to update this changelog:

- Keep these rules and the entry template above the changelog entries. Add each new version entry below the rules and above the previous entries, keeping the full history.
- Increase the version by one minor step for each new update: `1.1`, `1.2`, through `1.9`, then `2.0`, `2.1`, and so on. After any `.9`, increase the first number and reset the second number to `0`; do not use `1.10`.
- Update the current version shown at the top of this file.
- Record the contributor's full name under **Author** and the update date as `YYYY-MM-DD`. Ask for the name if it is unknown; do not reuse the previous author's name automatically. List all authors for a shared contribution.
- Review the actual changes since the previous checkpoint and describe what changed, why it matters, and how it was verified. Do not repeat earlier changes as new work.
- Distinguish implemented behavior from tested behavior. Record remaining verification when relevant.
- Use this project's version sequence even for small changes; it is a team convention rather than semantic versioning.

Entry template:

```markdown
## Version X.Y — YYYY-MM-DD

**Author:** Contributor's full name

### Changes

- Describe the changes and affected files.

### Verification

- Record checks performed and their results.
- Note relevant checks still pending.
```

## Version 1.2 — 2026-11-07

**Author:** Aalvee Ahtav

### Changes

- Replaced the placeholder with Person 1's local map/interface dashboard: hazard visibility controls, hotspot navigation, before/after guidance, and zone/household/team detail panels.
- Added browser-only Leaflet 1.9.4 with attributed OpenStreetMap raster tiles, selectable hazard polygons and record markers, severity outlines, reset navigation, resizing support, and a basemap-load warning.
- Added disposable fictional UI fixtures for all six supported hazards across the contiguous U.S.; these are separate from Person 3's future authoritative datasets and are clearly labeled simulations.
- Added responsive layouts, keyboard-accessible hotspot/record selection, loading/empty/connection-error presentations, and fixed scenario source timestamps displayed in America/Chicago.
- Defined frontend data view models and a prop-based integration boundary with a workflow composition slot for Person 4. Documented coordinate ordering, IDs, status assumptions, and remaining backend integration in `frontend/src/components/map/README.md`.
- Assigned Person 1 ownership in the README and updated setup/progress documentation. Current scope follows the README's nationwide six-hazard plan; v1.1's single-region flood description records the earlier plan.
- Added explanatory comments to map components, frontend view models, temporary fixtures, and global styles covering Leaflet lifecycle/cleanup, selection/filter behavior, coordinate conventions, teammate integration, and responsive layout choices.
- No persisted operational changes, live hazard feeds, decision scoring, or SpacetimeDB integration were added.

### Verification

- `npm --prefix frontend run lint` and `npm --prefix frontend run typecheck` passed after implementation. Lint passed again after adding comments; `git diff --check` also passed.
- The contributor reported successful lint, type checking, and production build for the original starter before these dashboard changes.
- The new dashboard production build was attempted in the agent environment and retried with escalation; both attempts failed because Turbopack's CSS worker could not bind a local port. Compilation completion is not claimed for this version.
- Browser rendering, tile loading, pan/zoom, selection, overlapping-zone inspection, narrow-screen behavior, and real connection states still require interactive verification. Map/interface checklist items remain in progress.
- npm installation reported eight moderate dependency findings. Backend acceptance checks and two-session verification remain pending.

## Version 1.1 — 2026-11-07

**Author:** Aalvee Ahtav

### Changes

- Documented RiskReach's employee-facing disaster preparedness and response concept for the State Farm and Spacetime hackathon challenges, including proactive customer outreach and community assistance.
- Defined the single-region flood MVP, stretch goals, proposed data contract, status lifecycles, prioritization, dispatch behavior, four-person task split, relative 24-hour schedule, progress checklist, and judging demo.
- Confirmed Next.js + TypeScript for the frontend and a planned TypeScript SpacetimeDB module for the backend.
- Scaffolded Next.js 16.4.5 with App Router, TypeScript, Tailwind CSS 4, ESLint, the `@/*` alias, and placeholder directories for shared components and helpers.
- Added a RiskReach starter page, project metadata, and system fonts. Map features, disaster workflows, and SpacetimeDB integration remain pending.
- Organized all Next.js source, static assets, configuration, package manifest/lockfile, framework guidance, and local generated files under `frontend/`.
- Created `backend/README.md` to document the planned SpacetimeDB module. Backend code and generated client bindings have not been added.
- Added frontend development/build/start/lint/typecheck scripts, shared `.nvmrc`, and root ignore rules covering nested dependencies, generated output, and environment files.
- Updated the README with actual setup commands, repository layout, completed/pending tasks, verification status, and dependency findings.
- Consolidated the documentation, frontend scaffold, and folder separation into this v1.1 checkpoint. Kept changelog rules and the entry template above the history.

### Verification

- Reviewed the sponsor screenshots, project proposal, and relevant official documentation as planning inputs.
- Installed frontend dependencies. After moving the application, `npm --prefix frontend run lint` and `npm --prefix frontend run typecheck` passed.
- Verified that nested dependencies, Next.js output, generated environment types, and TypeScript build information remain ignored by Git.
- Production build compilation was attempted before the directory move, but Turbopack's CSS worker could not bind a local port in this environment. An elevated retry encountered the same restriction. Production build and browser rendering remain unverified.
- The initial online npm audit reported eight moderate findings in the development linting dependency chain through `minimatch`, with no production dependency findings. No forced dependency downgrade was applied.
- Checked documentation consistency and `git diff --check`. Backend connectivity, domain behavior, acceptance checks, and final sponsor eligibility verification remain pending.
