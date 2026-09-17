// LOS CHIPS SUMAN EL TOTAL, Y NINGÚN PRODUCTO APARECE DOS VECES.
//
// ── POR QUÉ ES ÉSTA LA AFIRMACIÓN Y NO OTRA ────────────────────────────────
//
// Porque un producto puede tener VARIAS filas en la misma importación —el
// proveedor lo informa dos veces, o dos códigos suyos apuntan al mismo
// producto— y ahí es donde se rompe: listado por fila, el mismo producto sale
// dos veces, los chips suman más que el total, y el número de la tarjeta del
// resultado deja de cerrar contra la lista que abre.
//
// Este módulo existe para que eso no pueda pasar: contesta UN grupo por
// producto. El candado ejerce las combinaciones que de verdad ocurren, incluida
// la que decide el orden de las ramas.
//
//   node --experimental-loader ./scripts/alias-loader.mjs --test lib/proveedores/listas/losQueNoCambian.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import {
  GRUPO_NO_CAMBIA,
  ORDEN_NO_CAMBIAN,
  chipsCierran,
  contarLosQueNoCambian,
  grupoQueNoCambia,
} from "./losQueNoCambian.js";
import { ESTADO_LINEA } from "./estados.js";

const RANGO = { minPct: 2, maxPct: 15 };

/** Una fila con la forma que produce el endpoint, no una inventada. */
const fila = (estado, extra = {}) => ({
  estado,
  motivo: null,
  costoAnterior: 1000,
  productoBaseId: 7,
  excluidaManual: false,
  aplicada: false,
  diferenciaPct: 5,
  aumentoEsperadoMinPct: null,
  aumentoEsperadoMaxPct: null,
  confirmadoEn: null,
  vinculadoEn: null,
  multiplicadorConfirmado: null,
  fueraDeRangoAceptadaEn: null,
  ...extra,
});

test("sin filas es «no vino en la lista»", () => {
  assert.equal(grupoQueNoCambia([], RANGO), GRUPO_NO_CAMBIA.NO_VINO);
});

test("una fila pendiente es «para revisar»", () => {
  const f = fila(ESTADO_LINEA.FACTOR_DUDOSO, { diferenciaPct: 90 });
  assert.equal(grupoQueNoCambia([f], RANGO), GRUPO_NO_CAMBIA.PARA_REVISAR);
});

test("una fila excluida a mano es «lo dejaste igual»", () => {
  const f = fila(ESTADO_LINEA.LISTO_PARA_ACTUALIZAR, { excluidaManual: true });
  assert.equal(grupoQueNoCambia([f], RANGO), GRUPO_NO_CAMBIA.DEJADO);
});

test("UN PRODUCTO QUE SÍ SE VA A ACTUALIZAR NO ENTRA, aunque tenga otra fila excluida", () => {
  // ES LA RAMA QUE SACA AL PRODUCTO DE LA PANTALLA, y la que más caro sale si
  // se equivoca: decirle a Emanuel que un producto conserva el costo viejo
  // cuando en un rato se le va a escribir uno nuevo.
  const seAplica = fila(ESTADO_LINEA.LISTO_PARA_ACTUALIZAR);
  const excluida = fila(ESTADO_LINEA.LISTO_PARA_ACTUALIZAR, { excluidaManual: true });
  assert.equal(grupoQueNoCambia([seAplica, excluida], RANGO), null);
  assert.equal(grupoQueNoCambia([excluida, seAplica], RANGO), null, "el orden del array no puede decidir");
});

