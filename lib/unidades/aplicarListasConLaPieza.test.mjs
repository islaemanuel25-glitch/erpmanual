// LA REGLA ÚNICA DE UNIDADES, TANDA 5: APLICAR UNA LISTA, CONFIRMAR LA
// PRESENTACIÓN Y ARCOR HACEN LA CUENTA CON LA PIEZA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/unidades/aplicarListasConLaPieza.test.mjs
//
// ── LO QUE EXIGE ───────────────────────────────────────────────────────────
//
// Que aplicar una lista ya confirmada escriba EXACTAMENTE los mismos costos que
// antes de esta tanda. Los costos esperados de abajo no están calculados a
// mano: salen de correr `revalidarFila` con el código anterior (sobre 7b2e91b),
// con estas mismas filas, antes de tocarlo.
//
// ── DE DÓNDE SALEN LAS FILAS ───────────────────────────────────────────────
//
//   · PURE × 12, display × 1 y TRAVIATA × 16: las de `aplicacion.test.mjs`.
//   · DR LEMON × 4 ($48.641,28) y ALICANTE × 24 ($19.210,80): las de
//     `cajaRecordada.test.mjs`, con los números reales de DYSSA y de Dab.
//   · Las masitas de Arcor confirmadas por el UxBU: SERRANAS SANDWICH × 16 y
//     CRIOLLITA × 22. Tienen la FORMA real —display, UxBU igual a la caja de
//     la ficha, multiplicador confirmado igual a esa caja— pero NO los precios
//     de producción, que no están en el repo. Lo que se fija es que con esa
//     forma el código nuevo escribe lo mismo que el anterior.

import { test } from "node:test";
import assert from "node:assert/strict";

import { bultoDeLaFicha, costoDelBulto, MARCA_REGLA_DE_UNIDADES } from "./reglaDeUnidades.js";
import { lecturasPosibles } from "../compras-proveedor/comprobante/unidadPorPrecio.js";
import { revalidarFila } from "../proveedores/listas/aplicacion.js";
import { armadoConfirmadoPorElArchivo, hipotesisDeCosto } from "../proveedores/listas/confirmarPresentacion.js";
import { CONFIG_ARCOR } from "../proveedores/listas/configuraciones/arcor.js";
import { CONFIG_GENERICA } from "../proveedores/listas/configuraciones/generico.js";
import { conLoRecordado } from "../proveedores/listas/cajaRecordada.js";
import { ESTADO_LINEA } from "../proveedores/listas/estados.js";

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const CONTEXTO = { operandoEnLocalId: 1, depositoLocalId: 1, cabecera: { aumentoEsperadoMinPct: 0, aumentoEsperadoMaxPct: 100 } };

/** El producto de la base, con los campos que el endpoint de aplicar selecciona. */
const producto = (extra = {}) => ({
  id: 10, nombre: "X", precio_costo: 1000, precio_venta: 1300, margen: 30, redondeo_100: false, es_combo: false,
  creadoEnLocalId: 1, activo: true, locales: [{ activo: true }], unidad_medida: "pack", factor_pack: 12,
  modoCompraProveedor: "BULTO", pesoReferenciaKg: null, ...extra,
});
/** Una fila confirmada, lista para aplicar. */
const confirmada = (extra = {}) => ({
  id: 1, estado: "LISTO_PARA_ACTUALIZAR", aplicada: false, productoBaseId: 10,
  confirmadoEn: "2026-08-09T03:00:00Z", vinculadoEn: null, ...extra,
});

/** ALICANTE PIMENTÓN 25G y DR LEMON 473, con la forma de `cajaRecordada.test.mjs`. */
const pimenton = (extra = {}) =>
  producto({ id: 9, nombre: "ALICANTE PIMENTÓN 25G", precio_costo: 19680, precio_venta: 25000, margen: 27, unidad_medida: "unidad", factor_pack: null, modoCompraProveedor: null, ...extra });
const drLemon = (extra = {}) => pimenton({ id: 21, nombre: "dr lemon 473", precio_costo: 45600, unidad_medida: "pack", factor_pack: 24, ...extra });
const renglon = (extra = {}) => ({
  id: 4233, estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR, motivo: null, costoAnterior: 19680, productoBaseId: 9,
  excluidaManual: false, aplicada: false, seleccionada: true, diferenciaPct: null,
  aumentoEsperadoMinPct: 0, aumentoEsperadoMaxPct: 12, confirmadoEn: new Date("2026-10-24T10:00:00.000Z"), vinculadoEn: null,
  multiplicadorConfirmado: null, fueraDeRangoAceptadaEn: null, costoMaestroPropuesto: null,
  codigoCrudo: "4233", codigoNormalizado: "4233", descripcionProveedor: "ALICANTE PIMENTON 25G",
  precioConIva: 800.45, unidadesPorBulto: null, unidadProveedor: "", ...extra,
});
const ANCHO = { operandoEnLocalId: 1, depositoLocalId: 1, cabecera: { aumentoEsperadoMinPct: -100, aumentoEsperadoMaxPct: 100 } };

