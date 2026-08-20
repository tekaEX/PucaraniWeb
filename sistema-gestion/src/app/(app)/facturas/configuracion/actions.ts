"use server";

import { esAdmin, SIN_PERMISO } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { empresaActual } from "@/lib/empresa-server";
import { encrypt } from "@/lib/crypto";
import { sReq } from "@/lib/form-helpers";
import { parsearCaf } from "@/lib/caf";
import { errorRut, mismoRut, normalizarRut } from "@/lib/rut";
import { errorCertificado } from "@/lib/sii/certificado";
import type { Ambiente } from "@/lib/sii/estado";
import { configSii } from "../config-sii";

export type FormState = { error?: string };

/**
 * Dónde vive el certificado de una empresa en el bucket privado.
 *
 * Dos cosas a propósito. El **ambiente** en la ruta: certificación y producción
 * usan certificados distintos y una ruta común obligaría a pisar uno con otro.
 * Y el **sufijo único**: si el archivo tuviera un nombre fijo, subir un
 * certificado nuevo destruiría el anterior ANTES de saber si el nuevo sirve —
 * y un `upsert` que falla después dejaría a la empresa sin poder emitir. Con
 * ruta nueva por carga, la fila de `sii_credenciales` es la única que decide
 * cuál está activo, y el anterior se borra recién cuando el nuevo quedó escrito.
 */
function rutaCertificado(empresaId: string, ambiente: string, ext: string, sufijo: string): string {
  return `${empresaId}/${ambiente}/certificado-${sufijo}${ext}`;
}

