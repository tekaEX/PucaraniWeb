import "server-only";
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
  /**
   * La empresa de la cuenta (migración 0050). Casi nunca hace falta pasarla a
   * una consulta —las policies RLS ya filtran por ella sin que la app diga
   * nada—; está acá para lo que Postgres no puede filtrar solo, como la carpeta
   * del bucket privado donde se guardan los adjuntos.
   */
  empresaId: string | null;
};

// Roles que ven el panel. Son TODOS los que hay: este sistema no tiene
// ninguna pantalla para el chofer. La tenía —la app de reparto en /conductor,
// que se fue a Ares junto con encomiendas— y era el único motivo por el que un
// chofer necesitaba cuenta.
//
// 'contador' era el tercero: el contador externo entraba a mirar facturas,
// gastos y viajes sin poder escribir (RLS de la migración 0006). Nunca se le
// asignó a nadie y la app jamás implementó ese "solo lectura" —habría visto
// todos los botones de crear y editar, y recién al guardar le habría fallado
// contra RLS—, así que se retiró en la migración 0040.
//
// Los dos valores siguen existiendo en el enum rol_usuario de Postgres (de un
// enum no se pueden quitar valores), pero ya no se le asignan a nadie y no les
// queda ninguna policy: esta lista es la que manda en la app.
export const ROLES_PANEL: RolUsuario[] = ["admin", "operador"];

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
  // fila, así que esta consulta funciona con cualquier rol. Es también la única
  // policy que NO filtra por empresa, y no puede: es la consulta con la que se
  // averigua cuál es la empresa.
  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol, empresa_id")
    .eq("id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? "",
    rol: (perfil?.rol as RolUsuario | undefined) ?? null,
    empresaId: (perfil?.empresa_id as string | undefined) ?? null,
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

// ---------------------------------------------------------------------------
// Las otras dos puertas de entrada
//
// exigirPanel() lo llama (app)/layout.tsx, así que cubre las PÁGINAS. No cubre
// las otras dos formas de entrar al sistema, que Next expone como endpoints
// independientes y no pasan por ningún layout:
//
//   · los Route Handlers de /api (exportaciones a PDF/Excel, sync del SII)
//   · las Server Actions, que se pueden invocar con un POST directo sin haber
//     abierto nunca la página que las usa
//
// Hoy RLS las frena igual —un rol sin permiso no lee ni escribe nada— y por eso
// no hay filtración. Pero la Constitución §II pide que la app aplique su propia
// regla en vez de delegarla entera a la base, y un rechazo temprano da un error
// honesto en lugar de uno de Postgres.
// ---------------------------------------------------------------------------

/**
 * Puerta del panel para Route Handlers.
 *
 * No redirige, a diferencia de exigirPanel(): un endpoint que devuelve un Excel
 * no puede contestar con una pantalla de login, porque el navegador guardaría
 * ese HTML como si fuera el .xlsx. Devuelve `null` si puede pasar, o la
 * respuesta de rechazo si no.
 */
export async function rechazoSiNoPanel(): Promise<Response | null> {
  const sesion = await sesionActual();
  if (!sesion) {
    return new Response("Necesitás iniciar sesión.", { status: 401 });
  }
  if (!tieneAccesoAlPanel(sesion.rol)) {
    return new Response("Esta cuenta no tiene acceso al sistema.", { status: 403 });
  }
  return null;
}

/**
 * Puerta del panel para Server Actions. Se usa al principio de cada action que
 * escribe:
 *
 *     if (!(await puedeEditar())) return { error: SIN_PERMISO };
 *
 * No es decorativa, y el caso que lo demuestra estaba documentado en
 * eliminarChofer: cuando RLS frena un DELETE, lo hace EN SILENCIO —0 filas
 * afectadas, sin error—, así que la action respondía "eliminado" a cualquiera
 * con sesión aunque no hubiera borrado nada. Para un INSERT o un UPDATE sí
 * llega el error de la policy; para un DELETE no. Ese es el motivo de fondo por
 * el que la app tiene que aplicar su propia regla y no delegarla toda a la base.
 */
export async function puedeEditar(): Promise<boolean> {
  const sesion = await sesionActual();
  return tieneAccesoAlPanel(sesion?.rol);
}

/**
 * Solo admin. Para lo que un operador NO puede tocar aunque sí pueda facturar:
 * las credenciales del SII y los rangos de folios (CAF), que son llaves de
 * firma. Las policies de sii_credenciales y sii_caf exigen lo mismo — esto
 * llega antes, con un mensaje en castellano en vez de un error de RLS.
 */
export async function esAdmin(): Promise<boolean> {
  const sesion = await sesionActual();
  return sesion?.rol === "admin";
}

/** Mensaje único, para que el rechazo se lea igual en todo el sistema. */
export const SIN_PERMISO = "Tu cuenta no tiene permiso para esta acción.";
