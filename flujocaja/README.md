# Flujo de Caja

App web (PWA) para llevar mis **finanzas personales y de emprendimiento** en un solo lugar, viéndolas por separado.

- **Personal** vs **Negocio** (emprendimiento), con filtros por ámbito y período.
- **Rentabilidad por vehículo**: Suzuki Swift (arriendo Uber), Furgón Daihatsu Hijet (Starken) y Mazda Axela (uso personal + Uber, mixto).
- Registro rápido de **ingresos y gastos** en CLP, con categorías y gráficos.
- **Instalable** en el celular (iPhone/Android) y se ve como app de escritorio en el computador.
- **Sincronización** entre dispositivos con **Firebase** (login con Google) y respaldo local + export JSON/CSV.

## Estructura

| Archivo | Descripción |
|---|---|
| `index.html` | La aplicación completa (HTML + CSS + JS, sin dependencias) |
| `manifest.webmanifest` | Configuración de la PWA (instalación) |
| `service-worker.js` | Cache para funcionar sin conexión |
| `icon-*.png` | Íconos de la app |
| `GUIA.md` | Guía paso a paso: hosting, instalar en iPhone y configurar Firebase |

## Tecnología

HTML/CSS/JavaScript puro (un solo archivo) + Firebase (Authentication + Firestore) para la sincronización. No requiere compilación ni servidor: se sirve como archivos estáticos.

> Nota: la `apiKey` de Firebase en el código **no es secreta**; la seguridad la dan las reglas de Firestore y el inicio de sesión.
