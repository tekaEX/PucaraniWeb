"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button, buttonClass } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { crearClienteRapido } from "@/app/(app)/clientes/actions";
import { crearChoferRapido } from "@/app/(app)/choferes/actions";
import { documentosChofer, marcaDocumentos } from "@/lib/vencimientos";

// Desplegable de Empresa / Chofer con la opción de crear uno sin salir de la
// pantalla.
//
// En el sistema anterior, Empresas y Choferes eran dos botones arriba que
// abrían un cuadro con la lista y un campo para agregar: se cargaba un
// servicio, faltaba la empresa, se agregaba ahí mismo y se seguía. Acá esas
// dos son secciones completas del sistema (con RUT, licencia, vencimientos),
// pero el flujo de carga no puede depender de eso: interrumpir para ir a otra
// pantalla es perder lo que se venía escribiendo.
//
// Entonces: la ficha completa vive en su sección, y acá se puede dar de alta
// con el nombre —que es lo único que hace falta para asignarle un servicio—.
// El resto se completa después.

const NUEVO = "__nuevo__";

type Opcion = { id: string; nombre: string; licencia_vencimiento?: string | null };

export function AltaRapida({
  tipo,
  opciones,
  valor,
  onChange,
  name,
  id,
  sinSeleccion,
}: {
  tipo: "empresa" | "chofer";
  opciones: Opcion[];
  valor: string;
  onChange: (id: string) => void;
  name: string;
  id?: string;
  sinSeleccion: string;
}) {
  const [abierto, setAbierto] = useState(false);
  // Las creadas en esta sesión se agregan a la lista sin recargar la página:
  // el `revalidatePath` del servidor las va a traer igual, pero recién en la
  // próxima navegación, y el servicio se está cargando AHORA.
  const [nuevas, setNuevas] = useState<Opcion[]>([]);

  // Al crear una, el servidor revalida la pantalla y en la próxima respuesta ya
  // viene en `opciones`: sin este filtro quedaría dos veces en el desplegable,
  // con la misma key.
  const lista = [
    ...opciones,
    ...nuevas.filter((n) => !opciones.some((o) => o.id === n.id)),
  ];

  return (
    <>
      <Select
        id={id}
        name={name}
        value={valor}
        onChange={(e) => {
          if (e.target.value === NUEVO) setAbierto(true);
          else onChange(e.target.value);
        }}
      >
        <option value="">{sinSeleccion}</option>
        {lista.map((o) => (
          <option key={o.id} value={o.id}>
            {tipo === "chofer"
              ? marcaDocumentos(
                  o.nombre,
                  documentosChofer({ licencia_vencimiento: o.licencia_vencimiento ?? null }),
                )
              : o.nombre}
          </option>
        ))}
        <option value={NUEVO}>
          {tipo === "empresa" ? "+ Agregar empresa…" : "+ Agregar chofer…"}
        </option>
      </Select>

      {abierto ? (
        <DialogoAlta
          tipo={tipo}
          onCerrar={() => setAbierto(false)}
          onCreado={(o) => {
            setNuevas((prev) => [...prev, o]);
            onChange(o.id);
            setAbierto(false);
          }}
        />
      ) : null}
    </>
  );
}

function DialogoAlta({
  tipo,
  onCerrar,
  onCreado,
}: {
  tipo: "empresa" | "chofer";
  onCerrar: () => void;
  onCreado: (o: Opcion) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  useEffect(() => {
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  async function crear() {
    if (!nombre.trim() || guardando) return;
    setGuardando(true);
    const r =
      tipo === "empresa"
        ? await crearClienteRapido(nombre)
        : await crearChoferRapido(nombre);
    setGuardando(false);

    if ("error" in r) {
      toast(r.error, "error");
      return;
    }
    toast(tipo === "empresa" ? "Empresa agregada" : "Chofer agregado");
    onCreado(r);
  }

  if (typeof document === "undefined") return null;

  const etiqueta = tipo === "empresa" ? "empresa" : "chofer";

  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label={`Agregar ${etiqueta}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-scale-in w-full max-w-sm rounded-[18px] bg-white p-5 shadow-card"
      >
        <p className="text-base font-semibold">
          {tipo === "empresa" ? "Agregar empresa" : "Agregar chofer"}
        </p>
        <p className="mt-1 text-sm text-muted">
          {tipo === "empresa"
            ? "Con el nombre alcanza para asignarle servicios. El RUT y los datos de contacto se completan después en Clientes."
            : "Con el nombre alcanza para asignarle servicios. La licencia y su vencimiento se completan después en Choferes."}
        </p>

        <Input
          ref={inputRef}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          // Enter crea, como en el cuadro del sistema anterior. No es un
          // <form>: está dentro del formulario de alta del servicio, y anidar
          // formularios no es válido en HTML.
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void crear();
            }
          }}
          placeholder={tipo === "empresa" ? "Nombre de la empresa…" : "Nombre del chofer…"}
          maxLength={60}
          className="mt-4"
        />

        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onCerrar} className={buttonClass({ variant: "outline", size: "sm" })}>
            Cancelar
          </button>
          <Button
            type="button"
            size="sm"
            onClick={() => void crear()}
            disabled={guardando || !nombre.trim()}
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {guardando ? "Agregando…" : "Agregar"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
