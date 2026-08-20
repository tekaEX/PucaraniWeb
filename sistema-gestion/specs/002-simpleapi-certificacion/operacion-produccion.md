# Operar la facturación electrónica en producción

Qué mirar, cada cuánto, y qué hacer cuando algo sale mal.

Este documento existe porque en producción los errores no se arreglan con un
redeploy: un documento aceptado por el SII se anula con una nota de crédito, y
un folio consumido se declara. Lo que se puede hacer es **enterarse rápido**.

---

## 1 · Qué mirar y cada cuánto

| Qué | Dónde | Cada cuánto | Por qué |
|---|---|---|---|
| Facturas con problema en el SII | `/facturas` — pastilla roja en la fila | **Diario** | Una rechazada que se ve igual que el resto es la que alguien va a ir a cobrar |
| Facturas en «Enviada al SII» sin resolver | Abrir la fila → **Consultar estado** | Diario | El SII no responde al instante; si algo queda días en ese estado, hay un problema |
| Cuota de emisión | Configuración SII → **Probar conexión** | **Semanal, y sin falta la última semana del mes** | El tope es mensual, se reinicia el día 1 y **no se acumula** |
| Folios disponibles | Configuración SII → *Folios autorizados* | Semanal | Pedir un CAF al SII no es instantáneo |
| Folios no utilizados sin declarar | Consulta de la sección 4 | **Mensual**, antes del F29 | Es un trámite con plazo |
| Vencimiento del certificado | Calendario, aviso a 60 días | Una vez al año | Ver sección 6 |

La aplicación **no manda alertas**: hay que mirar. La campana de vencimientos
cubre los papeles de la flota, no el SII.

---

## 2 · Cuotas de SimpleAPI

El plan actual da **500 emisiones al mes**. Lo que consume cuota es **solo el
envío al SII**: timbrar, ensobrar y generar el PDF no cuentan. Una factura
emitida = 1.

El resto de los servicios tienen topes propios y más chicos (folios 20, RCV 30,
RUT 10, mapas 30).

**Al 2026-08-20 el consumo iba en 10/500**, de las pruebas de contrato.

Qué pasa si se agota: la emisión falla con un mensaje que lo dice con todas las
letras y aclara que **no se arregla esperando** — el tope se reinicia el día 1.
Es distinto del error de «demasiadas consultas seguidas», que sí se resuelve
esperando unos segundos.

Si se agota a mitad de mes hay dos caminos: ampliar el plan con SimpleAPI, o
volver a cargar facturas a mano con folio tipeado hasta el día 1. La segunda
funciona porque el camino manual nunca se sacó.

---

## 3 · Los errores que se pueden ver, y qué hacer

Los mensajes están escritos para que se entiendan sin este documento. Acá está
lo que **no** cabe en un mensaje: qué hacer después.

| Situación | Qué pasó con el folio | Qué hacer |
|---|---|---|
| Falla por datos (giro, comuna, montos) | **No se consumió** | Corregir y volver a emitir |
| «El folio N quedó consumido» | **Se perdió** | Corregir, volver a emitir (toma el siguiente) y **declarar el N** (sección 4) |
| «El documento quedó timbrado con el folio N» | Consumido pero **el documento sirve** | Botón **Reintentar envío**: manda el mismo documento sin gastar otro folio |
| «El SII recibió el documento pero no se pudo actualizar la factura» | Consumido y **el documento está en el SII** | Anotar folio y track id del mensaje. La factura quedó desincronizada: corregirla a mano. **No volver a emitir** — sería un duplicado |
| Rechazada por el SII | Consumido | Leer la glosa, corregir el dato y emitir de nuevo. Declarar el folio rechazado |
| Aceptada con reparos | Consumido, documento **válido** | No hay que reemitir. Corregir para las siguientes |
| Trabada en «Emitiendo…» más de unos minutos | Indeterminado | Ver sección 5 |

---

## 4 · Folios no utilizados

Todo folio consumido que no terminó en un documento válido hay que declararlo al
SII.

Desde la migración `0055` quedan registrados en una tabla, no dentro del texto
de un mensaje. La lista de lo pendiente sale de:

