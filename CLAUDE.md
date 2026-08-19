# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Static HTML website for **Transportes Pucarani**, a transportation company in Arica, Chile. Based on the BootstrapMade "Logis" template (Bootstrap 5.3.3). No build system, package manager, or server-side framework — all files are served directly from the filesystem or a static web host.

## Development

Open any `.html` file directly in a browser, or serve the root directory with any static server:

```bash
# Python
python -m http.server 8080

# Node (if npx available)
npx serve .
```

There are no build, lint, or test commands.

## Architecture

### Page structure
Each `.html` file is self-contained. Pages share identical `<head>` (vendor CSS + `assets/css/styles.css`) and `<body>` endings (vendor JS + `assets/js/main.js`). There is no templating engine — shared markup (header, footer, floating WhatsApp button) must be duplicated across pages when changed.

Pages:
- `index.html` — home (hero, nosotros, servicios, por qué elegirnos, cobertura, testimonios, FAQ, CTA)
- 7 service landing pages, one per service, linked from the nav dropdown, the 6 service cards and the footer:
  `traslado-aeropuerto-chacalluta.html`, `taxi-ejecutivo-arica.html`, `traslado-arica-tacna.html`,
  `city-tour-arica.html`, `city-tour-tacna.html`, `traslado-puerto-arica.html`,
  `traslado-artistas-arica.html`
  (the home grid shows 6 cards: Tacna transfer lives in the nav/footer only)
- `404.html` — GitHub Pages error page
- `robots.txt` / `sitemap.xml` — keep the sitemap in sync when adding or renaming pages

Landing pages all use the same skeleton: `.page-hero` (photo + breadcrumbs + H1) → `.lp-body` (2/3 content) + `.lp-aside` (sticky WhatsApp card) → FAQ accordion → `.lp-related` (internal links) → CTA → footer.

### Styling
All custom styles live in `assets/css/styles.css` (there is no `main.css`). The color scheme is controlled entirely through CSS custom properties declared at the top of that file (`--accent-color`, `--heading-color`, etc.). Applying `.dark-background` or `.light-background` to a section swaps the palette for that section. Landing-page and coverage-section styles are in the "AÑADIDOS" block at the end of the file. SCSS source is only available in the paid pro version of the template.

### SEO
Every page carries: unique `<title>` + meta description, `<link rel="canonical">`, Open Graph/Twitter tags, geo meta, and JSON-LD. The home page declares `LocalBusiness`/`TaxiService` (`@id` = `https://transportespucarani.cl/#empresa`) plus `WebSite` and `WebPage`+`FAQPage`; landing pages declare `Service` (referencing that provider `@id`), `WebPage`+`FAQPage` and `BreadcrumbList`. When the phone, email or address changes, update it in the visible HTML **and** in the JSON-LD of every page.

### Temas de búsqueda (decisión del dueño, 19-08-2026)
Los temas nuevos que se quieren posicionar (`traslado arica`, `transporte arica`, `transfer`, `taxi 24 horas`, `turismo arica`, `tour arica`, `cómo ir de arica a tacna`, `ir de compras a tacna`, `transporte con factura`) **se cubren reforzando las 9 páginas existentes: no se crean landings nuevas ni servicios nuevos**. El refuerzo va en `<title>`, meta description, H2, texto de cuerpo y preguntas frecuentes; el `<meta name="keywords">` se mantiene solo por orden, Google lo ignora.

Vehículos de cada tema:
- `index.html` → las 7 preguntas frecuentes de la home (la sección `#traslados` que también cubría estos temas fue eliminada por decisión del dueño el 19-08-2026: no reintroducirla).
- Cada landing → un H2 nuevo orientado a su búsqueda principal (`Cómo ir de Arica a Tacna`, `Qué hacer en Arica si tienes medio día`, `Ir de compras a Tacna por el día`, `Desde qué sectores de Arica salimos`, `Eventos, festivales y delegaciones`, `También a los terminales de la ciudad`, `Un taxi reservado…`) más 2-4 preguntas frecuentes.

Cada pregunta frecuente vive **dos veces**: en el HTML (`.faq-item`) y en `mainEntity` del `FAQPage` del JSON-LD. Al agregar o editar una hay que tocar las dos; el conteo debe coincidir.

Servicios que **no** se ofrecen y por lo tanto no deben aparecer: matrimonios y eventos sociales, arriendo de van/minibús sin más contexto, delegaciones deportivas o escolares como servicio propio, y traslado médico a Tacna como servicio aparte (las clínicas de Tacna son solo un destino del traslado Arica–Tacna que ya existe).

### JavaScript (`assets/js/main.js`)
A single IIFE handles all interactivity: scroll-based header/scroll-top behavior, mobile nav toggle, AOS animation init, PureCounter (animated stats), GLightbox (video/image overlays), Swiper sliders (testimonials), and FAQ accordion. Swiper instances are configured via inline `<script type="application/json" class="swiper-config">` blocks in the HTML — no separate config file.

