// Las dos variables sin las cuales no hay app, leídas en un solo lugar.
//
// Los tres clientes hacían `process.env.NEXT_PUBLIC_SUPABASE_URL!` con aserción
// de no-nulo. Si un despliegue arranca sin esas variables, el `!` miente: el
// cliente se construye con `undefined`, la llamada falla, y el proxy —que
// atrapa el error de red a propósito, para que Supabase caído no tire un 500—
// lo interpreta como "este usuario no tiene sesión". El resultado es una
// pantalla de login que no entra nunca, idéntica a una contraseña equivocada.
// Nadie mira la configuración porque nada apunta hacia allá.
//
// Acá revienta con nombre propio y dice cuál falta. La app SIGUE compilando y
// arrancando: no se rompe el build, que es la otra alternativa y esa sí es una
// decisión del dueño (ver `pendientes.md` §3.1).
//
// No lleva `server-only`: el cliente de navegador también pasa por acá. Las
// `NEXT_PUBLIC_*` las incrusta el bundler en el bundle, así que si faltan al
// compilar, el error aparece igual en el navegador.

export type SupabaseEnv = { url: string; anonKey: string };

export function supabaseEnv(): SupabaseEnv {
  // Los accesos van escritos completos y literales a propósito: el bundler los
  // reemplaza por su valor buscando exactamente ese texto. Con
  // `process.env[nombre]` no habría nada que reemplazar y en el navegador
  // llegarían siempre vacías.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const faltan = [
    !url && "NEXT_PUBLIC_SUPABASE_URL",
    !anonKey && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ].filter(Boolean);

  if (faltan.length > 0) {
    throw new Error(
      `Configuración incompleta: falta ${faltan.join(" y ")}. ` +
        "Sin esas variables la app no puede hablar con la base y el login no " +
        "va a funcionar por más que la contraseña sea correcta. " +
        "En local van en .env.local (ver .env.example); en Vercel, en las " +
        "variables del proyecto — y ahí hay que volver a desplegar, porque las " +
        "NEXT_PUBLIC_* se incrustan al compilar.",
    );
  }

  return { url: url as string, anonKey: anonKey as string };
}
