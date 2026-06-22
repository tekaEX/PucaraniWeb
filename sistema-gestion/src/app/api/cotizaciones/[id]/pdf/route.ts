import { getCotizacionParaDocumento } from "@/lib/queries";
import { renderCotizacionPDF } from "@/lib/pdf/cotizacion-pdf";
import { loadLogo } from "@/lib/logo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const data = await getCotizacionParaDocumento(id);
  if (!data) return new Response("Cotización no encontrada", { status: 404 });

  const logo = await loadLogo(data.empresa);
  const buffer = await renderCotizacionPDF(data, logo);

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="cotizacion-n-${data.cotizacion.numero}.pdf"`,
    },
  });
}
