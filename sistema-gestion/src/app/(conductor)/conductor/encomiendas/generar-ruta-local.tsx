"use client";

// Botón de armar/rehacer la ruta del chofer. Reemplazó a
// components/encomiendas/generar-ruta-boton.tsx, que llamaba a una server action
// (la oficina también podía generar la ruta; ya no, porque la ruta vive en el
// teléfono). Misma interfaz, pero el cálculo corre acá, así que funciona sin
// señal salvo por las consultas de dirección y trazado.
//
// Lo que arma NO se guarda: se entrega como propuesta (ver calcularRutaLocal) y
// la pantalla la muestra dibujada en el mapa para que el chofer la acepte. Antes
// se guardaba de una y la ruta le cambiaba abajo de los pies.

import { useEffect, useRef, useState } from "react";
import { RefreshCw, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DireccionInput } from "@/components/ui/direccion-input";
import { cn } from "@/lib/utils";
import {
  calcularRutaLocal,
  type PropuestaRuta,
  type PuntoInicio,
} from "@/lib/encomiendas/local/generar-ruta";

type Opcion = "empresa" | "gps" | "direccion";

// El punto de partida es una decisión de vez en cuando, no de todos los días:
// por eso queda plegado detrás de una línea discreta y lo que se ve siempre es
// una sola acción clara.
const OPCIONES: { valor: Opcion; corto: string; largo: string }[] = [
  { valor: "empresa", corto: "Empresa", largo: "Dirección de la empresa" },
  { valor: "gps", corto: "Mi ubicación", largo: "Mi ubicación actual" },
  { valor: "direccion", corto: "Otra", largo: "Otra dirección" },
];

export function GenerarRutaLocal({
  fecha,
  direccionEmpresa,
  regenerar = false,
  autoGenerar = false,
  onPropuesta,
}: {
  fecha: string;
  /** Punto de partida por defecto. Es un dato de la empresa, así que lo baja la
   *  página desde la base y lo pasa acá. */
  direccionEmpresa: string | null;
  regenerar?: boolean;
  /** Calcula la ruta sola, una vez, al abrir la vista. Solo se pasa cuando NO
   *  hay ruta todavía y hay pedidos pendientes: así el chofer se la encuentra
   *  propuesta sin apretar nada, pero nunca se le reordenan las paradas de una
   *  ruta que ya empezó. */
  autoGenerar?: boolean;
  onPropuesta: (propuesta: PropuestaRuta) => void;
}) {
  const [opcion, setOpcion] = useState<Opcion>("empresa");
  const [mostrarOpciones, setMostrarOpciones] = useState(false);
  const [direccion, setDireccion] = useState("");
  // Coordenadas de la dirección elegida de la lista de sugerencias: con esto la
  // partida no hay que volver a ubicarla ni puede salir mal escrita.
  const [coordPartida, setCoordPartida] = useState<{
    texto: string;
    lat: number;
    lng: number;
  } | null>(null);
  const [armando, setArmando] = useState(false);
  const [obteniendoUbicacion, setObteniendoUbicacion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoDisparadoRef = useRef(false);

  async function disparar(puntoInicio: PuntoInicio) {
    setError(null);
    setArmando(true);
    try {
      onPropuesta(await calcularRutaLocal(fecha, puntoInicio));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo armar la ruta.");
    } finally {
      setArmando(false);
    }
  }

  // El ref hace dos cosas: evita reintentar en bucle si la generación
  // automática falla (se muestra el error y queda en manos del chofer), y
  // permite que "onPropuesta" esté en las dependencias sin que un re-render de
  // la pantalla contenedora vuelva a armar la ruta.
  useEffect(() => {
    if (!autoGenerar || autoDisparadoRef.current) return;
    autoDisparadoRef.current = true;
    setArmando(true);
    calcularRutaLocal(fecha, { tipo: "empresa", direccion: direccionEmpresa })
      .then((res) => onPropuesta(res))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "No se pudo armar la ruta."),
      )
      .finally(() => setArmando(false));
  }, [autoGenerar, fecha, direccionEmpresa, onPropuesta]);

  function onClick() {
    setError(null);

    if (opcion === "gps") {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        setError("Este dispositivo no puede obtener tu ubicación.");
        return;
      }
      setObteniendoUbicacion(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setObteniendoUbicacion(false);
          void disparar({ tipo: "gps", lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => {
          setObteniendoUbicacion(false);
          setError(
            "No se pudo obtener tu ubicación. Revisa el permiso de ubicación del navegador.",
          );
        },
        { enableHighAccuracy: true, timeout: 10_000 },
      );
      return;
    }

    if (opcion === "direccion") {
      const texto = direccion.trim();
      if (!texto) {
        setError("Escribe la dirección de partida.");
        return;
      }
      const elegida = coordPartida?.texto === texto ? coordPartida : null;
      void disparar({ tipo: "direccion", direccion: texto, lat: elegida?.lat, lng: elegida?.lng });
      return;
    }

    void disparar({ tipo: "empresa", direccion: direccionEmpresa });
  }

  const ocupado = armando || obteniendoUbicacion;
  const elegida = OPCIONES.find((o) => o.valor === opcion)!;

  return (
    <div className="space-y-2">
      <Button onClick={onClick} disabled={ocupado} className="w-full justify-center">
        <RefreshCw className={cn("h-4 w-4", ocupado && "animate-spin")} />
        {obteniendoUbicacion
          ? "Obteniendo ubicación…"
          : armando
            ? "Armando la ruta…"
            : regenerar
              ? "Regenerar ruta"
              : "Generar ruta del día"}
      </Button>

      <button
        onClick={() => setMostrarOpciones((v) => !v)}
        className="flex w-full items-center justify-center gap-1 py-0.5 text-xs text-muted transition-colors hover:text-foreground"
      >
        Desde: {elegida.largo}
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform", mostrarOpciones && "rotate-180")}
        />
      </button>

      {mostrarOpciones ? (
        <div className="animate-expand space-y-2">
          {/* Control segmentado en vez de una lista de radios: los toques son
              más grandes y se lee de un vistazo cuál está elegido. */}
          <div className="flex gap-1 rounded-full bg-[#ececef] p-1">
            {OPCIONES.map((o) => (
              <button
                key={o.valor}
                onClick={() => setOpcion(o.valor)}
                className={cn(
                  "flex-1 rounded-full px-2 py-1.5 text-xs font-medium transition-colors",
                  opcion === o.valor
                    ? "bg-white text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                    : "text-muted",
                )}
              >
                {o.corto}
              </button>
            ))}
          </div>
          {opcion === "direccion" ? (
            <DireccionInput
              value={direccion}
              onChange={setDireccion}
              onSeleccionar={(s) =>
                setCoordPartida({ texto: s.direccion, lat: s.lat, lng: s.lng })
              }
              confirmada={coordPartida?.texto === direccion.trim()}
            />
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-lg bg-danger-bg px-3 py-2 text-xs text-danger">{error}</p>
      ) : null}
    </div>
  );
}
