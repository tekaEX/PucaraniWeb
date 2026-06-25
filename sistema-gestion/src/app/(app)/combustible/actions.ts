"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDemo } from "@/lib/demo";
import { encrypt } from "@/lib/crypto";
import { sReq } from "@/lib/form-helpers";

export type FormState = { error?: string };

// Guarda las credenciales SII de la empresa: sube el certificado (.pfx) al
// bucket privado y cifra su clave (AES-256-GCM) antes de persistirla.
export async function guardarCredencialesSii(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (isDemo()) {
    return {
      error:
        "Modo demostración: conecta Supabase para guardar credenciales reales.",
    };
  }

  const rut = sReq(formData.get("rut"));
  const password = sReq(formData.get("password"));
  const cert = formData.get("certificado");

  if (!rut) return { error: "El RUT es obligatorio." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado." };

  const { data: empresa } = await supabase
    .from("empresa")
    .select("id")
    .order("created_at")
    .limit(1)
    .single();
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
      cert_path,
      cert_password_enc,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "empresa_id" },
  );
  if (error) return { error: `No se pudo guardar: ${error.message}` };

  revalidatePath("/combustible/configuracion");
  redirect("/vehiculos");
}
