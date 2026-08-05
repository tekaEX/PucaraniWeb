"use client";

// Operaciones sobre el guardado local del chofer (ver ./idb.ts para el dónde y
// el por qué). Este módulo es el ÚNICO que debería tocar los stores: mantiene
// dos invariantes que si se rompen cuestan plata o confunden al chofer.
//
//  1. Cerrar una parada (entrega u omisión) guarda el estado Y encola el evento
//     para el servidor en la MISMA transacción. Si quedara el estado sin el
//     evento, el chofer perdería esa entrega en su liquidación; si quedara el
//     evento sin el estado, la parada volvería a aparecer como pendiente y se
//     contaría dos veces.
//  2. Regenerar la ruta nunca pierde lo ya cerrado en el día. Es el mismo
//     cuidado que hoy vive en generarRuta (unas 90 líneas de reconciliación en
//     el servidor, ver el comentario de la 0025); acá son diez líneas, porque
//     no hay secuencias ni claves únicas contra las que chocar.

import { uuidv7 } from "@/lib/uuid";
import {
  STORES,
  INDICE_PEDIDO_ESTADO,
  contarPorIndice,
  escribir,
  leerTodos,
  leerUno,
} from "./idb";

// ----------------------------------------------------------------------------
// Formas guardadas
// ----------------------------------------------------------------------------

/** Un pedido tiene solo dos estados, igual que en el servidor (ver 0018 y
 *  ENCOMIENDA_ESTADOS): omitir NO lo cierra, lo deja pendiente para
 *  reintentarlo otro día. Es lo que hace que los pendientes se arrastren de una
 *  jornada a la siguiente. */
export type EstadoPedidoLocal = "pendiente" | "entregado";

export type PedidoLocal = {
  /** UUIDv7 generado en el teléfono. */
  id: string;
  nombre: string;
  telefono: string;
  direccion: string;
  /** null cuando la dirección no se pudo ubicar en el mapa: el pedido igual se
   *  guarda (el chofer puede corregirla), pero no puede entrar en una ruta. */
  lat: number | null;
  lng: number | null;
  notas: string | null;
  estado: EstadoPedidoLocal;
  /** ISO. Sirve para ordenar la lista y para ver cuánto lleva sin entregarse. */
  cargadoEn: string;
};

export type EstadoLlamadaLocal = "pendiente" | "contesto" | "no_contesto";
export type EstadoEntregaLocal = "pendiente" | "entregado" | "omitido";

/** Cómo le fue a un pedido DENTRO de un día concreto. Vive en la ruta y no en
 *  el pedido porque el mismo pedido puede pasar por varios días (omitido hoy,
 *  entregado mañana). */
export type ParadaLocal = {
  pedidoId: string;
  llamada: EstadoLlamadaLocal;
  entrega: EstadoEntregaLocal;
  horaLlamada: string | null;
  horaEntrega: string | null;
};

export type RutaLocal = {
  /** "YYYY-MM-DD" en hora de Chile. Es la clave del store. */
  fecha: string;
  /** En orden de visita. */
  paradas: ParadaLocal[];
  /** Trazado por calles, [lng, lat] por punto (formato GeoJSON). null si el
   *  servicio de rutas no respondió: el mapa queda con los puntos y sin línea. */
  geometria: [number, number][] | null;
  distanciaM: number | null;
  duracionS: number | null;
  generadaEn: string;
};

/** Evento esperando salir a encomienda_actividad. Los nombres son los del
 *  dominio local; la traducción a columnas se hace al enviarlo. */
export type EventoCola = {
  /** UUIDv7: el MISMO id que va a la base, para que reenviar no duplique. */
  id: string;
  choferId: string;
  fecha: string;
  tipo: "entrega" | "omision" | "llamada";
  /** ISO. Cuándo ocurrió de verdad, que puede ser mucho antes de poder
   *  enviarlo. */
  hora: string;
};

// ----------------------------------------------------------------------------
// Pedidos
// ----------------------------------------------------------------------------

