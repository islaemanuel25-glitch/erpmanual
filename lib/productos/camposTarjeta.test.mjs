// Candados de la personalización de la tarjeta.
//
// Lo que defienden, en una línea: que un guardado viejo, incompleto o adulterado
// no pueda dejar la tarjeta sin datos ni dibujar renglones que no existen.
//
// ── QUÉ CAMBIÓ, Y POR QUÉ ESTOS CANDADOS SE REESCRIBIERON ──────────────────
//
// La personalización tenía DOS ejes: prender/apagar y REORDENAR dentro de una
// región. El orden se sacó por decisión de diseño —la posición de cada dato la
// define el layout aprobado— y con él se fueron `REGION`, `camposVisiblesDe` y
// `moverCampo`.
//
// Seis candados afirmaban sobre el orden. No se borraron sin más: cinco se
// reemplazan por su contrario —que el orden NO exista, y que un guardado que lo
// traiga no rompa nada— y uno, el de las regiones, se va porque el concepto que
// probaba desapareció.
//
// Eso es lo que hace que un candado reescrito no sea un candado aflojado: la
// afirmación nueva tiene que cubrir el agujero que deja la vieja. Acá el agujero
// es la migración, y por eso hay tres candados nuevos sobre `localStorage`.

import test from "node:test";
import assert from "node:assert/strict";

import {
  CAMPO,
  CAMPOS_FIJOS,
  CAMPOS_OPCIONALES,
  IDS_OPCIONALES,
  alternarCampo,
  campoVisible,
  claveDeConfiguracion,
  configuracionPorDefecto,
  normalizarConfiguracion,
} from "./camposTarjeta.js";

test("G1. los tres fijos NO son opcionales, así que no se pueden apagar", () => {
  // Si estuvieran en la lista de opcionales, alguien podría dejarlos en `false`
  // —a mano en el localStorage, o con un error de código— y la tarjeta quedaría
  // sin nombre, sin precio o sin forma de editar.
  const idsFijos = CAMPOS_FIJOS.map((c) => c.id);
  for (const id of idsFijos) {
    assert.equal(IDS_OPCIONALES.includes(id), false, `${id} es apagable y no debería`);
  }
  assert.deepEqual(idsFijos, ["nombre", "precioPos", "editar"]);
  // Y el fijo del precio nombra las DOS cosas, porque son una sola: el número
  // sin su presentación no se puede controlar.
  assert.match(CAMPOS_FIJOS[1].etiqueta, /presentación/i);
});

test("G2. de fábrica se ve TODO, que es la tarjeta de hoy", () => {
  const base = configuracionPorDefecto();
  for (const id of IDS_OPCIONALES) {
    assert.equal(base.visibles[id], true, `${id} arranca apagado`);
  }
  assert.equal(Object.keys(base.visibles).length, IDS_OPCIONALES.length);
});

test("G3. un guardado nulo, roto o de otro tipo cae en el default", () => {
  for (const basura of [null, undefined, 0, "", "{}", [], true]) {
    assert.deepEqual(normalizarConfiguracion(basura), configuracionPorDefecto());
  }
});

test("G4. NO HAY ORDEN: ni en el default ni en lo que devuelve la normalización", () => {
  // ── EL CANDADO QUE REEMPLAZA A LOS DEL ORDEN ────────────────────────────
  //
  // Devolver un `orden` que nadie lee es peor que no devolverlo: queda una llave
  // en el estado guardado que dentro de seis meses alguien va a interpretar como
  // si significara algo, y va a escribir código que la respete.
  assert.deepEqual(Object.keys(configuracionPorDefecto()), ["visibles"]);
  assert.deepEqual(Object.keys(normalizarConfiguracion(null)), ["visibles"]);
  assert.deepEqual(Object.keys(alternarCampo(null, CAMPO.COSTO)), ["visibles"]);
});

test("G5. MIGRACIÓN: un guardado viejo CON orden conserva lo que estaba apagado", () => {
  // Es el caso real de cualquiera que haya abierto "Personalizar card" antes de
  // esta tanda. Lo que no puede pasar es que la migración le prenda todo de
  // nuevo: apagó el costo por algo.
  const viejo = {
    visibles: {
      proveedor: true,
      costo: false,
      margen: true,
      equivalencia: false,
      codigoBarra: false,
      codigoInterno: true,
    },
    orden: ["codigoInterno", "codigoBarra", "equivalencia", "margen", "costo", "proveedor"],
  };
  const migrado = normalizarConfiguracion(viejo);

  assert.equal(migrado.visibles.costo, false, "se perdió que el costo estaba apagado");
  assert.equal(migrado.visibles.codigoBarra, false, "se perdió que el código de barras estaba apagado");
  assert.equal(migrado.visibles.proveedor, true);
  assert.equal(migrado.visibles.margen, true);
  assert.equal(migrado.visibles.codigoInterno, true);
  // Y el orden guardado se ignora, no se arrastra.
  assert.equal(migrado.orden, undefined);
});

