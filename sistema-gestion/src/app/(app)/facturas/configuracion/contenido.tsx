import { createClient } from "@/lib/supabase/server";
import { empresaActual } from "@/lib/empresa-server";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { CredForm } from "./cred-form";
import { CafForm } from "./caf-form";
import { AmbienteForm } from "./ambiente-form";
import { EstadoSimpleApi } from "./estado-simpleapi";
import { TIPOS_DTE } from "@/types/db";
import { formatDate } from "@/lib/format";
import { configSii } from "../config-sii";

// El cuerpo de la configuración SII, sin encabezado ni enlaces de "volver".
//
// Vive aparte de la página porque se muestra en dos lugares: como pantalla
// completa (/facturas/configuracion, útil para entrar directo o compartir el
// enlace) y como modal desde el botón de Facturas, que es de donde se abre
// siempre. Duplicar este cuerpo sería garantizar que las dos versiones se vayan
// separando con el tiempo.

type Caf = {
  id: string;
  tipo_dte: number;
  ambiente: string;
  folio_desde: number;
  folio_hasta: number;
  folio_siguiente: number;
  fecha_autorizacion: string;
};

export async function ConfiguracionSii() {
  let rut = "";
  let rutCertificado = "";
  let numeroResolucion = "";
  let fechaResolucion = "";
  let tieneCert = false;
  let ambiente = "certificacion";
  let cafs: Caf[] = [];

  const supabase = await createClient();
  const empresa = await empresaActual();

  // El diagnóstico manda: sabe cuál es el ambiente activo (migración 0054) y
  // resuelve componente por componente qué falta para poder emitir.
  const diagnostico = await configSii();
  ambiente = diagnostico.ambiente;

  if (empresa) {
    rut = empresa.rut ?? "";
    const [{ data: creds }, { data: cafData }] = await Promise.all([
      // Filtrado por ambiente y como LISTA: desde la 0053 una empresa puede
      // tener dos credenciales, y `.maybeSingle()` habría fallado la consulta
      // entera al aparecer la segunda en vez de traer la que corresponde.
      supabase
        .from("sii_credenciales")
        .select("rut, rut_certificado, numero_resolucion, fecha_resolucion, cert_path, ambiente")
        .eq("empresa_id", empresa.id)
        .eq("ambiente", diagnostico.ambiente),
      supabase
        .from("sii_caf")
        .select("id, tipo_dte, ambiente, folio_desde, folio_hasta, folio_siguiente, fecha_autorizacion")
        .eq("empresa_id", empresa.id)
        .order("tipo_dte")
        .order("folio_desde"),
    ]);
    const cred = creds?.[0] ?? null;
    if (cred) {
      tieneCert = Boolean(cred.cert_path);
      rut = cred.rut ?? rut;
      rutCertificado = cred.rut_certificado ?? "";
      numeroResolucion = cred.numero_resolucion === null ? "" : String(cred.numero_resolucion);
      fechaResolucion = cred.fecha_resolucion ?? "";
    }
    cafs = (cafData ?? []) as Caf[];
  }


  return (
    <div className="space-y-4">
      {/* El ambiente no es un detalle: decide si los documentos que salgan de
          acá son de prueba o documentos tributarios reales. */}
      {ambiente === "produccion" ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger-bg p-3">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <p className="text-sm text-danger">
            Ambiente de <strong>producción</strong>: todo lo que se emita desde acá
            son documentos tributarios reales ante el SII.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-2.5 rounded-xl border border-border bg-white p-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
          <p className="text-sm text-muted">
            Ambiente de <strong>certificación</strong>: lo que se emita es de prueba
            y no tiene efecto tributario. Es donde el SII exige probar antes de
            autorizar la emisión real.
          </p>
        </div>
      )}

      {/* Estado componente por componente. Antes era una sola frase con todo
          lo que faltaba junto; separarlo importa porque son cosas que se
          consiguen en momentos distintos y de manos distintas — la key la pone
          el servidor, el certificado lo compra el representante legal, los
          folios los da el SII— y quien configura necesita saber cuál de las
          siete le toca a él ahora. */}
      <Card>
        <CardHeader>
          <CardTitle>
            {diagnostico.listo ? "Listo para emitir" : "Qué falta para emitir"}
          </CardTitle>
        </CardHeader>
        <CardBody>
          <ul className="space-y-2">
            {diagnostico.componentes.map((c) => (
              <li key={c.clave} className="flex items-start gap-2.5 text-sm">
                {c.listo ? (
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden />
                ) : (
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
                )}
                <span className="min-w-0">
                  {/* El estado va en TEXTO además del ícono y del color: una
                      lista donde lo que falta se distingue solo por ser rojo no
                      se puede leer sin ver los colores. */}
                  <span className="sr-only">{c.listo ? "Listo: " : "Falta: "}</span>
                  <span className={c.listo ? "text-foreground" : "font-medium text-warn"}>
                    {c.etiqueta}
                  </span>
                  <span className="text-muted"> — {c.detalle}</span>
                </span>
              </li>
            ))}
          </ul>
          {!diagnostico.listo ? (
            <p className="mt-3 text-xs text-muted">
              Mientras tanto las facturas se siguen registrando a mano, con folio y
              fecha tipeados.
            </p>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ambiente</CardTitle>
        </CardHeader>
        <CardBody>
          <AmbienteForm ambiente={diagnostico.ambiente} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conexión con SimpleAPI</CardTitle>
        </CardHeader>
        <CardBody>
          <EstadoSimpleApi />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Certificado digital</CardTitle>
        </CardHeader>
        <CardBody>
          <CredForm
            rut={rut}
            rutCertificado={rutCertificado}
            numeroResolucion={numeroResolucion}
            fechaResolucion={fechaResolucion}
            tieneCert={tieneCert}
          />
          <p className="mt-4 text-xs text-muted">
            El certificado se guarda en un bucket privado y su clave se cifra con
            AES-256-GCM. Solo se desencripta en memoria al firmar.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Folios autorizados (CAF)</CardTitle>
        </CardHeader>
        <CardBody className="space-y-5">
          {cafs.length === 0 ? (
            <p className="text-sm text-muted">
              Todavía no hay folios cargados. Sin un CAF no se puede emitir ningún
              documento: el SII autoriza rangos de números y cada factura tiene que
              salir de uno de ellos.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-background text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Documento</th>
                    <th className="px-3 py-2 font-medium">Ambiente</th>
                    <th className="px-3 py-2 font-medium">Rango</th>
                    <th className="px-3 py-2 font-medium text-right">Disponibles</th>
                    <th className="px-3 py-2 font-medium">Autorizado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {cafs.map((c) => {
                    const quedan = c.folio_hasta - c.folio_siguiente + 1;
                    return (
                      <tr key={c.id}>
                        <td className="px-3 py-2">
                          {c.tipo_dte} — {TIPOS_DTE[c.tipo_dte as keyof typeof TIPOS_DTE] ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-muted">{c.ambiente}</td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                          {c.folio_desde}–{c.folio_hasta}
                        </td>
                        <td
                          className={`px-3 py-2 text-right tabular-nums ${quedan === 0 ? "text-muted" : quedan <= 10 ? "text-warn" : ""}`}
                        >
                          {quedan === 0 ? "agotado" : quedan}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-muted">
                          {formatDate(c.fecha_autorizacion)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <CafForm />
        </CardBody>
      </Card>
    </div>
  );
}
