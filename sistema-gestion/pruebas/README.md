# Pruebas

```bash
npm test              # 66 pruebas, sin red ni base de datos (<1 s)
npm run test:esquema  # el esquema COMPLETO de la base real (solo lectura)
npm run test:datos    # integridad de los datos guardados (solo lectura)
```

Las pruebas importan los archivos **reales** de `src/` — no copias ni versiones
portadas. `loader.mjs` traduce lo que TypeScript resuelve y Node no (el alias
`@/…` y los imports sin extensión) y cambia por un doble solo lo que no puede
ser real dentro de una prueba: el cliente de Supabase y `next/headers`.

No hay framework de pruebas: `node:test` viene con Node.

| Archivo | Qué cubre |
| --- | --- |
| `1-periodo.test.mjs` | El filtro de mes/año y las fechas: que ninguna factura quede fuera de su periodo. |
| `2-cobranza.test.mjs` | Estado de cuenta por cliente: por cobrar, vencido, pagado, pendiente de facturar. La regla delicada es que cada factura entra al periodo por una fecha distinta según su estado. |
| `3-patentes.test.mjs` | La patente es la **clave primaria** del vehículo: guardarla en dos formatos parte el historial en dos. |
| `4-form-helpers.test.mjs` | Cómo se leen los números que escribe la gente (formato chileno de miles). Fija la trampa del punto decimal. |
| `5-vencimientos-cifrado.test.mjs` | Alertas de papeles vencidos y el cifrado de la clave del certificado del SII. |
| `esquema.mjs` | El esquema de la base contra lo que el código da por hecho. |
| `datos.mjs` | Los datos ya guardados: totales que no cuadran, fechas imposibles, referencias rotas. |

La numeración salta desde la 5 porque las pruebas de encomiendas (pago, rutas,
navegación, el almacén del teléfono) se fueron con esa parte del sistema al
proyecto Ares. Los archivos que quedaron se renumeraron de 1 a 5.

## Por qué `esquema.mjs` existe

`tsc`, `eslint` y `next build` pueden estar los tres en verde con una pantalla
entera rota: ninguno sabe qué columnas tiene la base. Pasó — una migración no
corrida dejaba sin una columna a todas las consultas de una pantalla, y en vez
de un error se veía la pantalla vacía, idéntica a un mes sin trabajo.

De ahí salieron dos cosas: este script (**correlo después de cada migración**) y
`components/ui/error-datos.tsx`, para que un error de lectura no vuelva a
disfrazarse de mes sin movimiento.

`esquema.mjs` comprueba además que las tablas `encomienda_*` **no** hayan vuelto
a aparecer: si están, alguien restauró un respaldo anterior a la migración 0036.

## Lo que estas pruebas NO cubren

- **Las policies RLS.** `test:esquema` y `test:datos` usan la clave de servicio,
  que se salta RLS. Que cada rol vea solo lo suyo se comprueba entrando con una
  cuenta de ese rol.
- **Las Server Actions de punta a punta**: necesitan una sesión de Next. Lo que
  sí está probado es toda la lógica pura que usan.
