"use server";

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

  redirect(destinoValido ? redirectTo : "/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
