# Research: Dashboard de gestión para transporte

## Decision: architecture and business boundaries

**Decision**: Use the existing Next.js App Router structure in this repository and extend current modules instead of introducing another top-level app pattern.

**Rationale**: The project already has a clear structure under `src/app`, `src/components`, `src/lib`, and `src/types`, and the constitution explicitly requires conformance to that architecture. The feature is a natural extension of the current admin dashboard rather than a fresh platform.

**Alternatives considered**:
- Create a separate feature folder or micro-frontend layer: rejected because it would fragment the existing app structure and bypass established patterns.
- Add generic reporting tables outside the current architecture: rejected because the company needs this reporting embedded in the same operational workflow.

## Decision: domain flow

**Decision**: Keep the business process consistent with `cotización → viajes → facturas → cobros` and avoid creating parallel inconsistent workflows.

**Rationale**: The constitution and product goal explicitly treat derived states like “por facturar”, “por cobrar” and “pagada” as computed from the source dataset. This preserves a single source of truth.

**Alternatives considered**:
- Allow manual state flags for invoice or payment status: rejected because it risks drift and inconsistent reporting.
- Treat fleet compliance as a side feature: rejected because business rules require it as an operational alert system, not an afterthought.

## Decision: compliance tracking scope

**Decision**: Vehicle and driver legal-document expiration must be first-class in the app, visible in notifications and management pages.

**Rationale**: The product requirement states that jockeying fleet and driver compliance is part of the operational need, and the constitution makes it a core business requirement.

**Alternatives considered**:
- Display expired docs only in a static report: rejected because management needs proactive alerting in the real workflow.
- Treat compliance as a future milestone: rejected because the current project already expects it as part of the operational stack.

## Decision: monthly financial reporting

**Decision**: Build financial reporting by month from the same data as operations, invoices, payments, and costs.

**Rationale**: The business value of the app includes company-level KPI visibility. Monthly summaries should be computed from the operational data so the report stays internally consistent.

**Alternatives considered**:
- Create a spreadsheet-style export without integrated dashboard reporting: rejected because it fails the “dashboard” objective and loses operational context.
- Maintain a separate reporting dataset: rejected because it introduces duplication and out-of-sync data risk.

## Decision: validation strategy

**Decision**: Use the existing `pruebas/*.test.mjs` test harness, plus targeted domain validations for quote/invoice lifecycle and compliance alerts.

**Rationale**: The project already includes a test runner and business-specific tests. This allows TDD and protects domain logic against regression.

**Alternatives considered**:
- Manual validation only: rejected because the constitution requires tests and verification before completion.
- No validation for compliance and billing state: rejected because these are central business outcomes.
