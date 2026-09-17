// LO QUE EMANUEL CONTESTA UNA VEZ NO SE LE VUELVE A PREGUNTAR.
//
// ── LA REGLA, Y SU LÍMITE ──────────────────────────────────────────────────
//
// Si dijo que el precio que este proveedor publica para este producto es el de
// la caja de 12, la lista del mes que viene se lee así sola. Eso es lo que
// convierte el módulo de "revisar 70 productos todos los meses" en "revisar los
// que cambiaron".
//
// Y tiene UN límite, que es lo que estos candados defienden: la lectura guardada
// se usa SOLO si el costo que produce cae en el rango del proveedor. Guardar una
// respuesta no es guardar un permiso. El proveedor puede haber cambiado de
// presentación, o el costo del producto puede haberse corregido, y en los dos
// casos la respuesta vieja dejó de valer.

import test from "node:test";
import assert from "node:assert/strict";

import { costoDeLaFila } from "@/lib/proveedores/listas/eleccionDeLectura";
import { CONFIG_GENERICA } from "@/lib/proveedores/listas/configuraciones/generico";

const RECARGO = 5;

// Un producto que se compra por caja de 12 y hoy cuesta 12.000 la caja.
const base = {
  precio_costo: 12000,
  factor_pack: 12,
  unidad_medida: "UNIDAD",
  modoCompraProveedor: "BULTO",
  pesoReferenciaKg: null,
};

const producto = {
  factorPack: 12,
  unidadMedida: "UNIDAD",
  modoCompraProveedor: "BULTO",
  esCombo: false,
  creadoEnLocalId: 1,
};

/**
 * La lista dice 1.000. Leída tal cual da 1.050 —se hunde—; leída por caja da
 * 12.600, que es +5 % y entra en un rango de 2 a 15.
 */
const correr = ({ precio = 1000, rango = { minPct: 2, maxPct: 15 }, lecturaRecordada = null, costo = 12000 } = {}) =>
  costoDeLaFila({
    fila: { precioConIva: precio, unidadProveedor: null, unidadesPorBulto: null },
    base: { ...base, precio_costo: costo },
    config: { ...CONFIG_GENERICA, impuestoAdicionalPct: null },
    recargoPct: RECARGO,
    impuestoAdicionalPct: null,
    rango,
    precioConRecargo: precio * (1 + RECARGO / 100),
    producto,
    requiereBulto: true,
    factorErp: 12,
    factorErpValido: true,
    lecturaRecordada,
  });

test("sin nada recordado, elige el rango, como siempre", () => {
  const r = correr();
  assert.equal(r.ok, true);
  assert.equal(r.clave, "PACK_12");
  assert.equal(r.resultado, "RECOMENDADA");
});

test("la lectura recordada se usa sola cuando su costo cae en el rango", () => {
  const r = correr({ lecturaRecordada: { clave: "PACK_12", multiplicador: 12 } });
  assert.equal(r.ok, true);
  assert.equal(r.clave, "PACK_12");
  // El resultado dice de dónde salió la decisión. No es cosmético: es lo que
  // deja explicar después por qué una fila se aplicó sin que nadie la mirara.
  assert.equal(r.resultado, "RECORDADA");
  assert.equal(r.costoMaestro, 12600);
});

test("SI LA LECTURA RECORDADA QUEDA FUERA DEL RANGO, SE VUELVE A PREGUNTAR", () => {
  // ÉSTE ES EL LÍMITE, y el caso donde de verdad se nota: el costo del producto
  // se corrigió a 5.000, así que NINGUNA de las dos lecturas cae en 2–15 —tal
  // cual da -79 %, por caja da +152 %—. Con la memoria tratada como permiso, la
  // fila se habría aplicado a +152 %; lo que tiene que pasar es que vuelva a la
  // cola.
  const r = correr({ costo: 5000, lecturaRecordada: { clave: "PACK_12", multiplicador: 12 } });
  assert.equal(r.ok, false, "la memoria se usó como si fuera un permiso");
  assert.equal(r.motivo, "FUERA_DE_RANGO");
});

test("si la recordada no cae pero OTRA sí, gana la que cae", () => {
  // El costo del producto pasó a ser el de la unidad. La respuesta vieja —por
  // caja— daría +1.160 %, y la otra lectura da +5 %. No hay nada que preguntar:
  // la memoria no es un permiso, pero tampoco un veto sobre el resto.
  const r = correr({ costo: 1000, lecturaRecordada: { clave: "PACK_12", multiplicador: 12 } });
  assert.equal(r.ok, true);
  assert.equal(r.clave, "MISMA_PRESENTACION");
  assert.equal(r.resultado, "RECOMENDADA", "la eligió el rango, no la memoria");
});

test("una lectura recordada que ya no existe para esta fila se ignora", () => {
  // El proveedor dejó de publicar esa presentación, o el producto perdió el
  // factor. La clave guardada no está entre las lecturas posibles: se cae al
  // camino de siempre en vez de romper.
  const r = correr({ lecturaRecordada: { clave: "PACK_99", multiplicador: 99 } });
  assert.equal(r.ok, true);
  assert.equal(r.clave, "PACK_12");
  assert.equal(r.resultado, "RECOMENDADA");
});

test("la memoria NO puede rescatar una fila que el rango rechaza entera", () => {
  // CONTRAPRUEBA DEL LÍMITE: con un rango que ninguna lectura cumple, recordar
  // no cambia nada. Si lo cambiara, la memoria sería una puerta para escribir
  // cualquier costo con tal de haberlo contestado una vez.
  const r = correr({
    rango: { minPct: 40, maxPct: 50 },
    lecturaRecordada: { clave: "PACK_12", multiplicador: 12 },
  });
  assert.equal(r.ok, false);
});

test("y la memoria tampoco pisa una lectura que cae justo en el costo de hoy", () => {
  // El caso "sin cambio" gana antes que todo: una lectura que da EXACTAMENTE el
  // costo que el producto ya tiene es la evidencia más fuerte de que ésa es la
  // buena, y aplicarla no escribe nada. Recordar otra no puede convertir un
  // "no hay nada que hacer" en una escritura.
  const r = correr({ precio: 11428.571428, lecturaRecordada: { clave: "PACK_12", multiplicador: 12 } });
  assert.equal(r.ok, true);
  assert.equal(r.clave, "MISMA_PRESENTACION");
  assert.equal(r.costoMaestro, 12000);
});
