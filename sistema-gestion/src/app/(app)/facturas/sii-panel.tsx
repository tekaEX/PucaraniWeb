"use client";

import { useState, useTransition } from "react";
import { FileCode2, FileText, RefreshCw, Send } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { SiiBadge } from "@/components/ui/badge";
import { formatDate, formatTime } from "@/lib/format";
import {
  clasificarEstadoSii,
  esperaRespuesta,
  necesitaAtencion,
  type EstadoSii,
} from "@/lib/sii/estado";
import { consultarEstadoSii, type ResultadoConsulta } from "./consultar-sii";
import { reenviarFactura, type ResultadoReenvio } from "./reenviar";

// Lo que el SII contestó sobre esta factura, y el botón para volver a
// preguntar.
//
// El track id se muestra entero y seleccionable a propósito: es el número con
// el que se reclama en el SII si algo sale mal, y hasta ahora estaba guardado
// en una columna que nadie veía. Que esté a la vista es la mitad del arreglo;
// la otra mitad es el botón.
export type DatosSii = {
  id: string;
  estado: string;
  folio: number | null;
  sii_track_id: string | null;
  sii_ambiente: string | null;
  estado_sii: string | null;
  sii_glosa: string | null;
  sii_enviado_at: string | null;
  /** Ruta del DTE timbrado. Es lo que hace posible reintentar sin gastar folio. */
  sii_xml_path: string | null;
  /** Representación impresa generada desde el DTE. */
  sii_pdf_path: string | null;
};

