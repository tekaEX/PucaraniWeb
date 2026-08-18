import { NextResponse } from "next/server";
import { rechazoSiNoPanel } from "@/lib/auth";
import { estadoSuscripcion } from "@/lib/sii/simpleapi";

// "Probar conexión" con SimpleAPI: devuelve cuánto queda de cada servicio en el
// mes. Es la única llamada que no necesita certificado ni CAF, así que sirve
// para confirmar que la key está bien puesta antes de intentar emitir.
//
// No consume cuota (verificado: el `uso` no se mueve al llamarla).
export const runtime = "nodejs";

export async function GET() {
  const rechazo = await rechazoSiNoPanel();
  if (rechazo) return rechazo;

  const r = await estadoSuscripcion();
  if ("error" in r) return NextResponse.json(r, { status: 502 });
  return NextResponse.json(r);
}