export async function leerPedidos(): Promise<PedidoLocal[]> {
  const pedidos = await leerTodos<PedidoLocal>(STORES.pedidos);
  return pedidos.sort((a, b) => b.cargadoEn.localeCompare(a.cargadoEn));
}

/** Los que todavía hay que entregar, incluidos los arrastrados de días
 *  anteriores. Es la entrada para armar la ruta. */
export async function pedidosPendientes(): Promise<PedidoLocal[]> {
  const pedidos = await leerPedidos();
  return pedidos.filter((p) => p.estado === "pendiente");
}

export type DatosPedido = {
  nombre: string;
  telefono: string;
  direccion: string;
  lat: number | null;
  lng: number | null;
  notas: string | null;
};

/** Crea (sin id) o actualiza (con id) un pedido. Devuelve el guardado. */
export async function guardarPedido(
  datos: DatosPedido,
  id?: string,
): Promise<PedidoLocal> {
  const anterior = id ? await leerUno<PedidoLocal>(STORES.pedidos, id) : null;

  const pedido: PedidoLocal = {
    ...datos,
    id: anterior?.id ?? id ?? uuidv7(),
    // Editar un pedido no lo reabre ni lo cierra: el estado solo cambia al
    // marcar la entrega.
    estado: anterior?.estado ?? "pendiente",
    cargadoEn: anterior?.cargadoEn ?? new Date().toISOString(),
  };

  await escribir([STORES.pedidos], ({ guardar }) => guardar(STORES.pedidos, pedido));
  return pedido;
}

/** Ids de todos los pedidos que ya están en el teléfono, entregados incluidos.
 *  Lo usa el traspaso desde la base para no volver a traer lo que ya está (ver
 *  ./importar.ts). */
export async function idsGuardados(): Promise<Set<string>> {
  const pedidos = await leerTodos<PedidoLocal>(STORES.pedidos);
  return new Set(pedidos.map((p) => p.id));
}

/** Inserta pedidos ya armados sin pisar los que ya existan, conservando su id y
 *  su fecha de carga original. Es la entrada del traspaso único desde la base
 *  (ver ./importar.ts); para lo que carga el chofer está guardarPedido.
 *  Devuelve cuántos se agregaron de verdad. */
export async function agregarFaltantes(pedidos: PedidoLocal[]): Promise<number> {
  const existentes = await idsGuardados();
  const faltantes = pedidos.filter((p) => !existentes.has(p.id));
  if (faltantes.length === 0) return 0;

  await escribir([STORES.pedidos], ({ guardar }) => {
    for (const pedido of faltantes) guardar(STORES.pedidos, pedido);
  });
  return faltantes.length;
}

/** Fija las coordenadas de varios pedidos de una vez, sin tocar el resto de sus
 *  datos: se usa al reintentar ubicar direcciones que habían fallado (ver
 *  ./generar-ruta.ts). Los que ya no existan se ignoran en silencio — el chofer
 *  pudo borrarlos mientras corría la geocodificación. */
export async function fijarCoordenadas(
  coordenadas: { id: string; lat: number; lng: number }[],
): Promise<void> {
  if (coordenadas.length === 0) return;
  const actuales = await Promise.all(
    coordenadas.map((c) => leerUno<PedidoLocal>(STORES.pedidos, c.id)),
  );

  await escribir([STORES.pedidos], ({ guardar }) => {
    actuales.forEach((pedido, i) => {
      if (!pedido) return;
      guardar(STORES.pedidos, { ...pedido, lat: coordenadas[i].lat, lng: coordenadas[i].lng });
    });
  });
}

/** Borra un pedido y lo saca de la ruta del día si estaba ahí. No toca eventos
 *  ya enviados: si se entregó, esa entrega ya está contada y así debe quedar. */
export async function borrarPedido(id: string, fecha: string): Promise<void> {
  const ruta = await leerUno<RutaLocal>(STORES.rutas, fecha);
  const rutaSinPedido = ruta
    ? { ...ruta, paradas: ruta.paradas.filter((p) => p.pedidoId !== id) }
    : null;

  await escribir([STORES.pedidos, STORES.rutas], ({ guardar, borrar }) => {
    borrar(STORES.pedidos, id);
    if (rutaSinPedido) guardar(STORES.rutas, rutaSinPedido);
  });
}

