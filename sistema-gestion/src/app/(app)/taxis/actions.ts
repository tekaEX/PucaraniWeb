"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { s, sReq, num } from "@/lib/form-helpers";
import { TAXI_TIPOS, type TaxiTipo } from "@/types/db";

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
  const id = s(formData.get("id"));
  const fecha = sReq(formData.get("fecha"));
  if (!fecha) return { error: "La fecha es obligatoria." };

  const tipo = sReq(formData.get("tipo")) as TaxiTipo;
  if (!(tipo in TAXI_TIPOS)) return { error: "Tipo de servicio inválido." };

  const monto = Math.round(num(formData.get("monto")));
  if (monto < 0) return { error: "El monto no puede ser negativo." };

  // La descripción solo existe para el tipo "especial" (check en la base).
  const descripcion = tipo === "especial" ? s(formData.get("descripcion")) : null;
  if (tipo === "especial" && !descripcion) {
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
  // Al crear, vuelve a la lista; al editar inline, se queda en el acordeón.
  if (!id) redirect("/taxis");
  return { ok: true };
}

export async function eliminarServicioTaxi(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = sReq(formData.get("id"));
  if (!id) return { error: "Falta el identificador." };
  const supabase = await createClient();
  const { error } = await supabase.from("servicios_taxi").delete().eq("id", id);
  if (error) return { error: `No se pudo eliminar: ${error.message}` };
  revalidarTaxis();
  redirect("/taxis");
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

// La app antigua guardaba "aeropuerto" en registros viejos.
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

    // Normaliza el tipo (con alias legado). Un tipo desconocido con texto se
    // rescata como "especial"; sin texto, se descarta.
    let tipo = (TIPO_ALIAS[r.tipo] ?? r.tipo) as TaxiTipo;
    if (!(tipo in TAXI_TIPOS)) {
      if (r.servicio?.trim()) tipo = "especial";
      else {
        res.invalidos++;
        continue;
      }
    }
    const descripcion =
      tipo === "especial" ? r.servicio?.trim() || "(sin descripción)" : null;

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
