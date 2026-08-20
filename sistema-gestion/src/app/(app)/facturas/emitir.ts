"use server";

// Emitir una factura al SII.
//
// Es la acción menos reversible del sistema. Vale la pena tener presente por
// qué, porque explica el orden de todo lo que sigue:
//
//   · Un folio tomado no vuelve. Si la emisión falla después de tomarlo, ese
//     número queda con un hueco y hay que declararlo al SII como folio no
//     utilizado. Por eso primero se valida TODO —con un folio de mentira— y
//     recién cuando no queda nada que pueda fallar por datos se pide el real.
//   · Un documento aceptado por el SII no se borra: se anula con una nota de
//     crédito. Emitir con el monto equivocado no es un bug que se arregle con
//     un update.
//
// El contrato con SimpleAPI está verificado (ver src/lib/sii/simpleapi.ts) y la
// cadena entera se puede correr sin certificado real con `npm run test:simpleapi`.

import { revalidatePath } from "next/cache";
import { esAdmin, SIN_PERMISO } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { empresaActual } from "@/lib/empresa-server";
import { decrypt } from "@/lib/crypto";
import { hoyChile } from "@/lib/format";
import { construirDocumento, type TipoDteEmitible } from "@/lib/sii/documento";
import { configSii } from "./config-sii";
import {
  enviarAlSii,
  generarDte,
  generarPdf,
  generarSobre,
  RUT_SII,
  type Certificado,
} from "@/lib/sii/simpleapi";

export type ResultadoEmision = {
  error?: string;
  ok?: boolean;
  /** Se llena aunque haya error, si el folio alcanzó a consumirse. */
  folio?: number;
  trackId?: number;
  /** true cuando falló DESPUÉS de tomar el folio: hay que declararlo al SII. */
  folioPerdido?: boolean;
};

const TIPOS_EMITIBLES = [33, 34];

