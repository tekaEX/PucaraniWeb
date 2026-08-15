# Gestión — Transportes Pucarani

Sistema web (ERP interno) para gestionar la operación de una empresa de transporte de
pasajeros: **cotizaciones → viajes → facturación → cobranza**, con costos y finanzas.

Permite:

- Crear **cotizaciones con número correlativo** automático (ítems por día, exento de IVA
  por defecto) y **exportarlas a PDF y Excel**. Al **aceptar** una cotización, sus líneas
  se convierten automáticamente en **viajes programados**.
- Registrar **viajes** (la operación): cliente, fechas, **choferes y buses asignados**
  (varios por viaje) y **costos** (combustible, peajes, viáticos) con su utilidad.
- Emitir **facturas** que agrupan uno o varios viajes, con su **folio**, tipo de DTE y
  adjunto PDF opcional. Los estados son **derivados** (no se declaran a mano): un viaje
  realizado sin factura está *por facturar*; una factura emitida sin pago está *por cobrar*;
  con fecha de pago pasa a *pagada*.
- **Dashboard** unificado con KPIs del periodo, tendencia de 6 meses e ingresos/egresos.
- **Estado de cuenta por cliente** (cobranzas): cuánto te deben, qué está vencido (+30 días)
  y el detalle de facturas y viajes por facturar.
- **Gastos de flota** por vehículo (manual o importados del SII) y alertas de vencimientos
  de documentos (revisión técnica, SOAP, permiso, licencias) en una **campana** siempre visible.
- **Periodo global** (mes/año) que filtra toda la app y edición **inline con autoguardado**
  en cada lista.
- **Inicio de sesión** con roles (admin / operador / contador / chofer) para proteger los datos.

Construido con **Next.js 16** (App Router), **React 19**, **Supabase** (PostgreSQL + login +
archivos) y **Tailwind CSS v4**.

---

## 1) Crear el proyecto en Supabase (una sola vez)

1. Entra a <https://supabase.com> y crea una cuenta (gratis).
2. **New project** → ponle un nombre (ej. `transportes-pucarani`), elige una contraseña
   para la base de datos y la región más cercana (ej. *South America (São Paulo)*).
3. Cuando el proyecto esté listo, ve a **SQL Editor → New query** y ejecuta **en orden**
   los archivos de la carpeta `supabase/migrations` (copia el contenido de cada uno,
   pégalo y presiona **Run**). Pégalos **directamente desde el editor de código** (no por
   la consola) para no corromper los acentos:
   - `0001` … `0005` — esquema base v1 (histórico).
   - [`0006_esquema_v2.sql`](supabase/migrations/0006_esquema_v2.sql) — **rediseño v2**
     (viajes separados de facturas, estados derivados, roles/RLS). Es destructivo y deja
     la base lista; los anteriores quedan como historia.
   - [`0007`](supabase/migrations/0007_gastos_por_patente.sql) y
     [`0008_patente_identificador.sql`](supabase/migrations/0008_patente_identificador.sql)
     — la **patente pasa a ser el identificador del vehículo** (PK) y vincula los gastos
     del SII automáticamente.

   La numeración salta (`0017`–`0019`, `0021`–`0029`, `0031`–`0035`): esas migraciones
   creaban y ajustaban las tablas `encomienda_*`, que se fueron al proyecto Ares junto
   con el reparto. Los huecos son a propósito y no hay nada que reponer — correr los
   archivos que quedan, en orden, deja la base completa. Los números no se
   renumeraron porque en la base ya instalada están registrados con el número viejo.

   Opcionales: [`seed_demo.sql`](supabase/seed_demo.sql) carga datos de prueba realistas
   (evergreen, relativos a hoy); [`fix_encoding.sql`](supabase/fix_encoding.sql) repara
   acentos si algún `.sql` se ejecutó con codificación equivocada.
4. Crea tu usuario: **Authentication → Users → Add user → Create new user**. Pon tu correo
   y una contraseña (el primer usuario queda como **admin**). Con eso inicias sesión.
5. Copia tus credenciales en **Project Settings → API**:
   - **Project URL** → será `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** (clave pública) → será `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## 2) Ejecutar en tu computador

Requisitos: tener **Node.js** instalado (ya lo está en este equipo).