```sql
select ambiente, tipo_dte, folio, motivo, created_at::date as fecha
  from sii_folios_no_utilizados
 where declarado_at is null
 order by ambiente, tipo_dte, folio;
```

Al declararlos en el SII, marcarlos:

```sql
update sii_folios_no_utilizados
   set declarado_at = now()
 where folio = <N> and tipo_dte = <T> and ambiente = 'produccion';
```

> Un folio que se declara y no se marca vuelve a aparecer en la lista del mes
> siguiente. Uno que se marca sin declarar desaparece de la vista y sigue
> pendiente ante el SII — de los dos errores, ese es el caro.

---

## 5 · Una factura trabada en «Emitiendo…»

`emitiendo` es el cerrojo que impide que dos pestañas emitan la misma factura.
Se pone antes de pedir el folio y se levanta al terminar, salga bien o mal.

Si queda puesto es porque el proceso se cortó en el medio — se cayó el servidor,
se cerró el navegador durante una emisión larga. La factura no se puede emitir
ni reintentar mientras siga así.

**Antes de tocar nada, averiguar si el folio salió o no:**

```sql
select folio, estado, estado_sii, sii_track_id, sii_xml_path
  from facturas where id = '<id>';
```

- **Con `sii_track_id`** → el documento LLEGÓ al SII. No reemitir. Corregir el
  estado a mano y consultar el track id.
- **Con `folio` y `sii_xml_path`, sin track id** → quedó timbrado sin enviarse.
  Poner `estado_sii = 'error'` y usar **Reintentar envío**.
- **Con `folio` y sin `sii_xml_path`** → el folio se quemó antes de timbrar.
  Poner `estado_sii = 'error'`, registrarlo en `sii_folios_no_utilizados` y
  emitir de nuevo.
- **Sin `folio`** → no se alcanzó a consumir nada. `estado_sii = null` y a
  emitir normalmente.

---

## 6 · El certificado vence

Es la falla más tonta y más frecuente: un día deja de emitir y nadie sabe por
qué. La firma electrónica dura **un año**.

- Anotar la fecha de vencimiento en `certificacion-acta.md` y en el calendario,
  **con aviso a 60 días**.
- Renovarlo es comprarlo de nuevo y volver a cargarlo en Configuración SII. Los
  folios no se tocan: el CAF es independiente del certificado.
- El sistema **no avisa** de esto.

---

## 7 · Volver atrás

No existe «deshacer una emisión». Lo que existe es contener el daño.

**Si algo sale mal en producción y no se sabe qué:**

1. **Dejar de emitir.** Configuración SII → *Ambiente* → **Volver a
   certificación**. No pide confirmación: es la dirección segura. Desde ahí se
   puede seguir probando sin generar documentos reales.
2. **No borrar facturas.** Una factura borrada se lleva el rastro del folio, y
   el folio se consumió igual. Los viajes vuelven solos a «por facturar».
3. **Identificar qué salió.** Las que tienen `sii_track_id` llegaron al SII:
   esas existen aunque la pantalla diga otra cosa.
   ```sql
   select folio, estado, estado_sii, sii_track_id, sii_enviado_at
     from facturas
    where sii_ambiente = 'produccion' and sii_track_id is not null
    order by sii_enviado_at desc;
   ```
4. **Avisar al responsable tributario** — contador o representante legal — con
   la lista de folios y track ids. Lo que sigue (notas de crédito, declaración
   de folios) es trámite, no software.
5. **Guardar los XML.** Están en el bucket `adjuntos` bajo `<empresa>/dte/` y
   son la evidencia de qué se envió exactamente.

**Lo que este sistema NO puede hacer**: emitir notas de crédito o débito
(56/61). Anular un documento aceptado necesita una, y hoy se hace fuera del
sistema. Es la limitación que más conviene tener presente antes de pasar a
producción.

---

## 8 · Cuando aparezca algo desconocido

Si una factura muestra **«Respuesta del SII»** con un código sin traducir,
significa que el SII contestó algo que la tabla de `src/lib/sii/estado.ts` no
tiene. La app lo muestra crudo a propósito: **nunca da por aceptada una
respuesta que no sabe leer**.

Anotar el código y la glosa y pasarlos al equipo técnico. Agregarlo es una línea
en esa tabla.
