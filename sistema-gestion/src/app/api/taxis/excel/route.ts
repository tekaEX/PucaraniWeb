import ExcelJS from "exceljs";
import { rechazoSiNoPanel } from "@/lib/auth";
import { cargarServiciosExport } from "@/lib/taxis-export";
import { formatDate, hoyChile, nombreArchivo } from "@/lib/format";
import {
  taxiTipoLabel,
  taxiPideDescripcion,
  taxiNombreCliente,
  taxiNombreChofer,
  type ServicioTaxiConRelaciones,
} from "@/types/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BRAND = "FF1D4E89";
const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Informe mensual de taxis (formato de la app original): Fecha | Tipo |
// Empresa | Chofer | Nombre | Monto + fila TOTAL. Con el periodo en "año
// completo" se genera una hoja por mes con datos.
function armarHoja(
  wb: ExcelJS.Workbook,
  titulo: string,
  nombreHoja: string,
  servicios: ServicioTaxiConRelaciones[],
) {
  const ws = wb.addWorksheet(nombreHoja);
  ws.columns = [
    { width: 12 },
    { width: 26 },
    { width: 28 },
    { width: 22 },
    { width: 22 },
    { width: 14 },
  ];

  ws.mergeCells("A1:F1");
  const t = ws.getCell("A1");
  t.value = titulo;
  t.font = { bold: true, size: 14 };
  ws.getCell("A2").value = `Generado: ${formatDate(hoyChile())} · ${servicios.length} servicio${servicios.length === 1 ? "" : "s"}`;
  ws.getCell("A2").font = { color: { argb: "FF6B7686" }, size: 10 };

  let r = 4;
  const headers = ["Fecha", "Tipo", "Empresa", "Chofer", "Nombre", "Monto"];
  headers.forEach((h, i) => {
    const cell = ws.getCell(r, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    cell.alignment = { horizontal: i === 5 ? "right" : "left", vertical: "middle" };
  });
  r++;

  let total = 0;
  for (const s of servicios) {
    // El "Especial" se informa con lo que fue: su nombre solo no dice nada.
    const tipo =
      taxiPideDescripcion(s.tipo) && s.descripcion
        ? `Especial: ${s.descripcion}`
        : taxiTipoLabel(s.tipo);
    ws.getCell(r, 1).value = formatDate(s.fecha);
    ws.getCell(r, 2).value = tipo;
    ws.getCell(r, 3).value = taxiNombreCliente(s) ?? "";
    ws.getCell(r, 4).value = taxiNombreChofer(s) ?? "";
    ws.getCell(r, 5).value = s.pasajero ?? "";
    ws.getCell(r, 6).value = Number(s.monto);
    ws.getCell(r, 6).numFmt = '"$"#,##0';
    total += Number(s.monto);
    r++;
  }

  r++;
  ws.getCell(r, 5).value = "TOTAL";
  ws.getCell(r, 5).font = { bold: true };
  ws.getCell(r, 5).alignment = { horizontal: "right" };
  ws.getCell(r, 6).value = total;
  ws.getCell(r, 6).numFmt = '"$"#,##0';
  ws.getCell(r, 6).font = { bold: true };
}

export async function GET(req: Request) {
  const rechazo = await rechazoSiNoPanel();
  if (rechazo) return rechazo;

  const url = new URL(req.url);
  const cliente = url.searchParams.get("cliente");

  const { servicios, periodo } = await cargarServiciosExport(cliente);
  if (servicios.length === 0) {
    return new Response("Sin servicios de taxi en el periodo seleccionado.", {
      status: 404,
    });
  }

  const wb = new ExcelJS.Workbook();
  const sufijo = cliente ? ` | ${cliente}` : "";

  if (periodo.mes === null) {
    // Año completo: una hoja por mes con datos.
    for (let m = 1; m <= 12; m++) {
      const delMes = servicios.filter(
        (s) => Number(s.fecha.slice(5, 7)) === m,
      );
      if (delMes.length === 0) continue;
      armarHoja(
        wb,
        `INFORME DE TRANSPORTES — ${MESES[m - 1].toUpperCase()} ${periodo.anio}${sufijo}`,
        MESES[m - 1],
        delMes,
      );
    }
  } else {
    armarHoja(
      wb,
      `INFORME DE TRANSPORTES — ${MESES[periodo.mes - 1].toUpperCase()} ${periodo.anio}${sufijo}`,
      MESES[periodo.mes - 1],
      servicios,
    );
  }

  const buffer = await wb.xlsx.writeBuffer();
  const nombre = nombreArchivo(
    `Informe_Taxis_${periodo.anio}${periodo.mes ? `_${MESES[periodo.mes - 1]}` : ""}${cliente ? `_${cliente}` : ""}`,
  );

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}.xlsx"`,
    },
  });
}