1. Copia el archivo `.env.example` como `.env.local` y pega tus credenciales de Supabase:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-clave-anon
   ```

2. Instala dependencias (solo la primera vez) y levanta el sistema:

   ```bash
   npm install
   npm run dev
   ```

3. Abre <http://localhost:3000> e inicia sesión con el usuario que creaste en Supabase.

---

## 3) Subir el código a GitHub

1. Crea un repositorio nuevo en <https://github.com> (puede ser privado).
2. En esta carpeta, ejecuta:

   ```bash
   git init
   git add .
   git commit -m "Sistema de gestión Transportes Pucarani"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
   git push -u origin main
   ```

> El archivo `.env.local` **no** se sube (está protegido). Las credenciales se cargan
> aparte en Vercel (siguiente paso).

---

## 4) Publicar en internet con Vercel

1. Entra a <https://vercel.com> y crea una cuenta (puedes usar tu cuenta de GitHub).
2. **Add New → Project** → importa el repositorio que subiste.
3. En **Environment Variables**, agrega las mismas dos variables de tu `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. **Deploy**. En ~1 minuto tendrás una URL del tipo `https://tu-proyecto.vercel.app`.

Cada vez que hagas `git push`, Vercel actualiza el sitio automáticamente.

---

## 5) Conectar tu dominio de GoDaddy

1. En Vercel: **Project → Settings → Domains → Add** y escribe tu dominio
   (ej. `transportespucarani.cl` o `app.transportespucarani.cl`).
2. Vercel te mostrará los registros DNS a configurar. En **GoDaddy → Mis productos →
   DNS** del dominio, agrega lo que indique Vercel:
   - Para un **subdominio** (recomendado, ej. `app.tudominio.cl`): un registro **CNAME**
     `app` → `cname.vercel-dns.com`.
   - Para el **dominio raíz** (`tudominio.cl`): un registro **A** `@` → la IP que indique
     Vercel (normalmente `76.76.21.21`).
3. Espera unos minutos a que el dominio se verifique (a veces hasta 1 hora). Listo.

---

## 6) Cómo se usa

El menú está agrupado en **Operación** (Cotizaciones, Viajes, Facturas) y **Datos**
(Vehículos, Choferes, Clientes), con el **Dashboard** arriba. La barra superior tiene el
**selector de periodo** (mes/año) y la **campana** de alertas, visibles en toda la app.
Todo se **edita en línea** (clic en una fila → se despliega) y se **autoguarda**; los
botones "Nuevo…" abren una **ventana modal**.

- **Configuración:** datos de tu empresa, logo y próximo número de cotización (aparecen en
  el PDF/Excel).
- **Cotizaciones:** *Nueva cotización* → agrega líneas → el número se asigna solo. Exporta
  **PDF/Excel** y, al marcarla **Aceptada**, se generan sus **viajes programados**.
- **Viajes:** la operación diaria. Marca un viaje como **Realizado** (queda *por facturar*),
  asígnale choferes/buses y registra sus costos para ver la utilidad.
- **Facturas:** crea una factura, elige los **viajes que cubre** y su **folio**. La pastilla
  de estado marca **Por cobrar → Pagada** (registra el pago con fecha de hoy).
- **Vehículos y Choferes:** tu flota y conductores con los vencimientos de documentos
  (revisión técnica, SOAP, permiso, licencia). Las alertas salen en la **campana**.
- **Clientes:** cada cliente muestra su **estado de cuenta** (por facturar, por cobrar,
  vencido, pagado) con el detalle de facturas y viajes — reemplaza la antigua "Cobranzas".
- **Dashboard:** KPIs del periodo (cotizado, por facturar, por cobrar, pagado, ingresos,
  costos, utilidad), tendencia de 6 meses, egresos por vehículo/categoría e ingresos por
  cliente.

---

## Notas técnicas

- **Estados derivados:** los estados (*por facturar*, *por cobrar*, *pagada*) no se guardan;
  se calculan de los datos (viaje sin factura, factura sin fecha de pago, etc.). Una sola
  fuente de verdad, sin desincronización.
- **Patente = identificador del vehículo:** la patente es la clave primaria de `vehiculos`
  (formato `ABCD-12` / `AB-1234`, validado en la app y en la base). Los gastos del SII se
  vinculan solos por patente.
- Usuarios: Supabase → **Authentication → Users → Add user**. Roles en la tabla `perfiles`.
- Archivos (logo, fotos, PDF de facturas, certificados) en **Supabase Storage**; los
  buckets `adjuntos` y `certificados` son privados (se acceden con URL firmada).
- Correlativo de cotizaciones: campo *Próximo número de cotización* en **Configuración**
  (empezó en 1189, continuando el último presupuesto 1188).
