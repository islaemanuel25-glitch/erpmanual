// Qué dice la descripción del proveedor sobre la presentación.
//
// Todas las descripciones de acá son del archivo real de agosto.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  presentacionDeDescripcion,
  compatibilidadDePresentacion,
} from "@/lib/proveedores/listas/presentacionDescripcion";

const cant = (d) => presentacionDeDescripcion(d).cantidad;

test("cantidad seguida del peso de cada unidad", () => {
  assert.equal(cant("JG. PV. ARC NARANJA 18 X 15g"), 18);
  assert.equal(cant("JG. PV. ARC FRUTILLA 18u x 18g"), 18);
  assert.equal(cant("BOCADITO CABSHA 48 x 10g"), 48);
  assert.equal(cant("BON. O BON SUPREME 12x36g"), 12);
  assert.equal(cant("ROCKLETS MINI 44X10G"), 44);
  assert.equal(cant("DISPLAY CHOCO. ARC. MILK 20u x 12g"), 20);
  assert.equal(cant("BARRITA AGUILA TAZA 24x14 GRS."), 24);
  assert.equal(cant("SERRANAS SANDWICH 3 X 112 GRS"), 3);
});

test("la forma de tres números: el primero es la cantidad", () => {
  assert.equal(cant("MOGUL. BANANITAS 12X12X30G"), 12);
});

test("cantidad sin peso", () => {
  assert.equal(cant("BON. O BON BLANCO x 30u"), 30);
  assert.equal(cant("BON O BON CHOCOLINAS x 18u"), 18);
  assert.equal(cant("MOGUL. OSITOS ACIDOS x10u"), 10);
  assert.equal(cant("ROLLO MOGUL ACIDO x 12u"), 12);
});

test("un envase descrito solo por su peso es UNO", () => {
  assert.equal(cant("TABLETA ARCOR LECHE MANI x 80g"), 1);
  assert.equal(cant("ROCKLETS. x40g CONFITADO"), 1);
  assert.equal(cant("BAÑO REP.LECHE POUCH X150G."), 1);
  assert.equal(cant("COFLER AIREADO LECHE X27GR"), 1);
  assert.equal(cant("SURTIDO CHOCOLATE ARCOR x 246g"), 1);
});

// ── LA DISTINCIÓN QUE IMPORTA ───────────────────────────────────────────────

test("EL CASO MOGUL: el contenido de la bolsa no es la cantidad", () => {
  const r = presentacionDeDescripcion("MOGUL x1 Kg CONITOS (450u)");
  assert.equal(r.cantidad, 1, "es UNA bolsa");
  assert.equal(r.contenidoInterno, 450, "con 450 caramelos adentro");
  assert.match(r.pesoTexto ?? "", /1\s*Kg/i);
});

test("MOGUL de 500 g con su contenido entre paréntesis", () => {
  const r = presentacionDeDescripcion("MOGUL x 500Grs FRUTILLA C/CREMA (119u)");
  assert.equal(r.cantidad, 1);
  assert.equal(r.contenidoInterno, 119);
});

test("MOGUL x1 Kg JELLY BUTTONS (210u)", () => {
  const r = presentacionDeDescripcion("MOGUL x1 Kg JELLY BUTTONS (210u)");
  assert.equal(r.cantidad, 1);
  assert.equal(r.contenidoInterno, 210);
});

test("sin paréntesis no hay contenido interno inventado", () => {
  assert.equal(presentacionDeDescripcion("MOGUL x 500Grs OSITOS").contenidoInterno, null);
});

test("una descripción vacía no dice nada", () => {
  for (const d of ["", null, undefined, "   "]) {
    const r = presentacionDeDescripcion(d);
    assert.equal(r.cantidad, null, String(d));
    assert.equal(r.origen, "SIN_DATO");
  }
});

test("una descripción sin números tampoco", () => {
  assert.equal(cant("COFLER MACIZO 60% ALMENDRAS"), null);
});

test("una cantidad disparatada no se toma como presentación", () => {
  // Más de 200 unidades no es un envase que se venda. Queda como envase único:
  // lo que importa es que ese número NO se convierta en la cantidad.
  const r = presentacionDeDescripcion("ALGO 5000 x 10g");
  assert.notEqual(r.cantidad, 5000);
  assert.equal(r.cantidad, 1);
});

// ── La conciliación de presentación ─────────────────────────────────────────

test("coinciden cuando la descripción y el producto dicen lo mismo", () => {
  assert.equal(compatibilidadDePresentacion({ cantidadDescripcion: 18, factorPack: 18 }), "COINCIDEN");
});

test("difieren cuando no", () => {
  assert.equal(compatibilidadDePresentacion({ cantidadDescripcion: 12, factorPack: 18 }), "DIFIEREN");
});

test("sin uno de los dos no se opina", () => {
  assert.equal(compatibilidadDePresentacion({ cantidadDescripcion: null, factorPack: 18 }), "SIN_DATO");
  assert.equal(compatibilidadDePresentacion({ cantidadDescripcion: 18, factorPack: null }), "SIN_DATO");
});

test("el jugo real: la descripción dice 18 y el producto tiene 18", () => {
  const r = presentacionDeDescripcion("JG. PV. ARC FRUTILLA 18u x 18g");
  assert.equal(compatibilidadDePresentacion({ cantidadDescripcion: r.cantidad, factorPack: 18 }), "COINCIDEN");
});

test("Rocklets: la descripción dice una unidad y el producto agrupa 18", () => {
  const r = presentacionDeDescripcion("ROCKLETS. x40g CONFITADO");
  assert.equal(r.cantidad, 1);
  assert.equal(compatibilidadDePresentacion({ cantidadDescripcion: 1, factorPack: 18 }), "DIFIEREN");
});
