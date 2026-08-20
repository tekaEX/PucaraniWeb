import "server-only";

import { createClient } from "@/lib/supabase/server";
import { empresaActual } from "@/lib/empresa-server";
import type { ConfigSii, Ambiente, EstadoComponenteSii } from "@/lib/sii/estado";

// ¿Se puede emitir electrónicamente, y contra qué ambiente?
//
// Se resuelve una sola vez por pantalla, no por fila: el motivo es el mismo
// para todas las facturas y preguntarlo N veces serían N consultas iguales.
//
// Lo que cambió con la migración 0053: una empresa puede tener DOS credenciales,
// una por ambiente. Eso obliga a que TODO lo que se lee acá esté filtrado por el
// ambiente activo — credencial, folios y resolución—, porque la falla que esta
// función tiene que hacer imposible es emitir un documento real creyendo que es
// de prueba, o al revés. Antes, con `.maybeSingle()` sobre una tabla que ahora
// puede traer dos filas, ni siquiera habría respondido: habría fallado la
// consulta.

/** Qué falta para emitir, componente por componente. */
export type DiagnosticoSii = ConfigSii & {
  componentes: EstadoComponenteSii[];
};

export async function configSii(): Promise<DiagnosticoSii> {
  const supabase = await createClient();
  const empresa = await empresaActual();

  // El ambiente activo va en consulta aparte y su fallo se tolera: si la
  // migración 0054 todavía no se corrió, la columna no existe y esto devuelve
  // error. Caer a 'certificacion' es el modo degradado SEGURO — nunca produce
  // una emisión real por accidente.
  let ambiente: Ambiente = "certificacion";
  if (empresa) {
    const { data } = await supabase
      .from("empresa")
      .select("sii_ambiente_activo")
      .eq("id", empresa.id)
      .maybeSingle();
    if (data?.sii_ambiente_activo === "produccion") ambiente = "produccion";
  }

  const [{ data: creds }, { data: cafs }] = await Promise.all([
    // `select` de lista y no `.maybeSingle()`: desde la 0053 puede haber dos
    // filas por empresa y `maybeSingle` habría reventado con la segunda.
    supabase
      .from("sii_credenciales")
      .select("cert_path, rut, rut_certificado, numero_resolucion, fecha_resolucion, ambiente")
      .eq("ambiente", ambiente),
    // "Con folios libres" es folio_siguiente <= folio_hasta, y eso compara dos
    // columnas entre sí: PostgREST no lo expresa en un filtro. Son pocas filas
    // (un puñado de rangos por empresa), así que se resuelve acá.
    supabase.from("sii_caf").select("folio_siguiente, folio_hasta, tipo_dte").eq("ambiente", ambiente),
  ]);

  const cred = creds?.[0] ?? null;
  const rangosLibres = (cafs ?? []).filter((c) => c.folio_siguiente <= c.folio_hasta);

  // El diagnóstico por componente: la pantalla puede mostrar qué está listo y
  // qué falta sin adivinar, y quien configura avanza de a un paso.
  const componentes: EstadoComponenteSii[] = [
    {
      clave: "key",
      etiqueta: "Conexión con SimpleAPI",
      listo: Boolean(process.env.SIMPLEAPI_KEY?.trim()),
      // El valor de la key NO se devuelve nunca: solo si está puesta o no.
      detalle: process.env.SIMPLEAPI_KEY?.trim()
        ? "Configurada en el servidor."
        : "Falta SIMPLEAPI_KEY en el entorno del servidor.",
    },
    {
      clave: "rut_empresa",
      etiqueta: "RUT de la empresa",
      listo: Boolean(empresa?.rut),
      detalle: empresa?.rut ?? "Falta el RUT en Configuración › Empresa.",
    },
    {
      clave: "actividad",
      etiqueta: "Actividad económica",
      listo: (empresa?.actividad_economica?.length ?? 0) > 0,
      detalle:
        (empresa?.actividad_economica?.length ?? 0) > 0
          ? empresa!.actividad_economica.join(", ")
          : "Falta al menos un código de actividad (lo asigna el SII).",
    },
    {
      clave: "certificado",
      etiqueta: "Certificado digital",
      listo: Boolean(cred?.cert_path),
      detalle: cred?.cert_path
        ? `Cargado para ${ambiente}.`
        : `Falta el certificado de ${ambiente}.`,
    },
    {
      clave: "titular",
      etiqueta: "RUT del titular de la firma",
      listo: Boolean(cred?.rut_certificado),
      detalle:
        cred?.rut_certificado ??
        "Falta el RUT de la persona dueña del certificado (no es el de la empresa).",
    },
    {
      clave: "resolucion",
      etiqueta: "Resolución del SII",
      listo: cred?.numero_resolucion !== null && Boolean(cred?.fecha_resolucion),
      detalle:
        cred?.numero_resolucion !== null && cred?.fecha_resolucion
          ? `N° ${cred.numero_resolucion} del ${cred.fecha_resolucion}`
          : "Falta el número y la fecha (en certificación el número es 0).",
    },
    {
      clave: "folios",
      etiqueta: "Folios autorizados (CAF)",
      listo: rangosLibres.length > 0,
      detalle:
        rangosLibres.length > 0
          ? `${rangosLibres.length} rango(s) con folios libres en ${ambiente}.`
          : `No hay CAF con folios disponibles en ${ambiente}.`,
    },
  ];

  // El orden importa: se avisa lo PRIMERO que falta, no todo junto.
  const faltante = componentes.find((c) => !c.listo);

  return {
    ambiente,
    listo: !faltante,
    motivo: faltante ? faltante.detalle : undefined,
    componentes,
  };
}
