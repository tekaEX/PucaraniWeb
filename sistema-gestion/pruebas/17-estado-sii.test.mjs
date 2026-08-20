// Cómo se lee lo que contestó el SII.
//
// La regla que fijan estas pruebas es una sola y va en una dirección: el
// sistema puede equivocarse mostrando MENOS certeza de la que hay, nunca más.
// Un "en proceso" de más obliga a volver a consultar y no cuesta nada. Un
// "aceptada" de más hace que alguien cobre un documento que ante el SII no
// existe, y eso no se descubre mirando la pantalla.
//
// La tabla de códigos del SII todavía no está verificada contra respuestas
// reales —falta el certificado digital—, así que lo que se prueba acá no es
// que cada código esté bien traducido: es que los desconocidos NO se cuelen
// como aceptados.
import test from "node:test";
import assert from "node:assert/strict";

import {
  clasificarEstadoSii,
  esperaRespuesta,
  necesitaAtencion,
  ESTADOS_SII,
} from "@/lib/sii/estado";

test("sin código = nunca pasó por el SII (no es un error ni un pendiente)", () => {
  assert.equal(clasificarEstadoSii(null), "sin_enviar");
  assert.equal(clasificarEstadoSii(undefined), "sin_enviar");
  assert.equal(clasificarEstadoSii(""), "sin_enviar");
  assert.equal(clasificarEstadoSii("   "), "sin_enviar");
});

test("los estados propios de la app se reconocen", () => {
  // Los escribe emitirFactura(): 'enviado' al recibir el track id, 'error'
  // cuando el envío ni siquiera salió.
  assert.equal(clasificarEstadoSii("enviado"), "enviado");
  assert.equal(clasificarEstadoSii("error"), "error");
});

test('el "OK" del envío significa entregado, NO aceptado', () => {
  // Es lo que guarda emitirFactura() cuando el sobre se entregó bien. Leerlo
  // como "aceptada" sería dar por válido un documento sobre el que el SII
  // todavía no dijo nada: el veredicto solo llega consultando el track id.
  assert.equal(clasificarEstadoSii("OK"), "enviado");
  assert.equal(esperaRespuesta(clasificarEstadoSii("OK")), true);
});

test("un código desconocido NO se da por aceptado", () => {
  // Este es el caso que importa: el día que el SII conteste algo que la tabla
  // no tiene, la factura no puede quedar en verde.
  for (const codigo of ["XYZ", "99", "PROCESANDO", "ACEPTADO", "VALIDO"]) {
    const e = clasificarEstadoSii(codigo);
    assert.equal(e, "sin_clasificar", `"${codigo}" debería quedar sin clasificar, dio "${e}"`);
    assert.notEqual(e, "aceptado");
  }
});

test("un código sin clasificar cuenta como respuesta pendiente, no como final", () => {
  // Si no sabemos leer la respuesta, tampoco sabemos si el SII terminó: la
  // factura tiene que seguir invitando a consultar de nuevo.
  assert.equal(esperaRespuesta(clasificarEstadoSii("XYZ")), true);
});

test("los rechazos del SII se reconocen como rechazo", () => {
  for (const codigo of ["RCH", "RCT", "RSC", "RFR", "RCV", "SNC"]) {
    assert.equal(clasificarEstadoSii(codigo), "rechazado", codigo);
  }
});

test("la glosa gana sobre el código cuando habla de reparos", () => {
  // Un "aceptado con reparos" vale, pero hay algo que corregir. Confundirlo
  // con un aceptado limpio hace que el reparo se repita en la factura
  // siguiente. Equivocarse hacia "reparos" no rompe nada; al revés sí.
  assert.equal(clasificarEstadoSii("EPR", "Envio Procesado con reparos"), "reparos");
  assert.equal(clasificarEstadoSii("EPR", "Documento con 2 REPAROS"), "reparos");
});

test('"sin reparos" no es un reparo', () => {
  assert.equal(clasificarEstadoSii("EPR", "Envio Procesado sin reparos"), "aceptado");
});

test("el código se reconoce en cualquier caja", () => {
  // Los del SII llegan en mayúsculas y los nuestros en minúsculas; que la
  // columna guarde lo crudo no debe romper la lectura.
  assert.equal(clasificarEstadoSii("epr"), "aceptado");
  assert.equal(clasificarEstadoSii("ENVIADO"), "enviado");
  assert.equal(clasificarEstadoSii("rch"), "rechazado");
});

test('"emitiendo" es el cerrojo: transitorio, y no es un problema', () => {
  // Lo escribe emitirFactura() antes de pedir el folio, para que otra pestaña
  // no emita la misma factura. Mientras esté puesto la emisión está en curso:
  // ni resuelta ni fallada.
  assert.equal(clasificarEstadoSii("emitiendo"), "emitiendo");
  assert.equal(esperaRespuesta("emitiendo"), true);
  assert.equal(necesitaAtencion("emitiendo"), false);
});

test("necesitaAtencion marca lo que alguien tiene que resolver", () => {
  assert.equal(necesitaAtencion("rechazado"), true);
  assert.equal(necesitaAtencion("reparos"), true);
  assert.equal(necesitaAtencion("error"), true);
  assert.equal(necesitaAtencion("aceptado"), false);
  assert.equal(necesitaAtencion("sin_enviar"), false);
  // Una factura recién enviada no es un problema: es una espera.
  assert.equal(necesitaAtencion("enviado"), false);
});

test("esperaRespuesta distingue lo transitorio de lo definitivo", () => {
  assert.equal(esperaRespuesta("enviado"), true);
  assert.equal(esperaRespuesta("en_proceso"), true);
  assert.equal(esperaRespuesta("aceptado"), false);
  assert.equal(esperaRespuesta("rechazado"), false);
  assert.equal(esperaRespuesta("reparos"), false);
});

test("todos los estados tienen etiqueta en castellano", () => {
  // Sin esto un estado nuevo se muestra como `undefined` en la pastilla.
  const estados = [
    "sin_enviar",
    "emitiendo",
    "enviado",
    "en_proceso",
    "aceptado",
    "reparos",
    "rechazado",
    "error",
    "sin_clasificar",
  ];
  for (const e of estados) {
    assert.equal(typeof ESTADOS_SII[e], "string", e);
    assert.ok(ESTADOS_SII[e].length > 0, e);
  }
  assert.equal(Object.keys(ESTADOS_SII).length, estados.length);
});