export async function emitirFactura(facturaId: string): Promise<ResultadoEmision> {
  // Emitir toca los folios y el certificado, que son de administración.
  // Además la RLS de la 0051 solo deja leer sii_caf a admin: un operador ni
  // siquiera podría encontrar el archivo del CAF.
  if (!(await esAdmin())) return { error: SIN_PERMISO };

  const supabase = await createClient();

  // --- Lo que se va a emitir ------------------------------------------------
  const { data: factura, error: errFactura } = await supabase
    .from("facturas")
    .select("id, tipo_dte, folio, estado, neto, iva, total, fecha_emision, cliente_id")
    .eq("id", facturaId)
    .single();
  if (errFactura || !factura) return { error: "No se encontró la factura." };

  if (factura.estado !== "borrador") {
    return { error: `Esta factura está en estado "${factura.estado}": solo se emite un borrador.` };
  }
  if (factura.folio) {
    return { error: `Esta factura ya tiene el folio ${factura.folio} asignado.` };
  }
  if (!TIPOS_EMITIBLES.includes(factura.tipo_dte)) {
    return {
      error: `El sistema emite facturas afectas (33) y exentas (34). Esta es tipo ${factura.tipo_dte}; las notas se cargan a mano.`,
    };
  }

  const { data: cliente } = await supabase
    .from("clientes")
    .select("nombre, rut, direccion, giro, comuna, contacto_telefono")
    .eq("id", factura.cliente_id)
    .single();
  if (!cliente) return { error: "La factura no tiene cliente." };

  const { data: viajes } = await supabase
    .from("viajes")
    .select("descripcion, valor, fecha_inicio")
    .eq("factura_id", facturaId)
    .order("fecha_inicio");

  const lineas = (viajes ?? []).map((v) => ({
    descripcion: v.descripcion,
    cantidad: 1,
    valorUnitario: Number(v.valor),
  }));

  // --- Quién emite ----------------------------------------------------------
  const empresa = await empresaActual();
  if (!empresa) return { error: "No hay empresa configurada." };

  // El ambiente lo decide la EMPRESA, no la credencial. Desde la 0053 puede
  // haber una credencial por ambiente, y desde la 0054 la empresa dice cuál está
  // activo; `configSii()` resuelve las dos cosas y cae a certificación si la
  // 0054 todavía no se corrió. Preguntárselo a la credencial sería circular: con
  // dos filas, no hay forma de que ella misma diga cuál manda.
  const config = await configSii();
  const ambiente = config.ambiente;

  const { data: creds } = await supabase
    .from("sii_credenciales")
    .select(
      "rut, rut_certificado, cert_path, cert_password_enc, ambiente, numero_resolucion, fecha_resolucion",
    )
    .eq("empresa_id", empresa.id)
    .eq("ambiente", ambiente);

  // Lista y no `.maybeSingle()`: con dos filas por empresa, `maybeSingle`
  // habría fallado la consulta entera en vez de traer la que corresponde.
  const cred = creds?.[0] ?? null;
  if (!cred) {
    return {
      error: `Faltan las credenciales del SII para ${ambiente}. Cargá el certificado de ese ambiente en Facturas › Configuración.`,
    };
  }
  if (!cred.rut_certificado) {
    return {
      error:
        "Falta el RUT del titular del certificado (la persona dueña de la firma). Cargalo en Facturas › Configuración.",
    };
  }
  if (cred.numero_resolucion === null || !cred.fecha_resolucion) {
    return {
      error:
        "Faltan el número y la fecha de la resolución del SII que autoriza a emitir. Van en la carátula de todo envío; cargalos en Facturas › Configuración.",
    };
  }

  const tipoDte = factura.tipo_dte as TipoDteEmitible;
  const fechaEmision = factura.fecha_emision ?? hoyChile();

  const emisor = {
    rut: cred.rut ?? empresa.rut ?? "",
    razonSocial: empresa.razon_social ?? empresa.nombre,
    giro: empresa.giro ?? "",
    direccion: empresa.direccion ?? "",
    comuna: empresa.comuna ?? empresa.ciudad ?? "",
    actividadEconomica: empresa.actividad_economica ?? [],
  };
  const receptor = {
    rut: cliente.rut ?? "",
    razonSocial: cliente.nombre,
    giro: cliente.giro ?? "",
    direccion: cliente.direccion ?? "",
    comuna: cliente.comuna ?? "",
    contacto: cliente.contacto_telefono,
  };

  // --- Ensayo: validar todo ANTES de gastar un folio ------------------------
  //
  // Se arma el documento con un folio de mentira solo para que salten los
  // errores de datos —falta el giro del cliente, los montos no cuadran—. Es la
  // diferencia entre "no se pudo emitir" y "no se pudo emitir y encima perdiste
  // el folio 466".
  const ensayo = construirDocumento({
    factura: { tipoDte, folio: 1, fechaEmision, neto: Number(factura.neto), iva: Number(factura.iva), total: Number(factura.total) },
    emisor,
    receptor,
    lineas,
  });
  if ("error" in ensayo) return { error: ensayo.error };

  // --- El certificado, descifrado solo en memoria ---------------------------
  const { data: certFile, error: errCert } = await supabase.storage
    .from("certificados")
    .download(cred.cert_path);
  if (errCert || !certFile) return { error: "No se pudo leer el certificado digital." };

  let password: string;
  try {
    password = decrypt(cred.cert_password_enc);
  } catch {
    return { error: "No se pudo descifrar la clave del certificado. ¿Cambió ENCRYPTION_KEY?" };
  }
  const certificado: Certificado = {
    rut: cred.rut_certificado,
    password,
    pfx: new Uint8Array(await certFile.arrayBuffer()),
  };

  // --- Cerrojo contra doble emisión -----------------------------------------
  //
  // La guarda de arriba (`if (factura.folio)`) mira un valor que se leyó al
  // principio de la acción, y entre esa lectura y `tomar_folio()` pasan varias
  // llamadas. Dos pestañas apretando "Emitir" casi a la vez leían las dos
  // `folio = null`, las dos pasaban, y se quemaban DOS folios para una sola
  // factura.
  //
  // Se toma el cerrojo en la base: un UPDATE condicionado a que la factura siga
  // siendo un borrador sin folio. Postgres serializa las dos escrituras, así que
  // solo una ve `count = 1`; la otra ve 0 y se va sin haber tocado un folio.
  // `estado_sii = 'emitiendo'` es además lo que la pantalla puede mostrar
  // mientras la emisión corre.
  const { data: cerrojo, error: errCerrojo } = await supabase
    .from("facturas")
    .update({ estado_sii: "emitiendo", updated_at: new Date().toISOString() })
    .eq("id", facturaId)
    .eq("estado", "borrador")
    .is("folio", null)
    // `estado_sii <> 'emitiendo'` es NULL cuando la columna es NULL, y en SQL
    // eso NO es verdadero: un `.neq()` a secas dejaría afuera justamente a los
    // borradores nuevos, que son los únicos que se emiten. De ahí el `or`.
    //
    // Esta condición es la que hace que el cerrojo funcione: el UPDATE cambia
    // `estado_sii`, así que cuando la segunda pestaña despierta del lock y
    // re-evalúa el WHERE contra la fila ya modificada, deja de calzar. Sin una
    // columna que cambie, las dos pasarían.
    .or("estado_sii.is.null,estado_sii.neq.emitiendo")
    .select("id");
  if (errCerrojo) return { error: `No se pudo iniciar la emisión: ${errCerrojo.message}` };
  if (!cerrojo || cerrojo.length === 0) {
    return {
      error:
        "Esta factura ya se está emitiendo (o se emitió recién) desde otra pantalla. Recargá la lista antes de volver a intentarlo.",
    };
  }

  /** Suelta el cerrojo dejando la factura como estaba. */
  const soltarCerrojo = async () => {
    await supabase.from("facturas").update({ estado_sii: null }).eq("id", facturaId);
  };

  // --- Desde acá el folio ya es irreversible --------------------------------
  const { data: folio, error: errFolio } = await supabase.rpc("tomar_folio", {
    p_tipo_dte: tipoDte,
    p_ambiente: ambiente,
  });
  if (errFolio || !folio) {
    // No se consumió ningún folio: la factura vuelve a quedar disponible.
    await soltarCerrojo();
    return {
      error:
        errFolio?.message ??
        `No quedan folios para el documento tipo ${tipoDte} en ${ambiente}. Pedí un CAF nuevo al SII y cargalo.`,
    };
  }
  const folioNum = Number(folio);

  /** Deja rastro del folio quemado: sin esto el hueco aparece recién en el SII. */
  const abortar = async (mensaje: string): Promise<ResultadoEmision> => {
    await supabase
      .from("facturas")
      .update({ sii_glosa: mensaje, estado_sii: "error", updated_at: new Date().toISOString() })
      .eq("id", facturaId);

    // El folio se gastó y hay que declararlo al SII. Antes el único rastro era
    // el número escrito dentro del texto de la glosa, que sirve para leerlo en
    // pantalla y para nada más: el trámite pide LA LISTA de folios a declarar, y
    // sacarla obligaba a leer glosas de a una. Acá queda como fila consultable.
    //
    // El fallo de este insert no cambia lo que se le responde a quien emitió: el
    // folio se perdió igual y el mensaje ya lo dice. Perder el registro es malo,
    // pero taparlo con otro error sería peor.
    await supabase.from("sii_folios_no_utilizados").insert({
      tipo_dte: tipoDte,
      ambiente,
      folio: folioNum,
      factura_id: facturaId,
      motivo: mensaje,
    });

    return {
      error: `${mensaje} El folio ${folioNum} quedó consumido: hay que declararlo al SII como folio no utilizado.`,
      folio: folioNum,
      folioPerdido: true,
    };
  };

  // El CAF del que salió el folio: es el que trae la llave con que se timbra.
  const { data: caf } = await supabase
    .from("sii_caf")
    .select("xml_path")
    .eq("tipo_dte", tipoDte)
    .eq("ambiente", ambiente)
    .lte("folio_desde", folioNum)
    .gte("folio_hasta", folioNum)
    .maybeSingle();
  if (!caf) return abortar(`No se encontró el CAF que contiene el folio ${folioNum}.`);

  const { data: cafFile, error: errCaf } = await supabase.storage
    .from("certificados")
    .download(caf.xml_path);
  if (errCaf || !cafFile) return abortar("No se pudo leer el archivo CAF.");
  const cafXml = await cafFile.text();

  // --- Armar, timbrar, ensobrar y enviar ------------------------------------
  const armado = construirDocumento({
    factura: { tipoDte, folio: folioNum, fechaEmision, neto: Number(factura.neto), iva: Number(factura.iva), total: Number(factura.total) },
    emisor,
    receptor,
    lineas,
  });
  if ("error" in armado) return abortar(armado.error);

  const timbrado = await generarDte(armado.documento, certificado, cafXml);
  if ("error" in timbrado) return abortar(timbrado.error);

  const sobre = await generarSobre(
    {
      rutEmisor: emisor.rut,
      rutReceptor: RUT_SII,
      numeroResolucion: cred.numero_resolucion,
      fechaResolucion: cred.fecha_resolucion,
    },
    certificado,
    [timbrado.xml],
  );
  if ("error" in sobre) return abortar(sobre.error);

  // El XML se guarda ANTES de enviar: si el envío se cae, el documento timbrado
  // no se pierde y se puede reintentar el envío sin volver a gastar folio.
  const xmlPath = `${empresa.id}/dte/${ambiente}-${tipoDte}-${folioNum}.xml`;
  await supabase.storage
    .from("adjuntos")
    .upload(xmlPath, new Blob([timbrado.xml], { type: "application/xml" }), {
      contentType: "application/xml",
      upsert: true,
    });

  const enviado = await enviarAlSii(certificado, sobre.xml, ambiente);
  if ("error" in enviado) {
    await supabase
      .from("facturas")
      .update({
        folio: folioNum,
        fecha_emision: fechaEmision,
        sii_ambiente: ambiente,
        sii_xml_path: xmlPath,
        estado_sii: "error",
        sii_glosa: enviado.error,
        updated_at: new Date().toISOString(),
      })
      .eq("id", facturaId);
    revalidatePath("/facturas");
    return {
      error: `${enviado.error} El documento quedó timbrado con el folio ${folioNum}; se puede reintentar solo el envío.`,
      folio: folioNum,
    };
  }

  // --- Quedó emitida --------------------------------------------------------
  const { error: errUpdate } = await supabase
    .from("facturas")
    .update({
      folio: folioNum,
      fecha_emision: fechaEmision,
      estado: "emitida",
      sii_ambiente: ambiente,
      sii_xml_path: xmlPath,
      sii_track_id: String(enviado.trackId),
      sii_enviado_at: new Date().toISOString(),
      estado_sii: enviado.estado || "enviado",
      sii_glosa: enviado.glosa || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", facturaId);
  if (errUpdate) {
    // El SII ya lo recibió: esto es un problema de la base, no de la emisión.
    return {
      error: `El SII recibió el documento (track id ${enviado.trackId}) pero no se pudo actualizar la factura: ${errUpdate.message}`,
      folio: folioNum,
      trackId: enviado.trackId,
    };
  }

  // --- La representación impresa, si sale -----------------------------------
  //
  // Va al final y no corta el flujo: el documento ya está emitido y el PDF se
  // puede regenerar cuando sea. Hacerlo bloqueante convertiría un problema
  // cosmético en una emisión "fallida".
  const pdf = await generarPdf(timbrado.xml, {
    numeroResolucion: cred.numero_resolucion,
    fechaResolucion: cred.fecha_resolucion,
    unidadSII: empresa.comuna ?? empresa.ciudad ?? "",
  });
  if (!("error" in pdf)) {
    const pdfPath = `${empresa.id}/dte/${ambiente}-${tipoDte}-${folioNum}.pdf`;
    const { error: errPdf } = await supabase.storage
      .from("adjuntos")
      .upload(pdfPath, new Blob([pdf.pdf.slice()], { type: "application/pdf" }), {
        contentType: "application/pdf",
        upsert: true,
      });
    if (!errPdf) {
      await supabase.from("facturas").update({ sii_pdf_path: pdfPath }).eq("id", facturaId);
    }
  }

  revalidatePath("/facturas");
  revalidatePath(`/facturas/${facturaId}`);
  return { ok: true, folio: folioNum, trackId: enviado.trackId };
}
