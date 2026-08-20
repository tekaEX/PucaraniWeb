"use server";

import { puedeEditar, SIN_PERMISO } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { s, sReq, intNull } from "@/lib/form-helpers";
import { errorRut, normalizarRut } from "@/lib/rut";

export type FormState = { error?: string; ok?: boolean };

export async function guardarEmpresa(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await puedeEditar())) return { error: SIN_PERMISO };

  const id = s(formData.get("id"));

  // El RUT de la empresa es el que va como <RE> en el CAF y como emisor en cada
  // DTE: si está mal escrito, el SII rechaza TODO lo que se emita.
  const rutCrudo = s(formData.get("rut"));
  if (rutCrudo) {
    const err = errorRut(rutCrudo, "El RUT de la empresa");
    if (err) return { error: err };
  }

  const values = {
    nombre: sReq(formData.get("nombre")) || "Transportes Pucarani",
    razon_social: s(formData.get("razon_social")),
    rut: rutCrudo ? normalizarRut(rutCrudo) : null,
    direccion: s(formData.get("direccion")),
    ciudad: s(formData.get("ciudad")),
    comuna: s(formData.get("comuna")),
    giro: s(formData.get("giro")),
    // Se escriben separados por coma porque son uno o dos códigos, no una
    // lista larga. Lo que no sea un número se descarta en vez de guardarse:
    // un "492300 (transporte)" tipeado entero rompería el DTE al emitir.
    actividad_economica: (s(formData.get("actividad_economica")) ?? "")
      .split(/[,;\s]+/)
      .map((c) => Number(c.trim()))
      .filter((n) => Number.isInteger(n) && n > 0),
    telefono: s(formData.get("telefono")),
    email: s(formData.get("email")),
    representante: s(formData.get("representante")),
    logo_url: s(formData.get("logo_url")),
    proximo_numero_cotizacion:
      intNull(formData.get("proximo_numero_cotizacion")) ?? 1189,
    updated_at: new Date().toISOString(),
  };

  // Este formulario EDITA la empresa de la cuenta; no crea empresas. Antes, si
  // llegaba sin id, insertaba una fila nueva — un camino que existía para la
  // base recién instalada, cuando la tabla podía estar vacía. Desde la
  // migración 0050 toda cuenta tiene empresa (perfiles.empresa_id es NOT NULL),
  // así que el formulario siempre trae el id, y un insert acá solo podría
  // significar que algo se rompió: crearía una empresa huérfana —sin ningún
  // perfil apuntándola— que además la policy `empresa_write_admin_op` rechaza,
  // porque una fila nueva nunca es ya la empresa del usuario. Mejor decirlo que
  // devolver el error de Postgres.
  if (!id) {
    return {
      error:
        "No se encontró la empresa de tu cuenta. Recargá la página; si sigue igual, avisá: el perfil quedó sin empresa asignada.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("empresa").update(values).eq("id", id);

  if (error) {
    return { error: `No se pudo guardar: ${error.message}` };
  }

  revalidatePath("/configuracion");
  revalidatePath("/");
  return { ok: true };
}
