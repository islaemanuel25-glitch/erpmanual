// LA OFERTA A MEDIO ARMAR SOBREVIVE A UN REFRESH.
//
//   node --import ./scripts/alias-loader.mjs --test lib/ofertas/ofertaEnCurso.test.mjs
//
// Lo que se afirma es la IDA Y VUELTA: lo que se guarda se repone tal cual. Y lo
// que NO se guarda, que es la mitad que se olvida — el costo y el precio normal
// se vuelven a pedir al servidor, porque entre que se fue y volvió pudieron
// cambiar.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CLAVE_OFERTA_EN_CURSO,
  deserializarOfertaEnCurso,
  serializarOfertaEnCurso,
  textoDelCartel,
} from "@/lib/ofertas/ofertaEnCurso";

const COMPLETA = {
  productoLocalId: 2006,
  productoBaseId: 6,
  nombre: "9 DE ORO AGRIDULCE",
  margen: "18",
  precio: "3400",
  redondear: true,
  duracion: "UNA_SEMANA",
  fechaElegida: "",
  soloEfectivo: true,
};

// ── 1 · LA IDA Y VUELTA ───────────────────────────────────────────────────

test("C1 · lo guardado se repone TAL CUAL, campo por campo", () => {
  const ida = serializarOfertaEnCurso(COMPLETA);
  const vuelta = deserializarOfertaEnCurso(JSON.stringify(ida));
  assert.deepEqual(vuelta, {
    productoLocalId: 2006,
    productoBaseId: 6,
    nombre: "9 DE ORO AGRIDULCE",
    margen: "18",
    precio: "3400",
    redondear: true,
    duracion: "UNA_SEMANA",
    fechaElegida: "",
    soloEfectivo: true,
  });
});

test("C2 · el margen y el precio viajan como TEXTO, a medio tipear incluido", () => {
  // Si se guardaran como número, "18." volvería como 18 y el campo perdería lo
  // que la persona estaba escribiendo.
  const ida = serializarOfertaEnCurso({ ...COMPLETA, margen: "18.", precio: "" });
  const vuelta = deserializarOfertaEnCurso(JSON.stringify(ida));
  assert.equal(vuelta.margen, "18.");
  assert.equal(vuelta.precio, "");
});

test("C3 · el redondeo APAGADO sobrevive, que es el caso que se pierde fácil", () => {
  // Un `redondear: false` mal serializado vuelve como `undefined` y el default
  // lo enciende: la persona vuelve y el precio le cambió sin que nadie lo tocara.
  const ida = serializarOfertaEnCurso({ ...COMPLETA, redondear: false });
  assert.equal(ida.redondear, false);
  assert.equal(deserializarOfertaEnCurso(JSON.stringify(ida)).redondear, false);

  // Y si no vino el campo, queda ENCENDIDO, que es el valor por defecto.
  assert.equal(deserializarOfertaEnCurso('{"productoLocalId":1}').redondear, true);
});

test("C4 · la fecha elegida a mano también vuelve", () => {
  const ida = serializarOfertaEnCurso({ ...COMPLETA, duracion: "ELEGIR", fechaElegida: "2026-09-21" });
  const vuelta = deserializarOfertaEnCurso(JSON.stringify(ida));
  assert.equal(vuelta.duracion, "ELEGIR");
  assert.equal(vuelta.fechaElegida, "2026-09-21");
});

// ── 2 · LO QUE NO SE GUARDA, Y ES DELIBERADO ──────────────────────────────

test("C5 · NO se guardan el costo ni el precio normal", () => {
  // Se vuelven a pedir al servidor al volver. Guardarlos mostraría el valor
  // viejo justo en el número que decide si la oferta conviene — es la misma
  // decisión que tomó el pedido a proveedor con el costo.
  const ida = serializarOfertaEnCurso({ ...COMPLETA, costo: 2833.33, precioNormal: 3700 });
  assert.ok(!("costo" in ida), "se guardó el costo: al volver mostraría el viejo");
  assert.ok(!("precioNormal" in ida), "se guardó el precio normal");
});

// ── 3 · LO QUE NO SE GUARDA PORQUE NO HAY NADA QUE GUARDAR ────────────────

test("C6 · sin producto elegido NO se guarda nada", () => {
  // Una pantalla recién abierta no es una oferta a medio armar. Guardarla haría
  // aparecer el cartel de "tenés una oferta a medio armar" sobre una pantalla
  // vacía, cada vez.
  assert.equal(serializarOfertaEnCurso({}), null);
  assert.equal(serializarOfertaEnCurso({ productoLocalId: 0 }), null);
  assert.equal(serializarOfertaEnCurso({ productoLocalId: "x" }), null);
  assert.equal(serializarOfertaEnCurso({ margen: "18", precio: "3400" }), null);
});

// ── 4 · LO ROTO NO ROMPE LA PANTALLA ──────────────────────────────────────

test("C7 · un JSON roto, una versión vieja o algo manipulado devuelven null", () => {
  for (const basura of ["", "{", "null", "[]", '"texto"', "{}", '{"productoLocalId":null}', '{"productoLocalId":-3}', undefined, null]) {
    assert.equal(deserializarOfertaEnCurso(basura), null, `entró ${JSON.stringify(basura)}`);
  }
});

test("C8 · un id manipulado a mano no pasa", () => {
  // `sessionStorage` lo puede editar cualquiera desde la consola del navegador.
  // Lo único que sale de acá es un entero positivo; el servidor igual valida el
  // alcance, pero la pantalla no tiene que ni intentar pedir un id inventado.
  assert.equal(deserializarOfertaEnCurso('{"productoLocalId":"1 OR 1=1"}'), null);
  assert.equal(deserializarOfertaEnCurso('{"productoLocalId":1.5}'), null);
});

// ── 5 · LA CLAVE Y EL CARTEL ──────────────────────────────────────────────

test("C9 · la clave es propia y no pisa la del pedido a proveedor", () => {
  assert.equal(CLAVE_OFERTA_EN_CURSO, "ofertasOfertaEnCurso");
  assert.notEqual(CLAVE_OFERTA_EN_CURSO, "comprasPedidoEnCurso");
});

test("C10 · el cartel nombra el producto, y sin nombre no dice «undefined»", () => {
  assert.match(textoDelCartel(deserializarOfertaEnCurso(JSON.stringify(serializarOfertaEnCurso(COMPLETA)))), /9 DE ORO AGRIDULCE/);
  assert.equal(textoDelCartel(deserializarOfertaEnCurso('{"productoLocalId":1}')), "Tenés una oferta a medio armar");
  assert.equal(textoDelCartel(null), "");
});
