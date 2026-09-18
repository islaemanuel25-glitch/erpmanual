// UN PRODUCTO DADO DE BAJA NO PARTICIPA DE UNA LISTA DE PROVEEDOR.
//
// ── EL DEFECTO, MEDIDO EN PRODUCCIÓN EL 2026-09-18 ─────────────────────────
//
// El módulo de listas no miraba `activo` en NINGUNA de sus consultas: ni la
// ficha maestra ni la del local, ni al conciliar ni al aplicar. Resultado: 11
// productos dados de baja —7 de Arcor y 4 de Myf— aparecían en cada importación
// de su proveedor, repartidos entre "no vino en la lista" y "sin código del
// proveedor", ensuciando la pantalla donde se decide qué hacer con cada uno.
//
// Y dos de ellos conservaban su vínculo de código de proveedor ACTIVO: nunca
// llegaron a machear porque Arcor todavía no había mandado esos códigos, pero
// nada lo impedía. La próxima lista que los trajera les habría escrito el costo.
//
// ── POR QUÉ SON TRES AFIRMACIONES Y NO UNA ────────────────────────────────
//
// Porque son tres momentos distintos y tapar uno solo deja el agujero abierto:
//
//   1. al CONCILIAR      → no entra al universo, así que no machea ni cuenta;
//   2. al APLICAR        → se rechaza aunque la fila venga conciliada de antes;
//   3. al ABRIR una lista vieja → las filas cuyo producto se dio de baja
//      DESPUÉS quedan afuera de lo que la pantalla muestra y cuenta.
//
// El segundo es el que no se puede deducir del primero: entre conciliar una
// lista y aplicarla pasan días, y la fila ya conciliada existe. Filtrar al
// conciliar no la protege.
//
// Cada afirmación va con su CONTRAPRUEBA —el mismo caso con el producto vivo—
// porque sin eso no se distingue un candado que afirma de uno que pasa siempre.

import test from "node:test";
import assert from "node:assert/strict";

import {
  productoActivoWhere,
  productoEstaDeBaja,
  filaConProductoDeBajaWhere,
} from "./productoDeBaja.js";
import { revalidarFila, MOTIVO_OMISION, TEXTO_OMISION } from "./aplicacion.js";
import { ESTADO_LINEA } from "./estados.js";

// ── 1. EL PREDICADO DE LA CONSULTA ─────────────────────────────────────────

test("el universo exige la ficha maestra activa", () => {
  const w = productoActivoWhere();
  assert.equal(w.activo, true);
});

test("el universo también saca al que no tiene NINGUNA ficha de local activa", () => {
  const w = productoActivoWhere();
  assert.deepEqual(w.NOT, {
    AND: [{ locales: { some: {} } }, { locales: { none: { activo: true } } }],
  });
});

test("CONTRAPRUEBA: el que no tiene fichas de local todavía NO está de baja", () => {
  // Es el recién creado en el depósito que no bajó a ningún local. Si la
  // condición fuera "ninguna ficha activa" a secas, este quedaría afuera del
  // universo justo cuando hay que cargarle el primer costo.
  assert.equal(productoEstaDeBaja({ activo: true, locales: [] }), false);
  assert.equal(productoEstaDeBaja({ activo: true }), false);
});

// ── 2. EL PREDICADO SOBRE UN PRODUCTO YA LEÍDO ─────────────────────────────

test("está de baja si la ficha maestra está apagada", () => {
  assert.equal(productoEstaDeBaja({ activo: false, locales: [{ activo: true }] }), true);
});

test("está de baja si tiene fichas de local y ninguna está activa", () => {
  assert.equal(productoEstaDeBaja({ activo: true, locales: [{ activo: false }, { activo: false }] }), true);
});

test("CONTRAPRUEBA: con una sola ficha de local activa, sigue vivo", () => {
  assert.equal(productoEstaDeBaja({ activo: true, locales: [{ activo: false }, { activo: true }] }), false);
});

test("un producto que no llegó se trata como de baja, no como vivo", () => {
  // Falla cerrado: si la consulta se olvidó de traerlo, no se le escribe costo.
  assert.equal(productoEstaDeBaja(null), true);
  assert.equal(productoEstaDeBaja(undefined), true);
});

