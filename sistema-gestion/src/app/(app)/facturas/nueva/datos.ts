// Carga de datos para crear una factura — compartida entre la página completa
// (/facturas/nueva) y su versión modal interceptada (@modal).
import { createClient } from "@/lib/supabase/server";
import { TIPOS_DTE } from "@/types/db";
import type { ViajeOpt } from "../factura-form";

/**
 * El próximo folio de cada tipo de documento: el último usado + 1.
 *
 * Existe porque nadie se acuerda en qué número va cada talonario, y el dato ya
 * está en la base. Se consulta un folio por tipo —cuatro consultas de una fila,
 * no la tabla entera— para que siga costando lo mismo con diez mil facturas.
 *
 * Cuenta los folios de facturas anuladas también: ese número se gastó igual y
 * no se puede reutilizar.
 */
export async function foliosSugeridos(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const tipos = Object.keys(TIPOS_DTE);

  const ultimos = await Promise.all(
    tipos.map((tipo) =>
      supabase
        .from("facturas")
        .select("folio")
        .eq("tipo_dte", Number(tipo))
        .not("folio", "is", null)
        .order("folio", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ),
  );

  const sugeridos: Record<string, number> = {};
  tipos.forEach((tipo, i) => {
    const ultimo = ultimos[i].data?.folio;
    // Sin ninguna factura de ese tipo no se inventa un número: el primer folio
    // lo decide el CAF del SII, no la app.
    if (ultimo) sugeridos[tipo] = Number(ultimo) + 1;
  });
  return sugeridos;
}

export async function datosNuevaFactura() {
  const supabase = await createClient();
  const [{ data: cl }, { data: via }, folios] = await Promise.all([
    supabase.from("clientes").select("id,nombre,codigo").order("nombre"),
    supabase
      .from("viajes")
      .select("id,cliente_id,descripcion,fecha_inicio,valor")
      .eq("estado", "realizado")
      .is("factura_id", null)
      .order("fecha_inicio", { ascending: false }),
    foliosSugeridos(),
  ]);
  const clientes = cl ?? [];
  const viajesDisponibles = (via ?? []) as ViajeOpt[];

  return { clientes, viajesDisponibles, folios };
}
