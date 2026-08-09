import { createClient } from "@/lib/supabase/server";
import { exigirConductor } from "@/lib/auth";

// Quién puede entrar a las pantallas de encomiendas. Vive aparte porque ahora
// son DOS páginas —preparar la jornada y hacer el reparto— y las dos tienen que
// comprobar exactamente lo mismo. Repetido en cada una, alcanzaba con olvidarse
// de una comprobación en una sola para dejar una puerta abierta.

export type Acceso =
  | { ok: true; chofer: { id: string; nombre: string } }
  | { ok: false; titulo: string; texto: string };

export async function accesoEncomiendas(): Promise<Acceso> {
  const sesion = await exigirConductor();
  const supabase = await createClient();

  const { data: chofer } = await supabase
    .from("choferes")
    .select("id, nombre")
    .eq("user_id", sesion.userId)
    .maybeSingle();

  if (!chofer) {
    return {
      ok: false,
      titulo: "Cuenta sin vincular",
      texto:
        "Tu usuario no está vinculado a ningún chofer. Pide a un administrador que lo configure en la ficha del chofer.",
    };
  }

  // Defensa en profundidad: aunque no aparezca como acceso directo en el hub
  // (/conductor), estas rutas no deben abrirse tecleándolas a mano si el jefe no
  // le asignó la categoría "encomiendas".
  const { count: tieneCategoria } = await supabase
    .from("chofer_categorias")
    .select("chofer_id", { count: "exact", head: true })
    .eq("chofer_id", chofer.id)
    .eq("categoria", "encomiendas");

  if (!tieneCategoria) {
    return {
      ok: false,
      titulo: "Sin acceso",
      texto:
        "No tienes la categoría 'Encomiendas' asignada. Pide a un administrador que te la active.",
    };
  }

  return { ok: true, chofer };
}
