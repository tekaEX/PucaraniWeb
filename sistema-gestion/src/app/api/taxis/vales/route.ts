import { cargarServiciosExport } from "@/lib/taxis-export";
import { renderValesTaxiPDF } from "@/lib/pdf/vales-taxi-pdf";
import { loadLogo } from "@/lib/logo";
import { etiquetaPeriodo } from "@/lib/periodo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Talonario de vales del periodo (un vale por página), filtro opcional
// ?cliente=<nombre de empresa> — el mismo de la tabla.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const cliente = url.searchParams.get("cliente");

  const { servicios, empresa, periodo } = await cargarServiciosExport(cliente);
  if (servicios.length === 0) {
    return new Response("Sin servicios de taxi en el periodo seleccionado.", {
      status: 404,
    });
  }
  // Un vale = una página: con cientos, el PDF se vuelve inmanejable (y pesado
  // de generar). Se pide acotar con el periodo mensual o el filtro de empresa.
  if (servicios.length > 300) {
    return new Response(
      `Son ${servicios.length} vales: demasiados para un solo PDF. Elige un mes en el selector de periodo o filtra por empresa.`,
      { status: 400 },
    );
  }

  const logo = await loadLogo(empresa);
  const buffer = await renderValesTaxiPDF(servicios, empresa, logo);

  const nombre = `Vales_${etiquetaPeriodo(periodo)}${cliente ? `_${cliente}` : ""}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "_");

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nombre}.pdf"`,
    },
  });
}
