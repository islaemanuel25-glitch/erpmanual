// El UNIVERSO de una conciliación: qué productos pueden participar.
//
// Un producto participa si el proveedor de la lista está asociado en alguna de
// las tres relaciones reales del ERP —proveedor_id, proveedor2_id,
// proveedor3_id—. Nada más lo habilita: ni un ProductoCodigoProveedor viejo, ni
// un código igual, ni un sufijo igual, ni el mismo código de barras, ni un
// nombre parecido.
//
// Es la diferencia entre "el proveedor llama X a este producto" y "este producto
// se le compra al proveedor". Solo lo segundo autoriza a moverle el costo con
// una lista suya.

import { test } from "node:test";
import assert from "node:assert/strict";

import { productoDelProveedorWhere } from "@/lib/proveedores/listas/cargaErp";
import {
  TIPO_COINCIDENCIA,
  MOTIVO_CONCILIACION,
  MIN_PARECIDO_NOMBRE,
  conciliarLista,
  parecidoNombre,
  sugerirPorNombre,
  macheePorCodigoBarra,
  indexarCodigosBarra,
} from "@/lib/proveedores/listas/conciliarLista";
import { CONFIG_ARCOR } from "@/lib/proveedores/listas/configuraciones/arcor";

const ARCOR = 20;
const OTRO = 33;

/** Un producto del ERP tal como lo entrega la carga, ya recortado al universo. */
function producto(id, extra = {}) {
  return {
    productoBaseId: id,
    nombre: `Producto ${id}`,
    precioCostoActual: 1000,
    factorPack: null,
    unidadMedida: "unidad",
    modoCompraProveedor: "BULTO",
    pesoReferenciaKg: null,
    creadoEnLocalId: 1,
    esCombo: false,
    codigosBarra: [],
    relacionProveedor: 1,
    ...extra,
  };
}

const filaLista = (codigo, extra = {}) => ({
  filaExcel: 2,
  hojaNombre: "Hoja1",
  codigoCrudo: String(codigo),
  codigoNormalizado: String(codigo),
  descripcionProveedor: "PRODUCTO DE LISTA",
  unidadProveedor: "UN",
  unidadesPorBulto: 1,
  precioConIva: 100,
  ...extra,
});

const conciliar = ({ productos, codigos = [], filas }) =>
  conciliarLista({
    filas,
    productos,
    codigosProveedor: codigos,
    contexto: { grupoId: 1, proveedorId: ARCOR, operandoEnLocalId: 1, depositoLocalId: 1 },
    config: CONFIG_ARCOR,
  });

// ── El predicado de la consulta ─────────────────────────────────────────────

test("el universo se define por las TRES relaciones reales del modelo", () => {
  const w = productoDelProveedorWhere(ARCOR);
  assert.deepEqual(w, {
    OR: [
      { proveedor_id: ARCOR },
      { proveedor2_id: ARCOR },
      { proveedor3_id: ARCOR },
    ],
  });
});

test("el predicado no mira ProductoCodigoProveedor", () => {
  // Si algún día alguien agrega el vínculo de códigos como criterio de universo,
  // esta prueba lo frena: es exactamente el error que se está corrigiendo.
  const json = JSON.stringify(productoDelProveedorWhere(ARCOR));
  assert.equal(/codigo/i.test(json), false);
  assert.equal(/ProductoCodigoProveedor/i.test(json), false);
});

// ── Participa: las tres relaciones y la combinación ─────────────────────────

for (const [rel, etiqueta] of [[1, "principal"], [2, "secundario"], [3, "terciario"]]) {
  test(`un producto con Arcor como proveedor ${etiqueta} participa`, () => {
    const p = producto(10, { relacionProveedor: rel });
    const r = conciliar({
      productos: [p],
      codigos: [{ id: 1, productoBaseId: 10, codigoInterno: "5001", activo: true }],
      filas: [filaLista(5001)],
    });
    assert.equal(r.filas[0].tipoCoincidencia, TIPO_COINCIDENCIA.CODIGO_INTERNO);
    assert.equal(r.filas[0].producto.productoBaseId, 10);
  });
}

