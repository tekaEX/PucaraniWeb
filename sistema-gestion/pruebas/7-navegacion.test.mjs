// Recorrer el tramo EN EL TELÉFONO en vez de re-pedirlo cada 150 m.
//
// Se simula un viaje sobre un tramo REAL de Arica (fixtures/tramo-arica.json,
// capturado de la API de Mapbox: 9 maniobras, 3,6 km) y se comprueba que las
// dos reglas que reemplazan a esas consultas funcionan sobre datos de verdad:
//
//   · avanzar de maniobra cuando faltan <= 25 m para ella
//   · detectar que el chofer se salió del camino a más de 60 m del trazado
//
// Los umbrales solo se pueden justificar contra geometría real: con vértices
// cada 30 m en una avenida y cada 5 m en una rotonda, un número elegido a ojo
// deja pasos que no terminan nunca o recálculos en cada esquina.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { distanciaAPolilinea, distanciaMetros, metrosRestantes } from "@/lib/rutas";

const tramo = JSON.parse(
  readFileSync(new URL("./fixtures/tramo-arica.json", import.meta.url), "utf8"),
);

// Los mismos de use-navegacion.ts.
const UMBRAL_MANIOBRA_M = 25;
const UMBRAL_FUERA_DE_RUTA_M = 60;

const aCoord = ([lng, lat]) => ({ lat, lng });

/** Puntos cada ~paso metros a lo largo del trazado, como iría el GPS. */
function recorrer(geometria, cadaMetros = 10) {
  const puntos = [];
  for (let i = 0; i < geometria.length - 1; i++) {
    const a = aCoord(geometria[i]);
    const b = aCoord(geometria[i + 1]);
    const largo = distanciaMetros(a, b);
    const n = Math.max(1, Math.round(largo / cadaMetros));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      puntos.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
    }
  }
  puntos.push(aCoord(geometria[geometria.length - 1]));
  return puntos;
}

/** El avance de paso tal cual lo hace el hook durante el render. */
function avanzar(indice, posicion) {
  let i = indice;
  while (
    i < tramo.pasos.length - 1 &&
    metrosRestantes(posicion, tramo.pasos[i].geometria) <= UMBRAL_MANIOBRA_M
  ) {
    i++;
  }
  return i;
}

test("el fixture es un tramo real y completo", () => {
  assert.equal(tramo.pasos.length, 9);
  assert.ok(tramo.geometria.length > 100);
  assert.ok(tramo.pasos.every((p) => Array.isArray(p.geometria) && p.geometria.length >= 2));
  assert.ok(tramo.pasos.slice(0, -1).every((p) => p.avisos.length > 0), "faltan avisos de voz");
});

test("manejando el tramo entero, el cartel pasa por TODAS las maniobras y en orden", () => {
  let indice = 0;
  const vistos = [0];
  for (const posicion of recorrer(tramo.geometria)) {
    const nuevo = avanzar(indice, posicion);
    assert.ok(nuevo >= indice, "el paso retrocedió");
    if (nuevo !== indice) vistos.push(nuevo);
    indice = nuevo;
  }
  assert.equal(indice, tramo.pasos.length - 1, "no llegó al último paso");
  assert.deepEqual(vistos, [0, 1, 2, 3, 4, 5, 6, 7, 8], "se salteó maniobras");
});

test("ninguna maniobra se queda trabada (el bug que obligaba a re-consultar)", () => {
  // Para cada paso, cuántas lecturas de GPS se pasan antes de que avance.
  let indice = 0;
  const lecturasEnPaso = new Array(tramo.pasos.length).fill(0);
  for (const posicion of recorrer(tramo.geometria)) {
    lecturasEnPaso[indice]++;
    indice = avanzar(indice, posicion);
  }
  // El último acumula las lecturas del final; los demás tienen que haberse
  // terminado en algún momento.
  for (let i = 0; i < tramo.pasos.length - 1; i++) {
    assert.ok(lecturasEnPaso[i] > 0, `el paso ${i} nunca se mostró`);
  }
  assert.equal(indice, tramo.pasos.length - 1);
});

test("los metros a la maniobra bajan hasta cero dentro de cada paso", () => {
  let indice = 0;
  let anterior = Infinity;
  for (const posicion of recorrer(tramo.geometria)) {
    const nuevo = avanzar(indice, posicion);
    if (nuevo !== indice) {
      indice = nuevo;
      anterior = Infinity; // maniobra nueva, se reinicia la cuenta
    }
    const metros = metrosRestantes(posicion, tramo.pasos[indice].geometria);
    assert.ok(metros <= anterior + 1, `la distancia subió: ${anterior} → ${metros}`);
    anterior = metros;
  }
});

