// Candados de la personalización de la tarjeta.
//
// Lo que defienden, en una línea: que un guardado viejo, incompleto o adulterado
// no pueda dejar la tarjeta sin datos ni dibujar renglones que no existen.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CAMPO,
  REGION,
  CAMPOS_OPCIONALES,
  CAMPOS_FIJOS,
  IDS_OPCIONALES,
  configuracionPorDefecto,
  normalizarConfiguracion,
  camposVisiblesDe,
  campoVisible,
  moverCampo,
  alternarCampo,
  claveDeConfiguracion,
} from "./camposTarjeta.js";

test("G1. los tres fijos NO son opcionales, así que no se pueden apagar", () => {
  // Es el candado más importante del archivo: si un fijo entrara en la lista de
  // opcionales, alguien podría dejar la tarjeta sin nombre o sin precio.
  for (const fijo of CAMPOS_FIJOS) {
    assert.equal(
      IDS_OPCIONALES.includes(fijo.id),
      false,
      `${fijo.id} es fijo y no puede estar entre los opcionales`
    );
  }
  assert.deepEqual(CAMPOS_FIJOS.map((c) => c.id), ["nombre", "precioPos", "editar"]);
});

test("G2. de fábrica se ve todo, que es la tarjeta de hoy", () => {
  const config = configuracionPorDefecto();
  for (const id of IDS_OPCIONALES) {
    assert.equal(config.visibles[id], true, `${id} tendría que arrancar visible`);
  }
  assert.deepEqual(config.orden, IDS_OPCIONALES);
});

test("G3. un guardado nulo, roto o de otro tipo cae en el default", () => {
  for (const basura of [null, undefined, 0, "", "{}", [], true]) {
    const c = normalizarConfiguracion(basura);
    assert.equal(Object.keys(c.visibles).length, IDS_OPCIONALES.length);
    assert.deepEqual(c.orden, IDS_OPCIONALES);
  }
});

test("G4. un campo que el guardado no conoce aparece visible y al final", () => {
  // El caso real: se agrega un opcional nuevo y hay usuarios con la
  // configuración anterior guardada. Si el campo nuevo llegara oculto, nadie lo
  // vería nunca y parecería que la tanda no salió.
  const viejo = { visibles: { proveedor: false }, orden: [CAMPO.PROVEEDOR, CAMPO.COSTO] };
  const c = normalizarConfiguracion(viejo);

  assert.equal(c.visibles[CAMPO.PROVEEDOR], false, "lo que el usuario apagó se respeta");
  assert.equal(c.visibles[CAMPO.CODIGO_INTERNO], true, "lo que no conocía, visible");
  assert.deepEqual(c.orden.slice(0, 2), [CAMPO.PROVEEDOR, CAMPO.COSTO], "el orden guardado manda");
  assert.equal(c.orden.length, IDS_OPCIONALES.length, "y se completa con el resto");
});

test("G5. un id que ya no existe se descarta en vez de dibujar un renglón vacío", () => {
  const c = normalizarConfiguracion({
    visibles: { unCampoQueSeFue: true },
    orden: ["unCampoQueSeFue", CAMPO.MARGEN],
  });
  assert.equal(c.orden.includes("unCampoQueSeFue"), false);
  assert.equal(c.visibles.unCampoQueSeFue, undefined);
  assert.equal(c.orden[0], CAMPO.MARGEN, "el que sí existe conserva su lugar");
});

test("G6. un orden con repetidos no duplica el campo", () => {
  const c = normalizarConfiguracion({
    orden: [CAMPO.MARGEN, CAMPO.MARGEN, CAMPO.COSTO, CAMPO.MARGEN],
  });
  assert.equal(c.orden.filter((id) => id === CAMPO.MARGEN).length, 1);
  assert.equal(c.orden.length, IDS_OPCIONALES.length);
});

test("G7. cada región devuelve solo lo suyo, en el orden configurado", () => {
  const config = configuracionPorDefecto();
  assert.deepEqual(camposVisiblesDe(config, REGION.MARCA), [CAMPO.COSTO, CAMPO.MARGEN]);
  assert.deepEqual(camposVisiblesDe(config, REGION.PIE), [CAMPO.CODIGO_BARRA, CAMPO.CODIGO_INTERNO]);
  assert.deepEqual(camposVisiblesDe(config, REGION.PROVEEDOR), [CAMPO.PROVEEDOR]);
  assert.deepEqual(camposVisiblesDe(config, REGION.EQUIVALENCIA), [CAMPO.EQUIVALENCIA]);
});

