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
import { formatDate } from "@/lib/format";
import type { LogoData } from "@/lib/logo";
import {
  taxiNombreChofer,
  type Empresa,
  type ServicioTaxiConRelaciones,
  type TaxiTipo,
} from "@/types/db";

// Vale de servicio de taxi: réplica del talonario físico de la empresa.
// Un vale por página (tamaño media carta apaisada), listo para imprimir y
// firmar. Las 6 casillas son los servicios del talonario; "especial" se
// agrega como línea aparte con su descripción.

const BRAND = "#1d4e89";
const MUTED = "#6b7686";
const BORDER = "#9aa4b2";

// Los 6 servicios con casilla en el talonario (texto tal como va impreso).
const VALE_SERVICIOS: { tipo: TaxiTipo; texto: string }[] = [
  { tipo: "aeropuerto_arica", texto: "AEROPUERTO CIUDAD ARICA" },
  { tipo: "arica_aeropuerto", texto: "CIUDAD ARICA AEROPUERTO" },
  { tipo: "tacna_peru", texto: "TACNA-PERÚ" },
  { tipo: "local", texto: "SERVICIO LOCAL" },
  { tipo: "taxi_exclusivo", texto: "TAXI EXCLUSIVO" },
  { tipo: "taxi_compartido", texto: "TAXI COMPARTIDO" },
];

const styles = StyleSheet.create({
  page: {
    paddingVertical: 20,
    paddingHorizontal: 26,
    fontSize: 9,
    color: "#1a2230",
    fontFamily: "Helvetica",
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { height: 44, width: 50, objectFit: "contain" },
  brandName: { fontSize: 15, fontFamily: "Helvetica-Bold", color: BRAND },
  brandSub: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#c2410c" },
  contacto: { color: MUTED, fontSize: 7.5, marginTop: 1 },
  fila: { flexDirection: "row", gap: 8, marginTop: 10 },
  cajaDato: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 3,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  cajaLabel: { fontFamily: "Helvetica-Bold", fontSize: 8, marginRight: 6 },
  cajaValor: { fontSize: 10 },
  tabla: { marginTop: 10, borderWidth: 1, borderColor: BORDER, borderRadius: 3 },
  servicioRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingVertical: 4.5,
    paddingHorizontal: 8,
  },
  primeraRow: { borderTopWidth: 0 },
  casilla: {
    width: 13,
    height: 13,
    borderWidth: 1,
    borderColor: "#1a2230",
    borderRadius: 2,
    marginRight: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  equis: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: -1 },
  servicioTexto: { flex: 1, fontSize: 9 },
  servicioMonto: { fontFamily: "Helvetica-Bold", fontSize: 10 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: 8,
    gap: 8,
  },
  totalLabel: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  totalCaja: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 3,
    paddingVertical: 4,
    paddingHorizontal: 14,
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
  },
  firmas: { flexDirection: "row", gap: 24, marginTop: 26 },
  firma: { flex: 1, alignItems: "center" },
  firmaNombre: { fontSize: 9, marginBottom: 2, color: "#1a2230" },
  firmaLinea: {
    alignSelf: "stretch",
    borderTopWidth: 1,
    borderTopColor: "#1a2230",
    paddingTop: 3,
  },
  firmaLabel: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: MUTED,
    textAlign: "center",
  },
  pie: { marginTop: 14, textAlign: "center", color: MUTED, fontSize: 7 },
});

function miles(n: number): string {
  return Number(n).toLocaleString("es-CL");
}

function Vale({
  s,
  empresa,
  logo,
}: {
  s: ServicioTaxiConRelaciones;
  empresa: Empresa | null;
  logo: LogoData | null;
}) {
  return (
    <Page size={[396, 300]} style={styles.page}>
      <View style={styles.header}>
        {logo ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image src={logo.buffer} style={styles.logo} />
        ) : null}
        <View>
          <Text style={styles.brandName}>TRANSPORTES PUCARANI</Text>
          <Text style={styles.brandSub}>TURISMO PUCARANI</Text>
          <Text style={styles.contacto}>
            CEL: 995430273 • 991622929 · Web: pucarani.cl
          </Text>
          <Text style={styles.contacto}>
            ninotranspores@hotmail.com · {empresa?.ciudad ?? "Arica"} - Chile
          </Text>
        </View>
      </View>

      <View style={styles.fila}>
        <View style={styles.cajaDato}>
          <Text style={styles.cajaLabel}>FECHA</Text>
          <Text style={styles.cajaValor}>{formatDate(s.fecha)}</Text>
        </View>
        <View style={styles.cajaDato}>
          <Text style={styles.cajaLabel}>NOMBRE</Text>
          <Text style={styles.cajaValor}>{s.pasajero ?? ""}</Text>
        </View>
      </View>

      <View style={styles.tabla}>
        {VALE_SERVICIOS.map((vs, i) => {
          const marcado = s.tipo === vs.tipo;
          return (
            <View
              key={vs.tipo}
              style={
                i === 0 ? [styles.servicioRow, styles.primeraRow] : styles.servicioRow
              }
            >
              <View style={styles.casilla}>
                {marcado ? <Text style={styles.equis}>X</Text> : null}
              </View>
              <Text style={styles.servicioTexto}>{vs.texto}</Text>
              {marcado ? (
                <Text style={styles.servicioMonto}>$ {miles(s.monto)}</Text>
              ) : null}
            </View>
          );
        })}
        {s.tipo === "especial" ? (
          <View style={styles.servicioRow}>
            <View style={styles.casilla}>
              <Text style={styles.equis}>X</Text>
            </View>
            <Text style={styles.servicioTexto}>
              ESPECIAL: {s.descripcion ?? ""}
            </Text>
            <Text style={styles.servicioMonto}>$ {miles(s.monto)}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>TOTAL</Text>
        <Text style={styles.totalCaja}>$ {miles(s.monto)}</Text>
      </View>

      <View style={styles.firmas}>
        <View style={styles.firma}>
          <Text style={styles.firmaNombre}>{taxiNombreChofer(s) ?? " "}</Text>
          <View style={styles.firmaLinea}>
            <Text style={styles.firmaLabel}>FIRMA CONDUCTOR</Text>
          </View>
        </View>
        <View style={styles.firma}>
          <Text style={styles.firmaNombre}> </Text>
          <View style={styles.firmaLinea}>
            <Text style={styles.firmaLabel}>FIRMA PASAJERO</Text>
          </View>
        </View>
      </View>

      <Text style={styles.pie}>GRAFICOLOR • Celular: +56 9 94888863 • Arica</Text>
    </Page>
  );
}

export async function renderValesTaxiPDF(
  servicios: ServicioTaxiConRelaciones[],
  empresa: Empresa | null,
  logo: LogoData | null,
): Promise<Buffer> {
  return await renderToBuffer(
    <Document>
      {servicios.map((s) => (
        <Vale key={s.id} s={s} empresa={empresa} logo={logo} />
      ))}
    </Document>,
  );
}
