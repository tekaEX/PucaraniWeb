// Transición de entrada entre páginas: template.tsx se vuelve a montar en
// cada navegación (a diferencia del layout), así que la animación corre al
// cambiar de sección. Sutil: fundido + leve subida, 350ms.
//
// Además centra la pantalla (contenido-centrado, ver globals.css). Va acá y no
// en AppShell porque este div es el que envuelve a cada página: sus hijos
// directos son la raíz de la pantalla, y son esos los que hay que centrar.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page contenido-centrado">{children}</div>;
}