test("G7-bis. una región de uno no se puede reordenar, y lo dice", () => {
  // Es la contraprueba de la decisión: el proveedor y la equivalencia tienen
  // posición estructural propia, así que moverlos no puede hacer nada. Si esto
  // se pusiera rojo, el botón de subir/bajar estaría prometiendo algo que la
  // tarjeta no va a mostrar.
  const inicial = configuracionPorDefecto();
  for (const direccion of ["arriba", "abajo"]) {
    assert.deepEqual(moverCampo(inicial, CAMPO.PROVEEDOR, direccion).orden, inicial.orden);
    assert.deepEqual(moverCampo(inicial, CAMPO.EQUIVALENCIA, direccion).orden, inicial.orden);
  }
});

test("G8. apagar un campo lo saca de su región y no toca a los otros", () => {
  const config = alternarCampo(configuracionPorDefecto(), CAMPO.CODIGO_BARRA);
  assert.deepEqual(camposVisiblesDe(config, REGION.PIE), [CAMPO.CODIGO_INTERNO]);
  assert.equal(campoVisible(config, CAMPO.CODIGO_BARRA), false);
  assert.equal(campoVisible(config, CAMPO.CODIGO_INTERNO), true);
  assert.deepEqual(camposVisiblesDe(config, REGION.MARCA), [CAMPO.COSTO, CAMPO.MARGEN]);
});

test("G9. alternar dos veces vuelve a lo mismo", () => {
  const inicial = configuracionPorDefecto();
  const ida = alternarCampo(inicial, CAMPO.MARGEN);
  const vuelta = alternarCampo(ida, CAMPO.MARGEN);
  assert.deepEqual(vuelta.visibles, inicial.visibles);
  assert.deepEqual(vuelta.orden, inicial.orden);
});

test("G10. mover reordena DENTRO de la región y no mueve a las demás", () => {
  const config = moverCampo(configuracionPorDefecto(), CAMPO.MARGEN, "arriba");
  assert.deepEqual(camposVisiblesDe(config, REGION.MARCA), [CAMPO.MARGEN, CAMPO.COSTO]);
  // Las otras dos regiones quedan exactamente como estaban.
  assert.deepEqual(camposVisiblesDe(config, REGION.PIE), [CAMPO.CODIGO_BARRA, CAMPO.CODIGO_INTERNO]);
  assert.deepEqual(camposVisiblesDe(config, REGION.PROVEEDOR), [CAMPO.PROVEEDOR]);
});

test("G11. en el borde de su región, mover no hace nada", () => {
  const inicial = configuracionPorDefecto();
  // El costo ya es el primero de su región.
  assert.deepEqual(moverCampo(inicial, CAMPO.COSTO, "arriba").orden, inicial.orden);
  // Y el margen el último.
  assert.deepEqual(moverCampo(inicial, CAMPO.MARGEN, "abajo").orden, inicial.orden);
  // Un id que no existe tampoco.
  assert.deepEqual(moverCampo(inicial, "inventado", "arriba").orden, inicial.orden);
});

test("G12. mover NO cambia qué está visible", () => {
  // Reordenar y esconder son dos operaciones distintas: si mover apagara algo
  // —o lo prendiera— el usuario perdería su selección al acomodar la tarjeta.
  const apagado = alternarCampo(configuracionPorDefecto(), CAMPO.COSTO);
  const movido = moverCampo(apagado, CAMPO.MARGEN, "arriba");
  assert.deepEqual(movido.visibles, apagado.visibles);
});

test("G13. la clave de guardado es por ubicación", () => {
  assert.notEqual(claveDeConfiguracion(1), claveDeConfiguracion(2));
  assert.equal(claveDeConfiguracion(null), claveDeConfiguracion(0), "sin ubicación, una sola clave");
});

test("G14. cada opcional declara una región conocida", () => {
  const regiones = new Set(Object.values(REGION));
  for (const campo of CAMPOS_OPCIONALES) {
    assert.equal(regiones.has(campo.region), true, `${campo.id} declara una región inexistente`);
    assert.equal(typeof campo.etiqueta, "string");
    assert.ok(campo.etiqueta.length > 0, `${campo.id} sin etiqueta`);
  }
});
