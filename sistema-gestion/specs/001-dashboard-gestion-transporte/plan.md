# Implementation Plan: Dashboard de gestión para transporte

**Branch**: `001-dashboard-gestion-transporte` | **Date**: 2026-08-15 | **Spec**: `spec.md`

**Input**: Requerimiento funcional del dashboard de cotizaciones, viajes, facturación, flota y finanzas para una empresa de transporte.

## Summary

Se implementará un dashboard interno de gestión orientado a una empresa de transporte con operación de viajes especiales y taxis. La solución centraliza cotizaciones, viajes, facturas, cobros, gestión vehicular, documentación legal de choferes y vehículos, y reportes financieros mensuales. El sistema prioriza la reducción de trabajo manual y la capacidad de tomar decisiones con información consolidada.

## Technical Context

**Language/Version**: TypeScript 5, Node.js 20+

**Primary Dependencies**: Next.js 16, React 19, Tailwind CSS v4, Supabase, ESLint, Node test runner

**Storage**: Supabase PostgreSQL + Authentication + Storage

**Testing**: Node test runner sobre `pruebas/*.test.mjs`, validaciones de dominio y smoke checks manuales

**Target Platform**: Web internal dashboard (Vercel deployment target)

**Project Type**: Web application

**Performance Goals**: dashboards and list views responsive for operational data tables; monthly financial summaries under normal business usage

**Constraints**: strict TypeScript, role-based auth, domain derived states, global monthly period filter, no secret leakage, deployment through Vercel with env vars

**Scale/Scope**: management app for company operations, fleet, driver compliance, billing and monthly reporting

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- ✅ Architecture follows App Router and established repo structure: `src/app`, `src/components`, `src/lib`, `src/types`
- ✅ Security and authorization are enforced via session/role helpers and Supabase RLS expectations
- ✅ Strict TypeScript and ESLint integration are mandatory
- ✅ Directory conventions and naming patterns are already defined and aligned with the codebase
- ✅ Business rules are explicit: workflow cotización → viajes → facturas → cobros; vehicle identifier and compliance tracking are first-class
- ✅ Testing workflow is part of the project standard and must be followed before completion

No constitution violations identified for this feature. No waivers required.

## Project Structure

### Documentation (this feature)

```text
specs/001-dashboard-gestion-transporte/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── README.md
└── spec.md
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── (app)/
│   │   ├── @modal/          # slot paralelo: rutas interceptoras (.)*/nuevo
│   │   └── <sección>/       # page.tsx + *-form/accordion/panel + actions.ts
│   ├── api/
│   ├── login/
│   ├── globals.css
│   └── layout.tsx
├── components/
│   ├── app-shell.tsx
│   ├── estado-cuenta.tsx
│   ├── notificaciones.tsx
│   ├── page-header.tsx
│   ├── periodo-selector.tsx
│   └── ui/
├── lib/
│   ├── auth.ts
│   ├── cobranza.ts
│   ├── crypto.ts
│   ├── format.ts
│   ├── patentes.ts
│   ├── queries.ts
│   ├── supabase/
│   ├── utils.ts
│   ├── vencimientos.ts
│   └── ...
├── proxy.ts
├── types/
│   └── db.ts
└── ...
```

**Structure Decision**: Single project web app using the existing Next.js App Router structure with feature logic and business rules kept in `src/lib/` and UI in `src/components/`. The dashboard will extend the present pattern rather than introducing a parallel feature architecture.

**Convenciones obligatorias** (verificadas en T001, detalle en `estructura-dependencias.md`):

- Cada sección de `(app)/` sigue el patrón `page.tsx` (servidor, consulta) + componentes de cliente
  (`*-form.tsx`, `*-accordion.tsx`, `*-panel.tsx`) + `actions.ts` con `"use server"`.
- Toda alta nueva ("nuevo"/"nueva") necesita **su par de rutas**: la real bajo la sección y la
  interceptora bajo `@modal/(.)<sección>/`. Así abre como modal al navegar y como página completa
  al entrar por URL directa o recargar. Las siete altas existentes ya lo cumplen.
- Los módulos de `src/lib/` que tocan cookies, disco, cifrado o Supabase de servidor declaran
  `import "server-only"` en la primera línea; la lógica pura (`format`, `cobranza`, `vencimientos`,
  `patentes`, `form-helpers`, `utils`) queda libre para usarse en ambos lados.

## Complexity Tracking

No constitution violations require justification.

---

## Phase 0: Research and Design Inputs

### Research topics

1. Dashboard information model for quotations, trips, invoices, collections and KPIs.
2. Domain model for fleet and driver compliance tracking.
3. Requirements for monthly financial reporting aggregated by operation and taxi business.
4. Integration pattern with Supabase tables, auth, and request-scoped data access.
5. Validation approach: test coverage for business rules and monthly reporting.

### Key technical decisions

- Use the existing App Router and `src/lib` data layer; do not add new architecture layers unless required by a real domain need.
- Keep derived financial states computed from source tables instead of duplicated state fields.
- Preserve the global `periodo` concept and ensure it filters all business dashboards consistently.
- Treat legal-document expiry as a first-class operational alert queue visible in the app shell.
- Build monthly financial reporting from existing operational data rather than from a disconnected reporting database.

## Phase 1: Design outputs

### Data model focus
- `cotizaciones`
- `viajes`
- `facturas`
- `clientes`
- `vehiculos`
- `choferes`
- `perfiles`
- `gastos` / `documentos` / compliance tracking
- aggregated aggregates for dashboard and monthly financial totals

### Interface/contract focus
- Internal app routes and server actions for dashboard data queries and edits
- Data contracts for list/detail retrieval, no external API contract required unless a later feature introduces SII integration

### Quickstart validation focus
- Login and role restriction checks
- Create quotation and validate default flow
- Generate a trip and invoice from accepted quotation
- Verify compliance alerts for expired legal documents
- Validate monthly KPI totals and finanzas summary

## Result

This plan keeps the implementation aligned with the repository’s current architecture and the business goals documented in the constitution: a unified transport management dashboard for operations, billing, fleet compliance, and monthly financial management.
