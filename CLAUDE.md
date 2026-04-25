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
Each `.html` file is self-contained. Pages share identical `<head>` (vendor CSS + `assets/css/main.css`) and `<body>` endings (vendor JS + `assets/js/main.js`). There is no templating engine — shared markup (header, footer) must be duplicated across pages when changed.

### Styling
All custom styles live in `assets/css/main.css`. The color scheme is controlled entirely through CSS custom properties declared at the top of that file (`--accent-color`, `--heading-color`, etc.). Applying `.dark-background` or `.light-background` to a section swaps the palette for that section. SCSS source is only available in the paid pro version of the template.

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

### Contact forms (`forms/`)
`contact.php` and `get-a-quote.php` depend on the **PHP Email Form** library (`assets/vendor/php-email-form/php-email-form.php`), which is only included in the paid template version. The receiving address must be set in each PHP file. SMTP config is commented out by default.

## Key customization points

- **Brand colors**: top of `assets/css/main.css` in the `:root` blocks
- **Logo/company name**: `<a class="logo">` in each page's `<header>`
- **Stats counters**: `data-purecounter-end` attributes on `.purecounter` spans in `index.html`
- **WhatsApp float button**: phone number in the `href` on `index.html` (`wa.me/56...`)
- **Footer contact info**: duplicated in every page's `<footer>`
- **Services content**: service cards in the `#services` section of `index.html`
