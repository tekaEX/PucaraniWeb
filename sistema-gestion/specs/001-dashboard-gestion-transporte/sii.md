# Integración con el SII — estado real y qué falta

**Expansión NO prioritaria** (T053). Este archivo existe para que nadie descubra
por accidente que la sincronización con el SII está a medio camino: dice qué hay
escrito, qué está sin confirmar y qué costaría terminarlo.

Última revisión: 2026-08-17.

---

## Qué existe hoy

La app **no emite** documentos tributarios: emitir una factura en el sistema es
registrar una que ya se emitió por fuera. Lo único que toca el SII es una vía de
**lectura**: traer las compras de combustible del Registro de Compras y Ventas
(RCV) para que los gastos de flota no se carguen a mano.

| Pieza | Dónde | Estado |
|---|---|---|
| Endpoint de sincronización | `src/app/api/combustible/sync/route.ts` | Escrito, **sin verificar contra el servicio real** |
| Botón "Sincronizar" | `src/app/(app)/vehiculos/sincronizar-sii.tsx` | Funciona; llama al endpoint |
| Carga de credenciales | `src/app/(app)/combustible/configuracion/` | Funciona |
| Certificado + clave | tabla `sii_credenciales` + bucket privado `certificados` | Funciona |
| Cifrado de la clave | `src/lib/crypto.ts` (AES-256-GCM) | Funciona y **está probado** (`5-vencimientos-cifrado.test.mjs`) |
| Extracción de patente | `src/lib/patentes.ts` | Funciona y está probado (`3-patentes.test.mjs`) |

La parte delicada —la clave del certificado digital— es la que está **terminada
y probada**: se guarda cifrada, se descifra solo en memoria durante la llamada,
y un dato manipulado no se descifra, revienta.

## Qué está sin confirmar

Son los cuatro cabos que impiden decir que esto funciona. Los tres primeros
están marcados como TODO en el propio archivo:

1. **El cuerpo del request a SimpleAPI.** No está confirmado cómo se entrega el
   certificado: ¿`multipart/form-data` con el `.pfx`, o el `.pfx` en base64
   dentro de un JSON? Lo que hay es un placeholder.
2. **La cabecera de autorización.** `Authorization: <apiKey>`, sin saber si
   lleva prefijo (`ApiKey …`, `Bearer …`).
3. **Los RUT de los distribuidores.** `RUTS_COMBUSTIBLE` tiene **uno solo y
   marcado "(ejemplo)"**; Shell/Enex y Petrobras están comentados. Con esa
   lista, la sincronización descarta casi toda compra real. Confirmarlos es un
   trámite, pero sin eso el resultado es "0 gastos importados" y parece un error
   del código.
4. **La patente nunca se va a detectar por esta vía.** El RCV de compras trae la
   cabecera del documento, no el detalle de las líneas: no hay glosa desde donde
   leer la patente, así que todo gasto importado queda con `vehiculo_id = null`
   ("Sin asignar" en los egresos por vehículo) y hay que asignarlo a mano.
   `extraerPatente()` ya está listo para cuando exista otra vía con el detalle.

## Qué haría falta para terminarlo

En orden, y ninguno depende del código de la app:

1. Contratar/confirmar el plan de SimpleAPI y leer su documentación del RCV:
   resuelve los puntos 1 y 2 de arriba.
2. Conseguir la lista real de RUT de los distribuidores donde carga la flota
   (sale de las propias facturas de combustible ya recibidas).
3. Correr la sincronización de un día conocido y comparar contra las facturas de
   ese día. Hasta que eso pase, el botón puede devolver "0 documentos" y no hay
   forma de distinguir "no hubo compras" de "la llamada está mal armada".

## Lo que NO está en el alcance

- **Emitir DTE** (facturas electrónicas) desde el sistema. Hoy el folio y el PDF
  se cargan a mano, y así está previsto: la app lleva la cobranza, no la
  emisión.
- **Libro de ventas / propuesta F29.** No se leyó nunca ese lado del RCV.
- **Firma electrónica** de documentos propios.

El certificado digital ya cargado sirve para cualquiera de esos tres si alguna
vez se decide avanzar: la puerta que cuesta —guardar una clave privada de forma
segura— ya está construida.
