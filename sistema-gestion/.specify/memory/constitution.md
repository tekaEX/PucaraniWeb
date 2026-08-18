# Transportes Pucarani Gestión Constitution

## Core Principles

### I. Architecture must follow the Next.js 16 App Router
This project is built on Next.js 16, React 19, TypeScript, and Supabase. The architecture is not a generic React app: routing, rendering, auth, and data access are organized around the App Router in `src/app/` and server-side data access patterns from the framework docs.

Non-negotiable rules:
- Use App Router conventions in `src/app/`; do not introduce a Pages Router or duplicate routing patterns unless the feature explicitly requires a documented exception.
- Prefer Server Components by default. Use `"use client"` only for interactive client-side behavior.
- Keep data access and auth orchestration in `src/lib/` and route/session helpers; do not scatter Supabase calls across UI components.
- Respect the framework guidance in `AGENTS.md` and the local Next.js docs under `node_modules/next/dist/docs/` before introducing new patterns.

### II. Security and authorization are not optional
The app manages business data, invoices, trips, fleet, and client receivables. Authorization is a first-class concern and must follow the actual role model already implemented.

Non-negotiable rules:
- Session and role checks live in `src/lib/auth.ts`; any authenticated route must use those helpers rather than ad hoc logic.
- The active policy is: panel access is granted only to the roles in `ROLES_PANEL` (`admin`, `operador`).
- Do not bypass login gates or add routes that expose protected data without the same access guard.
- Supabase RLS and database schema remain the source of truth for row-level security; UI checks are a convenience layer, not the only gate.
- No user-facing feature may assume a role value without verifying it against the allowed panel roles.

### III. Type safety and linting are mandatory gates
The repo is configured for strict TypeScript and Next.js ESLint rules. We do not accept code that “works” while violating the established static checks.

Non-negotiable rules:
- TypeScript must remain strict (`strict: true`) and default to explicit, typed domain models in `src/types/` or `src/lib/`.
- The `@/*` alias is the canonical import style; avoid deep relative paths when a project alias is available.
- `eslint` is the required lint command for the project and must be respected. The config extends `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`.
- Static assets under `public/` are intentionally ignored by ESLint; do not move app logic into generated or static directories.
- New code must not weaken the project’s strictness or disable rules without explicit justification and documentation.

### IV. Folder conventions are part of the product architecture
The repository already has a clear separation of responsibilities. Future work must conform to the established layout instead of creating ad hoc directories.

Non-negotiable rules:
- `src/app/` contains app routes, route groups, layouts, and page-level logic.
- `src/components/` contains reusable UI building blocks, including shell layout and form/panel components.
- `src/lib/` contains domain logic, utilities, query helpers, formatting, auth/session, and business rules.
- `src/types/` contains shared TypeScript entities used across the app.
- `src/proxy.ts` is reserved for request-proxy or optimistic checks; it must not become the primary data-access layer for business logic.
- Keep naming consistent with existing patterns: English function names where the repo already uses them, Spanish business terminology for domain objects, and route names aligned with the app’s `Operación` / `Datos` semantics.
- Do not create a second “feature root” outside these conventions unless the architecture specifically calls for it; prefer extending the existing folders.

### V. Business domain rules are explicit and must not be diluted
This is not a generic admin panel. It is a transport company operations system with derived states, financial logic, fleet management, and staff compliance tracking. Business rules must remain consistent with the database and workflow design.

Non-negotiable rules:
- Derived states such as “por facturar”, “por cobrar”, and “pagada” must be computed from source data rather than stored as independently managed fields.
- The vehicle identifier rule applies: `patente` is the primary identifier of each vehicle and is validated consistently in the app and schema.
- Fleet and driver compliance management is part of the core system: legal-document expiration tracking for vehicles and drivers must be visible, actionable, and integrated into operational alerts.
- Driver and fleet records cannot be treated as secondary metadata; reminders for technical inspection, **SOAP** (the Chilean mandatory insurance — not "SOAT", which is another country's), permits, licenses, and related compliance dates must be supported as a first-class operational need.
- Period filters are global app state; changes in period selection affect the app’s data context and must be preserved consistently across the UI.
- The app’s operating model is: cotización → viajes programados → facturas → cobros. Any new feature must respect that flow and not create alternative inconsistent states.
- The system must support a company-wide financial view by month, aggregating operational, billing, and cost data so leadership can evaluate the business health of the company as a whole.
- The system is for internal management only; do not reintroduce services or flows removed by the business decision (for example, the old internal/altiplano or cruise workflows remain out of scope unless the domain explicitly reauthorizes them).

### VI. Testing and validation happen before completion
The repo includes an automated test suite under `pruebas/` and a test runner configured in `package.json`.

Non-negotiable rules:
- TDD applies to bug fixes and feature work: add or update the failing test that captures the behavior, implement the fix, then validate the relevant suite.
- Do not claim completion without running the actual validation commands for the affected area.
- The project’s default verification commands are:
  - `npm run lint`
  - `npm test`
- For data/domain changes, validate the relevant schema/data scripts or business-specific checks in `pruebas/` before merging.

## Additional Constraints

### Technology stack
- Next.js 16 (App Router)
- React 19
- TypeScript 5 with strict mode enabled
- Tailwind CSS v4
- Supabase PostgreSQL + Authentication + Storage
- Node-based test runner for `pruebas/*.test.mjs`

### Environment and deployment constraints
- Local configuration uses `.env.local` and environment variables such as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Secrets must not be committed to the repository.
- Production deployment is aligned with Vercel, with Supabase environment values injected there separately.

### Code quality constraints
- Keep fixes minimal and targeted; avoid broad refactors while working on a localized change.
- Prefer existing project patterns over introducing hidden abstractions, framework churn, or new libraries without need.
- Use existing UI conventions, theme tokens, and layout shell patterns instead of creating duplicate styling systems.
- Generated files such as `.next/` and build output must not be treated as source of truth.

## Development Workflow

1. Check the relevant architecture files first: `AGENTS.md`, `README.md`, `src/app/`, `src/lib/`, `src/components/`, and the active feature area.
2. Keep each change aligned with the existing folder and naming conventions.
3. Write or update the failing test before making the implementation change when the behavior is testable.
4. Validate the targeted business/domain behavior and then run the relevant project checks.
5. Do not merge or declare completion without lint/test evidence from the repository’s configured commands.

## Governance
This Constitution supersedes ad hoc coding preferences. Any change to architecture, security model, folder conventions, or validation requirements must be documented in the project rules and reflected in the implementation and tests before release.

All contributors are expected to follow this constitution. The project must remain consistent with the actual runtime architecture of this repository: Next.js App Router, typed TypeScript, authenticated Supabase access, and business rules anchored in the domain model.

**Version**: 1.0.1 | **Ratified**: 2026-08-15 | **Last Amended**: 2026-08-17

Cambios de la 1.0.1 (T049, solo terminología — ningún principio cambió): el
seguro obligatorio de la flota es el **SOAP** chileno, no el SOAT. El nombre
importa porque es el que se busca en el código (`soap_venc`), en la base y en
los papeles del vehículo.
