"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth";
import { intNull, num, s, sReq } from "@/lib/form-helpers";
import { hoyChile } from "@/lib/format";
import { uuidv7 } from "@/lib/uuid";
import {
  agruparPorDia,
  calcularPagoDia,
  ingresoEstimado,
  reglaVigente,
  valorPedido,
  type DiaActividad,
  type EventoActividad,
} from "@/lib/encomiendas/pago";
import type { EncomiendaActividadTipo, EncomiendaReglaPago } from "@/types/db";

// Acá solo vive lo exclusivamente admin: confirmar pagos y cargar a mano un día
// que el teléfono no alcanzó a registrar. La carga de pedidos y el armado de la
// ruta ya no pasan por el servidor — viven en el teléfono del conductor (ver
// lib/encomiendas/local y la cabecera de la migración 0026).

export type FormState = { error?: string; ok?: boolean };

// Las Server Actions son endpoints POST de la ruta donde se usan: cualquiera
// con sesión puede invocarlas, el proxy no las filtra. RLS ya frena la
// escritura de encomienda_pagos y de la actividad manual a admin/operador, pero
// un DELETE/UPDATE bloqueado por RLS devuelve "0 filas, sin error" y la acción
// respondería {ok:true} sin haber hecho nada. Mejor decirlo de frente.
async function esAdminUOperador(): Promise<boolean> {
  const sesion = await sesionActual();
  return sesion?.rol === "admin" || sesion?.rol === "operador";
}

const SELECT_ACTIVIDAD = "chofer_id, fecha, tipo, origen";

async function leerReglas(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.from("encomienda_reglas_pago").select("*");
  return (data ?? []) as EncomiendaReglaPago[];
}

// Arma la fila de encomienda_pagos de un día. Es un SNAPSHOT auditable
// (guarda regla_id y calculado_en): si la regla cambia después, lo ya
// confirmado NO se recalcula solo. El panel muestra en paralelo el cálculo al
// vuelo, así que una diferencia entre ambos queda a la vista.
// Devuelve null si el día no se puede liquidar (sin conductor o sin regla).
//
// Ya no hace falta preguntar si el día "cuenta como trabajado": un día llega
// hasta acá solo si tiene actividad registrada (ver agruparPorDia).
function filaPago(
  dia: DiaActividad<EventoActividad>,
  reglas: EncomiendaReglaPago[],
  ahora: string,
) {
  if (!dia.choferId) return null;
  const regla = reglaVigente(reglas, dia.choferId, dia.fecha);
  if (!regla) return null;

  const pago = calcularPagoDia(dia.conteo, regla);

  // pago_total no va: es una columna generada (0017/0024).
  return {
    chofer_id: dia.choferId,
    fecha: dia.fecha,
    pedidos_entregados: dia.conteo.entregados,
    pedidos_no_entregados: dia.conteo.omitidos,
    ingresos_totales: ingresoEstimado(dia.conteo.entregados, valorPedido(regla)),
    pago_base: pago.base,
    pago_dia: pago.dia,
    pago_bono: pago.bono,
    regla_id: regla.id,
    calculado_en: ahora,
  };
}

/** Confirma (o recalcula) el pago de un día concreto para un conductor. */
export async function calcularPagoChofer(choferId: string, fecha: string): Promise<FormState> {
  if (!(await esAdminUOperador())) {
    return { error: "No tienes permiso para confirmar pagos." };
  }

  const supabase = await createClient();

  const { data, error: errActividad } = await supabase
    .from("encomienda_actividad")
    .select(SELECT_ACTIVIDAD)
    .eq("chofer_id", choferId)
    .eq("fecha", fecha)
    .returns<EventoActividad[]>();
  if (errActividad) {
    return { error: `No se pudo leer la actividad: ${errActividad.message}` };
  }

  const dias = agruparPorDia(data ?? []);
  if (dias.length === 0) {
    return { error: "Ese conductor no registró actividad en esa fecha." };
  }

  const fila = filaPago(dias[0], await leerReglas(supabase), new Date().toISOString());
  if (!fila) {
    return { error: "No hay ninguna regla de pago vigente a esa fecha. Configúrala primero." };
  }

  const { error } = await supabase
    .from("encomienda_pagos")
    .upsert(fila, { onConflict: "chofer_id,fecha" });
  if (error) return { error: `No se pudo guardar el pago: ${error.message}` };

  revalidatePath("/encomiendas");
  revalidatePath("/encomiendas/dia");
  return { ok: true };
}

