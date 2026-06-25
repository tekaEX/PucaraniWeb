# Design Brief — Sistema de Gestión · Transportes Pucarani

> Documento para pegar en **claude.ai/design** como punto de partida del rediseño.
> Describe la app real (no es un diseño desde cero): contexto, tokens, componentes y
> restricciones. La idea es rediseñar el sistema visual y luego llevarlo al código
> (Next.js 16 + Tailwind CSS v4).

---

## 1. Contexto del producto

- **Qué es:** sistema de gestión interna (ERP a medida) para una empresa de transporte
  de personal y turismo en Arica, Chile.
- **Usuarios:** equipo administrativo interno (pocas personas, uso frecuente).
- **Plataforma:** escritorio principalmente, también móvil. Hay **mucha tabla y datos densos**.
- **Stack:** Next.js 16 + React 19 + Tailwind CSS v4. Tema basado en **variables CSS**
  (un solo lugar controla la paleta).
- **Idioma de la interfaz:** español.

## 2. Módulos / pantallas

| Módulo | Contenido |
|--------|-----------|
| Dashboard | KPIs (cotizado, por cobrar, pagado, utilidad), alertas de documentos, tabla de últimos servicios |
| Cotizaciones | Lista, formulario con líneas de detalle, vista, exporta PDF/Excel |
| Facturas | Lista con filtros, formulario, seguimiento de estado |
| Cobranzas | Cuentas por cobrar |
| Vehículos | Flota + vencimientos de documentos (rev. técnica, SOAP, permiso) |
| Choferes | Conductores + licencias |
| Clientes | Base de datos de clientes |
| Configuración | Datos de la empresa |
| Login | Autenticación |

## 3. Sistema de diseño actual (tokens)

### Paleta A — Identidad original (azul Pucarani)
```
--background      #f4f6f9   (gris claro frío)
--foreground      #1a2230
--card            #ffffff
--border          #e2e7ee
--muted           #6b7686
--brand           #1d4e89   (azul)
--brand-dark      #163c6b
--accent          #c79a3a   (dorado)
```

### Paleta B — Variante prototipada (teal, estilo "Claude Design" / app Flujo de Caja)
```
--background      #f3f3f1   (blanco cálido)
--foreground      #1c1c1a
--card            #ffffff
--border          #e6e6e0
--muted           #6f6f66
--brand           #0f766e   (teal)
--brand-dark      #0b5d56
--accent          #a87b3e   (dorado cálido)
--radius          16px      (esquinas redondeadas, botones tipo pastilla)
--shadow-soft     0 1px 2px rgba(25,25,20,.03), 0 4px 16px rgba(25,25,20,.04)
```

- **Tipografía:** Geist Sans (UI) + Geist Mono (números/código).
- **Radios actuales:** 8–16px. **Sombras:** suaves.

## 4. Inventario de componentes a rediseñar

- **Botones** — variantes: `primary`, `secondary`, `outline`, `ghost`, `danger`;
  tamaños: `sm`, `md`, `lg`, `icon`.
- **Tarjetas** — `Card` + `CardHeader` + `CardTitle` + `CardBody`.
- **Badges de estado** (deben comunicar significado por color):
  - Factura: *en proceso* (gris), *por facturar* (azul), *facturada* (ámbar), *pagada* (verde).
  - Cotización: *borrador*, *enviada*, *aceptada*, *rechazada*.
  - Vencimientos: *vigente* (verde), *por vencer* (ámbar), *vencido* (rojo).
- **Formularios** — `Input`, `Select`, `Textarea`, `Label` (con estado de foco).
- **Barra lateral** de navegación (fondo oscuro de marca, ítem activo resaltado;
  drawer en móvil).
- **Tablas de datos** — encabezado, filas con tono según estado, hover.
- **PageHeader** — título + descripción + botones de acción.

## 5. Restricciones / requisitos

1. Los **colores de estado** deben seguir comunicando significado
   (verde = ok/pagado, ámbar = pendiente, rojo = vencido/alerta).
2. Debe verse bien con **tablas densas** y mucha información en pantalla.
3. **Responsive:** sidebar en escritorio, menú drawer en móvil.
4. Implementable con **Tailwind v4**: tokens como variables CSS + utilidades.
   Evitar gradientes complejos o efectos difíciles de portar a Tailwind.
5. Marca: **Transportes Pucarani** (transporte de personal y turismo, Arica).

## 6. Objetivo del rediseño

> (Completar según lo que busques.) Ejemplo: "Estilo limpio y moderno tipo app,
> esquinas redondeadas, botones tipo pastilla, sombras suaves, sensación ordenada
> para uso diario intensivo. Tomar como referencia la Paleta B (teal)."

---

## 7. Prompt sugerido para pegar en claude.ai/design

```
Quiero rediseñar el sistema de diseño de una app de gestión interna (ERP) para una
empresa de transporte. Adjunto el brief con contexto, paleta actual y componentes.

Objetivo: un look limpio y moderno tipo app — esquinas redondeadas, botones tipo
pastilla, sombras suaves, base de color teal (#0f766e). Debe funcionar para tablas
densas y mantener colores de estado con significado (verde=pagado, ámbar=pendiente,
rojo=vencido).

Genérame un sistema de diseño con: tokens de color (variables CSS), tipografía,
radios y sombras, y los componentes: botones (5 variantes), tarjetas, badges de
estado, inputs/selects, sidebar de navegación y tabla de datos. Entrégame los
tokens como variables CSS y el HTML/CSS de cada componente.
```