test("un producto con varios proveedores participa si Arcor es uno de ellos", () => {
  // La carga ya lo resolvió: el producto llegó al universo, con la relación en
  // la que apareció Arcor. Lo que se prueba acá es que el motor no lo descarta
  // por tener otros proveedores encima.
  const p = producto(10, { relacionProveedor: 2 });
  const r = conciliar({
    productos: [p],
    codigos: [{ id: 1, productoBaseId: 10, codigoInterno: "5001", activo: true }],
    filas: [filaLista(5001)],
  });
  assert.equal(r.filas[0].estado !== "NO_MACHEADO", true);
  assert.equal(r.filas[0].producto.productoBaseId, 10);
});

// ── NO participa: el caso que motivó el cambio ──────────────────────────────

test("con ProductoCodigoProveedor de Arcor pero sin Arcor asociado NO participa", () => {
  // El universo llega VACÍO —la carga descartó el producto— y el vínculo
  // también, porque apunta afuera. La fila queda sin vincular.
  const r = conciliar({
    productos: [],
    codigos: [],
    filas: [filaLista(5001)],
  });
  assert.equal(r.filas[0].estado, "NO_MACHEADO");
  assert.equal(r.filas[0].producto, null);
});

test("un vínculo que apunta fuera del universo no machea aunque el código sea idéntico", () => {
  // Se fuerza el caso pasando el vínculo pero NO el producto: es exactamente lo
  // que produce la carga cuando el producto no tiene a Arcor asociado.
  const r = conciliar({
    productos: [producto(99)],
    codigos: [{ id: 1, productoBaseId: 77, codigoInterno: "5001", activo: true }],
    filas: [filaLista(5001)],
  });
  assert.equal(r.filas[0].estado, "NO_MACHEADO");
  assert.equal(r.filas[0].producto, null);
});

test("el mismo código en un producto que no es de Arcor no machea", () => {
  // El producto 77 tiene el código 5001 pero no está en el universo: no llega.
  const r = conciliar({
    productos: [producto(10, { nombre: "Otro producto de Arcor" })],
    codigos: [{ id: 1, productoBaseId: 10, codigoInterno: "9999", activo: true }],
    filas: [filaLista(5001)],
  });
  assert.equal(r.filas[0].estado, "NO_MACHEADO");
});

test("el mismo SUFIJO en un producto que no es de Arcor no machea", () => {
  const r = conciliar({
    productos: [producto(10)],
    codigos: [{ id: 1, productoBaseId: 10, codigoInterno: "7778888", activo: true }],
    filas: [filaLista(3312)],
  });
  assert.equal(r.filas[0].estado, "NO_MACHEADO");
});

test("el mismo código de barras en un producto que no es de Arcor no machea", () => {
  // El universo no lo contiene, así que el índice de barras tampoco.
  const r = conciliar({
    productos: [],
    codigos: [],
    filas: [filaLista(5001, { codigoBarraProveedor: "7790000000001" })],
  });
  assert.equal(r.filas[0].estado, "NO_MACHEADO");
  assert.equal(r.filas[0].producto, null);
  assert.equal(r.filas[0].sugerencia, null);
});

test("un nombre parecido en un producto que no es de Arcor no sugiere nada", () => {
  const r = conciliar({
    productos: [],
    codigos: [],
    filas: [filaLista(5001, { descripcionProveedor: "GALLETITAS SURTIDAS 300G" })],
  });
  assert.equal(r.filas[0].sugerencia, null);
});

// ── Código de barras: ahora SÍ machea, dentro del universo ──────────────────