/** La propuesta que el panel le mostró a la persona: la lectura con ese multiplicador. */
function conPropuesta(fila, base) {
  const h = hipotesisDeCosto({ fila, base, recargoPct: 5, impuestoAdicionalPct: null }).find((x) => x.multiplicador === fila.multiplicadorConfirmado);
  return { ...fila, costoMaestroPropuesto: h?.costoNuevo ?? null };
}

// [nombre, fila, producto, config, recargo, contexto, costo que escribía el código anterior]
const CASOS = [
  ["PURE, UN × 12", conPropuesta(confirmada({ unidadProveedor: "UN", unidadesPorBulto: 12, precioConIva: 100, factorErp: 12, costoAnterior: 1000, multiplicadorConfirmado: 12 }), producto()), producto(), CONFIG_ARCOR, 5, CONTEXTO, 1260],
  ["display × 1", conPropuesta(confirmada({ unidadProveedor: "DI", unidadesPorBulto: 12, precioConIva: 1200, factorErp: 12, costoAnterior: 1000, multiplicadorConfirmado: 1 }), producto()), producto(), CONFIG_ARCOR, 5, CONTEXTO, 1260],
  ["TRAVIATA, DI × 16", conPropuesta(confirmada({ unidadProveedor: "DI", unidadesPorBulto: 16, precioConIva: 1733.333349, costoAnterior: 26640, multiplicadorConfirmado: 16 }), producto({ factor_pack: 16, precio_costo: 26640 })), producto({ factor_pack: 16, precio_costo: 26640 }), CONFIG_ARCOR, 5, CONTEXTO, 29120],
  ["masitas con la forma de SERRANAS SANDWICH, DI × 16", conPropuesta(confirmada({ unidadProveedor: "DI", unidadesPorBulto: 16, precioConIva: 2150.4, factorErp: 16, costoAnterior: 33000, multiplicadorConfirmado: 16 }), producto({ factor_pack: 16, precio_costo: 33000 })), producto({ factor_pack: 16, precio_costo: 33000 }), CONFIG_ARCOR, 5, CONTEXTO, 36126.72],
  ["masitas con la forma de CRIOLLITA, DI × 22", conPropuesta(confirmada({ unidadProveedor: "DI", unidadesPorBulto: 22, precioConIva: 987.65, factorErp: 22, costoAnterior: 21000, multiplicadorConfirmado: 22 }), producto({ factor_pack: 22, precio_costo: 21000 })), producto({ factor_pack: 22, precio_costo: 21000 }), CONFIG_ARCOR, 5, CONTEXTO, 22814.72],
  ["pack SIN factor en la ficha, UN × 12", confirmada({ unidadProveedor: "UN", unidadesPorBulto: null, precioConIva: 100, descripcionProveedor: "ALGO X12", factorErp: null, costoAnterior: 1000, multiplicadorConfirmado: 12 }), producto({ factor_pack: null }), CONFIG_ARCOR, 5, CONTEXTO, 1260],
  ["genérico × 24 por la caja de la ficha", confirmada({ unidadProveedor: "", unidadesPorBulto: null, precioConIva: 1800, descripcionProveedor: "GASEOSA", factorErp: 24, costoAnterior: 40000, multiplicadorConfirmado: 24 }), producto({ factor_pack: 24, precio_costo: 40000 }), CONFIG_GENERICA, 0, CONTEXTO, 43200],
  ["DR LEMON, pack de 6 × 4", renglon({ id: 5001, productoBaseId: 21, costoAnterior: 45600, codigoCrudo: "5000014471", codigoNormalizado: "5000014471", descripcionProveedor: "DR. LEMON VODKA 5% 473MLX6X4", precioConIva: 12160.32, multiplicadorConfirmado: 4, confirmadoEn: new Date("2026-11-04T10:00:00.000Z"), costoMaestroPropuesto: 48641.28, diferenciaPct: 6.67, factorErp: 24 }), conLoRecordado(drLemon(), { clave: "PACK_DE_LA_LISTA_6", multiplicador: 4, cantidad: 6 }), CONFIG_GENERICA, 0, ANCHO, 48641.28],
  ["ALICANTE, caja recordada × 24", renglon({ multiplicadorConfirmado: 24, costoMaestroPropuesto: 19210.8, diferenciaPct: -2.38, fueraDeRangoAceptadaEn: new Date("2026-10-24T10:00:00.000Z") }), conLoRecordado(pimenton(), { clave: "CAJA_DE_24", multiplicador: 24, cantidad: 24 }), CONFIG_GENERICA, 0, ANCHO, 19210.8],
];

