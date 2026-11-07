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

**Author:** Josh Sebastian

### Changes

- Aligned the README and Person 2 implementation plan with main commit `39893be`: nationwide tornado, earthquake, hurricane, wildfire, blizzard, and flood support, with national/metro/neighborhood zone hierarchies. Preserved Josh's Person 2 assignment.
- Added a TypeScript SpacetimeDB 2.14.1 module under `backend/`, pinned dependencies/lockfile, local project configuration, and build/typecheck/test/binding-generation commands.
- Implemented the eight operational entities with lookup indexes, plus a private employee allowlist. The publishing identity is the initial administrator; only an administrator can grant/revoke employee access or seed/reset/escalate scenarios. Private tables are exposed through employee-authorized views.
- Implemented validated check-in, outreach, preparedness tasks, help requests, assignment creation/progress/completion/cancellation, and transactional durable activity events. Conflicting dispatch, unavailable teams, capability/capacity violations, invalid statuses, and unauthorized calls are rejected. Safety status stays separate from assistance resolution.
- Added synthetic integration fixtures for all six hazards: 18 zones, 12 households/requests/tasks, and six teams. Added targeted disaster escalation and controlled reset that preserves memberships and activity history. Geometry and hazard-specific tasks are demonstration placeholders for Person 3's final data/rules.
- Added straight-line assignment distance (km) and approximate ETA (minutes, assumed 30 km/h); these are not road routing or automatic team recommendations.
- Generated frontend bindings and installed the matching frontend SDK. Added datastore tests and a repeatable local-only live-client smoke script. Browser connection/UI integration remains Person 4's work.
- Documented setup, identity enrollment, reducer contracts, multi-hazard handoffs, and remaining work in `backend/README.md` and `backend/PLAN.md`; updated the root tracker and ignored backend bundles/local test output.

### Verification

- Backend TypeScript checking passed; SpacetimeDB module build and binding generation passed using CLI/SDK 2.14.1.
- Eight datastore-harness tests passed, covering authorization/revocation, check-in/contact separation, task/request validation, dispatch conflicts, capability/capacity rejection, completion/cancellation, all six seeded hazard types, targeted escalation isolation, and repeatable reset.
- Published to an isolated local verification database on port 3100. Live SDK verification passed for synchronized check-in/outreach, competing dispatch (exactly one succeeds), assignment completion/team release, outsider rejection, and membership revocation removing subscribed data. The same live check passed again after republishing/resetting the six-hazard fixture.
- Frontend type checking passed after final multi-hazard binding regeneration. ESLint had no errors and one unused-disable warning in generated bindings. Production frontend build/browser rendering remain unverified.
- Backend dependency installation audit reported zero vulnerabilities after selecting patched test tools. The frontend retains the previously documented eight moderate development-chain findings.
- Verification used Node 24.20.0; npm warns that SDK 2.14.1 requires `^22.23.4 || ^24.22.1 || >=26.12.1`. Setup documentation records the supported versions; verification on a supported Node patch is still pending.
- `git diff --check` passed.
- Final Person 3 geometry/exposure, prioritization/reasons, overlooked-case detection, and team recommendations remain pending. Map/queue/action UI and the root README's complete browser acceptance checks remain pending. No commits, pushes, or cloud deployments were made.

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
