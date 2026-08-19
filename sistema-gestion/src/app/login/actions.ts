"use server";

import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tieneAccesoAlPanel } from "@/lib/auth";
import type { RolUsuario } from "@/types/db";

export type LoginState = { error?: string };

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = String(formData.get("redirect") ?? "/") || "/";

  if (!email || !password) {
    return { error: "Ingresa tu correo y contraseña." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Correo o contraseña incorrectos." };
  }

  // La contraseña puede ser correcta y la cuenta igual no tener nada que hacer
  // acá: las cuentas de chofer existían solo para la app de reparto, que se fue
  // con encomiendas. Se rechazan en el login —y se cierra la sesión que
  // signInWithPassword acaba de abrir— en vez de dejarlas entrar a un panel
  // donde RLS les niega todo: es más honesto que una pantalla llena de errores.
  const { data: perfil } = data.user
    ? await supabase.from("perfiles").select("rol").eq("id", data.user.id).maybeSingle()
    : { data: null };
  const rol = (perfil?.rol as RolUsuario | undefined) ?? null;

  if (!tieneAccesoAlPanel(rol)) {
    await supabase.auth.signOut();
    return { error: "Esta cuenta no tiene acceso al sistema." };
  }

  // El proxy pone ?redirect=<ruta> con la página que se intentó abrir sin
  // sesión. Solo se respeta si es una ruta interna ("//" abre otro sitio).
  const destinoValido = redirectTo.startsWith("/") && !redirectTo.startsWith("//");

  // El destino viene de la query, así que no es una ruta literal y typedRoutes
  // no puede verificarlo solo: hay que afirmarlo. Lo que sostiene el cast es la
  // validación de la línea de arriba, no la confianza en el string.
  redirect((destinoValido ? redirectTo : "/") as Route);
}

export type RecuperarState = { error?: string; enviado?: boolean };

// El origen público de la app, para armar el enlace que va en el correo. Se
// saca de la request y no de una variable de entorno para que funcione igual en
// localhost, en los preview de Vercel y en producción sin configurar nada. La
// URL igual tiene que estar permitida en Supabase (Authentication → URL
// Configuration → Redirect URLs), o Supabase manda al Site URL en su lugar.
async function origenPublico(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// "Olvidé mi contraseña": Supabase manda el correo con el enlace de
// recuperación. El canje del enlace ocurre en /auth/confirm.
export async function enviarRecuperacion(
  _prevState: RecuperarState,
  formData: FormData,
): Promise<RecuperarState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Ingresa tu correo." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await origenPublico()}/auth/confirm?next=/auth/nueva-contrasena`,
  });

  // No se distingue "esa cuenta no existe" de "listo, revisa tu correo":
  // Supabase tampoco lo hace, y decirlo convertiría esta pantalla en una forma
  // de averiguar qué correos tienen cuenta en el sistema. El único error que se
  // muestra es el del límite de envíos, que sí necesita explicación.
  if (error) {
    return {
      error:
        "No se pudo enviar el correo ahora (hay un límite de envíos por hora). " +
        "Espera unos minutos y vuelve a intentarlo.",
    };
  }

  return { enviado: true };
}

export type NuevaContrasenaState = { error?: string };

// Guarda la contraseña nueva. Corre con la sesión que abrió /auth/confirm al
// canjear el enlace del correo: si no hay sesión, no hay nada que cambiar.
export async function actualizarContrasena(
  _prevState: NuevaContrasenaState,
  formData: FormData,
): Promise<NuevaContrasenaState> {
  const password = String(formData.get("password") ?? "");
  const repetida = String(formData.get("password2") ?? "");

  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }
  if (password !== repetida) {
    return { error: "Las dos contraseñas no son iguales." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error:
        "El enlace ya no es válido. Pide uno nuevo desde «Olvidé mi contraseña».",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: `No se pudo cambiar la contraseña: ${error.message}` };
  }

  // Queda dentro con la sesión ya abierta: pedirle iniciar sesión de nuevo con
  // la contraseña que acaba de escribir no agrega seguridad, solo un paso.
  redirect(`/?guardado=${encodeURIComponent("Contraseña actualizada")}` as Route);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
