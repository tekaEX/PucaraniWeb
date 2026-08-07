# Pruebas

```bash
npm test           # 188 pruebas, sin red ni base de datos (~4 s)
npm run test:esquema  # el esquema COMPLETO de la base real (solo lectura)
npm run test:datos    # integridad de los datos guardados (solo lectura)
npm run test:base     # el esquema de encomiendas en detalle (solo lectura)
```

Las pruebas importan los archivos **reales** de `src/` — no copias ni versiones
portadas. `loader.mjs` traduce lo que TypeScript resuelve y Node no (el alias
`@/…` y los imports sin extensión) y cambia por un doble solo lo que no puede
ser real dentro de una prueba: el cliente de Supabase y `next/headers`.

No hay framework de pruebas: `node:test` viene con Node.

| Archivo | Qué cubre |
| --- | --- |
| `1-pago.test.mjs` | `lib/encomiendas/pago.ts` — qué regla rige cada día, cuánto se paga, cómo se agrupa la actividad. **Es la plata.** |
| `2-rutas.test.mjs` | `lib/rutas.ts` — orden de paradas, trazado por tramos, navegación. Mapbox se sustituye con un doble de `fetch`. |
| `3-almacen.test.mjs` | `lib/encomiendas/local/` — el teléfono del chofer, sobre una IndexedDB real (`fake-indexeddb`). Jornada completa, regenerar la ruta, doble toque. |
| `4-envio.test.mjs` | La cola offline: nada se borra del teléfono sin confirmación del servidor. |
| `5-periodo.test.mjs` | El filtro de mes/año y las fechas: que ningún día de pago quede fuera de su periodo. |
| `6-voz.test.mjs` | Qué voz se elige para hablar según las que tenga instaladas el teléfono. |
| `7-navegacion.test.mjs` | Simula manejar un tramo **real** de Arica (`fixtures/tramo-arica.json`, 9 maniobras, 3,6 km) y comprueba que el cartel avanza solo por todas las maniobras y que salirse del camino se detecta. Es lo que reemplazó a consultar Mapbox cada 150 m. |
| `9-cobranza.test.mjs` | Estado de cuenta por cliente: por cobrar, vencido, pagado, pendiente de facturar. La regla delicada es que cada factura entra al periodo por una fecha distinta según su estado. |
| `10-patentes.test.mjs` | La patente es la **clave primaria** del vehículo: guardarla en dos formatos parte el historial en dos. |
| `11-form-helpers.test.mjs` | Cómo se leen los números que escribe la gente (formato chileno de miles). Fija la trampa del punto decimal. |
| `12-vencimientos-cifrado.test.mjs` | Alertas de papeles vencidos y el cifrado de la clave del certificado del SII. |
| `13-uuid.test.mjs` | Los ids que genera el teléfono: versión, variante, unicidad y orden temporal. De ahí depende que reenviar no duplique. |
| `8-orden-paradas.test.mjs` | **Calidad** del orden de las paradas, no solo que sea una permutación válida: hasta 9 paradas se compara contra el óptimo real calculado por fuerza bruta (implementación independiente de la del código). Cubre también la matriz de calles asimétrica, que es la que rompe los algoritmos que suponen que ir y volver cuestan igual. |
| `base.mjs` | El esquema de la base contra lo que el código da por hecho. |

El fixture se capturó una vez de la API real. Para renovarlo hace falta el token
en `.env.local` y volver a pedir el mismo tramo (empresa → centro de Arica).

## Por qué `base.mjs` existe

`tsc`, `eslint` y `next build` pueden estar los tres en verde con el panel
entero roto: ninguno sabe qué columnas tiene la base. Pasó — la migración `0028`
agregaba `encomienda_actividad.origen`, no se había corrido, todas las consultas
del panel fallaban y la pantalla mostraba *"No hay actividad registrada en este
periodo"* con los KPI en `$0`, que es exactamente lo que se ve un mes en que el
conductor no salió nunca. Había 16 entregas registradas.

De ahí salieron dos cosas: este script (**correlo después de cada migración**) y
`components/ui/error-datos.tsx`, para que un error de lectura no vuelva a
disfrazarse de mes sin trabajo.

## Lo que estas pruebas NO cubren

- **Las policies RLS.** `test:base` usa la clave de servicio, que se salta RLS.
  Que el chofer pueda insertar su actividad solo se comprueba de verdad
  marcando una entrega desde su teléfono y viéndola aparecer en
  `/encomiendas/dia`.
- **GPS, voz, giro del mapa y el avance de parada en la calle.** Eso se prueba
  manejando (ver `PRUEBA-RECORRIDO.md`).
- **Las Server Actions de punta a punta**: necesitan una sesión de Next. Lo que
  sí está probado es toda la lógica pura que usan.