// ----------------------------------------------------------------------------
// Ruta del día
// ----------------------------------------------------------------------------

export function leerRuta(fecha: string): Promise<RutaLocal | null> {
  return leerUno<RutaLocal>(STORES.rutas, fecha);
}

/** Cuántos quedan por entregar. Pasa por el índice: la pantalla de inicio lo
 *  consulta para decidir si ofrece armar la ruta, y no necesita las filas. */
export function contarPendientes(): Promise<number> {
  return contarPorIndice(STORES.pedidos, INDICE_PEDIDO_ESTADO, "pendiente");
}

export type EntradaRuta = {
  fecha: string;
  /** Ids de pedido en orden de visita, tal como los calculó el ordenamiento. */
  pedidoIdsEnOrden: string[];
  geometria: [number, number][] | null;
  distanciaM: number | null;
  duracionS: number | null;
};

// Guarda la ruta del día conservando SIEMPRE lo que ya se cerró en la jornada:
// las paradas entregadas u omitidas quedan primero, en su orden original, y
// detrás va el orden nuevo con lo que falta. Sin esto, regenerar a media mañana
// para meter dos pedidos nuevos borraría el registro de lo repartido antes.
//
// El estado de LLAMADA de una parada que sigue pendiente también se conserva:
// el chofer ya llamó, no tiene por qué volver a llamar solo porque rehizo la
// ruta.
export async function guardarRuta(entrada: EntradaRuta): Promise<RutaLocal> {
  const anterior = await leerRuta(entrada.fecha);
  const cerradas = (anterior?.paradas ?? []).filter((p) => p.entrega !== "pendiente");
  const yaCerrado = new Set(cerradas.map((p) => p.pedidoId));
  const llamadaPrevia = new Map(
    (anterior?.paradas ?? []).map((p) => [p.pedidoId, p] as const),
  );

  const nuevas: ParadaLocal[] = entrada.pedidoIdsEnOrden
    .filter((pedidoId) => !yaCerrado.has(pedidoId))
    .map((pedidoId) => {
      const previa = llamadaPrevia.get(pedidoId);
      return {
        pedidoId,
        llamada: previa?.llamada ?? "pendiente",
        entrega: "pendiente",
        horaLlamada: previa?.horaLlamada ?? null,
        horaEntrega: null,
      };
    });

  const ruta: RutaLocal = {
    fecha: entrada.fecha,
    paradas: [...cerradas, ...nuevas],
    // Si el servicio de rutas no respondió, conservar el trazado anterior le
    // sirve más al chofer que un mapa en blanco (mismo criterio que hoy tiene
    // generarRuta en el servidor).
    geometria: entrada.geometria ?? anterior?.geometria ?? null,
    distanciaM: entrada.distanciaM ?? anterior?.distanciaM ?? null,
    duracionS: entrada.duracionS ?? anterior?.duracionS ?? null,
    generadaEn: new Date().toISOString(),
  };

  await escribir([STORES.rutas], ({ guardar }) => guardar(STORES.rutas, ruta));
  return ruta;
}

// ----------------------------------------------------------------------------
// Marcar en terreno — las dos operaciones que mueven plata
// ----------------------------------------------------------------------------

/** Si en todo el día no se cerró ni se llamó nada todavía, este es el primer
 *  acto en terreno: hay que dejar constancia en el servidor de que el chofer
 *  salió, aunque después no logre entregar nada (de eso depende el fijo
 *  diario). Después del primero ya no hace falta: cualquier evento del día
 *  prueba lo mismo. */
function esPrimeraAccion(ruta: RutaLocal): boolean {
  return ruta.paradas.every((p) => p.llamada === "pendiente" && p.entrega === "pendiente");
}

function evento(
  choferId: string,
  fecha: string,
  tipo: EventoCola["tipo"],
  hora: string,
): EventoCola {
  return { id: uuidv7(), choferId, fecha, tipo, hora };
}

export type Marca = {
  fecha: string;
  pedidoId: string;
  choferId: string;
};