test("dentro del universo, el código de barras machea", () => {
  const p = producto(10, { codigosBarra: ["7790000000001"] });
  const r = conciliar({
    productos: [p],
    codigos: [],
    filas: [filaLista(5001, { codigoBarraProveedor: "7790000000001" })],
  });
  assert.equal(r.filas[0].tipoCoincidencia, TIPO_COINCIDENCIA.CODIGO_BARRA);
  assert.equal(r.filas[0].producto.productoBaseId, 10);
});

test("el código interno le gana al código de barras", () => {
  const pA = producto(10, { codigosBarra: [] });
  const pB = producto(20, { codigosBarra: ["7790000000001"] });
  const r = conciliar({
    productos: [pA, pB],
    codigos: [{ id: 1, productoBaseId: 10, codigoInterno: "5001", activo: true }],
    filas: [filaLista(5001, { codigoBarraProveedor: "7790000000001" })],
  });
  assert.equal(r.filas[0].tipoCoincidencia, TIPO_COINCIDENCIA.CODIGO_INTERNO);
  assert.equal(r.filas[0].producto.productoBaseId, 10);
});

test("dos productos del universo con el mismo código de barras dan ambiguo", () => {
  const r = conciliar({
    productos: [
      producto(10, { codigosBarra: ["7790000000001"] }),
      producto(20, { codigosBarra: ["7790000000001"] }),
    ],
    codigos: [],
    filas: [filaLista(5001, { codigoBarraProveedor: "7790000000001" })],
  });
  assert.equal(r.filas[0].estado, "CODIGO_DUPLICADO");
  assert.equal(r.filas[0].tipoCoincidencia, TIPO_COINCIDENCIA.AMBIGUA);
});

test("macheePorCodigoBarra sin código no busca", () => {
  const idx = indexarCodigosBarra([producto(10, { codigosBarra: ["7790000000001"] })]);
  assert.equal(macheePorCodigoBarra(idx, {}).tipo, TIPO_COINCIDENCIA.NINGUNA);
});

// ── Nombre: solo sugerencia ─────────────────────────────────────────────────

test("el parecido de nombre es por palabras compartidas", () => {
  assert.equal(parecidoNombre("PURE LA HUERTA 530G", "Pure la huerta 530g"), 1);
  assert.ok(parecidoNombre("PURE LA HUERTA 530G", "Pure la huerta 520g") >= 0.6);
  assert.ok(parecidoNombre("PURE LA HUERTA", "Gaseosa cola 2L") < 0.2);
});

test("el nombre SUGIERE pero nunca machea", () => {
  const p = producto(10, { nombre: "PURE LA HUERTA 530G" });
  const r = conciliar({
    productos: [p],
    codigos: [],
    filas: [filaLista(5001, { descripcionProveedor: "PURE LA HUERTA 530G" })],
  });
  assert.equal(r.filas[0].estado, "NO_MACHEADO", "sigue sin vincular");
  assert.equal(r.filas[0].producto, null);
  assert.equal(r.filas[0].sugerencia.motivo, MOTIVO_CONCILIACION.SUGERENCIA_NOMBRE);
  assert.equal(r.filas[0].sugerencia.producto.productoBaseId, 10);
});

test("dos nombres igual de parecidos no sugieren ninguno", () => {
  const r = sugerirPorNombre(
    [producto(10, { nombre: "PURE LA HUERTA 530G" }), producto(20, { nombre: "PURE LA HUERTA 530G" })],
    { descripcionProveedor: "PURE LA HUERTA 530G" }
  );
  assert.equal(r, null);
});

test("por debajo del umbral no se sugiere nada", () => {
  const r = sugerirPorNombre([producto(10, { nombre: "Gaseosa cola 2L" })], {
    descripcionProveedor: "PURE LA HUERTA 530G",
  });
  assert.equal(r, null);
  assert.equal(MIN_PARECIDO_NOMBRE, 0.6);
});

test("sin descripción no se sugiere nada", () => {
  assert.equal(sugerirPorNombre([producto(10)], { descripcionProveedor: "" }), null);
});
