import "server-only";
import type { LogoData } from "@/lib/logo";
import {
  TAXI_TIPOS,
  taxiNombreChofer,
  taxiPideDescripcion,
  type Empresa,
  type ServicioTaxiConRelaciones,
  type TaxiTipo,
} from "@/types/db";

// ============================================================================
// El vale de taxi, EL MISMO del sistema anterior.
//
// Esto no es una reconstrucción: es el mismo documento. El vale de la app de
// `gestion/` nunca fue un PDF generado —era esta página HTML impresa por el
// navegador (`window.print()` → "Guardar como PDF")—, así que el CSS y el
// marcado de abajo están copiados de ahí tal cual, incluidas sus medidas en
// milímetros, sus tamaños en píxeles y sus colores.
//
// Se intentó primero rehacerlo con el generador de PDF del sistema (el mismo que
// usan la cotización y el informe) y no alcanza: otro motor de tipografía, otras
// fuentes disponibles y otra forma de medir dan siempre un papel parecido pero
// distinto. Y el cliente firma este papel con sus pasajeros, así que "parecido"
// no sirve.
//
// Consecuencias de hacerlo así, que son las del sistema anterior:
//   · la letra manuscrita es Caveat, cargada desde Google Fonts en el navegador
//     de quien imprime — no hace falta incrustar ninguna fuente
//   · el diálogo de impresión se abre solo, y de ahí sale "Guardar como PDF"
//   · el papel es A4 vertical, margen 9 mm, dos vales por hoja
// ============================================================================

/** Escapa lo que viene de la base antes de meterlo en el HTML. Mismo criterio
 *  que `escapeHtml` del sistema anterior. */
function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** dd/mm/yyyy — el `fmtFecha` del sistema anterior. */
function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** El monto del vale: sin símbolo (el "$" ya está impreso) y vacío si es cero
 *  —un vale con "$ 0" parece un servicio sin cobrar—. Es `valeAmount`. */
function valeAmount(n: number): string {
  const v = Number(n);
  if (!v || v < 0) return "";
  return v.toLocaleString("es-CL");
}

// Las 6 casillas impresas del talonario, en orden. "Especial" no tiene casilla:
// se agrega como línea escrita a mano.
const VALE_SERVICIOS = (Object.keys(TAXI_TIPOS) as TaxiTipo[])
  .filter((tipo) => TAXI_TIPOS[tipo].casilla)
  .map((tipo) => ({ tipo, texto: TAXI_TIPOS[tipo].vale }));

