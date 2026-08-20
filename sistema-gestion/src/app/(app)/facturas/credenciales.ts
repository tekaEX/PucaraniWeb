import "server-only";

// Cargar el certificado de un ambiente y dejarlo listo para firmar.
//
// Vive aparte porque lo necesitan tres acciones —emitir, reenviar y consultar—
// y las tres tienen que resolverlo IGUAL: misma empresa, mismo ambiente, misma
// forma de descifrar la clave. Cuando esto estaba copiado en cada una, bastaba
// con arreglar un detalle en un lugar y olvidarlo en los otros dos para que dos
// acciones firmaran con credenciales distintas.
//
// La clave se descifra solo en memoria y nunca sale de acá dentro de un objeto
// que pueda terminar en una respuesta.

import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import type { Certificado } from "@/lib/sii/simpleapi";
import type { Ambiente } from "@/lib/sii/estado";

export type CredencialCargada = {
  certificado: Certificado;
  /** RUT de la EMPRESA emisora (el que valida el <RE> del CAF). */
  rutEmpresa: string;
  numeroResolucion: number | null;
  fechaResolucion: string | null;
};

export async function cargarCredencial(
  empresaId: string,
  ambiente: Ambiente,
  rutEmpresaFallback?: string | null,
): Promise<CredencialCargada | { error: string }> {
  const supabase = await createClient();

  // Lista filtrada por ambiente, no `.maybeSingle()`: desde la migración 0053
  // una empresa puede tener dos credenciales y `maybeSingle` fallaría la
  // consulta entera al aparecer la segunda.
  const { data: creds } = await supabase
    .from("sii_credenciales")
    .select("rut, rut_certificado, cert_path, cert_password_enc, numero_resolucion, fecha_resolucion")
    .eq("empresa_id", empresaId)
    .eq("ambiente", ambiente);

  const cred = creds?.[0] ?? null;
  if (!cred?.cert_path) {
    return {
      error: `Faltan las credenciales del SII para ${ambiente}. Cargá el certificado de ese ambiente en Facturas › Configuración.`,
    };
  }
  if (!cred.rut_certificado) {
    return {
      error:
        "Falta el RUT del titular del certificado (la persona dueña de la firma, no la empresa). Cargalo en Facturas › Configuración.",
    };
  }

  const { data: archivo, error: errCert } = await supabase.storage
    .from("certificados")
    .download(cred.cert_path);
  if (errCert || !archivo) return { error: "No se pudo leer el certificado digital." };

  let password: string;
  try {
    password = decrypt(cred.cert_password_enc);
  } catch {
    return { error: "No se pudo descifrar la clave del certificado. ¿Cambió ENCRYPTION_KEY?" };
  }

  return {
    certificado: {
      rut: cred.rut_certificado,
      password,
      pfx: new Uint8Array(await archivo.arrayBuffer()),
    },
    rutEmpresa: cred.rut ?? rutEmpresaFallback ?? "",
    numeroResolucion: cred.numero_resolucion,
    fechaResolucion: cred.fecha_resolucion,
  };
}