// Guarda las credenciales SII de la empresa: sube el certificado (.pfx) al
// bucket privado y cifra su clave (AES-256-GCM) antes de persistirla.
export async function guardarCredencialesSii(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  // Admin, no `puedeEditar`: el certificado y su clave son material de firma, y
  // la policy `sii_cred_admin_only` ya lo exige del lado de la base. Sin esta
  // guarda un operador subía el archivo al bucket y RECIÉN AHÍ la RLS le
  // rechazaba el insert, dejando el certificado huérfano en Storage.
  if (!(await esAdmin())) return { error: SIN_PERMISO };

  const rut = sReq(formData.get("rut"));
  const password = sReq(formData.get("password"));
  const cert = formData.get("certificado");
  const rutCertificado = sReq(formData.get("rut_certificado"));
  const numeroResolucionRaw = sReq(formData.get("numero_resolucion"));
  const fechaResolucion = sReq(formData.get("fecha_resolucion"));

  // El RUT de la EMPRESA: es contra este que se valida el <RE> del CAF y el que
  // viaja como emisor en cada DTE. Mal escrito, el SII rechaza todo.
  const errEmpresa = errorRut(rut, "El RUT de la empresa");
  if (errEmpresa) return { error: errEmpresa };

  // El RUT del TITULAR es otro: la persona dueña de la firma. Es opcional acá
  // (llega después) pero si está, tiene que estar bien.
  if (rutCertificado) {
    const errTitular = errorRut(rutCertificado, "El RUT del titular del certificado");
    if (errTitular) return { error: errTitular };
  }

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

  // A qué ambiente pertenece lo que se está cargando.
  //
  // Desde la 0053 una empresa puede tener una credencial por ambiente, así que
  // esto ya no se puede deducir de la fila existente —habría dos y ninguna
  // podría decir cuál se está editando—. Viene del formulario; si no viene, es
  // el ambiente activo de la empresa, y ante cualquier valor raro es
  // certificación, que es el que no emite documentos reales.
  const ambienteForm = sReq(formData.get("ambiente"));
  const ambiente: Ambiente =
    ambienteForm === "produccion" || ambienteForm === "certificacion"
      ? ambienteForm
      : (await configSii()).ambiente;

  const { data: existentes } = await supabase
    .from("sii_credenciales")
    .select("cert_path, cert_password_enc, ambiente")
    .eq("empresa_id", empresaId)
    .eq("ambiente", ambiente);

  // Lista y no `.maybeSingle()`: con dos filas por empresa, `maybeSingle`
  // habría fallado la consulta entera al aparecer la segunda.
  const existente = existentes?.[0] ?? null;

  // --- El certificado, si se adjuntó uno nuevo ------------------------------
  //
  // `pathAnterior` se recuerda para borrarlo DESPUÉS de que la fila quede
  // escrita; `pathNuevo`, para borrarlo si la escritura falla. Nunca hay un
  // momento en que la empresa se quede sin certificado utilizable.
  let cert_path = existente?.cert_path ?? "";
  let pathNuevo: string | null = null;
  const pathAnterior = existente?.cert_path ?? null;

  if (cert && typeof cert !== "string" && cert.size > 0) {
    const bytes = new Uint8Array(await cert.arrayBuffer());

    // Se valida ANTES de subir: un archivo que no es un PKCS#12 no tiene por
    // qué llegar nunca al bucket.
    const errCert = errorCertificado({ nombre: cert.name, tipo: cert.type, bytes });
    if (errCert) return { error: errCert };

    const ext = cert.name.toLowerCase().endsWith(".p12") ? ".p12" : ".pfx";
    pathNuevo = rutaCertificado(empresaId, ambiente, ext, String(Date.now()));

    // `upsert: false`: la ruta lleva un sufijo único, así que si ya existe es
    // que algo anda mal y es mejor fallar que pisar un archivo ajeno.
    const { error: upErr } = await supabase.storage
      .from("certificados")
      .upload(pathNuevo, bytes, { contentType: "application/x-pkcs12", upsert: false });
    if (upErr) return { error: `No se pudo subir el certificado: ${upErr.message}` };

    cert_path = pathNuevo;
  }
  if (!cert_path) return { error: "Debes subir el certificado (.pfx o .p12)." };

  /** Deshace la subida. Se usa en todo camino de error posterior a ella. */
  const limpiarSubida = async () => {
    if (pathNuevo) await supabase.storage.from("certificados").remove([pathNuevo]);
  };

  // --- La clave: cifrada, nunca en texto ------------------------------------
  let cert_password_enc = existente?.cert_password_enc ?? "";
  if (password) {
    try {
      cert_password_enc = encrypt(password);
    } catch (e) {
      await limpiarSubida();
      // El mensaje de `encrypt` habla de ENCRYPTION_KEY, no de la clave que
      // escribió el usuario: no hay riesgo de devolverla en la respuesta.
      return { error: e instanceof Error ? e.message : "Error al cifrar la clave." };
    }
  }
  if (!cert_password_enc) {
    await limpiarSubida();
    return { error: "Debes ingresar la clave del certificado." };
  }

  const valores = {
    // Se guarda canónico: el CAF trae el RUT sin puntos y comparar dos
    // formatos distintos del mismo número es una fuente de falsos rechazos.
    rut: normalizarRut(rut) ?? rut,
    rut_certificado: rutCertificado ? (normalizarRut(rutCertificado) ?? rutCertificado) : null,
    numero_resolucion: numeroResolucion,
    fecha_resolucion: fechaResolucion || null,
    cert_path,
    cert_password_enc,
    updated_at: new Date().toISOString(),
  };

  // Actualizar-si-existe en vez de `upsert`, y no es un rodeo: el `upsert`
  // necesitaba `onConflict: "empresa_id"`, que depende de la restricción única
  // que hoy tiene la tabla — una credencial por empresa. La migración `0053`
  // la cambia por `(empresa_id, ambiente)` para poder preparar producción sin
  // pisar certificación, y ese día el `onConflict` viejo dejaría de existir y
  // la carga fallaría. Escrito así funciona con las dos formas de la tabla, de
  // modo que la migración se puede aplicar cuando el dueño decida y no cuando
  // lo obligue el código.
  const { data: actualizadas, error: errUpd } = await supabase
    .from("sii_credenciales")
    .update(valores)
    .eq("empresa_id", empresaId)
    .eq("ambiente", ambiente)
    .select("id");

  const error =
    errUpd ??
    (actualizadas && actualizadas.length > 0
      ? null
      : (
          await supabase
            .from("sii_credenciales")
            .insert({ empresa_id: empresaId, ambiente, ...valores })
        ).error);

  if (error) {
    // Limpieza compensatoria: sin esto el bucket queda con un certificado que
    // ninguna fila referencia — material de firma sin dueño ni forma de saber
    // que sobra.
    await limpiarSubida();
    return { error: `No se pudo guardar: ${error.message}` };
  }

  // Recién ahora el anterior es reemplazable: la fila ya apunta al nuevo.
  // Si este borrado falla no se avisa nada — la credencial quedó bien y un
  // archivo viejo de más no rompe nada; volver atrás sí lo haría.
  if (pathNuevo && pathAnterior && pathAnterior !== pathNuevo) {
    await supabase.storage.from("certificados").remove([pathAnterior]);
  }

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

  // El CAF se carga al MISMO ambiente que se esté configurando: un rango de
  // folios de certificación cargado como producción emite documentos reales con
  // folios de prueba, que el SII rechaza y deja el folio quemado.
  const ambienteForm = sReq(formData.get("ambiente"));
  const ambiente: Ambiente =
    ambienteForm === "produccion" || ambienteForm === "certificacion"
      ? ambienteForm
      : (await configSii()).ambiente;

  const { data: creds } = await supabase
    .from("sii_credenciales")
    .select("rut, ambiente")
    .eq("empresa_id", empresa.id)
    .eq("ambiente", ambiente);
  const cred = creds?.[0] ?? null;

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

  // Misma convención que el certificado: `<empresa>/<ambiente>/caf/…`. El
  // ambiente va en la CARPETA y no en el nombre del archivo para que un listado
  // del bucket muestre de un vistazo qué pertenece a certificación y qué a
  // producción — mezclarlos es el error que esta feature existe para evitar.
  const path = `${empresa.id}/${ambiente}/caf/${caf.tipoDte}-${caf.folioDesde}-${caf.folioHasta}.xml`;
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
      // No se borra el XML: es EL MISMO archivo que ya estaba registrado (la
      // ruta se deriva del rango), así que borrarlo dejaría sin llave al CAF
      // bueno. La subida fue idempotente; el rechazo es solo del insert.
      return {
        error: `Ese rango ya estaba cargado (tipo ${caf.tipoDte}, folios ${caf.folioDesde}–${caf.folioHasta}). No se volvió a cargar para no reiniciar los folios ya usados.`,
      };
    }
    // Cualquier otro fallo sí deja un XML que ninguna fila referencia. Se borra:
    // el CAF trae la llave privada con la que se timbra, y no puede quedar
    // suelto en el bucket sin que nada lo reclame.
    await supabase.storage.from("certificados").remove([path]);
    return { error: `No se pudo registrar el rango: ${error.message}` };
  }

  revalidatePath("/facturas/configuracion");
  return {};
}
