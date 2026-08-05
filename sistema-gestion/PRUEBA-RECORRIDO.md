# Prueba de recorrido — Encomiendas (app del chofer)

Guion para probar la ruta del día de punta a punta: previsualización, avance de
parada y navegación. Borrá este archivo cuando la prueba esté hecha.

---

## Ya verificado (no hace falta repetirlo)

Corrido contra las APIs reales con el token de `.env.local` y los 10 pedidos de
la **ruta de prueba B** (ver `scripts/ruta-prueba-b.sql`):

| Qué | Resultado |
| --- | --- |
| Partida (empresa: *Quinsachata 1749, Arica*) | se ubica en `-18.471152, -70.289929` |
| Las 10 direcciones | las 10 resuelven a una **puerta exacta**, con número |
| Matriz de distancias por calle (11 puntos) | OK, por calles |
| Trazado del día completo | **14,5 km · 30 min · 422 puntos de línea** |
| Orden que sale | barrido limpio sur → centro → norte, sin zigzag |
| Instrucciones paso a paso | en español, con avisos de voz |
| Tiempo total del cálculo | ~1,5 s |
| Sugerencias de dirección | Mapbox + OpenStreetMap, solo resultados de Arica |
| Token de Mapbox | sin restricción de URL → funciona por túnel |
| `tsc`, `eslint`, `next build` | limpios |

La ruta B recorre el eje norte-sur (Pedro Aguirre Cerda → Capitán Ávalos) y es a
propósito distinta de la anterior, que se concentraba en el centro y la
costanera (esa daba 30,3 km · 52 min con 11 paradas).

Lo que **no** se puede verificar sin recorrer: GPS real, voz, giro del mapa y el
avance de parada en la calle.

---

## Quién entra

| | |
| --- | --- |
| Chofer | **Etian** — `sonylink16@gmail.com` (vinculado, con categoría *encomiendas*) |
| Sin contraseña | Panel → Choferes → ficha de Etian → *Reenviar invitación* → link a `/set-password` |

Los otros dos choferes (Cristian, Maickol) **no** sirven para esta prueba: no
tienen usuario vinculado ni la categoría asignada.

---

## A) Prueba de escritorio (5 minutos, sin salir a la calle)

Es la que verifica el bug arreglado — el que se reproducía **justo por estar
quieto**.

1. `npm run dev` → abrir `http://localhost:3000` (o el puerto que imprima Next si
   ese está ocupado). `localhost` cuenta como origen seguro, así que el GPS del
   navegador funciona.
2. Entrar con el chofer. Cae en `/conductor` → *Encomiendas*.
3. **Fijar una ubicación falsa**: `F12` → menú `⋮` → *More tools* → *Sensors* →
   *Location* → *Other…* → latitud `-18.471152`, longitud `-70.289929` (la
   dirección de la empresa). Recargar la página y permitir la ubicación.
4. Tocar **“Cargar tus 10 pedidos pendientes”**. Copia los pedidos de la base al
   navegador (IndexedDB); no los borra de la base.
5. La ruta se propone sola: la hoja se cierra, el mapa encuadra el recorrido con
   **línea cortada verde** y numera las 10 paradas, y abajo aparece el panel con
   km, minutos y el orden. Revisar que el orden se entienda y tocar
   **“Usar esta ruta”**. La línea pasa a gris (ruta del día) y el mapa vuelve al
   modo manejo.
6. **La prueba del bug**, sin tocar la ubicación en ningún momento:
   *Llamar* → *Contestó* → **Pedido finalizado**.
   - ✅ La tarjeta pasa al destinatario siguiente **y** el cartel de arriba y la
     línea azul se recalculan al nuevo destino en 1–2 s.
   - ❌ Lo que pasaba antes: la línea azul y el cartel se quedaban clavados en la
     casa ya entregada hasta que el chofer se alejaba 150 m.
   Repetirlo tres o cuatro paradas seguidas.
7. Mover la ubicación en *Sensors* a media ruta (por ejemplo `-18.479`,
   `-70.317`) y comprobar que el camino se vuelve a trazar desde ahí.
