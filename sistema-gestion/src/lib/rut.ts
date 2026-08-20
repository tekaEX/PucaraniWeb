// El RUT chileno y su dígito verificador.
//
// Por qué esto existe y por qué llega tarde: hasta ahora el sistema no validaba
// el RUT en ningún punto. La ficha del cliente guardaba el string tal cual y
// `construirDocumento()` solo comprobaba que no estuviera vacío. Mientras las
// facturas se cargaban a mano eso no costaba nada — el número estaba impreso en
// un papel y alguien lo copiaba—. Con emisión electrónica cambia: un RUT mal
// tipeado viaja al SII, el SII lo rechaza, y el rechazo llega CON EL FOLIO YA
// CONSUMIDO. Es el error de datos más probable de todos y el más caro de
// descubrir tarde.
//
// El dígito verificador es módulo 11 y se puede comprobar sin consultar nada:
// se multiplican los dígitos de derecha a izquierda por la serie 2,3,4,5,6,7
// que se repite, se suma, y el DV es 11 menos el resto de dividir por 11 — con
// 11 escrito como "0" y 10 como "K".
//
// Ojo con lo que este módulo NO hace: no dice si el RUT EXISTE ni si está
// vigente ante el SII. Un DV correcto solo prueba que el número está bien
// escrito. Es exactamente la clase de error que se comete tipeando, y es la
// única que se puede atrapar sin salir a la red.

/** Solo los caracteres del RUT: dígitos y la K final. */
function limpiar(raw: string): string {
  return raw.replace(/[.\-\s]/g, "").toUpperCase();
}

/**
 * El dígito verificador que le corresponde a un cuerpo numérico.
 *
 * Devuelve "0"…"9" o "K". El cuerpo va sin puntos y sin el DV.
 */
export function digitoVerificador(cuerpo: string): string {
  let suma = 0;
  let multiplicador = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }
  const resto = 11 - (suma % 11);
  if (resto === 11) return "0";
  if (resto === 10) return "K";
  return String(resto);
}

/**
 * Separa un RUT escrito de cualquier forma en cuerpo y dígito.
 *
 * Devuelve null si lo que llegó no tiene la FORMA de un RUT. No comprueba el
 * dígito: eso es `rutValido()`.
 */
function partir(raw: string | null | undefined): { cuerpo: string; dv: string } | null {
  const s = limpiar(raw ?? "");
  // Cuerpo de 7 u 8 dígitos más el verificador. Menos de 7 no es un RUT de
  // contribuyente ni de persona; más de 8 no existe.
  if (!/^\d{7,8}[0-9K]$/.test(s)) return null;
  return { cuerpo: s.slice(0, -1), dv: s.slice(-1) };
}

/** ¿Está bien escrito? Forma correcta y dígito verificador que calza. */
export function rutValido(raw: string | null | undefined): boolean {
  const p = partir(raw);
  return p !== null && p.dv === digitoVerificador(p.cuerpo);
}

/**
 * La forma canónica, sin puntos y con guion: "76192083-9".
 *
 * Es la que se guarda y la que se compara. Devuelve null si el RUT no es
 * válido, para que no se pueda persistir una versión "normalizada" de algo que
 * está mal escrito.
 */
export function normalizarRut(raw: string | null | undefined): string | null {
  const p = partir(raw);
  if (!p || p.dv !== digitoVerificador(p.cuerpo)) return null;
  return `${p.cuerpo}-${p.dv}`;
}

/** Con puntos, para mostrar: "76.192.083-9". */
export function formatearRut(raw: string | null | undefined): string {
  const p = partir(raw);
  if (!p) return (raw ?? "").trim();
  const conPuntos = p.cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${conPuntos}-${p.dv}`;
}

/**
 * Compara dos RUT ignorando puntos, guion y la caja de la K.
 *
 * NO valida el dígito a propósito: su trabajo es decir si dos textos se
 * refieren al mismo RUT, y eso tiene que funcionar igual con un RUT mal escrito
 * — si no, un RUT inválido en los dos lados se reportaría como "son distintos",
 * que es un mensaje falso y manda a buscar el problema donde no está.
 */
export function mismoRut(a: string, b: string): boolean {
  return limpiar(a) === limpiar(b);
}

/**
 * El error en castellano, o null si está bien.
 *
 * Devuelve el mensaje ya armado porque los cinco lugares que validan RUT tienen
 * que decir lo mismo: un usuario que ve "RUT inválido" en un formulario y
 * "dígito verificador incorrecto" en otro cree que son dos problemas distintos.
 */
export function errorRut(raw: string | null | undefined, etiqueta = "El RUT"): string | null {
  const s = (raw ?? "").trim();
  if (!s) return `${etiqueta} es obligatorio.`;

  const p = partir(s);
  if (!p) {
    return `${etiqueta} "${s}" no tiene forma de RUT. Se escribe con el dígito verificador, por ejemplo 76.192.083-9.`;
  }

  const esperado = digitoVerificador(p.cuerpo);
  if (p.dv !== esperado) {
    return `${etiqueta} "${s}" tiene el dígito verificador equivocado: a ${p.cuerpo} le corresponde -${esperado}.`;
  }
  return null;
}