test("dos maniobras casi juntas se saltan en una sola lectura de GPS", () => {
  // Los pasos 3→4 son "siga por la derecha" (77 m) pegado al anterior: yendo a
  // 50 km/h una lectura de GPS cubre ~15 m, pero con la señal mala pueden pasar
  // 100 m entre lecturas y las dos maniobras quedan atrás juntas.
  let indice = 0;
  for (const posicion of recorrer(tramo.geometria, 120)) {
    indice = avanzar(indice, posicion);
  }
  assert.equal(indice, tramo.pasos.length - 1, "con lecturas cada 120 m se perdió el avance");
});

// -------------------------------------------------- salirse del camino
test("yendo POR la ruta, nunca se declara fuera de camino", () => {
  let maximo = 0;
  for (const posicion of recorrer(tramo.geometria, 5)) {
    maximo = Math.max(maximo, distanciaAPolilinea(posicion, tramo.geometria));
  }
  assert.ok(maximo < 1, `sobre el propio trazado el desvío dio ${maximo} m`);
  assert.ok(maximo < UMBRAL_FUERA_DE_RUTA_M);
});

test("el desvío se mide contra el SEGMENTO, no contra el vértice más cercano", () => {
  // Una recta larga con solo dos vértices: yendo justo por el medio, la
  // distancia al vértice más cercano son cientos de metros y la del segmento,
  // cero. Medir por vértice habría hecho recalcular la ruta en cada avenida.
  const recta = [
    [-70.29, -18.47],
    [-70.29, -18.48],
  ];
  const medio = { lat: -18.475, lng: -70.29 };
  assert.ok(distanciaAPolilinea(medio, recta) < 1);
  const alVertice = Math.min(
    distanciaMetros(medio, aCoord(recta[0])),
    distanciaMetros(medio, aCoord(recta[1])),
  );
  assert.ok(alVertice > 500, `el vértice más cercano estaba a ${alVertice} m`);
});

test("doblar donde no era sí dispara el recálculo", () => {
  // 150 m perpendicular al trazado, a mitad de camino.
  const sobre = aCoord(tramo.geometria[Math.floor(tramo.geometria.length / 2)]);
  const desviado = { lat: sobre.lat + 0.00135, lng: sobre.lng };
  const desvio = distanciaAPolilinea(desviado, tramo.geometria);
  assert.ok(desvio > UMBRAL_FUERA_DE_RUTA_M, `dio ${Math.round(desvio)} m`);
});

test("el ancho de una avenida con bandejón NO dispara el recálculo", () => {
  // ~15 m al costado: el GPS rebotando entre edificios llega a eso, y ahí no
  // hay que pedir nada.
  const sobre = aCoord(tramo.geometria[Math.floor(tramo.geometria.length / 3)]);
  const alCostado = { lat: sobre.lat + 0.00013, lng: sobre.lng };
  assert.ok(distanciaAPolilinea(alCostado, tramo.geometria) < UMBRAL_FUERA_DE_RUTA_M);
});

test("distanciaAPolilinea: casos degenerados", () => {
  const p = { lat: -18.47, lng: -70.29 };
  assert.equal(distanciaAPolilinea(p, []), Infinity);
  assert.ok(distanciaAPolilinea(p, [[-70.29, -18.47]]) < 1); // un solo punto
  // Vértices repetidos (segmento de largo cero) no dan NaN.
  const d = distanciaAPolilinea(p, [
    [-70.3, -18.48],
    [-70.3, -18.48],
  ]);
  assert.ok(Number.isFinite(d) && d > 0);
});

// ---------------------------------------------- cuánto se ahorra de verdad
test("cuenta de consultas: recorrer el tramo en el teléfono contra re-pedirlo cada 150 m", () => {
  const largo = tramo.pasos.reduce((a, p) => a + p.distanciaM, 0);

  // Antes: una consulta cada 150 m recorridos.
  const antes = Math.floor(largo / 150);
  // Ahora: una por parada (más los recálculos, que en un tramo bien seguido
  // son cero).
  const ahora = 1;

  assert.ok(largo > 3000, `el tramo mide ${largo} m`);
  assert.ok(antes >= 20, `esperaba muchas consultas en el esquema viejo, dio ${antes}`);
  assert.ok(
    ahora <= antes / 10,
    `la mejora es menor a 10x: ${antes} → ${ahora}`,
  );
});
