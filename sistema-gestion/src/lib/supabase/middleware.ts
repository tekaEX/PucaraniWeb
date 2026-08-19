import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnv } from "./env";

// Refresca la sesión de Supabase en cada request y protege las rutas privadas.
// Se invoca desde proxy.ts (el "middleware" de Next.js 16).
export async function updateSession(request: NextRequest) {
  // Errores del enlace del correo (vencido, ya usado, o pedido desde un origen
  // que no está en las Redirect URLs de Supabase). Supabase los devuelve como
  // ?error_code=... y en esos casos el error puede caer en cualquier ruta: si el
  // redirect_to no estaba permitido, aterriza en el Site URL, o sea en "/".
  //
  // Va antes que todo lo demás porque si no, "/" sin sesión se trata como una
  // visita normal y termina en el login SIN decir nada: la persona ve un
  // formulario común y no entiende por qué su enlace no hizo nada.
  if (request.nextUrl.searchParams.has("error_code")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login/olvide-contrasena";
    url.search = "";
    url.searchParams.set("expirado", "1");
    return NextResponse.redirect(url);
  }

  let supabaseResponse = NextResponse.next({ request });

  // Va ANTES del try/catch de abajo a propósito: ese catch existe para que
  // Supabase caído no tire la app, y una variable faltante no es eso — es un
  // error de configuración que tiene que verse.
  const { url, anonKey } = supabaseEnv();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANTE: no ejecutar código entre createServerClient y getUser().
  // Si Supabase no responde (mala config o red), tratamos como "sin sesión"
  // en lugar de romper toda la app con un error 500. Ojo con la diferencia:
  // esto cubre a Supabase caído o inalcanzable, NO a una app mal configurada
  // —eso ya falló arriba, con el nombre de la variable que falta.
  let user = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    user = null;
  }

  const path = request.nextUrl.pathname;
  const isPublic = path.startsWith("/login") || path.startsWith("/auth") || path === "/favicon.ico";

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", path);
    return NextResponse.redirect(url);
  }

  // Si ya inició sesión y va a /login, lo mandamos al inicio. La excepción es
  // ?sin_acceso=1: ahí lo mandó exigirPanel() justamente PORQUE su sesión no
  // sirve para el panel. Rebotarlo al inicio lo devolvería a exigirPanel() y
  // de vuelta acá, en un ciclo infinito; se lo deja ver el login para que
  // pueda cerrar esa sesión o entrar con otra cuenta.
  if (user && path.startsWith("/login") && !request.nextUrl.searchParams.has("sin_acceso")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