// Confirma de una pasada todos los días del periodo que se está mirando. Sin
// esto, dejar la liquidación del mes registrada obliga a entrar día por día y
// apretar "Confirmar" treinta veces.
export async function confirmarPagosPeriodo(
  desde: string,
  hasta: string,
): Promise<FormState> {
  if (!(await esAdminUOperador())) {
    return { error: "No tienes permiso para confirmar pagos." };
  }

  const supabase = await createClient();

  const { data, error: errActividad } = await supabase
    .from("encomienda_actividad")
    .select(SELECT_ACTIVIDAD)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .returns<EventoActividad[]>();
  if (errActividad) {
    return { error: `No se pudo leer la actividad: ${errActividad.message}` };
  }

  const dias = agruparPorDia(data ?? []);
  if (dias.length === 0) {
    return { error: "No hay días con actividad para confirmar en este periodo." };
  }

  const reglas = await leerReglas(supabase);
  const ahora = new Date().toISOString();
  const filas = dias.map((d) => filaPago(d, reglas, ahora)).filter((f) => f != null);

  // Un solo upsert con todas las filas, no una por día: así el mes se
  // confirma entero o no se confirma nada. Antes, un día sin regla vigente
  // cortaba el bucle a la mitad y dejaba medio periodo grabado y medio no,
  // sin manera de saber cuál era cuál.
  if (filas.length === 0) {
    return { error: "No hay ninguna regla de pago vigente para esos días. Configúrala primero." };
  }
  const { error } = await supabase
    .from("encomienda_pagos")
    .upsert(filas, { onConflict: "chofer_id,fecha" });
  if (error) return { error: `No se pudieron guardar los pagos: ${error.message}` };

  revalidatePath("/encomiendas");
  revalidatePath("/encomiendas/dia");

  const omitidos = dias.length - filas.length;
  return omitidos > 0
    ? {
        error: `Se confirmaron ${filas.length} día(s). Quedaron ${omitidos} sin liquidar por no haber una regla de pago vigente a esa fecha (o por conductor eliminado).`,
      }
    : { ok: true };
}

// ----------------------------------------------------------------------------
// Cargar a mano un día que el teléfono no registró (0028)
//
// Un día de trabajo solo existe si hay filas en encomienda_actividad, y hasta
// acá las ponía únicamente el teléfono del conductor. Si el teléfono no
// sincronizó —sin batería, app reinstalada, o el día es anterior a que la app
// existiera— el conductor trabajó, hay que pagarle, y el panel no lo sabe.
// Esto lo arregla desde la oficina.
// ----------------------------------------------------------------------------

// Techo por día. No es una regla del negocio, es un cortafuegos contra el dedo
// resbalado: escribir "320" donde iban "32" insertaría 320 filas y multiplicaría
// por diez la liquidación de ese día. Una jornada real en Arica son ~60
// entregas, así que 300 no le queda corto a nadie.
const MAX_EVENTOS_DIA = 300;

/** Mediodía UTC del día cargado. La hora real de cada entrega NO se conoce
 *  —nadie la anotó— y este campo es `not null`, así que hay que poner algo.
 *  Mediodía UTC cae dentro del mismo día de calendario en Chile (UTC-4/-3),
 *  que es lo único que importa: `fecha` es la columna de la que sale el pago.
 *  Las pantallas no muestran esta hora en los días manuales, justamente para
 *  no aparentar una precisión que no existe. */
