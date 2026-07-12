import ExcelJS from "exceljs";
import { getViajesInforme } from "@/lib/queries";
import { loadLogo } from "@/lib/logo";
import { formatDate } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BRAND = "FF1D4E89";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const data = await getViajesInforme({
    estado: url.searchParams.get("estado") ?? undefined,
    cliente: url.searchParams.get("cliente") ?? undefined,
    mes: url.searchParams.get("mes") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
  });
  const { empresa, viajes, periodoLabel, empresaLabel, total } = data;

  const wb = new ExcelJS.Workbook();
  wb.creator = empresa?.nombre ?? "Transportes Pucarani";
  const ws = wb.addWorksheet("Informe");

  ws.columns = [
    { width: 12 }, // Fecha
    { width: 26 }, // Empresa
    { width: 40 }, // Descripción
    { width: 12 }, // N° Factura
    { width: 16 }, // OC
    { width: 22 }, // Estado
    { width: 14 }, // Monto
  ];

  // Logo (si está disponible)
  const logo = await loadLogo(empresa);
  if (logo) {
    const dataUrl = `data:image/${logo.ext};base64,${logo.buffer.toString("base64")}`;
    const imgId = wb.addImage({ base64: dataUrl, extension: logo.ext });
    ws.addImage(imgId, { tl: { col: 0, row: 0 }, ext: { width: 56, height: 56 } });
    ws.getRow(1).height = 44;
  }

  // Encabezado
  ws.mergeCells("B1:G1");
  const titleCell = ws.getCell("B1");
  titleCell.value = `${empresa?.nombre ?? "Transportes Pucarani"} — Informe de servicios`;
  titleCell.font = { bold: true, size: 16, color: { argb: BRAND } };
  titleCell.alignment = { vertical: "middle" };

  ws.mergeCells("B2:G2");
  ws.getCell("B2").value = `Período: ${periodoLabel}   ·   Empresa: ${empresaLabel}`;
  ws.getCell("B2").font = { color: { argb: "FF6B7686" } };

  // Tabla
  const headRow = 4;
  const headers = ["Fecha", "Empresa", "Descripción", "N° Factura", "OC", "Estado", "Monto ($)"];
  headers.forEach((h, i) => {
    const cell = ws.getCell(headRow, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    cell.alignment = { horizontal: i === 6 ? "right" : "left" };
  });

  let r = headRow + 1;
  for (const v of viajes) {
    ws.getCell(r, 1).value = formatDate(v.fecha_inicio);
    ws.getCell(r, 2).value = v.clienteNombre;
    ws.getCell(r, 3).value = v.descripcion;
    ws.getCell(r, 4).value = v.folio ?? "";
    ws.getCell(r, 5).value = v.orden_compra ?? "";
    ws.getCell(r, 6).value = v.estadoLabel;
    ws.getCell(r, 7).value = Number(v.valor);
    ws.getCell(r, 7).numFmt = '"$"#,##0';
    r++;
  }

  // Total
  ws.getCell(r, 6).value = "TOTAL";
  ws.getCell(r, 6).font = { bold: true };
  ws.getCell(r, 6).alignment = { horizontal: "right" };
  ws.getCell(r, 7).value = Number(total);
  ws.getCell(r, 7).numFmt = '"$"#,##0';
  ws.getCell(r, 7).font = { bold: true };

  const buf = await wb.xlsx.writeBuffer();
  const slug = (url.searchParams.get("mes") ?? "servicios").replace(/[^\w-]/g, "");

  return new Response(buf as unknown as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="informe-${slug}.xlsx"`,
    },
  });
}
