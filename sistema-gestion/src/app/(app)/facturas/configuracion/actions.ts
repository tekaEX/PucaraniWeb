"use server";

import { esAdmin, puedeEditar, SIN_PERMISO } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { empresaActual } from "@/lib/empresa-server";
import { encrypt } from "@/lib/crypto";
import { sReq } from "@/lib/form-helpers";
import { mismoRut, parsearCaf } from "@/lib/caf";

export type FormState = { error?: string };

// Guarda las credenciales SII de la empresa: sube el certificado (.pfx) al
// bucket privado y cifra su clave (AES-256-GCM) antes de persistirla.
export async function guardarCredencialesSii(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await puedeEditar())) return { error: SIN_PERMISO };

  const rut = sReq(formData.get("rut"));
  const password = sReq(formData.get("password"));
  const cert = formData.get("certificado");
  const rutCertificado = sReq(formData.get("rut_certificado"));
  const numeroResolucionRaw = sReq(formData.get("numero_resolucion"));
  const fechaResolucion = sReq(formData.get("fecha_resolucion"));

  if (!rut) return { error: "El RUT es obligatorio." };

  // Los tres datos de abajo se cargan cuando el SII responde, que es después de
  // tener el certificado: por eso son opcionales acá y se exigen recién al
  // emitir. Lo que no se acepta es un número de resolución que no sea número.
  let numeroResolucion: number | null = null;
  if (numeroResolucionRaw) {
    numeroResolucion = Number(numeroResolucionRaw);
    if (!Number.isInteger(numeroResolucion) || numeroResolucion < 0) {
      return { error: "El número de resolución tiene que ser un entero (en certificación es 0)." };
    }
  }
  if (fechaResolucion && !/^\d{4}-\d{2}-\d{2}$/.test(fechaResolucion)) {
    return { error: "La fecha de la resolución no es válida." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado." };

  const empresa = await empresaActual();
  if (!empresa) return { error: "No hay empresa configurada." };
  const empresaId = empresa.id;

  const { data: existente } = await supabase
    .from("sii_credenciales")
    .select("cert_path, cert_password_enc")
    .eq("empresa_id", empresaId)
    .maybeSingle();

  // Subir el certificado solo si se adjuntó uno nuevo
  let cert_path = existente?.cert_path ?? "";
  if (cert && typeof cert !== "string" && cert.size > 0) {
    const path = `${empresaId}/certificado.pfx`;
    const bytes = new Uint8Array(await cert.arrayBuffer());
    const { error: upErr } = await supabase.storage
      .from("certificados")
      .upload(path, bytes, {
        contentType: "application/x-pkcs12",
        upsert: true,
      });
    if (upErr)
      return { error: `No se pudo subir el certificado: ${upErr.message}` };
    cert_path = path;
  }
  if (!cert_path) return { error: "Debes subir el certificado (.pfx)." };

  // Cifrar la clave nueva; si se dejó en blanco, conservar la existente
  let cert_password_enc = existente?.cert_password_enc ?? "";
  if (password) {
    try {
      cert_password_enc = encrypt(password);
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : "Error al cifrar la clave.",
      };
    }
  }
  if (!cert_password_enc)
    return { error: "Debes ingresar la clave del certificado." };

  const { error } = await supabase.from("sii_credenciales").upsert(
    {
      empresa_id: empresaId,
      rut,
      rut_certificado: rutCertificado || null,
      numero_resolucion: numeroResolucion,
      fecha_resolucion: fechaResolucion || null,
      cert_path,
      cert_password_enc,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "empresa_id" },
  );
  if (error) return { error: `No se pudo guardar: ${error.message}` };

  revalidatePath("/facturas/configuracion");
  redirect("/facturas/configuracion");
}

// Carga un CAF (archivo de folios del SII).
//
// Lo que se guarda es la METADATA del rango; el XML entero va al bucket privado
// 'certificados', porque adentro viene la llave con la que se timbran los
// documentos y no tiene por qué estar al alcance de un select.
//
// El rango NO se pide por formulario: se lee del propio archivo. Tipear a mano
// "del 465 al 564" es exactamente el error que después emite un folio fuera de
// rango y lo rechaza el SII.
export async function guardarCaf(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await esAdmin())) return { error: SIN_PERMISO };

  const archivo = formData.get("caf");
  if (!archivo || typeof archivo === "string" || archivo.size === 0) {
    return { error: "Elegí el archivo CAF (.xml) que descargaste del SII." };
  }

  const empresa = await empresaActual();
  if (!empresa) return { error: "No hay empresa configurada." };

  const supabase = await createClient();
  const { data: cred } = await supabase
    .from("sii_credenciales")
    .select("rut, ambiente")
    .eq("empresa_id", empresa.id)
    .maybeSingle();

  // Cargar folios NO exige tener el certificado todavía: son dos cosas
  // separadas y se consiguen en momentos distintos. Lo único que hace falta es
  // el RUT, para verificar que el CAF sea de esta empresa; si no hay
  // credenciales SII cargadas, sirve el RUT de la empresa.
  const rutEmpresa = cred?.rut ?? empresa.rut;
  if (!rutEmpresa) {
    return {
      error: "Falta el RUT de la empresa: cargalo en Configuración, o subí el certificado digital acá arriba.",
    };
  }

  const xml = await archivo.text();
  const leido = parsearCaf(xml);
  if ("error" in leido) return { error: leido.error };
  const caf = leido.datos;

  // Un CAF de OTRO RUT timbra documentos que no son tuyos: el SII los rechaza y
  // el error llega tarde y sin explicación. Se corta acá.
  if (!mismoRut(caf.rutEmisor, rutEmpresa)) {
    return {
      error: `Ese CAF es del RUT ${caf.rutEmisor} y la empresa está configurada como ${rutEmpresa}.`,
    };
  }

  const ambiente = (cred?.ambiente ?? "certificacion") as "certificacion" | "produccion";
  const path = `${empresa.id}/caf/${ambiente}-${caf.tipoDte}-${caf.folioDesde}-${caf.folioHasta}.xml`;
  const { error: upErr } = await supabase.storage
    .from("certificados")
    .upload(path, new Blob([xml], { type: "application/xml" }), {
      contentType: "application/xml",
      upsert: true,
    });
  if (upErr) return { error: `No se pudo guardar el CAF: ${upErr.message}` };

  const { error } = await supabase.from("sii_caf").insert({
    empresa_id: empresa.id,
    tipo_dte: caf.tipoDte,
    ambiente,
    folio_desde: caf.folioDesde,
    folio_hasta: caf.folioHasta,
    folio_siguiente: caf.folioDesde,
    fecha_autorizacion: caf.fechaAutorizacion,
    xml_path: path,
  });
  if (error) {
    // El índice único (empresa, tipo, ambiente, folio_desde) es lo que evita que
    // volver a subir el mismo CAF reinicie el contador y repita folios ya usados.
    if (error.code === "23505") {
      return {
        error: `Ese rango ya estaba cargado (tipo ${caf.tipoDte}, folios ${caf.folioDesde}–${caf.folioHasta}). No se volvió a cargar para no reiniciar los folios ya usados.`,
      };
    }
    return { error: `No se pudo registrar el rango: ${error.message}` };
  }

  revalidatePath("/facturas/configuracion");
  return {};
}