// ── CSS copiado del sistema anterior (bloque "Vale (receipt)") ──────────────
// Solo se cambió `#print-root { display:none }` por la versión de pantalla: allá
// el vale vivía escondido dentro de la app y solo existía al imprimir; acá la
// página ES el vale, así que se ve antes de imprimir. El bloque @media print,
// que es el que define el papel, está igual.
const CSS = `
:root {
  --sans: 'DM Sans', sans-serif;
  --hand: 'Caveat', 'Segoe Script', cursive;
  --blue: #1B3FA0;
  --accent: #F0A800;
  --vale-border: #9c3b30;
  --radius: 10px;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: var(--sans);
  background: #F5F3EE;
  color: #1A1916;
  font-size: 14px;
  line-height: 1.5;
  padding: 6mm;
}

.barra {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; max-width: 210mm; margin: 0 auto 6mm;
}
.barra p { font-size: 13px; color: #6B6760; }
.barra button {
  display: inline-flex; align-items: center; gap: 8px;
  height: 40px; padding: 0 20px; border: none; border-radius: 6px;
  background: #1B3FA0; color: #fff; font-family: var(--sans);
  font-size: 14px; font-weight: 600; cursor: pointer;
}
.barra button:hover { background: #142E78; }

#print-root {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6mm;
  align-content: start;
  max-width: 210mm;
  margin: 0 auto;
}

.vale {
  background: #fff;
  color: #1a1a1a;
  border: 1px solid #cfcabf;
  border-radius: 4px;
  padding: 8mm 7mm 5mm;
  font-family: var(--sans);
  position: relative;
}
.vale-head { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 6px; }
.vale-logo { width: 46px; height: 46px; flex-shrink: 0; object-fit: contain; }
.vale-head-txt { line-height: 1.28; }
.vale-brand { font-size: 15px; font-weight: 700; letter-spacing: .3px; color: var(--blue); }
.vale-brand b { color: var(--blue); }
.vale-sub  { font-size: 11px; font-weight: 700; color: var(--accent); letter-spacing: .5px; }
.vale-line { font-size: 10.5px; color: #333; font-weight: 600; }
.vale-line.mail { font-weight: 400; color: #555; }
.vale-line.city { color: #666; }

.vale-box {
  border: 2px solid var(--vale-border);
  border-radius: 4px;
  padding: 7px 9px 9px;
  margin-top: 4px;
}
.vlabel { font-size: 11px; font-weight: 700; letter-spacing: .3px; color: #222; }
.hand { font-family: var(--hand); color: #14315e; font-weight: 600; }

.vale-fecha-row, .vale-nombre-row {
  display: flex; align-items: baseline; gap: 6px; margin-bottom: 6px;
}
.vale-fecha { font-size: 18px; }
.vale-nombre-row { border-bottom: 1px dotted #999; padding-bottom: 3px; }
.vale-nombre { font-size: 18px; flex: 1; }

.vsrv {
  display: grid; grid-template-columns: 18px 1fr auto;
  align-items: center; gap: 7px;
  padding: 3px 0;
  border-bottom: 1px dotted #ccc;
}
.vcheck {
  width: 13px; height: 13px; border: 1.5px solid #444; border-radius: 2px;
  display: inline-flex; align-items: center; justify-content: center;
  font-family: var(--hand); font-size: 16px; color: var(--vale-border);
  line-height: 1;
}
.vsrv-name { font-size: 11px; font-weight: 600; letter-spacing: .2px; color: #222; }
.vsrv.on .vsrv-name { color: #000; }
.vsrv-amt { font-size: 11px; font-weight: 700; color: #222; white-space: nowrap; }
.vsrv-amt .hand { font-size: 17px; margin-left: 2px; }

.vale-total {
  display: flex; justify-content: flex-end; align-items: baseline; gap: 6px;
  margin-top: 7px; font-size: 13px; font-weight: 700;
}
.vale-total .hand { font-size: 19px; }

.vale-firmas { display: flex; gap: 16px; margin-top: 16px; }
.vfirma { flex: 1; text-align: center; }
.vfirma-name {
  display: block; min-height: 24px; font-size: 20px;
  border-bottom: 1px solid #333; padding-bottom: 1px; line-height: 1.1;
}
.vfirma-label { font-size: 8.5px; font-weight: 600; letter-spacing: .3px; color: #555; }

.vale-foot {
  text-align: center; font-size: 8px; color: #888;
  margin-top: 6px; letter-spacing: .3px;
}

@media print {
  @page { size: A4 portrait; margin: 9mm; }
  html, body { background: #fff !important; padding: 0 !important; }
  body > *:not(#print-root) { display: none !important; }
  #print-root {
    display: grid !important;
    grid-template-columns: 1fr 1fr;
    gap: 6mm;
    align-content: start;
    max-width: none;
  }
  .vale { break-inside: avoid; page-break-inside: avoid; box-shadow: none; }
}
`;