function horaRelleno(fecha: string): string {
  return `${fecha}T12:00:00Z`;
}

/** Carga (o reemplaza) la actividad manual de un conductor en un día.
 *
 *  REEMPLAZA a propósito: volver a guardar el mismo (conductor, día) borra la
 *  carga manual anterior antes de escribir la nueva. Es la forma de corregir un
 *  número mal tecleado sin dejar el día sumado dos veces, que es el error que
 *  un "insertar y listo" haría fácil y silencioso.
 *
 *  Lo que el TELÉFONO mandó no se toca nunca: si ese día ya tenía 20 entregas
 *  sincronizadas y acá se cargan 12, el día queda en 32. La pantalla avisa de
 *  esa suma antes de guardar. */
export async function agregarDiaManual(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await esAdminUOperador())) {
    return { error: "No tienes permiso para cargar días." };
  }

  const chofer_id = sReq(formData.get("chofer_id"));
  if (!chofer_id) return { error: "Elige un conductor." };

  const fecha = sReq(formData.get("fecha"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: "La fecha no es válida." };
  // Comparación de strings sobre YYYY-MM-DD: ordena igual que por calendario y
  // evita construir un Date (que interpretaría la fecha en UTC y correría el
  // límite un día). hoyChile() ya viene en la zona del negocio.
  if (fecha > hoyChile()) return { error: "No se puede cargar un día que todavía no ocurre." };

  const entregados = intNull(formData.get("entregados")) ?? 0;
  const omitidos = intNull(formData.get("omitidos")) ?? 0;
  if (entregados < 0 || omitidos < 0) {
    return { error: "Los conteos no pueden ser negativos." };
  }
  if (entregados + omitidos > MAX_EVENTOS_DIA) {
    return {
      error: `Son ${entregados + omitidos} registros para un solo día (el tope es ${MAX_EVENTOS_DIA}). Revisa los números.`,
    };
  }

  const supabase = await createClient();

  // Que el conductor exista y reparta encomiendas. Sin esto, un chofer_id
  // inventado revienta contra la foreign key con un mensaje de Postgres, y uno
  // de otra área (taxis, operación) entraría a la liquidación de encomiendas
  // sin que nadie lo haya querido.
  const { count: esDeEncomiendas } = await supabase
    .from("chofer_categorias")
    .select("chofer_id", { count: "exact", head: true })
    .eq("chofer_id", chofer_id)
    .eq("categoria", "encomiendas");
  if (!esDeEncomiendas) {
    return { error: "Ese conductor no tiene la categoría 'Encomiendas' asignada." };
  }

  // Un día en que salió y no logró entregar nada igual es un día trabajado y se
  // paga el fijo diario: se registra con una 'llamada', que es exactamente para
  // lo que existe ese tipo (ver 0026).
  const tipos: EncomiendaActividadTipo[] =
    entregados + omitidos === 0
      ? ["llamada"]
      : [
          ...Array<EncomiendaActividadTipo>(entregados).fill("entrega"),
          ...Array<EncomiendaActividadTipo>(omitidos).fill("omision"),
        ];

  const hora = horaRelleno(fecha);
  const filas = tipos.map((tipo) => ({
    id: uuidv7(),
    chofer_id,
    fecha,
    tipo,
    hora,
    origen: "manual" as const,
  }));

  // Primero borrar la carga manual anterior de ese día, si la hubo (ver el
  // comentario de arriba sobre reemplazar). El filtro por origen es lo que deja
  // intacto lo que mandó el teléfono.
  //
  // Borrar y volver a insertar no es una transacción (serían dos consultas
  // PostgREST; hacerlo atómico pediría una función en la base). Si el insert
  // falla después del delete, la carga manual anterior se pierde y el día queda
  // solo con lo del teléfono. Se eligió ese orden a propósito: el fallo se ve
  // —el badge "Carga manual" desaparece y los conteos bajan— y se arregla
  // volviendo a guardar. Al revés, el fallo sería el día contado dos veces, que
  // no se nota y paga de más.
  const { error: errBorrado } = await supabase
    .from("encomienda_actividad")
    .delete()
    .eq("chofer_id", chofer_id)
    .eq("fecha", fecha)
    .eq("origen", "manual");
  if (errBorrado) {
    return { error: `No se pudo reemplazar la carga anterior: ${errBorrado.message}` };
  }

  const { error } = await supabase.from("encomienda_actividad").insert(filas);
  if (error) return { error: `No se pudo guardar el día: ${error.message}` };

  // Si ese día ya tenía la liquidación confirmada, el snapshot queda desfasado
  // respecto del cálculo al vuelo y el panel lo marca solo como "Por
  // recalcular". No se recalcula acá a propósito: cambiar un pago ya confirmado
  // es una decisión de quien liquida, no un efecto secundario de cargar un día.
  revalidatePath("/encomiendas");
  revalidatePath("/encomiendas/dia");
  return { ok: true };
}

