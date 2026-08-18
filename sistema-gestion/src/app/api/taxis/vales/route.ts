import { rechazoSiNoPanel } from "@/lib/auth";
import { cargarServiciosExport } from "@/lib/taxis-export";
import { renderValesHTML } from "@/lib/vales-taxi-html";
import { loadLogo } from "@/lib/logo";
import { etiquetaPeriodo } from "@/lib/periodo";
import { nombreArchivo } from "@/lib/format";
import { taxiNombreCliente } from "@/types/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vales del periodo: la MISMA página que imprimía el sistema anterior (ver
// lib/vales-taxi-html.ts). Devuelve HTML, no un PDF, porque así es como se hacía
// el vale allá: el navegador lo imprime y de ahí sale "Guardar como PDF". Un PDF
// generado por el servidor sería otro papel, parecido pero no el mismo.
//
// Dos filtros opcionales:
//   ?cliente=<nombre de empresa>  el mismo de la tabla
//   ?id=<uuid del servicio>       el vale de UNA fila (botón de la tabla)
export async function GET(req: Request) {
  const rechazo = await rechazoSiNoPanel();
  if (rechazo) return rechazo;

  const url = new URL(req.url);
  const cliente = url.searchParams.get("cliente");
  const servicioId = url.searchParams.get("id");

  const { servicios, empresa, periodo } = await cargarServiciosExport(cliente, servicioId);
  if (servicios.length === 0) {
    return new Response(
      servicioId
        ? "Ese servicio ya no existe, o no pertenece al periodo seleccionado."
        : "Sin servicios de taxi en el periodo seleccionado.",
      { status: 404 },
    );
  }
  // Van dos vales por hoja: unos cientos son un documento que el navegador va a
  // tardar en componer y nadie va a imprimir de una. Se pide acotar con el
  // periodo mensual o con el filtro de empresa.
  if (servicios.length > 300) {
    return new Response(
      `Son ${servicios.length} vales: demasiados para imprimir de una vez. Elige un mes en el selector de periodo o filtra por empresa.`,
      { status: 400 },
    );
  }

  const logo = await loadLogo(empresa);

  // El nombre del documento es el que el diálogo de impresión propone para el
  // archivo. El vale de una fila se nombra por su servicio, no por el periodo:
  // es el papel que se entrega y termina archivado suelto.
  const titulo = servicioId
    ? nombreArchivo(`Vale_${servicios[0].fecha}_${taxiNombreCliente(servicios[0]) ?? "particular"}`)
    : nombreArchivo(`Vales_${etiquetaPeriodo(periodo)}${cliente ? `_${cliente}` : ""}`);

  return new Response(renderValesHTML(servicios, empresa, logo, titulo), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Sin caché: los vales tienen que reflejar lo que está cargado ahora.
      "Cache-Control": "no-store",
    },
  });
}