test("APLICAR UNA LISTA CONFIRMADA ESCRIBE LOS MISMOS COSTOS QUE EL CÓDIGO ANTERIOR", () => {
  for (const [nombre, fila, base, config, recargoPct, contexto, esperado] of CASOS) {
    const r = revalidarFila({ fila, base, contexto, config, recargoPct });
    assert.equal(r.aplicable, true, `${nombre}: ${r.motivo}`);
    assert.equal(r.costoNuevo, esperado, nombre);
  }
});

test("CONFIRMAR LA PRESENTACIÓN: EL ARMADO DEL ARCHIVO SE COMPARA CONTRA LA CAJA DE LA FICHA", () => {
  // UxBU 16 contra la caja de 16: confirmado, y la lectura del bulto es × 16.
  const fila = confirmada({ unidadProveedor: "DI", unidadesPorBulto: 16, precioConIva: 2150.4 });
  assert.equal(armadoConfirmadoPorElArchivo(fila, producto({ factor_pack: 16 })), true);
  const bulto = hipotesisDeCosto({ fila, base: producto({ factor_pack: 16 }), recargoPct: 5, impuestoAdicionalPct: null }).find((h) => h.multiplicador === 16);
  assert.equal(bulto.costoNuevo, 36126.72);
  // El caso SERRANAS con el factor viejo —la ficha decía 14, el archivo 16—, un
  // fiambre con caja cargada, o un producto sin caja: no se confirma, y la caja
  // de la ficha no la pisa el archivo.
  for (const base of [producto({ factor_pack: 14 }), producto({ factor_pack: 16, modoCompraProveedor: "UNIDAD" }), producto({ factor_pack: null })]) {
    assert.equal(armadoConfirmadoPorElArchivo(fila, base), false, JSON.stringify(base.factor_pack));
  }
});

test("ARCOR: EL PRECIO POR UNIDAD SE LLEVA A LA CAJA CON LA CUENTA DE LA PIEZA", () => {
  const r = CONFIG_ARCOR.resolverCostoMaestro({
    unidadProveedor: "UN", unidadesPorBulto: 12, precioConRecargo: 105, producto: {},
    requiereBulto: true, factorErp: 12, factorErpValido: true,
  });
  assert.deepEqual([r.costoMaestro, r.factorAplicado, r.motivo], [1260, 12, null]);
  assert.equal(r.costoMaestro, round2(costoDelBulto({ precio: 105, unidades: 1, bulto: 12 })));
  // Si el armado del archivo no es la caja del producto, no se multiplica.
  const difiere = CONFIG_ARCOR.resolverCostoMaestro({
    unidadProveedor: "UN", unidadesPorBulto: 24, precioConRecargo: 105, producto: {},
    requiereBulto: true, factorErp: 12, factorErpValido: true,
  });
  assert.equal(difiere.costoMaestro, null);
});

test("LISTAS Y RECEPCIÓN: EL MISMO PRECIO POR LA MISMA CAJA DA EL MISMO COSTO", () => {
  // Para cada caja de las de arriba y un rango de precios, el × caja de
  // aplicar, de confirmar y de Arcor es el costo del bulto por unidad de la recepción.
  for (const caja of [12, 16, 22, 24]) {
    assert.equal(bultoDeLaFicha(producto({ factor_pack: caja })), caja);
    for (let precio = 50; precio <= 90000; precio = Math.round(precio * 1.17 * 100) / 100) {
      const recepcion = round2(lecturasPosibles({ cantidad: 1, precioFinal: precio, factorPack: caja }).porUnidad.costoPorBulto);
      const arcor = CONFIG_ARCOR.resolverCostoMaestro({
        unidadProveedor: "UN", unidadesPorBulto: caja, precioConRecargo: precio, producto: {},
        requiereBulto: true, factorErp: caja, factorErpValido: true,
      }).costoMaestro;
      assert.equal(arcor, recepcion, `Arcor × ${caja} a $${precio}`);
      const fila = confirmada({ unidadProveedor: "DI", unidadesPorBulto: caja, precioConIva: precio });
      const confirmar = hipotesisDeCosto({ fila, base: producto({ factor_pack: caja }), recargoPct: 0, impuestoAdicionalPct: null })
        .find((h) => h.multiplicador === caja).costoNuevo;
      assert.equal(confirmar, recepcion, `confirmar × ${caja} a $${precio}`);
    }
  }
});

test("LA MARCA DE LA VERSIÓN ES UN LITERAL Y LA DEVUELVE LA RUTA DE APLICAR", async () => {
  assert.equal(MARCA_REGLA_DE_UNIDADES, "regla-unica-de-unidades:tanda-5");
  const { readFileSync } = await import("node:fs");
  const ruta = readFileSync(new URL("../../app/api/proveedores/listas/[id]/aplicar/route.js", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert.match(ruta, /reglaDeUnidades: MARCA_REGLA_DE_UNIDADES,/);
});
