import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { formatDate, formatCLP, hoyChile } from "@/lib/format";
import type { ViajesInforme } from "@/lib/queries";
import type { LogoData } from "@/lib/logo";

const BRAND = "#1d4e89";
const MUTED = "#6b7686";
const BORDER = "#d7dce4";

const styles = StyleSheet.create({
  page: {
    paddingTop: 26,
    paddingBottom: 40,
    paddingHorizontal: 30,
    fontSize: 9,
    color: "#1a2230",
    fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 2,
    borderBottomColor: BRAND,
    paddingBottom: 10,
  },
  brandWrap: { flexDirection: "row", alignItems: "center" },
  logo: { height: 46, width: 46, objectFit: "contain", marginRight: 10 },
  empresaName: { fontSize: 13, fontFamily: "Helvetica-Bold", color: BRAND },
  small: { color: MUTED, fontSize: 8, marginTop: 1 },
  titleBox: { alignItems: "flex-end" },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  metaLine: { fontSize: 9, marginTop: 2 },
  metaLabel: { color: MUTED },
  table: { marginTop: 14 },
  thead: { flexDirection: "row", backgroundColor: BRAND },
  th: {
    color: "#ffffff",
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    paddingVertical: 5,
    paddingHorizontal: 5,
  },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDER },
  trAlt: { backgroundColor: "#f4f6f9" },
  td: { paddingVertical: 5, paddingHorizontal: 5 },
  cFecha: { width: 56 },
  cEmpresa: { width: 92 },
  cDesc: { flex: 1 },
  cNum: { width: 46 },
  cOC: { width: 70 },
  cEstado: { width: 80 },
  cMonto: { width: 66, textAlign: "right" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 2,
    borderTopColor: BRAND,
  },
  totalLabel: { fontSize: 11, fontFamily: "Helvetica-Bold", marginRight: 12 },
  totalValue: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    width: 90,
    textAlign: "right",
  },
  count: { marginTop: 4, color: MUTED, fontSize: 8 },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 30,
    right: 30,
    textAlign: "center",
    color: MUTED,
    fontSize: 8,
  },
});

function InformeDoc({
  data,
  logo,
}: {
  data: ViajesInforme;
  logo: LogoData | null;
}) {
  const { empresa, viajes, periodoLabel, empresaLabel, total } = data;
  const empresaLine = [empresa?.direccion, empresa?.ciudad]
    .filter(Boolean)
    .join(", ");

  return (
    <Document title={`Informe de servicios — ${periodoLabel}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.brandWrap}>
            {logo ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- <Image> de @react-pdf/renderer no admite alt
              <Image
                src={{ data: logo.buffer, format: logo.ext === "jpeg" ? "jpg" : "png" }}
                style={styles.logo}
              />
            ) : null}
            <View>
              <Text style={styles.empresaName}>
                {empresa?.nombre ?? "Transportes Pucarani"}
              </Text>
              {empresaLine ? <Text style={styles.small}>{empresaLine}</Text> : null}
              {empresa?.giro ? <Text style={styles.small}>{empresa.giro}</Text> : null}
              {empresa?.telefono ? (
                <Text style={styles.small}>Teléfono: {empresa.telefono}</Text>
              ) : null}
            </View>
          </View>

          <View style={styles.titleBox}>
            <Text style={styles.title}>Informe de servicios</Text>
            <Text style={styles.metaLine}>
              <Text style={styles.metaLabel}>Período: </Text>
              {periodoLabel}
            </Text>
            <Text style={styles.metaLine}>
              <Text style={styles.metaLabel}>Empresa: </Text>
              {empresaLabel}
            </Text>
            <Text style={styles.metaLine}>
              <Text style={styles.metaLabel}>Emitido: </Text>
              {/* Del día de Chile, no del reloj del servidor: un informe
                  generado a las 21:00 salía fechado mañana. */}
              {formatDate(hoyChile())}
            </Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.thead} fixed>
            <Text style={[styles.th, styles.cFecha]}>Fecha</Text>
            <Text style={[styles.th, styles.cEmpresa]}>Empresa</Text>
            <Text style={[styles.th, styles.cDesc]}>Descripción</Text>
            <Text style={[styles.th, styles.cNum]}>N° Fact.</Text>
            <Text style={[styles.th, styles.cOC]}>OC</Text>
            <Text style={[styles.th, styles.cEstado]}>Estado</Text>
            <Text style={[styles.th, styles.cMonto]}>Monto</Text>
          </View>

          {viajes.map((v, i) => (
            <View
              style={[styles.tr, ...(i % 2 ? [styles.trAlt] : [])]}
              key={v.id}
              wrap={false}
            >
              <Text style={[styles.td, styles.cFecha]}>{formatDate(v.fecha_inicio)}</Text>
              <Text style={[styles.td, styles.cEmpresa]}>{v.clienteNombre}</Text>
              <Text style={[styles.td, styles.cDesc]}>{v.descripcion}</Text>
              <Text style={[styles.td, styles.cNum]}>{v.folio ?? "—"}</Text>
              <Text style={[styles.td, styles.cOC]}>{v.orden_compra ?? "—"}</Text>
              <Text style={[styles.td, styles.cEstado]}>{v.estadoLabel}</Text>
              <Text style={[styles.td, styles.cMonto]}>{formatCLP(v.valor)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>TOTAL</Text>
          <Text style={styles.totalValue}>{formatCLP(total)}</Text>
        </View>
        <Text style={styles.count}>{viajes.length} servicio(s).</Text>

        <Text style={styles.footer} fixed>
          {empresa?.nombre ?? "Transportes Pucarani"}
          {empresa?.telefono ? ` · ${empresa.telefono}` : ""}
          {empresa?.email ? ` · ${empresa.email}` : ""}
        </Text>
      </Page>
    </Document>
  );
}

export async function renderInformePDF(
  data: ViajesInforme,
  logo: LogoData | null,
): Promise<Buffer> {
  return await renderToBuffer(<InformeDoc data={data} logo={logo} />);
}
