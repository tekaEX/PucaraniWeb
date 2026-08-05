"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronUp } from "lucide-react";

const ALTURA_VH = 78; // alto total de la hoja abierta, en % del viewport
const ALTO_COLAPSADO_PX = 84; // lo que se alcanza a ver cuando está cerrada

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

// Hoja deslizable sobre el mapa (mapa a pantalla completa detrás): colapsada
// solo se ve un resumen + el tirador; arrastrando hacia arriba (o con un
// simple tap en el tirador) se despliega todo el contenido.
export function BottomSheet({
  resumenColapsado,
  senalCerrar,
  children,
}: {
  resumenColapsado?: React.ReactNode;
  /** Cuando este valor CAMBIA (y no es null), la hoja se cierra sola. Lo usa la
   *  pantalla cuando lo importante pasa a ser el mapa y no el contenido de la
   *  hoja — al aparecer la ruta propuesta, por ejemplo, que se previsualiza
   *  dibujada en el mapa (ver vista-previa-ruta.tsx). */
  senalCerrar?: unknown;
  children: React.ReactNode;
}) {
  const [expandido, setExpandido] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [offsetArrastre, setOffsetArrastre] = useState(0);
  // Alto de la hoja calculado en JS (window.innerHeight), no con la unidad
  // CSS "dvh" — más seguro entre navegadores/versiones que la calculan
  // distinto (o no la soportan) según el dispositivo.
  const [altoVentana, setAltoVentana] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const inicioY = useRef(0);
  const movioRef = useRef(false);
  const activoRef = useRef(false);

  useEffect(() => {
    function medir() {
      setAltoVentana(window.innerHeight);
    }
    medir();
    window.addEventListener("resize", medir);
    window.addEventListener("orientationchange", medir);
    return () => {
      window.removeEventListener("resize", medir);
      window.removeEventListener("orientationchange", medir);
    };
  }, []);

  // Ajustado durante el render y no en un efecto: la hoja tiene que salir ya
  // cerrada en el mismo dibujado en que aparece la señal, sin un cuadro
  // intermedio con la hoja abierta tapando el mapa.
  const [senalAplicada, setSenalAplicada] = useState(senalCerrar);
  if (senalCerrar !== senalAplicada) {
    setSenalAplicada(senalCerrar);
    if (senalCerrar != null) setExpandido(false);
  }

  const altoSheet = Math.round(altoVentana * (ALTURA_VH / 100));
  const colapsadoTranslate = Math.max(altoSheet - ALTO_COLAPSADO_PX, 0);

  function onPointerDown(e: React.PointerEvent) {
    activoRef.current = true;
    movioRef.current = false;
    inicioY.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!activoRef.current) return;
    const delta = e.clientY - inicioY.current;
    if (Math.abs(delta) > 4) movioRef.current = true;
    if (!movioRef.current) return;
    setArrastrando(true);
    const base = expandido ? 0 : colapsadoTranslate;
    setOffsetArrastre(clamp(base + delta, 0, colapsadoTranslate));
  }

  function onPointerUp() {
    if (!activoRef.current) return;
    activoRef.current = false;
    if (movioRef.current) {
      setExpandido(offsetArrastre < colapsadoTranslate / 2);
    } else {
      // Sin arrastre real: fue un tap simple en el tirador.
      setExpandido((v) => !v);
    }
    setArrastrando(false);
    setOffsetArrastre(0);
  }

  const translateY = arrastrando ? offsetArrastre : expandido ? 0 : colapsadoTranslate;

  return (
    <div
      ref={sheetRef}
      className="fixed inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.15)]"
      style={{
        height: altoSheet > 0 ? `${altoSheet}px` : `${ALTURA_VH}vh`,
        transform: `translateY(${translateY}px)`,
        transition: arrastrando ? "none" : "transform 0.25s ease-out",
      }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="flex shrink-0 cursor-grab flex-col items-center gap-1.5 px-4 pb-2 pt-2.5 active:cursor-grabbing"
        style={{ touchAction: "none" }}
      >
        <div className="h-1.5 w-10 rounded-full bg-separator" />
        {!expandido ? (
          <div className="flex w-full items-center justify-between pt-1">
            <div className="min-w-0 flex-1">{resumenColapsado}</div>
            <ChevronUp className="h-4 w-4 shrink-0 text-muted" />
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">{children}</div>
    </div>
  );
}
