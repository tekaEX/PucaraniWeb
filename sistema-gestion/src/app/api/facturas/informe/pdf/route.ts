import { rechazoSiNoPanel } from "@/lib/auth";
import { getViajesInforme } from "@/lib/queries";
import { renderInformePDF } from "@/lib/pdf/informe-pdf";
import { loadLogo } from "@/lib/logo";
import { nombreArchivo } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const rechazo = await rechazoSiNoPanel();
  if (rechazo) return rechazo;

  const url = new URL(req.url);
  const data = await getViajesInforme({
    estado: url.searchParams.get("estado") ?? undefined,
    cliente: url.searchParams.get("cliente") ?? undefined,
    mes: url.searchParams.get("mes") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
  });

  const logo = await loadLogo(data.empresa);
  const buffer = await renderInformePDF(data, logo);
  const slug = nombreArchivo(url.searchParams.get("mes") ?? "servicios", "servicios");

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="informe-${slug}.pdf"`,
    },
  });
}
