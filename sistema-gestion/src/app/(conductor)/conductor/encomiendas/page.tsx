import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { exigirConductor } from "@/lib/auth";
import { hoyChile } from "@/lib/format";
import { PantallaEncomiendas } from "./pantalla";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ruta del día" };

// Esta página quedó reducida a lo que SOLO el servidor puede hacer: comprobar
// quién es el chofer y si tiene la categoría. Los pedidos y la ruta ya no se
// bajan de la base —viven en el teléfono, ver lib/encomiendas/local— así que de
// ahí en adelante manda PantallaEncomiendas, en el navegador.

// Siempre con la vuelta al hub: estas pantallas no tienen nada que tocar, y
// sin el link el chofer queda encerrado en una URL que se sabe de memoria.
function Mensaje({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="p-6 text-center">
      <p className="text-lg font-semibold">{titulo}</p>
      <p className="mx-auto max-w-xs text-sm text-muted">{texto}</p>
      <Link href="/conductor" className="mt-4 inline-block text-sm text-brand hover:underline">
        Volver al inicio
      </Link>
    </div>
  );
}

export default async function EncomiendasConductorPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const sesion = await exigirConductor();
  const supabase = await createClient();

  const { data: chofer } = await supabase
    .from("choferes")
    .select("id, nombre")
    .eq("user_id", sesion.userId)
    .maybeSingle();

  if (!chofer) {
    return (
      <Mensaje
        titulo="Cuenta sin vincular"
        texto="Tu usuario no está vinculado a ningún chofer. Pide a un administrador que lo configure en la ficha del chofer."
      />
    );
  }

  // Defensa en profundidad: aunque no aparezca como acceso directo en el
  // hub (/conductor), esta ruta no debe abrirse tecleándola a mano si el
  // jefe no le asignó la categoría "encomiendas".
  const { count: tieneCategoria } = await supabase
    .from("chofer_categorias")
    .select("chofer_id", { count: "exact", head: true })
    .eq("chofer_id", chofer.id)
    .eq("categoria", "encomiendas");
  if (!tieneCategoria) {
    return (
      <Mensaje
        titulo="Sin acceso"
        texto="No tienes la categoría 'Encomiendas' asignada. Pide a un administrador que te la active."
      />
    );
  }

  // Punto de partida por defecto de la ruta. Es un dato de la EMPRESA, no de un
  // destinatario, así que sigue viviendo en la base sin problema (ver la
  // cabecera de la migración 0026 para qué es lo que sí se sacó de ahí).
  const { data: empresa } = await supabase
    .from("empresa")
    .select("direccion, ciudad")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  const direccionEmpresa =
    [empresa?.direccion, empresa?.ciudad].filter(Boolean).join(", ") || null;

  const { fecha: fechaParam } = await searchParams;
  const hoy = hoyChile();
  const fecha = fechaParam && /^\d{4}-\d{2}-\d{2}$/.test(fechaParam) ? fechaParam : hoy;

  return (
    <PantallaEncomiendas
      choferId={chofer.id}
      nombreChofer={chofer.nombre}
      fecha={fecha}
      esHoy={fecha === hoy}
      direccionEmpresa={direccionEmpresa}
    />
  );
}
