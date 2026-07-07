"use client";

// Formulario que pide confirmación nativa antes de ejecutar la server action.
// Úsalo para acciones destructivas (eliminar registros).
export function ConfirmForm({
  action,
  mensaje,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  mensaje: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <form
      action={action}
      className={className}
      onSubmit={(e) => {
        if (!window.confirm(mensaje)) e.preventDefault();
      }}
    >
      {children}
    </form>
  );
}
