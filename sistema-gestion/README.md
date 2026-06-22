# Gestión — Transportes Pucarani

Sistema web para **cotizaciones** (presupuestos numerados) y **facturación / seguimiento**
de servicios de transporte de pasajeros.

Permite:

- Crear **cotizaciones con número correlativo** automático, con ítems por día y total
  (exento de IVA por defecto).
- **Exportar la cotización a PDF y a Excel** para enviarla al cliente.
- Registrar **facturas**, **enlazarlas a su cotización**, guardar la **orden de compra (OC)**
  y adjuntar (opcional) el **PDF de la factura**.
- Ver el **estado** de cada factura: *En proceso → Por facturar → Facturada (por pagar) → Pagada*.
- Un **dashboard** con totales y la tabla de seguimiento con colores (verde = pagada, ámbar = facturada).
- **Inicio de sesión** para proteger los datos.

Construido con **Next.js 16**, **Supabase** (base de datos + login + archivos) y **Tailwind CSS**.

---

## 1) Crear el proyecto en Supabase (una sola vez)

1. Entra a <https://supabase.com> y crea una cuenta (gratis).
2. **New project** → ponle un nombre (ej. `transportes-pucarani`), elige una contraseña
   para la base de datos y la región más cercana (ej. *South America (São Paulo)*).
3. Cuando el proyecto esté listo, ve a **SQL Editor → New query** y ejecuta **en orden**
   los dos archivos de la carpeta `supabase/migrations` de este proyecto (copia todo el
   contenido de cada uno, pégalo y presiona **Run**):
   1. [`0001_init.sql`](supabase/migrations/0001_init.sql) — tablas base, permisos,
      almacenamiento de archivos y datos iniciales.
   2. [`0002_flota_costos.sql`](supabase/migrations/0002_flota_costos.sql) — choferes,
      vehículos y costos por viaje.
4. Crea tu usuario: **Authentication → Users → Add user → Create new user**. Pon tu correo
   y una contraseña. (Con eso podrás iniciar sesión en el sistema).
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

- **Configuración:** pon los datos de tu empresa, sube el logo y ajusta el próximo número
  de cotización. Esos datos aparecen en el PDF/Excel.
- **Clientes:** crea tus clientes (EPA, TPA, etc.) con su código/sección.
- **Cotizaciones:** *Nueva cotización* → agrega líneas de servicio → guardar. El número se
  asigna solo. Desde el detalle puedes **exportar PDF/Excel** y **crear una factura** ligada.
- **Facturas:** registra el servicio, su valor, la **OC**, el **N° de factura** y su
  **estado**. Al marcarla *Pagada* se completa la fecha de pago. Puedes adjuntar el PDF.
- **Vehículos y Choferes:** registra tu flota y conductores con los vencimientos de
  documentos (revisión técnica, SOAP, permiso de circulación y licencia). El sistema
  avisa cuando están vencidos o por vencer.
- **Cobranzas:** muestra cuánto te debe cada cliente, qué está vencido (+30 días) y el
  estado de cuenta por empresa.
- **Costos y utilidad:** en cada factura puedes registrar combustible, peajes y viáticos
  para ver la utilidad del viaje; el dashboard resume ingresos, costos y utilidad.
- **Dashboard:** totales (cotizado, por facturar, por cobrar, pagado), rentabilidad y
  alertas de documentos por vencer.

---

## Notas técnicas

- Para agregar más usuarios: Supabase → **Authentication → Users → Add user**.
- Los archivos (logo y PDF de facturas) se guardan en **Supabase Storage** (buckets
  `logos` y `adjuntos`).
- La numeración correlativa se controla con el campo *Próximo número de cotización* en
  **Configuración** (empezó en 1189, continuando el último presupuesto n-1188).
