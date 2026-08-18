"use client";

import { useActionState, useRef, useState } from "react";
import { ConfirmarDialogo } from "@/components/ui/confirmar";

export type EliminarState = { error?: string };

// Formulario que pide confirmación antes de ejecutar la server action.
// Úsalo para acciones destructivas (eliminar registros). La action debe
// devolver { error } en vez de fallar en silencio (p.ej. si la BD la bloquea
// por una FK "on delete restrict"), para que el usuario sepa por qué no pasó.
//
// La confirmación es un diálogo propio del sistema (ui/confirmar), no
// window.confirm(): esa ventana la dibuja el navegador y se ve ajena a la app.
export function ConfirmForm({
  action,
  mensaje,
  titulo,
  textoConfirmar,
  className,
  children,
}: {
  action: (prevState: EliminarState, formData: FormData) => Promise<EliminarState>;
  mensaje: string;
  titulo?: string;
  textoConfirmar?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [preguntando, setPreguntando] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  // Al confirmar reenviamos el mismo form para que el navegador arme el
  // FormData igual que en un envío normal; esta bandera deja pasar ese segundo
  // submit sin volver a preguntar.
  const confirmado = useRef(false);

  // Mientras la action corre el diálogo sigue en pantalla mostrando
  // "Eliminando…", y se cierra solo cuando termina (o desaparece con la
  // página, si la action redirige). No hace falta un efecto: el envío y el
  // cierre del "preguntando" ocurren en el mismo click, así que se agrupan en
  // un solo render y el diálogo no parpadea.
  const visible = preguntando || pending;

  return (
    <>
      <form
        ref={formRef}
        action={formAction}
        className={className}
        onSubmit={(e) => {
          if (confirmado.current) {
            confirmado.current = false;
            return;
          }
          e.preventDefault();
          setPreguntando(true);
        }}
      >
        {children}
        {state.error ? <p className="mt-2 text-sm text-danger">{state.error}</p> : null}
      </form>

      {visible ? (
        <ConfirmarDialogo
          titulo={titulo}
          mensaje={mensaje}
          textoConfirmar={textoConfirmar}
          pending={pending}
          // Mientras se está eliminando no se puede cerrar por Escape ni por
          // clic en el fondo: cerrarlo no cancelaría nada y confundiría.
          onCancelar={() => {
            if (!pending) setPreguntando(false);
          }}
          onConfirmar={() => {
            confirmado.current = true;
            setPreguntando(false);
            formRef.current?.requestSubmit();
          }}
        />
      ) : null}
    </>
  );
}
