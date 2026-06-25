import ExcelJS from "exceljs";
import { getCotizacionParaDocumento } from "@/lib/queries";
import { loadLogo } from "@/lib/logo";
import { formatDate } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BRAND = "FF1D4E89";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const data = await getCotizacionParaDocumento(id);
  if (!data) return new Response("Cotización no encontrada", { status: 404 });

  const { empresa, cotizacion: c } = data;

  const wb = new ExcelJS.Workbook();
  wb.creator = empresa?.nombre ?? "Transportes Pucarani";
  const ws = wb.addWorksheet("Presupuesto", {
    pageSetup: { paperSize: 9, orientation: "portrait", margins: {
      left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3,
    } },
  });

  ws.columns = [
    { width: 6 },
    { width: 52 },
    { width: 10 },
    { width: 16 },
    { width: 16 },
  ];

  const logo = await loadLogo(empresa);
  if (logo) {
    const dataUrl = `data:image/${logo.ext};base64,${logo.buffer.toString("base64")}`;
    const imgId = wb.addImage({ base64: dataUrl, extension: logo.ext });
    ws.addImage(imgId, { tl: { col: 0, row: 0 }, ext: { width: 48, height: 48 } });
  }

  const title = ws.getCell("B1");
  title.value = "PRESUPUESTO";
  title.font = { bold: true, size: 20, color: { argb: BRAND } };
  ws.getCell("E1").value = `N° ${c.numero}`;
  ws.getCell("E1").font = { bold: true, size: 14 };
  ws.getCell("E1").alignment = { horizontal: "right" };

  let r = 3;
  const put = (
    row: number,
    label: string,
    value: string,
    opts: { bold?: boolean } = {},
  ) => {
    ws.getCell(`B${row}`).value = label;
    ws.getCell(`B${row}`).font = { bold: true, color: { argb: "FF6B7686" } };
    ws.getCell(`C${row}`).value = value;
    if (opts.bold) ws.getCell(`C${row}`).font = { bold: true };
    ws.mergeCells(`C${row}:E${row}`);
  };

  ws.getCell(`B${r}`).value = empresa?.nombre ?? "Transportes Pucarani";
  ws.getCell(`B${r}`).font = { bold: true, size: 12 };
  r++;
  if (empresa?.representante) {
    ws.getCell(`B${r}`).value = empresa.representante;
    r++;
  }
  if (empresa?.direccion || empresa?.ciudad) {
    ws.getCell(`B${r}`).value = [empresa?.direccion, empresa?.ciudad]
      .filter(Boolean)
      .join(", ");
    r++;
  }
  if (empresa?.giro) {
    ws.getCell(`B${r}`).value = `Giro: ${empresa.giro}`;
    r++;
  }
  if (empresa?.telefono) {
    ws.getCell(`B${r}`).value = `Teléfono: ${empresa.telefono}`;
    r++;
  }
  if (empresa?.rut) {
    ws.getCell(`B${r}`).value = `RUT: ${empresa.rut}`;
    r++;
  }

  r++;
  put(r++, "Cliente", c.cliente?.nombre ?? "—", { bold: true });
  if (c.cliente?.rut) put(r++, "RUT cliente", c.cliente.rut);
  put(r++, "Fecha", formatDate(c.fecha));
  put(r++, "Válido hasta", formatDate(c.fecha_validez));
  put(r++, "Autor", c.autor ?? "—");
  if (c.titulo) put(r++, "Servicio", c.titulo);

  r++;
  // Encabezado de la tabla
  const head = r;
  const headers = ["#", "Descripción", "Cant.", "Valor unitario", "Total"];
  headers.forEach((h, i) => {
    const cell = ws.getCell(head, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: BRAND },
    };
    cell.alignment = {
      horizontal: i >= 2 ? "right" : "left",
      vertical: "middle",
    };
  });
  r++;

  c.items.forEach((it, idx) => {
    ws.getCell(r, 1).value = idx + 1;
    ws.getCell(r, 2).value = it.descripcion;
    ws.getCell(r, 2).alignment = { wrapText: true, vertical: "top" };
    ws.getCell(r, 3).value = Number(it.cantidad);
    ws.getCell(r, 4).value = Number(it.valor_unitario);
    ws.getCell(r, 5).value = Number(it.total);
    ws.getCell(r, 4).numFmt = '"$"#,##0';
    ws.getCell(r, 5).numFmt = '"$"#,##0';
    ws.getCell(r, 3).alignment = { horizontal: "right" };
    r++;
  });

  // Totales
  const totalRow = (label: string, value: number, bold = false) => {
    ws.getCell(r, 4).value = label;
    ws.getCell(r, 4).font = { bold };
    ws.getCell(r, 4).alignment = { horizontal: "right" };
    ws.getCell(r, 5).value = value;
    ws.getCell(r, 5).numFmt = '"$"#,##0';
    ws.getCell(r, 5).font = { bold };
    r++;
  };
  totalRow("Subtotal", Number(c.subtotal));
  if (!c.exento_iva) totalRow("IVA (19%)", Number(c.iva));
  totalRow(
    c.exento_iva ? "Total (exento de IVA)" : "Total",
    Number(c.total),
    true,
  );

  if (c.nota_pie) {
    r++;
    ws.getCell(`B${r}`).value = c.nota_pie;
    ws.getCell(`B${r}`).alignment = { wrapText: true };
    ws.mergeCells(`B${r}:E${r}`);
  }

  const buf = await wb.xlsx.writeBuffer();

  return new Response(buf as unknown as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="cotizacion-${c.numero}.xlsx"`,
    },
  });
}
