# Acta de certificación ante el SII

**Empresa**: Transportes Pucarani · RUT `77.242.040-4`
**Ambiente**: certificación (`maullin.sii.cl`)
**Proveedor de emisión**: SimpleAPI

> **Plantilla sin llenar.** El certificado digital no sale del computador del
> cliente, así que estos casos los ejecuta el administrador o su contador
> siguiendo [`manual-carga-sii.md`](manual-carga-sii.md), y anota acá lo que
> pasó. El acta es la evidencia de que la certificación se hizo: sin ella no se
> habilita producción.

---

## 1 · Datos con los que se certificó

Se llena una vez, antes de empezar.

| Dato | Valor | Quién lo cargó | Fecha |
|---|---|---|---|
| RUT de la empresa | `77242040-4` | | |
| Razón social registrada en el SII | | | |
| Códigos de actividad económica | | | |
| Comuna | Arica | | |
| RUT del titular del certificado | | | |
| Proveedor del certificado | | | |
| Vencimiento del certificado | | | |
| N° de resolución (certificación) | `0` | | |
| Fecha de resolución | | | |
| Rango CAF tipo 33 | del ___ al ___ | | |
| Rango CAF tipo 34 (si aplica) | del ___ al ___ | | |
| **Vigencia de los folios** ⚠ | | | |

⚠ Ese último dato es el que falta para cerrar la validación de CAF vencido
(tarea T016). Pregúntelo al descargar el CAF.

---

## 2 · Casos ejecutados

Una fila por documento emitido. El track id y la glosa son la evidencia: sin
ellos no se puede demostrar qué contestó el SII.

| # | Fecha | Tipo | Folio | Cliente | Monto | Track id | Estado final | Glosa del SII |
|---|---|---|---|---|---|---|---|---|
| 1 | | 33 | | | | | | |
| 2 | | | | | | | | |
| 3 | | | | | | | | |
| 4 | | | | | | | | |
| 5 | | | | | | | | |

**Estado final** es lo que devolvió *Consultar estado*, no lo que dijo al
emitir: al emitir solo se sabe que el SII recibió el sobre.

---

## 3 · Casos que el SII pidió expresamente

Si el set de pruebas incluye casos de rechazo o de aceptación con reparos, van
acá con lo que se hizo para provocarlos.

| Caso pedido por el SII | Cómo se provocó | Resultado | Track id |
|---|---|---|---|
| | | | |

---

## 4 · Folios no utilizados

Todo folio que se consumió sin llegar a un documento aceptado. El sistema los
informa en el mensaje de error, nombrando el número.

| Folio | Tipo | Fecha | Por qué se perdió | ¿Declarado al SII? |
|---|---|---|---|---|
| | | | | |

---

## 5 · Archivos guardados

Por cada documento aceptado, el sistema deja el XML y el PDF en el
almacenamiento privado, bajo `<empresa>/dte/`.

- [ ] XML de cada documento emitido, descargado y guardado fuera del sistema
- [ ] PDF de cada documento, revisado línea por línea contra la factura
- [ ] Captura de la respuesta del SII para cada track id

---

## 6 · Verificaciones técnicas (equipo)

Se corren cuando el cliente informe que ya hay credenciales cargadas.

- [ ] `npm run test:esquema` sin diferencias
- [ ] `npm run test:datos` sin problemas nuevos
- [ ] `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` en verde
- [ ] **Confirmar la tabla `CODIGOS` de `src/lib/sii/estado.ts`** contra los
      códigos reales que devolvió el SII. Cualquiera que haya aparecido como
      «Respuesta del SII» (sin traducir) se agrega
- [ ] Comprobar que dos emisiones simultáneas dan folios distintos (caso FOL-02)
- [ ] Comprobar que un reenvío no consume folio nuevo (caso T035)

---

## 7 · Cierre

- [ ] El SII aprobó el set de pruebas
- [ ] Todos los folios no utilizados quedaron declarados
- [ ] El cliente confirma que los PDF son correctos y presentables
- [ ] Está entendido que **producción se habilita con una acción explícita** y
      que ahí cada documento es real

**Aprobado por**: ______________________  **Fecha**: ____________

**Observaciones**:
