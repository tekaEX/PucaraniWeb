import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { RolUsuario } from "@/types/db";

// Capa única de sesión + rol ("Data Access Layer" en los docs de Next 16:
// node_modules/next/dist/docs/01-app/02-guides/authentication.md).
//
// Por qué acá y no en el proxy (src/proxy.ts): la propia doc de Next dice que
// el proxy sirve para chequeos OPTIMISTAS y no debe hacer consultas a la base
// — corre en CADA request, incluidos los prefetch de <Link>. Leer el rol ahí
// significaría un viaje extra a Supabase por cada link que el navegador
// precarga. La autorización de verdad vive lo más cerca posible del dato: acá
// y en las policies RLS de Postgres.
//
// cache() de React memoiza el resultado durante UN render: el layout y la
// página pueden pedir la sesión sin que se consulte dos veces.

export type Sesion = {
  userId: string;
  email: string;
  rol: RolUsuario | null;
};

// Roles que ven el panel. Son TODOS los que hay: este sistema no tiene
// ninguna pantalla para el chofer. La tenía —la app de reparto en /conductor,
// que se fue a Ares junto con encomiendas— y era el único motivo por el que un
// chofer necesitaba cuenta. El valor 'chofer' sigue existiendo en el enum
// rol_usuario de Postgres (de un enum no se pueden quitar valores) pero ya no
// se le asigna a nadie; esta lista es la que manda en la app.
export const ROLES_PANEL: RolUsuario[] = ["admin", "operador", "contador"];

export function tieneAccesoAlPanel(rol: RolUsuario | null | undefined): boolean {
  return !!rol && ROLES_PANEL.includes(rol);
}

export const sesionActual = cache(async (): Promise<Sesion | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // perfiles_self_read (migración 0006) permite que cada usuario lea su propia
  // fila, así que esta consulta funciona con cualquier rol.
  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol")
    .eq("id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? "",
    rol: (perfil?.rol as RolUsuario | undefined) ?? null,
  };
});

/** Hay sesión, sin importar el rol. Si no, al login. */
export async function exigirSesion(): Promise<Sesion> {
  const sesion = await sesionActual();
  if (!sesion) redirect("/login");
  return sesion;
}

// Puerta del panel. El login ya rechaza a quien no tenga un rol de panel, pero
// esto NO es redundante: las cuentas de chofer que quedaron con la sesión
// abierta en el teléfono desde antes de sacar encomiendas traen la cookie
// puesta y nunca vuelven a pasar por el login. Sin esta guardia verían el
// armazón del panel de una empresa que ya no es la suya (vacío, porque RLS les
// niega los datos, pero visible). Van al login con el aviso, y ahí sí se les
// cierra la sesión.
export async function exigirPanel(): Promise<Sesion> {
  const sesion = await exigirSesion();
  if (!tieneAccesoAlPanel(sesion.rol)) redirect("/login?sin_acceso=1");
  return sesion;
}
