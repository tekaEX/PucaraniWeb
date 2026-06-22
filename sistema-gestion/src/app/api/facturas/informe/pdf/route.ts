import { getFacturasInforme } from "@/lib/queries";
import { renderInformePDF } from "@/lib/pdf/informe-pdf";
import { loadLogo } from "@/lib/logo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const data = await getFacturasInforme({
    estado: url.searchParams.get("estado") ?? undefined,
    cliente: url.searchParams.get("cliente") ?? undefined,
    mes: url.searchParams.get("mes") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
  });

  const logo = await loadLogo(data.empresa);
  const buffer = await renderInformePDF(data, logo);
  const slug = (url.searchParams.get("mes") ?? "servicios").replace(/[^\w-]/g, "");

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="informe-${slug}.pdf"`,
    },
  });
}