/** Registra el resultado de llamar al destinatario. No suma ni resta entregas:
 *  solo prueba que el chofer está trabajando (ver esPrimeraAccion). */
export async function marcarLlamada(
  { fecha, pedidoId, choferId }: Marca,
  resultado: Exclude<EstadoLlamadaLocal, "pendiente">,
): Promise<void> {
  const ruta = await leerRuta(fecha);
  if (!ruta) throw new Error("No hay una ruta para ese día.");
  if (!ruta.paradas.some((p) => p.pedidoId === pedidoId)) {
    throw new Error("Ese pedido no está en la ruta del día.");
  }

  const hora = new Date().toISOString();
  const primera = esPrimeraAccion(ruta);
  const actualizada: RutaLocal = {
    ...ruta,
    paradas: ruta.paradas.map((p) =>
      p.pedidoId === pedidoId ? { ...p, llamada: resultado, horaLlamada: hora } : p,
    ),
  };

  await escribir([STORES.rutas, STORES.cola], ({ guardar }) => {
    guardar(STORES.rutas, actualizada);
    if (primera) guardar(STORES.cola, evento(choferId, fecha, "llamada", hora));
  });
}

/** Cierra una parada. "entregado" cierra también el pedido; "omitido" lo deja
 *  pendiente para reintentarlo otro día (igual que el trigger del servidor en
 *  la 0018). El evento para el servidor sale en la misma transacción. */
export async function marcarEntrega(
  { fecha, pedidoId, choferId }: Marca,
  resultado: Exclude<EstadoEntregaLocal, "pendiente">,
): Promise<void> {
  const [ruta, pedido] = await Promise.all([
    leerRuta(fecha),
    leerUno<PedidoLocal>(STORES.pedidos, pedidoId),
  ]);
  if (!ruta) throw new Error("No hay una ruta para ese día.");
  if (!pedido) throw new Error("Ese pedido ya no existe en este teléfono.");
  const parada = ruta.paradas.find((p) => p.pedidoId === pedidoId);
  if (!parada) throw new Error("Ese pedido no está en la ruta del día.");
  // Marcar dos veces la misma parada duplicaría el evento y por lo tanto el
  // conteo: el id del evento sería nuevo, así que la idempotencia del servidor
  // no lo frenaría. Se corta acá.
  if (parada.entrega !== "pendiente") return;

  const hora = new Date().toISOString();
  const actualizada: RutaLocal = {
    ...ruta,
    paradas: ruta.paradas.map((p) =>
      p.pedidoId === pedidoId ? { ...p, entrega: resultado, horaEntrega: hora } : p,
    ),
  };
  const pedidoActualizado: PedidoLocal =
    resultado === "entregado" ? { ...pedido, estado: "entregado" } : pedido;

  await escribir([STORES.rutas, STORES.pedidos, STORES.cola], ({ guardar }) => {
    guardar(STORES.rutas, actualizada);
    guardar(STORES.pedidos, pedidoActualizado);
    guardar(
      STORES.cola,
      evento(choferId, fecha, resultado === "entregado" ? "entrega" : "omision", hora),
    );
  });
}

// ----------------------------------------------------------------------------
// Cola de envío (el vaciado vive en el enviador, ver tarea de cola offline)
// ----------------------------------------------------------------------------

export async function leerCola(): Promise<EventoCola[]> {
  const eventos = await leerTodos<EventoCola>(STORES.cola);
  // Más viejos primero: si algo se cae a mitad de un envío grande, lo que se
  // fue es lo más antiguo y la cola queda coherente.
  return eventos.sort((a, b) => a.hora.localeCompare(b.hora));
}

/** Se llama SOLO después de que el servidor confirmó el insert. */
export function quitarDeCola(ids: string[]): Promise<void> {
  return escribir([STORES.cola], ({ borrar }) => {
    for (const id of ids) borrar(STORES.cola, id);
  });
}

// Reexportado para que las pantallas puedan distinguir "el teléfono no puede
// guardar" (accionable: instalar la app, salir del modo privado) de cualquier
// otro error.
export { ErrorAlmacenLocal } from "./idb";