### Vendor libraries (all local, no CDN)
- Bootstrap 5.3.3 — layout and components
- Bootstrap Icons — icon font
- Font Awesome Free — additional icons
- AOS — scroll-triggered animations (`data-aos` attributes on elements)
- PureCounter — animated number counters (`data-purecounter-*` attributes)
- GLightbox — lightbox for images/video
- Swiper — touch/responsive slider

### Contact
There is no contact form and no PHP. The conversion paths are the green **Cotizar ahora** button in the header, the sidebar card on each landing page, and the CTA section — all to WhatsApp **+56 9 9162 2929** (`wa.me/56991622929`) with a prefilled message per context. The floating WhatsApp button and the WhatsApp icon in the footer social links were removed on purpose (owner's decision): the footer shows only phone, email **nanotransportes@gmail.com** and the Facebook link (`facebook.com/PucaraniArica`, also declared in the home page JSON-LD `sameAs`).

### Alcance del servicio (importante al escribir contenido)
La empresa **no presta servicios al interior de la comuna ni al altiplano** (Azapa, Lluta, Poconchile, Putre, Parque Nacional Lauca, Lago Chungará, Codpa, Socoroma, etc.) y **no atiende pasajeros de cruceros**. La cobertura es: la ciudad de Arica (incluidos aeropuerto Chacalluta, Puerto de Arica y terminales de buses) y Tacna, Perú, cruzando la frontera. No reintroducir esos destinos ni los cruceros en textos, alt de imágenes, palabras clave ni datos estructurados.

Servicios eliminados del listado por decisión del dueño: **turismo al altiplano** (reemplazado por City Tour Tacna).

El **transporte de personal para empresas sigue vigente**, pero por decisión del dueño (19-08-2026) **no se nombra como servicio propio**: no lleva página, ni tarjeta, ni aparece en el hero ni en el `hasOfferCatalog`. Que una empresa pueda contratar queda implícito en los servicios que sí se listan, más las menciones de **factura y cuenta mensual** repartidas en los textos y en la pregunta frecuente «¿Emiten factura? ¿Puede contratarlos una empresa?» de la home.

## Key customization points

- **Brand colors**: top of `assets/css/styles.css` in the `:root` blocks
- **Logo/company name**: `<a class="logo">` in each page's `<header>` (the company name is a `<span class="sitename">`, not an `<h1>` — the `<h1>` belongs to the page content, one per page)
- **Stats counters**: `data-purecounter-end` attributes on `.purecounter` spans in `index.html`
- **WhatsApp number**: appears in all `.html` files — search for `56991622929` and `9162 2929`, and also update it in the JSON-LD `telephone` fields
- **Footer contact info**: duplicated in every page's `<footer>`
- **Services content**: service cards in the `#services` section of `index.html`, each linking to its landing page
- **Photos**: `assets/img/`. The 6 service-card photos (`chacalluta.jpg`, `taxi.jpg`, `citytour.jpg`, `transladoPuerto.jpg`, `turismo.jpg`, `serviciosEspeciales.jpg`) are real Pucarani photos — do not replace them with stock. The descriptively-named files (`conductores-profesionales-arica.jpg`, `flota-vans-transporte-pasajeros.jpg`, `traslados-24-horas-madrugada.jpg`, `ruta-arica-tacna-desierto.jpg`, `transporte-ejecutivo-arica.jpg`, `mantenimiento-flota-revision-tecnica.jpg`, `pasajero-aeropuerto-chacalluta.jpg`, `altiplano-parque-lauca-chungara.jpg`) are free stock (Unsplash) placeholders meant to be swapped for real photos, keeping the same filenames so no HTML needs editing.
- **Favicon (el logo que Google muestra en el resultado)**: `favicon.ico` en la raíz + `assets/img/favicon-{48,96,192,512}.png` + `apple-touch-icon.png`, todos cuadrados y generados desde `pucaranilogo.png`. Google exige cuadrado y múltiplo de 48px, y cachea por URL: **no renombrar ni mover estos archivos**. Se declaran con rutas absolutas (`/favicon.ico`) idénticas en las 9 páginas, más `site.webmanifest`.
- **Miniatura en Google / vista previa al compartir**: `assets/img/og-transportes-pucarani.jpg` (1200×630, recorte de `van-pucarani-portada.jpg`). Está en `og:image`, `twitter:image`, `primaryImageOfPage` y `LocalBusiness.image` de `index.html`. El mapa del hero es **fondo CSS** (`.hero-bg`), no un `<img>`, justamente para que Google no lo elija de miniatura — si vuelve a ponerse como `<img>`, el mapa volverá a aparecer en los resultados.
- **Testimonials**: the 5 testimonials in `index.html` are **written examples, not real reviews** — replace them with real client quotes (or remove the section) before treating the site as final.
