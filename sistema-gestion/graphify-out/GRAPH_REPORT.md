# Graph Report - .  (2026-07-25)

## Corpus Check
- 162 files · ~67,168 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 664 nodes · 2245 edges · 42 communities (28 shown, 14 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 26 edges (avg confidence: 0.81)
- Token cost: 261,950 input · 0 output

## Community Hubs (Navigation)
- Choferes/Clientes/Combustible Actions
- Entity Form Components
- App Shell & Detail Panels
- List Pages & Finance Sections
- New-Entity Pages
- Viaje & Cotización Editing
- Docs & Demo Mockup
- Client Detail & Avatar Components
- TypeScript Config
- Estado Accordions (Cotización/Factura/Viaje)
- Cotización Preview & PDF
- Factura Informe & Reporting
- Dev Dependencies (Lint/Types)
- PDF/Excel Export Routes
- Core Runtime Dependencies
- Empresa Config & Cotización List
- NPM Scripts
- Taxis Module
- Root Layout
- App Icon Branding
- Vercel Scaffold Asset
- Company Logo Branding
- date-fns Dependency
- ESLint Config
- ExcelJS Dependency
- Hookform Resolvers Dependency
- Next.js Config
- React-PDF Renderer Dependency
- Supabase SSR Dependency
- Supabase JS Client Dependency
- Tailwind Merge Dependency
- PostCSS Config
- Default Next.js File Icon
- Default Next.js Globe Icon
- Default Next.js Wordmark
- Default Next.js Window Icon

## God Nodes (most connected - your core abstractions)
1. `isDemo()` - 106 edges
2. `createClient()` - 86 edges
3. `buttonClass()` - 46 edges
4. `formatCLP()` - 42 edges
5. `formatDate()` - 36 edges
6. `sReq()` - 35 edges
7. `s()` - 25 edges
8. `PageHeader()` - 23 edges
9. `getPeriodo()` - 22 edges
10. `Card()` - 21 edges

## Surprising Connections (you probably didn't know these)
- `Transportes Pucarani — Demostración (demo HTML)` --semantically_similar_to--> `Modo demostración (sin Supabase configurado)`  [INFERRED] [semantically similar]
  demo/transportes-pucarani-demo.html → README.md
- `Demo status badge classes (b-green/b-amber/b-red/b-blue/b-gray)` --semantically_similar_to--> `Badges de estado (Factura/Cotización/Vencimientos)`  [INFERRED] [semantically similar]
  demo/transportes-pucarani-demo.html → DESIGN-BRIEF.md
- `Demo Dashboard panel (KPIs, alertas de documentos, últimos servicios)` --semantically_similar_to--> `Flujo: cotizaciones → viajes → facturación → cobranza`  [INFERRED] [semantically similar]
  demo/transportes-pucarani-demo.html → README.md
- `Demo status badge classes (b-green/b-amber/b-red/b-blue/b-gray)` --semantically_similar_to--> `Estados derivados (por facturar, por cobrar, pagada)`  [INFERRED] [semantically similar]
  demo/transportes-pucarani-demo.html → README.md
- `This is NOT the Next.js you know (AGENTS.md rule)` --conceptually_related_to--> `Next.js 16 (App Router)`  [INFERRED]
  AGENTS.md → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Design system documentation trio (brief, palettes, component inventory) driving the visual redesign** — design_brief, design_brief_paleta_a, design_brief_paleta_b, design_brief_componentes_inventario, design_brief_badges_estado [EXTRACTED 0.90]
- **Supabase migration sequence establishing v2 schema, derived states, and patente-as-PK** — readme_migracion_0006, readme_migracion_0007, readme_migracion_0008, readme_estados_derivados, readme_patente_identificador [EXTRACTED 0.90]
- **Demo HTML panels mirroring the app's core modules (Dashboard, Cotizaciones, Facturas, Cobranzas, Vehículos, Choferes)** — demo_html_dashboard_panel, demo_html_cotizaciones_panel, demo_html_facturas_panel, demo_html_cobranzas_panel, demo_html_vehiculos_panel, demo_html_choferes_panel [EXTRACTED 0.90]

## Communities (42 total, 14 thin omitted)

### Community 0 - "Choferes/Clientes/Combustible Actions"
Cohesion: 0.07
Nodes (74): POST(), TODO: confirmar el BODY exacto del request — cómo se entrega el certificado, RUTS_COMBUSTIBLE, actualizarFotoChofer(), actualizarLicencia(), eliminarChofer(), guardarChofer(), ChoferesPage() (+66 more)

### Community 1 - "Entity Form Components"
Cohesion: 0.12
Nodes (39): CredForm(), metadata, FormState, CotizacionForm(), newKey(), Row, toNum(), FormState (+31 more)

### Community 2 - "App Shell & Detail Panels"
Cohesion: 0.06
Nodes (48): FormState, ChoferAccordion(), ChoferPanel(), LicenciaForm(), metadata, AppLayout(), VehiculoAccordion(), AppShell() (+40 more)

### Community 3 - "List Pages & Finance Sections"
Cohesion: 0.11
Nodes (45): GET(), ClientesPage(), CotizacionesPage(), ESTADOS, FacturasPage(), metadata, catChip, FinanzasSecciones() (+37 more)

### Community 4 - "New-Entity Pages"
Cohesion: 0.07
Nodes (27): ChoferForm(), metadata, ClienteForm(), metadata, datosNuevaCotizacion(), metadata, NuevaCotizacionPage(), FacturaForm() (+19 more)

### Community 5 - "Viaje & Cotización Editing"
Cohesion: 0.06
Nodes (31): EditarCotizacionPage(), metadata, NuevoViajeModal(), ViajeDetallePage(), datosNuevoViaje(), metadata, NuevoViajePage(), cliRef() (+23 more)

### Community 6 - "Docs & Demo Mockup"
Cohesion: 0.07
Nodes (36): This is NOT the Next.js you know (AGENTS.md rule), sistema-gestion CLAUDE.md, Transportes Pucarani — Demostración (demo HTML), Demo Choferes panel, Demo Cobranzas panel, Demo Cotizaciones panel (lista + presupuesto/cotización n-1188), Demo Dashboard panel (KPIs, alertas de documentos, últimos servicios), Demo Facturas panel (Seguimiento / Informe tabs) (+28 more)

### Community 7 - "Client Detail & Avatar Components"
Cohesion: 0.16
Nodes (21): FotoUploader(), FormState, ClienteAccordion(), ClientePanel(), EstadoCuenta(), ChoferAvatar(), colorDe(), iniciales() (+13 more)

### Community 8 - "TypeScript Config"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 9 - "Estado Accordions (Cotización/Factura/Viaje)"
Cohesion: 0.10
Nodes (24): FormState, CotizacionEditor(), ESTADOS_COTIZACION, ItemRow, ESTADOS_FACTURA, FacturaAccordion(), FacturaEstadoControl(), rowTone() (+16 more)

### Community 10 - "Cotización Preview & PDF"
Cohesion: 0.19
Nodes (16): CotizacionPreview(), CotizacionDetallePage(), Row, Monto(), demoCotizacionCompleta(), demoViajesPorCotizacion(), formatCLP(), formatDate() (+8 more)

### Community 11 - "Factura Informe & Reporting"
Cohesion: 0.14
Nodes (17): GET(), InformePreviewPage(), metadata, InformePreview(), renderInformePDF(), CotizacionDocumento, ESTADOS_VIAJE, estadoViajeLabel() (+9 more)

### Community 12 - "Dev Dependencies (Lint/Types)"
Cohesion: 0.12
Nodes (17): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node (+9 more)

### Community 13 - "PDF/Excel Export Routes"
Cohesion: 0.21
Nodes (12): GET(), GET(), GET(), loadLogo(), LogoData, renderCotizacionPDF(), miles(), styles (+4 more)

### Community 14 - "Core Runtime Dependencies"
Cohesion: 0.13
Nodes (15): clsx, lucide-react, next, dependencies, clsx, lucide-react, next, react (+7 more)

### Community 15 - "Empresa Config & Cotización List"
Cohesion: 0.24
Nodes (8): EmpresaForm(), metadata, CotizacionAccordion(), CotRow, metadata, demoCotizaciones, demoEmpresa, Viaje

### Community 16 - "NPM Scripts"
Cohesion: 0.22
Nodes (8): name, private, scripts, build, dev, lint, start, version

### Community 17 - "Taxis Module"
Cohesion: 0.42
Nodes (7): armarHoja(), GET(), MESES, TaxiPanel(), TaxisTabla(), taxiNombreChofer(), taxiNombreCliente()

### Community 18 - "Root Layout"
Cohesion: 0.40
Nodes (3): geistMono, geistSans, metadata

### Community 19 - "App Icon Branding"
Cohesion: 0.67
Nodes (3): Next.js App Router icon.svg File Convention, Transportation/Fleet Management Visual Branding, App Icon (icon.svg)

### Community 20 - "Vercel Scaffold Asset"
Cohesion: 0.67
Nodes (3): Next.js create-next-app default public assets, Vercel (company/platform), Vercel Logo (vercel.svg)

### Community 21 - "Company Logo Branding"
Cohesion: 0.67
Nodes (3): Transportes Pucarani Logo (logo.png), sistema-gestion Application, Transportes Pucarani (Company)

## Knowledge Gaps
- **167 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+162 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `isDemo()` connect `Choferes/Clientes/Combustible Actions` to `Entity Form Components`, `App Shell & Detail Panels`, `List Pages & Finance Sections`, `New-Entity Pages`, `Viaje & Cotización Editing`, `Client Detail & Avatar Components`, `Estado Accordions (Cotización/Factura/Viaje)`, `Cotización Preview & PDF`, `Factura Informe & Reporting`, `PDF/Excel Export Routes`, `Empresa Config & Cotización List`, `Taxis Module`?**
  _High betweenness centrality (0.093) - this node is a cross-community bridge._
- **Why does `createClient()` connect `Choferes/Clientes/Combustible Actions` to `Entity Form Components`, `App Shell & Detail Panels`, `List Pages & Finance Sections`, `New-Entity Pages`, `Viaje & Cotización Editing`, `Client Detail & Avatar Components`, `Cotización Preview & PDF`, `Factura Informe & Reporting`, `PDF/Excel Export Routes`, `Empresa Config & Cotización List`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Why does `buttonClass()` connect `List Pages & Finance Sections` to `Choferes/Clientes/Combustible Actions`, `Entity Form Components`, `App Shell & Detail Panels`, `New-Entity Pages`, `Client Detail & Avatar Components`, `Estado Accordions (Cotización/Factura/Viaje)`, `Cotización Preview & PDF`, `Factura Informe & Reporting`, `Empresa Config & Cotización List`, `Taxis Module`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _167 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Choferes/Clientes/Combustible Actions` be split into smaller, more focused modules?**
  _Cohesion score 0.07429526994744386 - nodes in this community are weakly interconnected._
- **Should `Entity Form Components` be split into smaller, more focused modules?**
  _Cohesion score 0.11827956989247312 - nodes in this community are weakly interconnected._
- **Should `App Shell & Detail Panels` be split into smaller, more focused modules?**
  _Cohesion score 0.05875706214689266 - nodes in this community are weakly interconnected._