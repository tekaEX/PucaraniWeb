"use server";

import { puedeEditar, SIN_PERMISO } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { s, sReq, num } from "@/lib/form-helpers";
import { TAXI_TIPOS, taxiPideDescripcion, type TaxiTipo } from "@/types/db";

export type FormState = { error?: string; ok?: boolean };

// Los taxis suman a los ingresos por cliente, así que además de /taxis hay
// que refrescar el Dashboard y Clientes.
function revalidarTaxis() {
  revalidatePath("/taxis");
  revalidatePath("/");
  revalidatePath("/clientes");
}

export async function guardarServicioTaxi(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await puedeEditar())) return { error: SIN_PERMISO };

  const id = s(formData.get("id"));
  const fecha = sReq(formData.get("fecha"));
  if (!fecha) return { error: "La fecha es obligatoria." };

  const tipo = sReq(formData.get("tipo")) as TaxiTipo;
  if (!(tipo in TAXI_TIPOS)) return { error: "Tipo de servicio inválido." };

  const monto = Math.round(num(formData.get("monto")));
  if (monto < 0) return { error: "El monto no puede ser negativo." };

  // La descripción es del tipo "Especial" y de ninguno de los otros seis: son
  // los del talonario y su nombre ya dice qué fue el servicio. Sin ella, un
  // "Especial" en el vale queda como una línea en blanco.
  const descripcion = taxiPideDescripcion(tipo) ? s(formData.get("descripcion")) : null;
  if (taxiPideDescripcion(tipo) && !descripcion) {
    return { error: "El servicio especial necesita una descripción." };
  }

  const values = {
    fecha,
    tipo,
    descripcion,
    monto,
    pasajero: s(formData.get("pasajero")),
    cliente_id: s(formData.get("cliente_id")),
    chofer_id: s(formData.get("chofer_id")),
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("servicios_taxi").update(values).eq("id", id)
    : await supabase.from("servicios_taxi").insert(values);

  if (error) return { error: `No se pudo guardar: ${error.message}` };

  revalidarTaxis();
  // No navega a ninguna parte, ni al crear ni al editar: el formulario de alta
  // vive en la misma pantalla que la tabla —como en el sistema anterior—, así
  // que cargar un servicio deja la vista donde está, con el cursor listo para
  // el siguiente. Un redirect acá remontaría la página y se perdería el foco.
  return { ok: true };
}

export async function eliminarServicioTaxi(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await puedeEditar())) return { error: SIN_PERMISO };

  const id = sReq(formData.get("id"));
  if (!id) return { error: "Falta el identificador." };
  const supabase = await createClient();
  const { error } = await supabase.from("servicios_taxi").delete().eq("id", id);
  if (error) return { error: `No se pudo eliminar: ${error.message}` };
  revalidarTaxis();
  // Sin redirect, por lo mismo que al guardar: la fila desaparece de la tabla
  // y el usuario sigue donde estaba.
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Importación del respaldo JSON de la app antigua de taxis (PWA/IndexedDB).
// ---------------------------------------------------------------------------

// Registro tal como viene en el respaldo (campos legado: proveedor = nombre
// del pasajero, servicio = descripción del tipo "especial").
const respaldoServicio = z.object({
  id: z.string().min(1),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tipo: z.string(),
  servicio: z.string().nullish(),
  proveedor: z.string().nullish(),
  monto: z.coerce.number().min(0),
  empresa: z.string().nullish(),
  chofer: z.string().nullish(),
});

export type ResumenImport = {
  creados: number;
  duplicados: number;
  invalidos: number;
  sinMatchEmpresa: number;
  sinMatchChofer: number;
  error?: string;
};

// La app antigua guardaba "aeropuerto" en registros viejos; los otros seis
// tipos se llaman igual acá, así que no hay nada más que traducir.
const TIPO_ALIAS: Record<string, TaxiTipo> = { aeropuerto: "aeropuerto_arica" };

const norm = (s: string) => s.trim().toLowerCase();