// ── 3. APLICAR RECHAZA, AUNQUE LA FILA VENGA CONCILIADA DE ANTES ───────────

const FILA_LISTA = {
  id: 1,
  aplicada: false,
  estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR,
  costoMaestroPropuesto: 150,
  precioConIva: 150,
  unidadProveedor: "unidad",
};

const BASE_VIVA = {
  id: 10,
  activo: true,
  locales: [{ activo: true }],
  es_combo: false,
  creadoEnLocalId: 1,
  precio_costo: 100,
  precio_venta: 200,
  margen: 50,
  redondeo_100: false,
  unidad_medida: "unidad",
  factor_pack: 1,
  modoCompraProveedor: "UNIDAD",
};

const CONTEXTO = { operandoEnLocalId: 1, depositoLocalId: 1 };

test("aplicar sobre un producto dado de baja se rechaza, con su motivo propio", () => {
  const r = revalidarFila({
    fila: FILA_LISTA,
    base: { ...BASE_VIVA, activo: false },
    contexto: CONTEXTO,
    config: {},
    recargoPct: 0,
  });
  assert.equal(r.aplicable, false);
  assert.equal(r.motivo, MOTIVO_OMISION.PRODUCTO_DADO_DE_BAJA);
});

test("también se rechaza si la baja es de todas sus fichas de local", () => {
  const r = revalidarFila({
    fila: FILA_LISTA,
    base: { ...BASE_VIVA, locales: [{ activo: false }] },
    contexto: CONTEXTO,
    config: {},
    recargoPct: 0,
  });
  assert.equal(r.aplicable, false);
  assert.equal(r.motivo, MOTIVO_OMISION.PRODUCTO_DADO_DE_BAJA);
});

test("CONTRAPRUEBA: la MISMA fila con el producto vivo no se rechaza por baja", () => {
  // Sin esto, el candado de arriba pasaría igual si `revalidarFila` rechazara
  // todo por cualquier otro motivo.
  const r = revalidarFila({
    fila: FILA_LISTA,
    base: BASE_VIVA,
    contexto: CONTEXTO,
    config: {},
    recargoPct: 0,
  });
  assert.notEqual(r.motivo, MOTIVO_OMISION.PRODUCTO_DADO_DE_BAJA);
});

test("el motivo NO se confunde con PRODUCTO_INEXISTENTE", () => {
  // Son dos cosas distintas y el cartel de cada una manda a hacer algo distinto:
  // uno dice "vinculá la fila a otro producto" —falso acá, el producto está— y
  // el otro dice "activalo si lo vas a usar".
  assert.notEqual(MOTIVO_OMISION.PRODUCTO_DADO_DE_BAJA, MOTIVO_OMISION.PRODUCTO_INEXISTENTE);
  const texto = TEXTO_OMISION[MOTIVO_OMISION.PRODUCTO_DADO_DE_BAJA];
  assert.ok(texto && texto.length > 0, "el motivo nuevo tiene que tener su texto");
  assert.notEqual(texto, TEXTO_OMISION[MOTIVO_OMISION.PRODUCTO_INEXISTENTE]);
});

// ── 4. DESACTIVAR DESPUÉS DE CONCILIAR LO SACA DE LA LISTA ─────────────────

test("el filtro de filas mira el producto vinculado, por los dos lados de la baja", () => {
  const w = filaConProductoDeBajaWhere();
  assert.deepEqual(w, {
    productoBase: {
      is: {
        OR: [
          { activo: false },
          { AND: [{ locales: { some: {} } }, { locales: { none: { activo: true } } }] },
        ],
      },
    },
  });
});

test("CONTRAPRUEBA: el filtro NO alcanza a las filas sin producto vinculado", () => {
  // `productoBase: { is: … }` no matchea una fila con `productoBaseId` en null.
  // Si alguien lo cambiara por un `NOT: productoActivoWhere()` sobre la
  // relación, las filas "no lo tenés" —la mitad del trabajo— desaparecerían de
  // la pantalla sin que nada avise.
  const json = JSON.stringify(filaConProductoDeBajaWhere());
  assert.equal(/"is"/.test(json), true, "tiene que ir por `is`, que exige producto vinculado");
  assert.equal(/NOT/.test(json), false, "no se expresa como la negación del universo");
});