/** Borra por completo la carga manual de un (conductor, día).
 *
 *  Es la vuelta atrás de un día cargado que no correspondía. Solo toca las
 *  filas de origen 'manual': lo que el teléfono registró en terreno no se puede
 *  borrar desde acá. */
export async function eliminarDiaManual(choferId: string, fecha: string): Promise<FormState> {
  if (!(await esAdminUOperador())) {
    return { error: "No tienes permiso para borrar días." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("encomienda_actividad")
    .delete()
    .eq("chofer_id", choferId)
    .eq("fecha", fecha)
    .eq("origen", "manual");
  if (error) return { error: `No se pudo borrar la carga manual: ${error.message}` };

  // Si no queda NADA de ese día, el día deja de existir para el panel (que lo
  // arma agrupando actividad). Una fila de encomienda_pagos sobreviviente sería
  // plata a pagar por un día que ya nadie puede ver ni auditar, así que se va
  // con él. Si en cambio quedó actividad del teléfono, el snapshot se conserva:
  // el día sigue existiendo y el panel lo marcará "Por recalcular".
  const { count: quedan } = await supabase
    .from("encomienda_actividad")
    .select("id", { count: "exact", head: true })
    .eq("chofer_id", choferId)
    .eq("fecha", fecha);

  if (!quedan) {
    const { error: errPago } = await supabase
      .from("encomienda_pagos")
      .delete()
      .eq("chofer_id", choferId)
      .eq("fecha", fecha);
    if (errPago) {
      return { error: `Se borró la actividad, pero quedó la liquidación: ${errPago.message}` };
    }
  }

  revalidatePath("/encomiendas");
  revalidatePath("/encomiendas/dia");
  return { ok: true };
}

// ----------------------------------------------------------------------------
// Configuración: reglas de pago e ingresos reales (0029)
//
// Vivían en /encomiendas/configuracion, una página aparte. Ahora todo esto se
// edita en un diálogo sobre el mismo panel: son ajustes que se miran contra los
// números que están en pantalla —"¿cuánto estamos estimando por entrega?",
// "¿cuánto entró de verdad este mes?"— y mandar a otra página obligaba a
// recordar la cifra o a ir y volver.
// ----------------------------------------------------------------------------

// El porcentaje NO puede leerse con num(): ese helper borra los puntos para
// soportar el formato chileno de miles ("1.234.567"), y el <input type=
// "number" step="0.1"> del formulario envía "7.5" — que num() convertiría en
// 75. Un 7,5 % guardado como 75 % es diez veces el pago del conductor, todos
// los días, sin ningún aviso. Acá el punto SÍ es separador decimal.
function porcentaje(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? "").trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

// Regla general (chofer_id null) por ahora — MVP de 1 conductor. Cada regla
// nueva queda "vigente desde hoy"; las anteriores se conservan para no
// alterar pagos ya calculados con ellas (ver encomienda_pagos.regla_id).
//
// Una regla tiene hasta cuatro componentes: cuánto se estima que entra por
// entrega (valor_pedido, 0029), un fijo por día trabajado (monto_dia, 0024), lo
// que corresponda por pedido entregado (tipo_pago + valor_pago) y un bono
// opcional al alcanzar una meta diaria.
export async function guardarReglaPago(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  // RLS ya frena el insert de un chofer, pero devolvería un mensaje de Postgres
  // en la cara. Mejor decirlo de frente, igual que el resto de este archivo.
  if (!(await esAdminUOperador())) {
    return { error: "No tienes permiso para cambiar las reglas de pago." };
  }

  const tipo_pago = sReq(formData.get("tipo_pago"));
  if (!["porcentaje", "monto_fijo"].includes(tipo_pago)) {
    return { error: "Tipo de pago inválido." };
  }

  // El % admite decimales; el monto fijo por pedido son pesos con separador
  // de miles. Dos formatos distintos, dos parsers distintos.
  const valor_pago =
    tipo_pago === "porcentaje"
      ? porcentaje(formData.get("valor_pago"))
      : num(formData.get("valor_pago"));
  if (valor_pago < 0) return { error: "El valor de pago no puede ser negativo." };
  if (tipo_pago === "porcentaje" && valor_pago > 100) {
    return { error: "El porcentaje no puede superar 100." };
  }

  // Sin valor por entrega no hay ingreso estimado, y con tipo_pago porcentaje
  // tampoco hay sueldo: el 7 % de cero es cero. Así que se exige.
  const valor_pedido = intNull(formData.get("valor_pedido"));
  if (valor_pedido == null || valor_pedido <= 0) {
    return { error: "Pon cuánto se estima que entra por cada entrega." };
  }

  const monto_dia = intNull(formData.get("monto_dia")) ?? 0;
  if (monto_dia < 0) return { error: "El monto por día no puede ser negativo." };

  const meta_entregas_dia = intNull(formData.get("meta_entregas_dia"));
  const bono_monto = intNull(formData.get("bono_monto"));
  if ((meta_entregas_dia == null) !== (bono_monto == null)) {
    return { error: "Para el bono, completa tanto la meta de entregas como el monto." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("encomienda_reglas_pago").insert({
    tipo_pago,
    valor_pago,
    valor_pedido,
    monto_dia,
    meta_entregas_dia,
    bono_monto,
    vigente_desde: hoyChile(),
  });
  if (error) return { error: `No se pudo guardar: ${error.message}` };

  revalidatePath("/encomiendas");
  revalidatePath("/encomiendas/dia");
  return { ok: true };
}

/** Anota lo que Starken liquidó de verdad en un mes (0029).
 *
 *  Reemplaza si ese mes ya estaba cargado: la liquidación puede llegar
 *  corregida, o cargarse primero un adelanto y después el total. */
export async function guardarIngresoReal(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await esAdminUOperador())) {
    return { error: "No tienes permiso para cargar ingresos." };
  }

  const anio = intNull(formData.get("anio"));
  const mes = intNull(formData.get("mes"));
  if (anio == null || anio < 2000 || anio > 2100) return { error: "El año no es válido." };
  if (mes == null || mes < 1 || mes > 12) return { error: "El mes no es válido." };

  const monto = intNull(formData.get("monto"));
  if (monto == null || monto < 0) {
    return { error: "Pon cuánto entró de verdad ese mes." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("encomienda_ingresos_reales")
    .upsert({ anio, mes, monto, nota: s(formData.get("nota")) }, { onConflict: "anio,mes" });
  if (error) return { error: `No se pudo guardar: ${error.message}` };

  revalidatePath("/encomiendas");
  return { ok: true };
}