// Importa un LOTE de servicios del respaldo (el cliente envía de a ~200 para
// no chocar con el límite de tamaño de las Server Actions). Idempotente: los
// origen_id ya importados se saltan, re-importar no duplica.
export async function importarRespaldoTaxis(
  lote: unknown[],
): Promise<ResumenImport> {
  const vacio: ResumenImport = {
    creados: 0,
    duplicados: 0,
    invalidos: 0,
    sinMatchEmpresa: 0,
    sinMatchChofer: 0,
  };

  // Esta escribe como cualquier otra, pero no devuelve FormState: el rechazo
  // viaja en el `error` del resumen, que es lo que la pantalla ya sabe mostrar.
  if (!(await puedeEditar())) return { ...vacio, error: SIN_PERMISO };

  const supabase = await createClient();

  // Catálogos para matchear por nombre (case-insensitive).
  const [{ data: clData }, { data: choData }] = await Promise.all([
    supabase.from("clientes").select("id,nombre"),
    supabase.from("choferes").select("id,nombre"),
  ]);
  const clientesPorNombre = new Map(
    (clData ?? []).map((c) => [norm(c.nombre), c.id as string]),
  );
  const choferesPorNombre = new Map(
    (choData ?? []).map((c) => [norm(c.nombre), c.id as string]),
  );

  const res = { ...vacio };
  const filas: {
    fecha: string;
    tipo: TaxiTipo;
    descripcion: string | null;
    monto: number;
    pasajero: string | null;
    cliente_id: string | null;
    chofer_id: string | null;
    cliente_texto: string | null;
    chofer_texto: string | null;
    origen_id: string;
  }[] = [];

  for (const crudo of lote) {
    const parsed = respaldoServicio.safeParse(crudo);
    if (!parsed.success) {
      res.invalidos++;
      continue;
    }
    const r = parsed.data;

    // Normaliza el tipo (con el alias legado). Un tipo desconocido con texto se
    // rescata como "especial", que es el que admite descripción; sin texto no
    // hay nada que guardar y se descarta.
    let tipo = (TIPO_ALIAS[r.tipo] ?? r.tipo) as TaxiTipo;
    const texto = r.servicio?.trim() || null;
    if (!(tipo in TAXI_TIPOS)) {
      if (!texto) {
        res.invalidos++;
        continue;
      }
      tipo = "especial";
    }
    const descripcion = taxiPideDescripcion(tipo) ? texto || "(sin descripción)" : null;

    const empresaTxt = r.empresa?.trim() || null;
    const choferTxt = r.chofer?.trim() || null;
    const cliente_id = empresaTxt
      ? (clientesPorNombre.get(norm(empresaTxt)) ?? null)
      : null;
    const chofer_id = choferTxt
      ? (choferesPorNombre.get(norm(choferTxt)) ?? null)
      : null;
    if (empresaTxt && !cliente_id) res.sinMatchEmpresa++;
    if (choferTxt && !chofer_id) res.sinMatchChofer++;

    filas.push({
      fecha: r.fecha,
      tipo,
      descripcion,
      monto: Math.round(r.monto),
      pasajero: r.proveedor?.trim() || null,
      cliente_id,
      chofer_id,
      // El texto solo se conserva cuando no hubo match (la FK manda).
      cliente_texto: cliente_id ? null : empresaTxt,
      chofer_texto: chofer_id ? null : choferTxt,
      origen_id: r.id,
    });
  }

  if (filas.length > 0) {
    // Idempotencia: se saltan los origen_id que ya existen.
    const { data: existentes, error: exError } = await supabase
      .from("servicios_taxi")
      .select("origen_id")
      .in("origen_id", filas.map((f) => f.origen_id));
    if (exError) return { ...res, error: `No se pudo importar: ${exError.message}` };

    const yaImportados = new Set((existentes ?? []).map((e) => e.origen_id));
    const nuevas = filas.filter((f) => !yaImportados.has(f.origen_id));
    res.duplicados += filas.length - nuevas.length;

    if (nuevas.length > 0) {
      const { error } = await supabase.from("servicios_taxi").insert(nuevas);
      if (error) return { ...res, error: `No se pudo importar: ${error.message}` };
      res.creados += nuevas.length;
    }
  }

  revalidarTaxis();
  return res;
}
