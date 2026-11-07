# Changelog

Current version: **1.4**

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

## Version 1.4 — 2026-11-07

**Author:** Karthik Bhagavatula

### Changes

- Expanded Person 3's generator with Small (60 households), Demo (10,000), and Stress (100,000) presets. Preserved the original small fixture and default behavior.
- Added 50 authored state context hotspots, including Alaska and Hawaii, alongside six dense narrative hotspots. Demo/Stress each contain 56 disaster exercises and 112 zones; Demo has 220 teams and 2,000 requests, while Stress has 1,970 teams and 20,000 requests.
- Added seeded coordinates, varied contact histories, customer/vulnerability mixes, team capacities/capabilities, stable IDs, hotspot count summaries, and explicit generator metadata in fixture schema v2. All data remains labeled synthetic; coordinates are approximate authored locations, not verified population or land-boundary samples.
- Added preset/seed/output CLI options and generalized validation for state coverage, per-hotspot counts, references, geometry, baseline cases, and team capability coverage. Added regression tests and ignored large generated outputs.
- Documented commands, schema compatibility, fixture handoff, and planned map aggregation, scoped subscriptions, and batched seeding. Those application integration features remain pending.

### Verification

- All six `unittest` cases passed, including original-fixture equality, national Demo coverage, full Stress validation, repeatability, changed-seed behavior, invalid presets, and ten damaged-data rejection cases.
- Generated Demo and Stress JSON through the CLI, validated both presets, and confirmed saved files match regenerated data. Verified large outputs are ignored by Git.
- On this local Python 3.12 run, Demo generation/validation took approximately 0.091/0.041 seconds; Stress took 0.963/0.389 seconds. Saved files were approximately 4.8 MB and 46.4 MB. These are local fixture-tool measurements, not backend, subscription, or browser benchmarks.
- Application dataset integration, Spacetime seeding, runtime performance, hazard-specific geometry, and remaining Person 3 decision logic are still pending.

## Version 1.3 — 2026-11-07

**Author:** Karthik Bhagavatula

### Changes

- Completed Person 3's first task with `data/scenarios/nationwide-v1.json`: six fictional disaster exercises, 12 regional/neighborhood zones, 60 households, 12 response teams, and 12 open help requests. Added national map framing and selected the tornado neighborhood as the initial demo hotspot.
- Included customer and community households, urgent non-customer requests, never-contacted and older-contact cases, available/unavailable teams, and safe households with unresolved supply requests for later workflow verification.
- Added stable IDs, explicit simulation/source labels, fixed UTC baseline timestamps, GeoJSON placeholder boundaries, and a deterministic fixture generator without third-party dependencies.
- Added a fixture validator and documented field conventions, coordinate order, proposed capability values, clock handling, and the handoff to Persons 1 and 2 in `data/scenarios/README.md`. Marked only the first Person 3 checklist item complete in the project README.

### Verification

- `python data/scenarios/validate.py` passed: six disasters, 12 zones, 60 households, 12 teams, and 12 requests. Checked unique IDs, foreign keys, geographic containment, source labels, timestamps, baseline statuses, and per-hazard demonstration coverage.
- Confirmed generator output equals the checked-in JSON fixture.
- Confirmed validation rejects seven intentionally damaged copies: duplicate IDs, missing hazards, broken references, invalid coordinates, future contacts, missing urgent community cases, and unlabeled geometry.
- These are offline fixture checks. Spacetime seeding, replacement of temporary frontend fixtures, hazard-specific impact geometry, runtime exposure calculation, priority scoring, overdue detection, preparedness suggestions, team matching/ETA, escalation, and database reset remain pending. No new application or database integration is claimed.

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
- Fixed the initial and reset map overview to fit the contiguous U.S. with padding instead of using a fixed zoom that cropped California hotspots on narrow screens.
- Refit the overview when its canvas resizes, while preserving manual pan/zoom and selected-record navigation.
- Matched both entity kind and ID for polygon, household-marker, and detail-row selection highlights so IDs shared across tables cannot select unrelated records.
- Updated the README checkpoint and map integration notes for these PR review fixes.
- No persisted operational changes, live hazard feeds, decision scoring, or SpacetimeDB integration were added.

### Verification

- `npm --prefix frontend run lint` and `npm --prefix frontend run typecheck` passed after implementation. Lint passed again after adding comments; `git diff --check` also passed.
- The contributor reported successful lint, type checking, and production build for the original starter before these dashboard changes.
- The new dashboard production build was attempted in the agent environment and retried with escalation; both attempts failed because Turbopack's CSS worker could not bind a local port. Compilation completion is not claimed for this version.
- The user confirmed browser verification of the fixture-backed map/interface tasks. Updated the README checklist to mark map rendering, hazard filtering, selection, before/after details, source labels, and UI loading/error/empty/responsive states complete. Live backend connection checks remain pending integration.
- npm installation reported eight moderate dependency findings. Backend acceptance checks and two-session verification remain pending.
- Frontend lint and type checking passed.
- Focused checks using Leaflet's actual bounds calculations fitted every fixture hotspot boundary at canvas widths of 294, 364, 569, and 849 pixels.
- An effect harness checked repeated resets, overview resizing, and preservation of manual navigation and selected-record focus during resize.
- Rendered detail-panel checks and overlay checks confirmed that colliding zone, household, and team IDs highlight only the selected entity type.
- Production build verification remains pending: the documented Turbopack worker-port restriction occurred during PR review, and the build was not rerun for these fixes.

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