// ── Marcado de un vale: el mismo `renderVale()` del sistema anterior ────────
function vale(
  s: ServicioTaxiConRelaciones,
  empresa: Empresa | null,
  logoSrc: string | null,
): string {
  const monto = valeAmount(s.monto);
  const nombre = esc((s.pasajero ?? "").trim());
  const chofer = esc((taxiNombreChofer(s) ?? "").trim());
  const especial = taxiPideDescripcion(s.tipo);

  let filas = VALE_SERVICIOS.map((t) => {
    const on = t.tipo === s.tipo;
    return `<div class="vsrv${on ? " on" : ""}">
        <span class="vcheck">${on ? "✗" : ""}</span>
        <span class="vsrv-name">${t.texto}</span>
        <span class="vsrv-amt">$ <span class="hand">${on ? monto : ""}</span></span>
      </div>`;
  }).join("");

  if (especial) {
    filas += `<div class="vsrv on">
        <span class="vcheck">✗</span>
        <span class="vsrv-name">${TAXI_TIPOS.especial.vale}: <span class="hand" style="font-size:16px">${esc((s.descripcion ?? "").trim())}</span></span>
        <span class="vsrv-amt">$ <span class="hand">${monto}</span></span>
      </div>`;
  }

  return `<div class="vale">
    <div class="vale-head">
      ${logoSrc ? `<img class="vale-logo" src="${logoSrc}" alt="">` : ""}
      <div class="vale-head-txt">
        <div class="vale-brand">TRANSPORTES <b>PUCARANI</b></div>
        <div class="vale-sub">TURISMO PUCARANI</div>
        <div class="vale-line">CEL: 995430273 • 991622929</div>
        <div class="vale-line">Web: pucarani.cl</div>
        <div class="vale-line mail">ninotranspores@hotmail.com</div>
        <div class="vale-line city">${esc(empresa?.ciudad ?? "Arica")} - Chile</div>
      </div>
    </div>
    <div class="vale-box">
      <div class="vale-fecha-row">
        <span class="vlabel">FECHA:</span>
        <span class="hand vale-fecha">${fmtFecha(s.fecha)}</span>
      </div>
      <div class="vale-nombre-row">
        <span class="vlabel">NOMBRE:</span>
        <span class="hand vale-nombre">${nombre}</span>
      </div>
      <div class="vale-services">${filas}</div>
      <div class="vale-total"><span>TOTAL $</span> <span class="hand">${monto}</span></div>
      <div class="vale-firmas">
        <div class="vfirma">
          <span class="hand vfirma-name">${chofer}</span>
          <span class="vfirma-label">FIRMA CONDUCTOR</span>
        </div>
        <div class="vfirma">
          <span class="hand vfirma-name"></span>
          <span class="vfirma-label">FIRMA PASAJERO</span>
        </div>
      </div>
    </div>
    <div class="vale-foot">GRAFICOLOR • Celular: +56 9 94888863 • Arica</div>
  </div>`;
}

/**
 * La página de vales lista para imprimir.
 *
 * `titulo` es el nombre que el diálogo de impresión propone para el archivo: en
 * el sistema anterior se cambiaba `document.title` justo antes de imprimir y se
 * restauraba después, y por eso el PDF salía como "Vales_Agosto_2026.pdf".
 */
export function renderValesHTML(
  servicios: ServicioTaxiConRelaciones[],
  empresa: Empresa | null,
  logo: LogoData | null,
  titulo: string,
): string {
  const logoSrc = logo
    ? `data:image/${logo.ext};base64,${logo.buffer.toString("base64")}`
    : null;

  const cuantos = servicios.length;
  const vales = servicios.map((s) => vale(s, empresa, logoSrc)).join("\n");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<!-- Las mismas dos familias del sistema anterior: DM Sans para lo impreso y
     Caveat para lo escrito a mano. -->
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=Caveat:wght@600;700&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<div class="barra">
  <p>${cuantos} ${cuantos === 1 ? "vale" : "vales"} · se abre el diálogo de impresión; elige <b>Guardar como PDF</b>.</p>
  <button type="button" onclick="window.print()">Imprimir / Guardar PDF</button>
</div>

<div id="print-root">
${vales}
</div>

<script>
// Espera a que el logo y las fuentes carguen antes de abrir el diálogo: si se
// imprime antes, el vale sale sin logo o con la letra de repuesto. Es lo mismo
// que hacía printVales() en el sistema anterior, que aguardaba las imágenes.
(function () {
  var imgs = Array.prototype.slice.call(document.images);
  var listas = imgs.map(function (img) {
    return img.complete ? Promise.resolve() : new Promise(function (ok) {
      img.onload = img.onerror = ok;
    });
  });
  listas.push(document.fonts ? document.fonts.ready : Promise.resolve());
  Promise.all(listas).then(function () {
    setTimeout(function () { window.print(); }, 120);
  });
})();
</script>
</body>
</html>`;
}
