"use client";

import { useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { guardarServicioTaxi } from "./actions";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { AltaRapida } from "./alta-rapida";
import { todayInput } from "@/lib/format";
import { TAXI_TIPOS, taxiPideDescripcion, type TaxiTipo } from "@/types/db";

// Alta de servicio SIEMPRE VISIBLE arriba de la tabla, como en el sistema
// anterior. No es un detalle de gusto: quien carga los servicios del día lo
// hace de corrido, uno tras otro, y en el sistema viejo eso era escribir y
// apretar "Agregar" sin que la pantalla se moviera. Mandarlo a otra página (o
// a un modal) por cada servicio agrega dos clics y una espera a cada carga.
//
// Lo que se conserva exactamente:
//   · el orden de los campos: Fecha · Tipo · Monto / Nombre · Empresa · Chofer
//   · el monto por defecto según el tipo (aeropuerto = $8.000), editable
//   · la descripción aparece SOLO al elegir "Especial"
//   · al agregar: se limpia Nombre, la fecha y los demás quedan como estaban,
//     y el cursor vuelve a Nombre para el siguiente
//   · el aviso abajo ("Servicio agregado"), en vez de un cartel que hay que cerrar

export type OpcionSimple = { id: string; nombre: string };

export function NuevoServicioTaxi({
  clientes,
  choferes,
}: {
  clientes: OpcionSimple[];
  choferes: { id: string; nombre: string; licencia_vencimiento?: string | null }[];
}) {
  const toast = useToast();
  const nombreRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  // Todo controlado: así "limpiar unos campos y conservar otros" después de
  // agregar es explícito, y no depende de remontar el formulario.
  const [fecha, setFecha] = useState(todayInput());
  const [tipo, setTipo] = useState<TaxiTipo>("local");
  const [monto, setMonto] = useState("");
  const [pasajero, setPasajero] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [choferId, setChoferId] = useState("");

  function onTipoChange(nuevo: TaxiTipo) {
    const anterior = TAXI_TIPOS[tipo].monto;
    setTipo(nuevo);
    // Precarga la tarifa del tipo nuevo solo si el monto está vacío o todavía
    // es la tarifa del tipo anterior: nunca pisa un monto escrito a mano.
    if (monto === "" || monto === "0" || monto === String(anterior ?? "")) {
      setMonto(TAXI_TIPOS[nuevo].monto ? String(TAXI_TIPOS[nuevo].monto) : "");
    }
  }

  // La acción se llama a mano en vez de con useActionState: lo que pasa DESPUÉS
  // de guardar (avisar, limpiar dos campos, devolver el foco) es una secuencia
  // del envío, no una reacción a un estado que cambió.
  function agregar(formData: FormData) {
    startTransition(async () => {
      const r = await guardarServicioTaxi({}, formData);
      if (r.error) {
        toast(r.error, "error");
        return;
      }
      toast("Servicio agregado");
      // Se limpia lo que cambia servicio a servicio. Fecha, tipo, monto,
      // empresa y chofer quedan como están: en una tanda suelen repetirse.
      setPasajero("");
      setDescripcion("");
      nombreRef.current?.focus();
    });
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Nuevo servicio</CardTitle>
      </CardHeader>
      <CardBody>
        {/* Dos filas, con los mismos anchos que el sistema anterior: la fecha
            angosta arriba a la izquierda, y abajo Nombre · Empresa · Chofer con
            el botón al final de la misma línea. En pantalla chica cada campo
            pasa a ocupar el ancho completo. */}
        <form action={agregar} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[180px_1fr_1fr]">
            <Field label="Fecha" htmlFor="taxi-fecha" className="mb-0">
              <Input
                id="taxi-fecha"
                name="fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                required
              />
            </Field>

            <Field label="Tipo de servicio" htmlFor="taxi-tipo" className="mb-0">
              <Select
                id="taxi-tipo"
                name="tipo"
                value={tipo}
                onChange={(e) => onTipoChange(e.target.value as TaxiTipo)}
              >
                {Object.entries(TAXI_TIPOS).map(([value, t]) => (
                  <option key={value} value={value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Monto ($)" htmlFor="taxi-monto" className="mb-0">
              <MoneyInput
                id="taxi-monto"
                name="monto"
                value={monto}
                onChange={setMonto}
                placeholder="0"
              />
            </Field>
          </div>

          {/* Solo para "Especial": es el único tipo cuyo nombre no dice qué fue
              el servicio, y en el vale ocupa la línea que se escribe a mano. El
              campo aparece al elegirlo, igual que en el sistema anterior. */}
          {taxiPideDescripcion(tipo) ? (
            <Field
              label="Descripción del servicio (Especial)"
              htmlFor="taxi-descripcion"
              className="mb-0"
            >
              <Input
                id="taxi-descripcion"
                name="descripcion"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Ej: City tour, traslado a evento, viaje especial…"
                required
              />
            </Field>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_150px]">
            <Field label="Nombre" htmlFor="taxi-pasajero" className="mb-0">
              <Input
                id="taxi-pasajero"
                name="pasajero"
                ref={nombreRef}
                value={pasajero}
                onChange={(e) => setPasajero(e.target.value)}
                placeholder="Ej: Juan Pérez"
              />
            </Field>

            <Field label="Empresa" htmlFor="taxi-cliente" className="mb-0">
              <AltaRapida
                tipo="empresa"
                opciones={clientes}
                valor={clienteId}
                onChange={setClienteId}
                name="cliente_id"
                id="taxi-cliente"
                sinSeleccion="Sin empresa"
              />
            </Field>

            <Field label="Chofer" htmlFor="taxi-chofer" className="mb-0">
              <AltaRapida
                tipo="chofer"
                opciones={choferes}
                valor={choferId}
                onChange={setChoferId}
                name="chofer_id"
                id="taxi-chofer"
                sinSeleccion="Sin chofer"
              />
            </Field>

            {/* La etiqueta invisible alinea el botón con la base de los campos,
                igual que en el sistema anterior. */}
            <div className="flex flex-col">
              <span aria-hidden className="mb-1.5 hidden text-xs lg:block">
                &nbsp;
              </span>
              <Button type="submit" disabled={pending} className="w-full">
                <Plus className="h-4 w-4" />
                {pending ? "Agregando…" : "Agregar"}
              </Button>
            </div>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