export function SiiPanel({ factura }: { factura: DatosSii }) {
  const [resultado, setResultado] = useState<ResultadoConsulta | null>(null);
  const [reenvio, setReenvio] = useState<ResultadoReenvio | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  // El XML y el PDF viven en un bucket PRIVADO y se abren con una URL firmada
  // que se pide en el momento. No se puede poner el enlace directo en el HTML:
  // sería una dirección pública a un documento tributario.
  async function abrir(path: string, que: string) {
    setErrorArchivo(null);
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from("adjuntos")
      .createSignedUrl(path, 60 * 60);
    if (error || !data?.signedUrl) {
      setErrorArchivo(`No se pudo abrir el ${que}.`);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  // Lo que devolvió la última consulta manda sobre lo que traía la página: es
  // más nuevo, y evita que el usuario apriete "Consultar" y no vea cambiar
  // nada hasta que Next revalide.
  const codigo = resultado?.codigo ?? factura.estado_sii;
  const glosa = resultado?.glosa ?? factura.sii_glosa;
  const estado: EstadoSii = resultado?.estado ?? clasificarEstadoSii(codigo, glosa);

  const trackId = factura.sii_track_id;

  // Un borrador que nunca salió no tiene nada que mostrar acá.
  if (!trackId && !codigo && factura.estado === "borrador") return null;

  // Emitida sin rastro del SII = se cargó a mano, con folio tipeado. No es un
  // pendiente ni un error, y decirlo evita que alguien la ande consultando.
  if (!trackId && !codigo) {
    return (
      <p className="text-xs text-muted">
        Cargada a mano: esta factura no pasó por el SII.
      </p>
    );
  }

  function consultar() {
    setReenvio(null);
    iniciar(async () => {
      setResultado(await consultarEstadoSii(factura.id));
    });
  }

  function reenviar() {
    setResultado(null);
    iniciar(async () => {
      setReenvio(await reenviarFactura(factura.id));
    });
  }

  // El reenvío se ofrece SOLO en el callejón que lo necesita: la factura tiene
  // folio (ya se consumió), tiene el DTE timbrado guardado, sigue en borrador y
  // el envío falló. En cualquier otro caso reenviar no corresponde — una
  // emitida se consulta, y una sin folio se emite.
  const puedeReenviar =
    estado === "error" && Boolean(factura.folio) && Boolean(factura.sii_xml_path);

  const ambiente = factura.sii_ambiente ?? "certificacion";

  return (
    <div
      className={`rounded-lg border px-3 py-2.5 ${
        necesitaAtencion(estado) ? "border-danger/30 bg-danger-bg/40" : "border-border bg-background"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SiiBadge estado={estado} />
        <span className="text-xs text-muted">
          Ambiente: {ambiente === "produccion" ? "producción" : "certificación"}
        </span>

        {trackId ? (
          <span className="text-xs text-muted">
            Track id{" "}
            <span className="select-all font-medium tabular-nums text-foreground">{trackId}</span>
          </span>
        ) : null}

        {factura.sii_enviado_at ? (
          <span className="text-xs text-muted">
            Enviada el {formatDate(factura.sii_enviado_at)} {formatTime(factura.sii_enviado_at)}
          </span>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {/* Reintentar NO vuelve a tomar folio: manda el mismo documento que
              ya quedó timbrado. Por eso puede repetirse sin costo. */}
          {puedeReenviar ? (
            <button
              type="button"
              onClick={reenviar}
              disabled={pendiente}
              className={buttonClass({ variant: "primary", size: "sm" })}
            >
              <Send className="h-3.5 w-3.5" />
              {pendiente ? "Reenviando…" : "Reintentar envío"}
            </button>
          ) : null}

          {trackId ? (
            <button
              type="button"
              onClick={consultar}
              disabled={pendiente}
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${pendiente ? "animate-spin" : ""}`} />
              {pendiente ? "Consultando…" : "Consultar estado"}
            </button>
          ) : null}
        </div>
      </div>

      {/* La glosa es la explicación del SII, y es lo único que dice POR QUÉ
          rechazó. Se muestra siempre que exista, no solo en los errores. */}
      {glosa ? (
        <p className="mt-2 text-xs leading-relaxed text-muted">
          <span className="text-foreground">SII:</span> {glosa}
        </p>
      ) : null}

      {estado === "sin_clasificar" && codigo ? (
        <p className="mt-1 text-xs text-muted">
          Código sin traducir: <span className="font-medium">{codigo}</span>. Se muestra crudo a
          propósito: el sistema no da por aceptada una respuesta que no sabe leer.
        </p>
      ) : null}

      {esperaRespuesta(estado) && estado !== "sin_clasificar" ? (
        <p className="mt-1 text-xs text-muted">
          El SII no responde al instante. Volvé a consultar en un rato.
        </p>
      ) : null}

      {/* Lo que se mandó y lo que se imprimió. Estaban guardados desde la
          primera emisión y no había forma de verlos: el XML es la evidencia de
          qué se envió exactamente, y hace falta si el SII reclama. */}
      {factura.sii_xml_path || factura.sii_pdf_path ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {factura.sii_xml_path ? (
            <button
              type="button"
              onClick={() => abrir(factura.sii_xml_path!, "XML")}
              className={buttonClass({ variant: "ghost", size: "sm" })}
            >
              <FileCode2 className="h-3.5 w-3.5" />
              Ver XML enviado
            </button>
          ) : null}
          {factura.sii_pdf_path ? (
            <button
              type="button"
              onClick={() => abrir(factura.sii_pdf_path!, "PDF")}
              className={buttonClass({ variant: "ghost", size: "sm" })}
            >
              <FileText className="h-3.5 w-3.5" />
              Ver PDF
            </button>
          ) : null}
          {/* Si el documento salió pero el PDF no, hay que decirlo: la factura
              es válida igual, pero no hay qué mandarle al cliente. */}
          {factura.sii_xml_path && !factura.sii_pdf_path && estado !== "error" ? (
            <span className="text-xs text-muted">
              El PDF no se llegó a generar. El documento vale igual; se puede
              regenerar volviendo a consultar.
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Una sola región viva para todo lo que devuelven las dos acciones. El
          resultado de apretar un botón tiene que anunciarse: sin esto, quien usa
          lector de pantalla aprieta "Reintentar envío" y no se entera de si
          funcionó. `aria-live="polite"` no interrumpe lo que se esté leyendo. */}
      <div aria-live="polite" className="empty:hidden">
        {resultado?.error ? (
          <p className="mt-2 text-xs text-danger">{resultado.error}</p>
        ) : null}
        {reenvio?.error ? <p className="mt-2 text-xs text-danger">{reenvio.error}</p> : null}
        {errorArchivo ? <p className="mt-2 text-xs text-danger">{errorArchivo}</p> : null}
        {reenvio?.ok ? (
          <p className="mt-2 text-xs text-ok">
            Reenviada con el folio {reenvio.folio}. Track id del SII: {reenvio.trackId}. No se
            consumió un folio nuevo.
          </p>
        ) : null}
      </div>
    </div>
  );
}