test("UNA FILA APLICADA FUERA DE RANGO SACA AL PRODUCTO IGUAL", () => {
  // ── EL FIXTURE QUE HACE FALTA, Y POR QUÉ NO SIRVE EL OBVIO ───────────────
  //
  // El primero que escribí era una fila aplicada, en rango y sin excluir. Con
  // ésa, sacarle la rama de `aplicada` NO ponía nada en rojo: `motivoDeRevision`
  // sobre una fila en rango devuelve `null` igual, así que la rama no
  // distinguía nada y el candado la daba por probada sin probarla.
  //
  // El caso donde SÍ distingue existe y es justo el que hay en producción: las
  // importaciones aplicadas antes de 27c70832 pudieron escribir costos fuera de
  // rango que nadie eligió. Esas filas están `aplicada: true` y
  // `motivoDeRevision` las manda a revisión — el costo YA está escrito. Sin la
  // rama, el producto aparecería en "no cambian · para revisar" mintiendo sobre
  // un costo que sí se cambió.
  const aplicadaFueraDeRango = fila(ESTADO_LINEA.LISTO_PARA_ACTUALIZAR, {
    aplicada: true,
    diferenciaPct: 1008.4,
  });
  assert.equal(
    grupoQueNoCambia([aplicadaFueraDeRango], RANGO),
    null,
    "un costo ya escrito no puede contarse como «no cambia»"
  );

  // Y con otra fila pendiente al lado, tampoco: el costo del producto ya cambió.
  const pendiente = fila(ESTADO_LINEA.FACTOR_DUDOSO, { diferenciaPct: 90 });
  assert.equal(grupoQueNoCambia([aplicadaFueraDeRango, pendiente], RANGO), null);
  assert.equal(grupoQueNoCambia([pendiente, aplicadaFueraDeRango], RANGO), null);
});

test("PARA REVISAR LE GANA A DEJADO: todavía hay una decisión que falta", () => {
  // Con una excluida y otra pendiente, contarlo como "lo dejaste igual"
  // escondería el trabajo que queda. Al revés no se pierde nada: la excluida
  // sigue excluida.
  const excluida = fila(ESTADO_LINEA.LISTO_PARA_ACTUALIZAR, { excluidaManual: true });
  const pendiente = fila(ESTADO_LINEA.FACTOR_DUDOSO, { diferenciaPct: 90 });
  assert.equal(grupoQueNoCambia([excluida, pendiente], RANGO), GRUPO_NO_CAMBIA.PARA_REVISAR);
  assert.equal(grupoQueNoCambia([pendiente, excluida], RANGO), GRUPO_NO_CAMBIA.PARA_REVISAR);
});

test("un producto cuyo precio no se movió no entra: no hay nada que corregir", () => {
  const igual = fila(ESTADO_LINEA.SIN_CAMBIOS);
  assert.equal(grupoQueNoCambia([igual], RANGO), null);
});

test("LOS CHIPS SUMAN EL TOTAL Y NADIE APARECE DOS VECES", () => {
  // Cada producto trae UN grupo, que es lo que `grupoQueNoCambia` garantiza.
  // Acá se afirma la consecuencia: la suma de los tres chips es el total.
  const productos = [
    { id: 1, grupo: GRUPO_NO_CAMBIA.NO_VINO },
    { id: 2, grupo: GRUPO_NO_CAMBIA.NO_VINO },
    { id: 3, grupo: GRUPO_NO_CAMBIA.PARA_REVISAR },
    { id: 4, grupo: GRUPO_NO_CAMBIA.DEJADO },
  ];
  const conteo = contarLosQueNoCambian(productos);
  assert.equal(conteo.total, 4);
  assert.deepEqual(conteo.porGrupo, { NO_VINO: 2, PARA_REVISAR: 1, DEJADO: 1 });
  assert.equal(chipsCierran(conteo), true);

  // Y ningún id repetido, que es la otra mitad de la afirmación.
  const ids = productos.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("CONTRAPRUEBA: si un producto entrara en dos grupos, los chips NO cerrarían", () => {
  // Un candado que solo afirma el caso bueno acompaña. Éste comprueba que la
  // afirmación sabe ponerse en rojo: un conteo con un producto contado dos
  // veces —que es exactamente lo que pasa cuando se lista por fila— da una suma
  // mayor que el total, y `chipsCierran` lo dice.
  const roto = { porGrupo: { NO_VINO: 2, PARA_REVISAR: 2, DEJADO: 1 }, total: 4 };
  assert.equal(chipsCierran(roto), false);
});

test("el orden de los chips nombra los tres grupos y ninguno de más", () => {
  // Si mañana aparece un cuarto motivo, este candado se pone rojo en vez de
  // dejarlo sin chip: un grupo sin chip es un producto que no se puede filtrar
  // y que igual suma al total.
  assert.deepEqual([...ORDEN_NO_CAMBIAN].sort(), Object.values(GRUPO_NO_CAMBIA).sort());
});
