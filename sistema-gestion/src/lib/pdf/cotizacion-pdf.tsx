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
import { formatDate, formatCLP } from "@/lib/format";
import type { CotizacionDocumento } from "@/lib/queries";
import type { LogoData } from "@/lib/logo";

const BRAND = "#1d4e89";
const MUTED = "#6b7686";
const BORDER = "#d7dce4";

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 40,
    paddingHorizontal: 36,
    fontSize: 10,
    color: "#1a2230",
    fontFamily: "Helvetica",
  },
  headerBand: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: BRAND,
    color: "#ffffff",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 4,
  },
  logo: { height: 58, width: 64, objectFit: "contain" },
  logoText: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#ffffff" },
  headerTitle: { fontSize: 22, fontFamily: "Helvetica-Bold", color: "#ffffff" },
  topRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 16 },
  empresaName: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  metaBox: { alignItems: "flex-end" },
  metaLine: { flexDirection: "row", marginBottom: 2 },
  metaLabel: { color: MUTED, marginRight: 6 },
  metaValue: { fontFamily: "Helvetica-Bold" },
  small: { color: MUTED, marginTop: 2 },
  clienteBox: {
    marginTop: 16,
    padding: 10,
    backgroundColor: "#f4f6f9",
    borderRadius: 4,
  },
  clienteLabel: { color: MUTED, fontSize: 8, textTransform: "uppercase" },
  clienteName: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 2 },
  servicio: { marginTop: 14, fontSize: 11, fontFamily: "Helvetica-Bold" },
  table: { marginTop: 8, borderWidth: 1, borderColor: BORDER, borderRadius: 4 },
  thead: { flexDirection: "row", backgroundColor: BRAND },
  th: {
    color: "#ffffff",
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tr: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  td: { paddingVertical: 6, paddingHorizontal: 8 },
  colNum: { width: 26 },
  colDesc: { flex: 1 },
  colMid: { width: 54, textAlign: "right" },
  colMoney: { width: 80, textAlign: "right" },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 6,
  },
  totalLabel: { width: 120, textAlign: "right", color: MUTED, paddingRight: 8 },
  totalValue: { width: 90, textAlign: "right" },
  totalStrong: { fontFamily: "Helvetica-Bold", fontSize: 12 },
  nota: {
    marginTop: 18,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    color: MUTED,
    fontSize: 9,
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    textAlign: "center",
    color: MUTED,
    fontSize: 8,
  },
});

function CotizacionDoc({
  empresa,
  cotizacion: c,
  logo,
}: CotizacionDocumento & { logo: LogoData | null }) {
  const empresaLine = [empresa?.direccion, empresa?.ciudad]
    .filter(Boolean)
    .join(", ");

  return (
    <Document
      title={`Cotización N° ${c.numero}`}
      author={empresa?.nombre ?? "Transportes Pucarani"}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.headerBand}>
          {logo ? (
            <Image
              src={{ data: logo.buffer, format: logo.ext === "jpeg" ? "jpg" : "png" }}
              style={styles.logo}
            />
          ) : (
            <Text style={styles.logoText}>
              {empresa?.nombre ?? "Transportes Pucarani"}
            </Text>
          )}
          <Text style={styles.headerTitle}>Presupuesto</Text>
        </View>

        <View style={styles.topRow}>
          <View style={{ maxWidth: 280 }}>
            <Text style={styles.empresaName}>
              {empresa?.nombre ?? "Transportes Pucarani"}
            </Text>
            {empresa?.representante ? (
              <Text style={styles.small}>{empresa.representante}</Text>
            ) : null}
            {empresaLine ? <Text style={styles.small}>{empresaLine}</Text> : null}
            {empresa?.giro ? (
              <Text style={styles.small}>Giro: {empresa.giro}</Text>
            ) : null}
            {empresa?.telefono ? (
              <Text style={styles.small}>Teléfono: {empresa.telefono}</Text>
            ) : null}
            {empresa?.rut ? (
              <Text style={styles.small}>RUT: {empresa.rut}</Text>
            ) : null}
          </View>

          <View style={styles.metaBox}>
            <View style={styles.metaLine}>
              <Text style={styles.metaLabel}>N°</Text>
              <Text style={styles.metaValue}>{c.numero}</Text>
            </View>
            <View style={styles.metaLine}>
              <Text style={styles.metaLabel}>Fecha</Text>
              <Text style={styles.metaValue}>{formatDate(c.fecha)}</Text>
            </View>
            <View style={styles.metaLine}>
              <Text style={styles.metaLabel}>Válido hasta</Text>
              <Text style={styles.metaValue}>{formatDate(c.fecha_validez)}</Text>
            </View>
            {c.autor ? (
              <View style={styles.metaLine}>
                <Text style={styles.metaLabel}>Autor</Text>
                <Text style={styles.metaValue}>{c.autor}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.clienteBox}>
          <Text style={styles.clienteLabel}>Presupuesto para</Text>
          <Text style={styles.clienteName}>{c.cliente?.nombre ?? "—"}</Text>
          {c.cliente?.rut ? (
            <Text style={styles.small}>RUT: {c.cliente.rut}</Text>
          ) : null}
        </View>

        {c.titulo ? <Text style={styles.servicio}>{c.titulo}</Text> : null}

        <View style={styles.table}>
          <View style={styles.thead}>
            <Text style={[styles.th, styles.colNum]}>#</Text>
            <Text style={[styles.th, styles.colDesc]}>Descripción</Text>
            <Text style={[styles.th, styles.colMid]}>Cant.</Text>
            <Text style={[styles.th, styles.colMoney]}>V. unitario</Text>
            <Text style={[styles.th, styles.colMoney]}>Total</Text>
          </View>
          {c.items.map((it, i) => (
            <View style={styles.tr} key={it.id} wrap={false}>
              <Text style={[styles.td, styles.colNum]}>{i + 1}</Text>
              <Text style={[styles.td, styles.colDesc]}>{it.descripcion}</Text>
              <Text style={[styles.td, styles.colMid]}>{it.cantidad}</Text>
              <Text style={[styles.td, styles.colMoney]}>
                {formatCLP(it.valor_unitario)}
              </Text>
              <Text style={[styles.td, styles.colMoney]}>
                {formatCLP(it.total)}
              </Text>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 8 }}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{formatCLP(c.subtotal)}</Text>
          </View>
          {!c.exento_iva ? (
            <View style={styles.totalsRow}>
              <Text style={styles.totalLabel}>IVA (19%)</Text>
              <Text style={styles.totalValue}>{formatCLP(c.iva)}</Text>
            </View>
          ) : null}
          <View style={styles.totalsRow}>
            <Text style={[styles.totalLabel, styles.totalStrong]}>
              {c.exento_iva ? "Total (exento de IVA)" : "Total"}
            </Text>
            <Text style={[styles.totalValue, styles.totalStrong]}>
              {formatCLP(c.total)}
            </Text>
          </View>
        </View>

        {c.nota_pie ? <Text style={styles.nota}>{c.nota_pie}</Text> : null}

        <Text style={styles.footer} fixed>
          {empresa?.nombre ?? "Transportes Pucarani"}
          {empresa?.telefono ? ` · ${empresa.telefono}` : ""}
        </Text>
      </Page>
    </Document>
  );
}

export async function renderCotizacionPDF(
  data: CotizacionDocumento,
  logo: LogoData | null,
): Promise<Buffer> {
  return await renderToBuffer(<CotizacionDoc {...data} logo={logo} />);
}