8. **Autocompletado**: subir la hoja → *Agregar pedido* → en Dirección escribir
   `chacab`, `18 de sept`, `diego portales 2000`, `terminal rodoviario`. Debe
   ofrecer direcciones de Arica con el detalle abajo; al elegir una queda el
   tilde verde y *“Ubicada en el mapa”*. Guardar y **Regenerar ruta**: el pedido
   nuevo entra en la propuesta.
   - Las que traen la etiqueta **OSM** vienen de OpenStreetMap en vivo (medio
     segundo después que las de Mapbox). Ahí se ve si una corrección hecha en OSM
     ya está llegando a la app: `terminal rodoviario` y `diego portales 2000` solo
     los resuelve OSM.
   - Las marcadas *“sin número”* son la calle, no la puerta: la parada queda a
     mitad de cuadra.

> En el escritorio, *Llamar* abre el diálogo de “¿abrir aplicación externa?” del
> navegador: es normal, cancelalo y seguí. En el teléfono abre el marcador con el
> número puesto (no llama solo). Los teléfonos de los pedidos de prueba son
> falsos (`+5691222000…`).

---

## B) Prueba en la calle (teléfono)

El GPS solo lo entrega el navegador en sitios **https**, así que no sirve entrar
por la IP del PC. Con el túnel (ya está permitido en `next.config.ts`):

1. En el PC: `npm run dev` y, en otra terminal, `ngrok http 3000`.
2. Copiar la URL `https://….ngrok-free.app` y abrirla en el teléfono.
3. Entrar con el chofer y **“Agregar a pantalla de inicio”**. No es opcional: en
   iPhone, un sitio abierto suelto pierde lo guardado a los 7 días sin usarse, y
   los pedidos viven en el teléfono (ver `src/lib/encomiendas/local/idb.ts`).
4. Abrir desde el ícono instalado, *Encomiendas*, y **permitir la ubicación**.
   Si dice “Permiso de ubicación denegado”, activarlo en los ajustes del
   navegador para ese sitio y volver a entrar.
5. Cargar los pedidos, revisar la propuesta, *Usar esta ruta*, y salir a
   manejar.

### Qué mirar manejando

- El punto azul con el cono se mueve y el mapa **gira** hacia donde sigue el
  camino, sin dar vueltas raras al salir.
- La voz dice las maniobras en español (botón de altavoz arriba a la derecha para
  silenciarla; la preferencia queda guardada).
- Al tocar *Pedido finalizado*, **la ruta pasa sola a la parada siguiente** y
  marca el número del que sigue.
- Con dos dedos se puede acercar/alejar sin que el mapa pelee; al arrastrar deja
  de seguir y el botón de centrar (◎) lo retoma.
- El contador *“N de 10”* avanza y, sin señal, aparece *“X registros sin
  enviar”* — que se tienen que ir solos al volver la cobertura.

### Si algo falla

| Síntoma | Dónde mirar |
| --- | --- |
| Mapa gris o “token rechazado” | `NEXT_PUBLIC_MAPBOX_TOKEN` en `.env.local`; si el token está restringido por URL, agregar el dominio de ngrok |
| “No se pudo guardar en el teléfono” | modo privado o app no instalada (ver `idb.ts`) |
| Una parada dice “Sin ubicar” | tocar el pedido y corregir la dirección eligiéndola de la lista |
| No hay sugerencias de dirección | sin señal, o menos de 3 letras escritas. El campo sigue funcionando a mano |

---

## Limpieza después de la prueba

**Importante:** cada *Contestó* / *Pedido finalizado* / omisión escribe una fila
en `encomienda_actividad`, que es de donde salen **los ingresos y la liquidación
del chofer**. Una prueba de recorrido le suma entregas al día de hoy. Para
borrarlas (Supabase → SQL Editor), con la fecha que muestre la app:

```sql
delete from encomienda_actividad
 where fecha = '2026-08-04'                                    -- el día de la prueba
   and chofer_id = (select id from choferes where nombre = 'Etian');
```

Lo demás:

- **Ruta y pedidos del teléfono**: quedan en IndexedDB. Para empezar de cero,
  DevTools → *Application* → *IndexedDB* → `pucarani-encomiendas` → *Delete
  database*; en el teléfono, borrar los datos del sitio.
- **Los 10 pedidos de la base**: siguen ahí (el botón copia, no mueve), así que
  el botón de cargar vuelve a aparecer en un teléfono limpio. Para volver a
  empezar con otro juego de direcciones, `scripts/ruta-prueba-b.sql` es el molde:
  cambiar las diez filas del `insert` y correrlo de nuevo.
- **Migración 0027**: no la corras hasta después de las pruebas — retira
  `encomienda_pedidos` y con eso desaparece el botón que carga los pedidos de
  prueba.
