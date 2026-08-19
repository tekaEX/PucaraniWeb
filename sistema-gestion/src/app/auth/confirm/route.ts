import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Canje del enlace que llega por correo (recuperar contraseña, invitación,
// confirmación de correo) por una sesión. El enlace lo abre el navegador, así
// que esto tiene que ser un route handler y no una server action.
//
// Se aceptan las dos formas que puede tomar el enlace según cómo esté escrita
// la plantilla del correo en Supabase:
//   · token_hash + type → verifyOtp (la forma que recomienda Supabase para
//     apps con render en el servidor; requiere plantilla con {{ .TokenHash }})
//   · code             → exchangeCodeForSession (flujo PKCE, plantilla por
//     defecto; solo funciona en el mismo navegador que pidió el enlace)
//
// `next` dice a dónde ir después. Se valida que sea una ruta interna: viene en
// la URL del correo y redirigir a lo que diga sin mirar es una redirección
// abierta.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  const pedido = searchParams.get("next") ?? "/auth/nueva-contrasena";
  const next =
    pedido.startsWith("/") && !pedido.startsWith("//")
      ? pedido
      : "/auth/nueva-contrasena";

  const destino = request.nextUrl.clone();
  destino.search = "";

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      destino.pathname = next;
      return NextResponse.redirect(destino);
    }
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      destino.pathname = next;
      return NextResponse.redirect(destino);
    }
  }

  // Enlace vencido, ya usado, o abierto en otro navegador. Vuelve al formulario
  // de recuperación diciendo qué pasó, en vez de a una pantalla de error muda.
  destino.pathname = "/login/olvide-contrasena";
  destino.searchParams.set("expirado", "1");
  return NextResponse.redirect(destino);
}