test("G6. MIGRACIÓN: `equivalencia` no reaparece, ni apagada ni prendida", () => {
  // Era un opcional hasta esta tanda y ahora no existe: la franja que apagaba se
  // fue. Un id fantasma en el estado haría que la hoja dibuje un renglón sin
  // efecto, que es la peor clase de control.
  const conEquivalencia = normalizarConfiguracion({
    visibles: { equivalencia: false, proveedor: true },
  });
  assert.equal("equivalencia" in conEquivalencia.visibles, false);

  const prendida = normalizarConfiguracion({ visibles: { equivalencia: true } });
  assert.equal("equivalencia" in prendida.visibles, false);

  // Y tampoco entra por la puerta de al lado: alternarlo no lo crea.
  assert.equal("equivalencia" in alternarCampo(null, "equivalencia").visibles, false);
  assert.equal(IDS_OPCIONALES.includes("equivalencia"), false);
});

test("G7. un id que ya no existe se descarta en vez de dibujar un renglón vacío", () => {
  const conBasura = normalizarConfiguracion({
    visibles: { proveedor: false, inventado: true, 42: false },
  });
  assert.deepEqual(Object.keys(conBasura.visibles).sort(), [...IDS_OPCIONALES].sort());
  assert.equal(conBasura.visibles.proveedor, false);
});

test("G8. un campo NUEVO que el guardado no conoce aparece visible", () => {
  // Si apareciera apagado, agregar un opcional lo dejaría escondido para todos
  // los que ya guardaron alguna vez — y nadie sabría que existe.
  const viejo = { visibles: { proveedor: false } };
  const migrado = normalizarConfiguracion(viejo);
  for (const id of IDS_OPCIONALES) {
    if (id === CAMPO.PROVEEDOR) continue;
    assert.equal(migrado.visibles[id], true, `${id} apareció apagado`);
  }
});

test("G9. un valor que no es booleano no cuenta como preferencia", () => {
  // `"false"` como texto es verdadero en JavaScript. Si se copiara tal cual,
  // un guardado adulterado prendería un campo que el usuario apagó.
  const raro = normalizarConfiguracion({
    visibles: { proveedor: "false", costo: 0, margen: null },
  });
  assert.equal(raro.visibles.proveedor, true, "un texto se tomó como booleano");
  assert.equal(raro.visibles.costo, true);
  assert.equal(raro.visibles.margen, true);
});

test("G10. apagar un campo no toca a los otros, y alternar dos veces vuelve", () => {
  const base = configuracionPorDefecto();
  const sinCosto = alternarCampo(base, CAMPO.COSTO);
  assert.equal(sinCosto.visibles[CAMPO.COSTO], false);
  for (const id of IDS_OPCIONALES) {
    if (id === CAMPO.COSTO) continue;
    assert.equal(sinCosto.visibles[id], true, `${id} cambió sin que se lo tocara`);
  }
  assert.deepEqual(alternarCampo(sinCosto, CAMPO.COSTO), base);
});

test("G11. alternar un id que no existe no inventa nada", () => {
  assert.deepEqual(alternarCampo(null, "inventado"), configuracionPorDefecto());
});

test("G12. campoVisible contesta sobre el guardado normalizado", () => {
  assert.equal(campoVisible(null, CAMPO.PROVEEDOR), true);
  assert.equal(campoVisible({ visibles: { proveedor: false } }, CAMPO.PROVEEDOR), false);
  // Un campo que no existe no está visible: la pantalla que pregunte por
  // `equivalencia` recibe `false` y no dibuja nada.
  assert.equal(campoVisible(null, "equivalencia"), false);
});

test("G13. la clave de guardado es por ubicación", () => {
  // En el depósito el número grande ES el costo, así que el opcional "Costo"
  // repite. Una preferencia única obligaría a reconfigurar al cambiar de local.
  assert.equal(claveDeConfiguracion(7), "productos:tarjeta:7");
  assert.notEqual(claveDeConfiguracion(7), claveDeConfiguracion(8));
  assert.equal(claveDeConfiguracion(null), "productos:tarjeta:0");
});

test("G14. el código interno se llama por su nombre completo", () => {
  // "Código interno" a secas se confundía con el id del producto y con el SKU —y
  // la tarjeta llegó a mostrar el id bajo ese rótulo—. El nombre largo es parte
  // del arreglo, no cosmética.
  const campo = CAMPOS_OPCIONALES.find((c) => c.id === CAMPO.CODIGO_INTERNO);
  assert.equal(campo.etiqueta, "Código interno por proveedor");
});

test("G15. los cinco opcionales son los del diseño aprobado, sin sobras", () => {
  // La lista es corta y cerrada a propósito: cada opcional que se agregue tiene
  // un lugar decidido en el layout, así que aparecer acá sin ese lugar es un
  // renglón que la tarjeta no sabe dónde poner.
  assert.deepEqual(IDS_OPCIONALES, [
    "proveedor",
    "costo",
    "margen",
    "codigoBarra",
    "codigoInterno",
  ]);
});
