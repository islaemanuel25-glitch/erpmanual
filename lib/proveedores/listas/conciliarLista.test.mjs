// Motor de conciliación de listas de proveedor, con Arcor como primer caso.
//
// Lo que se persigue acá es el error de plata que nadie ve: un código que machea
// contra el producto equivocado, un precio de bulto escrito como si fuera de
// unidad, un display convertido con una regla inventada, o una fila que queda
// tildada sola cuando nadie podía revisarla.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  conciliarLista,
  conciliarFila,
  indexarCodigosProveedor,
  indexarCodigosBarra,
  macheePorCodigo,
  sugerirPorCodigoBarra,
  puedeTocarElCosto,
  TIPO_COINCIDENCIA,
  MOTIVO_CONCILIACION,
} from "./conciliarLista.js";
import { CONFIG_ARCOR, MOTIVO_UNIDAD } from "./configuraciones/arcor.js";
import { ESTADO_LINEA } from "./estados.js";
import { MOTIVO_BLOQUEO } from "./calculoCosto.js";
import { puedeEditarCosto } from "../../productos/propiedadCosto.js";

// ── Escenario ───────────────────────────────────────────────────────────────
//
// Depósito = local 1. Todo lo que se opera por defecto se opera desde ahí.
const DEPOSITO = 1;
const CTX = { grupoId: 7, proveedorId: 3, operandoEnLocalId: DEPOSITO, depositoLocalId: DEPOSITO };

/** Un producto del ERP con la forma de entrada del motor. */
const prod = (over = {}) => ({
  productoBaseId: 100,
  nombre: "Producto",
  precioCostoActual: 1000,
  factorPack: null,
  unidadMedida: "unidad",
  modoCompraProveedor: "BULTO",
  creadoEnLocalId: DEPOSITO,
  esCombo: false,
  codigosBarra: [],
  ...over,
});

/** Una fila ya parseada. */
const linea = (over = {}) => ({
  filaExcel: 10,
  codigoCrudo: "10301",
  codigoNormalizado: "10301",
  codigoComparableSinCeros: null,
  codigoBarraProveedor: null,
  descripcionProveedor: "KETCHUP",
  unidadProveedor: "UN",
  unidadesPorBulto: 1,
  precioConIva: 1000,
  categoriaCruda: "ADEREZOS",
  ...over,
});

const vinculo = (over = {}) => ({
  productoBaseId: 100,
  codigoInterno: "10301",
  activo: true,
  ...over,
});

/** Concilia una fila sola y devuelve el resultado. */
function una({ fila = linea(), productos = [prod()], codigos = [vinculo()], contexto = CTX, config = CONFIG_ARCOR } = {}) {
  const r = conciliarLista({ filas: [fila], productos, codigosProveedor: codigos, contexto, config });
  return r.filas[0];
}

// ═══ MACHEO ══════════════════════════════════════════════════════════════════

test("1. coincidencia exacta por código interno", () => {
  const r = una();
  assert.equal(r.tipoCoincidencia, TIPO_COINCIDENCIA.CODIGO_INTERNO);
  assert.equal(r.producto.productoBaseId, 100);
});

test("2. fallback sin ceros: la lista trae 1234 y el ERP tiene 001234", () => {
  const r = una({
    fila: linea({ codigoCrudo: "1234", codigoNormalizado: "1234" }),
    codigos: [vinculo({ codigoInterno: "001234" })],
  });
  assert.equal(r.tipoCoincidencia, TIPO_COINCIDENCIA.CODIGO_INTERNO_SIN_CEROS);
  assert.equal(r.producto.productoBaseId, 100);
});

test("3. la exacta tiene prioridad sobre el fallback", () => {
  // Dos vínculos: uno exacto "0055" y otro que el fallback también alcanzaría.
  const codigos = [
    vinculo({ productoBaseId: 100, codigoInterno: "0055" }),
    vinculo({ productoBaseId: 200, codigoInterno: "55" }),
  ];
  const productos = [prod({ productoBaseId: 100 }), prod({ productoBaseId: 200 })];
  const r = una({
    fila: linea({ codigoCrudo: "0055", codigoNormalizado: "0055", codigoComparableSinCeros: "55" }),
    productos, codigos,
  });
  assert.equal(r.tipoCoincidencia, TIPO_COINCIDENCIA.CODIGO_INTERNO);
  assert.equal(r.producto.productoBaseId, 100);
});

test("4. fallback ambiguo: no se elige, se informa", () => {
  const codigos = [
    vinculo({ productoBaseId: 100, codigoInterno: "0055" }),
    vinculo({ productoBaseId: 200, codigoInterno: "00055" }),
  ];
  const productos = [prod({ productoBaseId: 100 }), prod({ productoBaseId: 200 })];
  const r = una({
    fila: linea({ codigoCrudo: "55", codigoNormalizado: "55" }),
    productos, codigos,
  });
  assert.equal(r.estado, ESTADO_LINEA.CODIGO_DUPLICADO);
  assert.equal(r.motivo, MOTIVO_CONCILIACION.VINCULO_AMBIGUO);
  assert.equal(r.producto, null);
  assert.deepEqual(r.candidatos.sort(), [100, 200]);
  assert.equal(r.seleccionable, false);
});

test("5. exacto ambiguo también es CODIGO_DUPLICADO", () => {
  const codigos = [
    vinculo({ productoBaseId: 100, codigoInterno: "10301" }),
    vinculo({ productoBaseId: 200, codigoInterno: "103-01" }),
  ];
  const r = una({ productos: [prod({ productoBaseId: 100 }), prod({ productoBaseId: 200 })], codigos });
  assert.equal(r.estado, ESTADO_LINEA.CODIGO_DUPLICADO);
});

test("6. sin coincidencia: NO_MACHEADO", () => {
  const r = una({ codigos: [vinculo({ codigoInterno: "99999" })] });
  assert.equal(r.estado, ESTADO_LINEA.NO_MACHEADO);
  assert.equal(r.motivo, MOTIVO_CONCILIACION.SIN_VINCULO);
  assert.equal(r.producto, null);
  assert.equal(r.seleccionable, false);
});

test("7. fila sin código utilizable", () => {
  const r = una({ fila: linea({ codigoCrudo: "---", codigoNormalizado: "" }), codigos: [] });
  assert.equal(r.estado, ESTADO_LINEA.NO_MACHEADO);
  assert.equal(r.motivo, MOTIVO_CONCILIACION.SIN_CODIGO);
});

test("8. un código INACTIVO no machea", () => {
  const r = una({ codigos: [vinculo({ activo: false })] });
  assert.equal(r.estado, ESTADO_LINEA.NO_MACHEADO);
  assert.equal(r.producto, null);
});

// El código de barras pasó a MACHEAR, no a sugerir. Cambió el universo: los
// candidatos ya no son todo el catálogo sino solo los productos que se le
// compran a este proveedor, y ahí una coincidencia de código de barras es una
// afirmación lo bastante fuerte como para vincular.
test("9. el código de barras machea dentro del universo del proveedor", () => {
  const productos = [prod({ productoBaseId: 500, codigosBarra: ["7793360103018"] })];
  const r = una({
    fila: linea({ codigoNormalizado: "SINVINCULO", codigoBarraProveedor: "7793360103018" }),
    productos, codigos: [],
  });
  assert.equal(r.tipoCoincidencia, TIPO_COINCIDENCIA.CODIGO_BARRA);
  assert.equal(r.producto.productoBaseId, 500);
  assert.equal(r.estado, ESTADO_LINEA.LISTO_PARA_ACTUALIZAR);
});

test("10. el código interno le gana al código de barras", () => {
  const productos = [
    prod({ productoBaseId: 400 }),
    prod({ productoBaseId: 500, codigosBarra: ["7793360103018"] }),
  ];
  const r = una({
    fila: linea({ codigoNormalizado: "1001", codigoBarraProveedor: "7793360103018" }),
    productos,
    codigos: [vinculo({ productoBaseId: 400, codigoInterno: "1001" })],
  });
  assert.equal(r.tipoCoincidencia, TIPO_COINCIDENCIA.CODIGO_INTERNO);
  assert.equal(r.producto.productoBaseId, 400);
});

test("11. código de barras compartido por dos productos del proveedor: ambiguo", () => {
  const productos = [
    prod({ productoBaseId: 500, codigosBarra: ["7793360103018"] }),
    prod({ productoBaseId: 600, codigosBarra: ["7793360103018"] }),
  ];
  const r = una({
    fila: linea({ codigoNormalizado: "SINVINCULO", codigoBarraProveedor: "7793360103018" }),
    productos, codigos: [],
  });
  assert.equal(r.producto, null, "un empate no se resuelve solo");
  assert.equal(r.estado, ESTADO_LINEA.CODIGO_DUPLICADO);
  assert.equal(r.tipoCoincidencia, TIPO_COINCIDENCIA.AMBIGUA);
});

test("12. el nombre SUGIERE pero sigue sin machear", () => {
  const productos = [prod({ productoBaseId: 500, nombre: "KETCHUP DOYPACK 500G" })];
  const r = una({
    fila: linea({ codigoNormalizado: "SINVINCULO", descripcionProveedor: "KETCHUP DOYPACK 500G" }),
    productos, codigos: [],
  });
  assert.equal(r.producto, null, "el nombre nunca vincula");
  assert.equal(r.estado, ESTADO_LINEA.NO_MACHEADO);
  assert.equal(r.sugerencia.motivo, MOTIVO_CONCILIACION.SUGERENCIA_NOMBRE);
  assert.equal(r.sugerencia.producto.productoBaseId, 500);
  assert.equal(r.sugerencia.confirmada, false);
});

test("13. un vínculo que apunta a un producto inexistente no machea", () => {
  const r = una({ productos: [], codigos: [vinculo({ productoBaseId: 999 })] });
  assert.equal(r.estado, ESTADO_LINEA.NO_MACHEADO);
});

// ═══ ARCOR · UN ══════════════════════════════════════════════════════════════

test("14. UN sobre producto de unidad suelta: el precio con recargo es el costo", () => {
  const r = una({ fila: linea({ unidadProveedor: "UN", precioConIva: 1000 }) });
  assert.equal(r.precioConIva, 1000);
  assert.equal(r.recargoPct, 5);
  assert.equal(r.montoRecargo, 50);
  assert.equal(r.precioConRecargo, 1050);
  assert.equal(r.costoMaestroPropuesto, 1050);
  assert.equal(r.estado, ESTADO_LINEA.LISTO_PARA_ACTUALIZAR);
});

test("15. UN sobre pack con UxBU igual al factor del ERP: multiplica", () => {
  const r = una({
    fila: linea({ unidadProveedor: "UN", unidadesPorBulto: 12, precioConIva: 1000 }),
    productos: [prod({ unidadMedida: "pack", factorPack: 12, precioCostoActual: 1 })],
  });
  assert.equal(r.precioConRecargo, 1050);
  assert.equal(r.costoMaestroPropuesto, 12600);
  assert.equal(r.factorAplicado, 12);
  assert.equal(r.estado, ESTADO_LINEA.LISTO_PARA_ACTUALIZAR);
});

test("16. UN sobre pack con factor DISTINTO: FACTOR_DUDOSO, con los dos valores", () => {
  const r = una({
    fila: linea({ unidadProveedor: "UN", unidadesPorBulto: 12 }),
    productos: [prod({ unidadMedida: "pack", factorPack: 24 })],
  });
  assert.equal(r.estado, ESTADO_LINEA.FACTOR_DUDOSO);
  assert.equal(r.motivo, MOTIVO_UNIDAD.FACTOR_DIFIERE);
  assert.equal(r.unidadesPorBulto, 12);
  assert.equal(r.factorErp, 24);
  assert.equal(r.costoMaestroPropuesto, null);
  assert.equal(r.seleccionable, false);
});

test("17. UN sobre pack SIN factor cargado: FACTOR_DUDOSO, no asume 1", () => {
  const r = una({
    fila: linea({ unidadProveedor: "UN", unidadesPorBulto: 12 }),
    productos: [prod({ unidadMedida: "pack", factorPack: null })],
  });
  assert.equal(r.estado, ESTADO_LINEA.FACTOR_DUDOSO);
  assert.equal(r.motivo, MOTIVO_UNIDAD.FACTOR_AUSENTE);
  assert.equal(r.costoMaestroPropuesto, null);
});

test("18. el recargo del 5% sale de la CONFIGURACIÓN, no del motor", () => {
  const sinRecargo = { ...CONFIG_ARCOR, recargoPct: 0 };
  const r = una({ config: sinRecargo });
  assert.equal(r.recargoPct, 0);
  assert.equal(r.precioConRecargo, 1000);
  assert.equal(r.costoMaestroPropuesto, 1000);
  // Y con otro proveedor, otro recargo.
  const r10 = una({ config: { ...CONFIG_ARCOR, recargoPct: 10 } });
  assert.equal(r10.costoMaestroPropuesto, 1100);
});

test("19. el redondeo ocurre AL FINAL de la multiplicación", () => {
  // 82,2222… × 1,05 × 18: redondear antes de multiplicar pierde centavos.
  const r = una({
    fila: linea({ unidadProveedor: "UN", unidadesPorBulto: 18, precioConIva: 1480 / 18 }),
    productos: [prod({ unidadMedida: "pack", factorPack: 18, precioCostoActual: 1 })],
  });
  assert.equal(r.costoMaestroPropuesto, 1554); // 1480 × 1,05
});

test("20. costo igual a dos decimales: SIN_CAMBIOS", () => {
  const r = una({ productos: [prod({ precioCostoActual: 1050 })] });
  assert.equal(r.estado, ESTADO_LINEA.SIN_CAMBIOS);
  assert.equal(r.seleccionable, false);
  assert.equal(r.seleccionadaPorDefecto, false);
});

test("21. una diferencia de milésimas sigue siendo SIN_CAMBIOS", () => {
  const r = una({ productos: [prod({ precioCostoActual: 1050.004 })] });
  assert.equal(r.estado, ESTADO_LINEA.SIN_CAMBIOS);
});

test("22. variación alta: se marca pero NO bloquea", () => {
  const r = una({ productos: [prod({ precioCostoActual: 700 })] });
  // 700 → 1050 es +50 %.
  assert.equal(r.variacionAlta, true);
  assert.equal(r.estado, ESTADO_LINEA.LISTO_PARA_ACTUALIZAR);
  assert.equal(r.seleccionable, true);
  assert.equal(r.seleccionadaPorDefecto, true);
});

test("23. variación por debajo del umbral no se marca", () => {
  const r = una({ productos: [prod({ precioCostoActual: 1000 })] });
  // 1000 → 1050 es +5 %.
  assert.equal(r.variacionAlta, false);
  assert.ok(Math.abs(r.diferenciaPct - 5) < 1e-9);
  assert.equal(r.diferencia, 50);
});

test("24. el umbral también sale de la configuración", () => {
  const duro = { ...CONFIG_ARCOR, umbralVariacionPct: 3 };
  const r = una({ productos: [prod({ precioCostoActual: 1000 })], config: duro });
  assert.equal(r.variacionAlta, true);
  assert.equal(r.estado, ESTADO_LINEA.LISTO_PARA_ACTUALIZAR);
});

// ═══ ARCOR · BU ══════════════════════════════════════════════════════════════

test("25. BU sobre producto por bulto: NO multiplica por el factor", () => {
  const r = una({
    fila: linea({ unidadProveedor: "BU", unidadesPorBulto: 1, precioConIva: 12000 }),
    productos: [prod({ unidadMedida: "cajon", factorPack: 12, precioCostoActual: 1 })],
  });
  assert.equal(r.precioConRecargo, 12600);
  assert.equal(r.costoMaestroPropuesto, 12600);
  assert.equal(r.factorAplicado, 1);
  assert.notEqual(r.costoMaestroPropuesto, 12600 * 12);
  assert.equal(r.estado, ESTADO_LINEA.LISTO_PARA_ACTUALIZAR);
});

test("26. BU: el costo propuesto es exactamente el precio con recargo", () => {
  const r = una({
    fila: linea({ unidadProveedor: "BU", precioConIva: 9999.99 }),
    productos: [prod({ unidadMedida: "pack", factorPack: 6, precioCostoActual: 1 })],
  });
  assert.equal(r.costoMaestroPropuesto, r.precioConRecargo);
});

test("27. BU con UxBU 1 no se lee como cantidad física", () => {
  const r = una({
    fila: linea({ unidadProveedor: "BU", unidadesPorBulto: 1, precioConIva: 12000 }),
    productos: [prod({ unidadMedida: "pack", factorPack: 24, precioCostoActual: 1 })],
  });
  // El factor 24 del ERP no se usa y el UxBU 1 tampoco: el precio ya es del bulto.
  assert.equal(r.costoMaestroPropuesto, 12600);
  assert.equal(r.estado, ESTADO_LINEA.LISTO_PARA_ACTUALIZAR);
});

test("28. BU sobre producto de UNIDAD SUELTA: incompatible, no se aplica", () => {
  const r = una({
    fila: linea({ unidadProveedor: "BU", precioConIva: 12000 }),
    productos: [prod({ unidadMedida: "unidad", factorPack: null })],
  });
  assert.equal(r.estado, ESTADO_LINEA.FACTOR_DUDOSO);
  assert.equal(r.motivo, MOTIVO_UNIDAD.BULTO_SOBRE_UNIDAD_SUELTA);
  assert.equal(r.costoMaestroPropuesto, null);
  assert.equal(r.seleccionable, false);
});

// ═══ ARCOR · DI ══════════════════════════════════════════════════════════════

test("29. DI sin equivalencia demostrable: FACTOR_DUDOSO", () => {
  const r = una({
    fila: linea({ unidadProveedor: "DI", unidadesPorBulto: 12, precioConIva: 5000 }),
    productos: [prod({ unidadMedida: "pack", factorPack: 12 })],
  });
  assert.equal(r.estado, ESTADO_LINEA.FACTOR_DUDOSO);
  assert.equal(r.motivo, MOTIVO_UNIDAD.DISPLAY_SIN_EQUIVALENCIA);
  assert.equal(r.seleccionable, false);
});

test("30. DI conserva el cálculo comercial aunque no se aplique", () => {
  const r = una({
    fila: linea({ unidadProveedor: "DI", precioConIva: 5000 }),
    productos: [prod({ unidadMedida: "pack", factorPack: 12 })],
  });
  assert.equal(r.precioConIva, 5000);
  assert.equal(r.montoRecargo, 250);
  assert.equal(r.precioConRecargo, 5250);
  assert.equal(r.costoUnitarioCalculado, 5250);
  assert.equal(r.costoMaestroPropuesto, null);
});

test("31. DI NUNCA se trata como unidad, en ninguna configuración de producto", () => {
  for (const p of [
    prod({ unidadMedida: "unidad", factorPack: null }),
    prod({ unidadMedida: "unidad", factorPack: 1 }),
    prod({ unidadMedida: "pack", factorPack: 12 }),
    prod({ unidadMedida: "cajon", factorPack: 6 }),
  ]) {
    const r = una({
      fila: linea({ unidadProveedor: "DI", unidadesPorBulto: 1, precioConIva: 5000 }),
      productos: [p],
    });
    assert.equal(r.estado, ESTADO_LINEA.FACTOR_DUDOSO, JSON.stringify(p.unidadMedida));
    assert.notEqual(r.costoMaestroPropuesto, 5250);
  }
});

test("32. DI nunca multiplica usando UxBU sin una regla explícita", () => {
  const r = una({
    fila: linea({ unidadProveedor: "DI", unidadesPorBulto: 12, precioConIva: 5000 }),
    productos: [prod({ unidadMedida: "pack", factorPack: 12 })],
  });
  assert.notEqual(r.costoMaestroPropuesto, 5250 * 12);
  assert.equal(r.costoMaestroPropuesto, null);
});

test("33. DI CON equivalencia declarada por la configuración: se aplica", () => {
  // El gancho existe para cuando el negocio defina la regla. Se prueba con una
  // configuración que la declara, sin tocar el motor.
  const conRegla = {
    ...CONFIG_ARCOR,
    equivalenciaDisplay: ({ precioConRecargo }) => ({ costoMaestro: precioConRecargo, factorAplicado: 1 }),
  };
  const r = una({
    fila: linea({ unidadProveedor: "DI", precioConIva: 5000 }),
    productos: [prod({ unidadMedida: "pack", factorPack: 12, precioCostoActual: 1 })],
    config: conRegla,
  });
  assert.equal(r.estado, ESTADO_LINEA.LISTO_PARA_ACTUALIZAR);
  assert.equal(r.costoMaestroPropuesto, 5250);
});

test("34. Arcor NO declara la regla de display", () => {
  assert.equal(CONFIG_ARCOR.equivalenciaDisplay, null);
});

// ═══ SEGURIDAD ═══════════════════════════════════════════════════════════════

test("35. producto kg: BLOQUEADO por unidad incompatible", () => {
  const r = una({ productos: [prod({ unidadMedida: "kg" })] });
  assert.equal(r.estado, ESTADO_LINEA.BLOQUEADO);
  assert.equal(r.motivo, MOTIVO_BLOQUEO.UNIDAD_INCOMPATIBLE);
  assert.equal(r.seleccionable, false);
});

test("36. fiambre: BLOQUEADO, y no se usa pesoReferenciaKg", () => {
  const r = una({
    productos: [prod({ unidadMedida: "kg", modoCompraProveedor: "UNIDAD", pesoReferenciaKg: 3 })],
  });
  assert.equal(r.estado, ESTADO_LINEA.BLOQUEADO);
  assert.equal(r.motivo, MOTIVO_BLOQUEO.UNIDAD_INCOMPATIBLE);
  assert.equal(r.costoMaestroPropuesto, null);
  // Ni multiplicado ni dividido por el peso.
  assert.notEqual(r.costoMaestroPropuesto, 1050 * 3);
});

test("37. kg queda bloqueado también con unidad BU del proveedor", () => {
  // Un precio por bulto tampoco es un precio por kilo.
  const r = una({
    fila: linea({ unidadProveedor: "BU" }),
    productos: [prod({ unidadMedida: "kg" })],
  });
  assert.equal(r.estado, ESTADO_LINEA.BLOQUEADO);
  assert.equal(r.motivo, MOTIVO_BLOQUEO.UNIDAD_INCOMPATIBLE);
});

test("38. sin propiedad del costo: BLOQUEADO", () => {
  // Producto exclusivo del local 5, operando desde el depósito.
  const r = una({ productos: [prod({ creadoEnLocalId: 5 })] });
  assert.equal(r.estado, ESTADO_LINEA.BLOQUEADO);
  assert.equal(r.motivo, MOTIVO_CONCILIACION.SIN_PROPIEDAD_COSTO);
  assert.equal(r.seleccionable, false);
});

test("39. la regla de propiedad coincide con propiedadCosto.js", () => {
  // El motor replica la regla canónica: se comparan las dos, caso por caso.
  const casos = [
    [1, null, 1], [1, 1, 1], [1, 5, 1], [5, 5, 1], [5, null, 1],
    [5, 1, 1], [0, 1, 1], [1, 5, null], [1, null, null],
  ];
  for (const [op, creado, deposito] of casos) {
    assert.equal(
      puedeTocarElCosto({ operandoEnLocalId: op, creadoEnLocalId: creado, depositoLocalId: deposito }),
      puedeEditarCosto(op, creado, deposito),
      `op=${op} creado=${creado} deposito=${deposito}`
    );
  }
});

test("40. el local dueño de un producto exclusivo SÍ puede", () => {
  const r = una({
    productos: [prod({ creadoEnLocalId: 5 })],
    contexto: { ...CTX, operandoEnLocalId: 5 },
  });
  assert.equal(r.estado, ESTADO_LINEA.LISTO_PARA_ACTUALIZAR);
});

test("41. un combo queda BLOQUEADO: no tiene costo propio", () => {
  const r = una({ productos: [prod({ esCombo: true })] });
  assert.equal(r.estado, ESTADO_LINEA.BLOQUEADO);
  assert.equal(r.motivo, MOTIVO_CONCILIACION.PRODUCTO_COMBO);
});

test("42. precio prácticamente cero, el caso HELIMPFEB: BLOQUEADO", () => {
  const r = una({
    fila: linea({ codigoCrudo: "HELIMPFEB", codigoNormalizado: "HELIMPFEB", precioConIva: 4.4019543565809725e-12 }),
    codigos: [vinculo({ codigoInterno: "HELIMPFEB" })],
  });
  assert.equal(r.estado, ESTADO_LINEA.BLOQUEADO);
  assert.equal(r.motivo, MOTIVO_CONCILIACION.PRECIO_NO_CREIBLE);
  assert.equal(r.seleccionable, false);
  // El dato se conserva: no se descarta en silencio.
  assert.equal(r.precioConIva, 4.4019543565809725e-12);
});

test("43. precio cero exacto: BLOQUEADO, no se aplica solo", () => {
  const r = una({ fila: linea({ precioConIva: 0 }) });
  assert.equal(r.estado, ESTADO_LINEA.BLOQUEADO);
  assert.equal(r.motivo, MOTIVO_CONCILIACION.PRECIO_CERO);
  assert.equal(r.seleccionable, false);
});

test("44. precio negativo: ERROR", () => {
  const r = una({ fila: linea({ precioConIva: -100 }) });
  assert.equal(r.estado, ESTADO_LINEA.ERROR);
  assert.equal(r.motivo, MOTIVO_CONCILIACION.PRECIO_INVALIDO);
});

test("45. precio ausente, texto o infinito: ERROR", () => {
  for (const v of [null, undefined, "", "s/d", Infinity, NaN]) {
    const r = una({ fila: linea({ precioConIva: v }) });
    assert.equal(r.estado, ESTADO_LINEA.ERROR, `precio ${String(v)}`);
  }
});

test("46. una unidad que el proveedor no manda no se aplica", () => {
  const r = una({ fila: linea({ unidadProveedor: "XX" }) });
  assert.equal(r.estado, ESTADO_LINEA.FACTOR_DUDOSO);
  assert.equal(r.seleccionable, false);
});

test("47. una fila excluida no se aplica aunque esté todo bien", () => {
  const r = una({ fila: linea({ excluido: true }) });
  assert.equal(r.estado, ESTADO_LINEA.EXCLUIDO);
  assert.equal(r.seleccionable, false);
});

test("48. SOLO LISTO_PARA_ACTUALIZAR queda seleccionada por defecto", () => {
  const casos = [
    { fila: linea(), productos: [prod()] },                                    // LISTO
    { fila: linea(), productos: [prod({ precioCostoActual: 1050 })] },         // SIN_CAMBIOS
    { fila: linea(), codigos: [vinculo({ codigoInterno: "X" })] },             // NO_MACHEADO
    { fila: linea({ precioConIva: 0 }) },                                      // BLOQUEADO
    { fila: linea({ precioConIva: -1 }) },                                     // ERROR
    { fila: linea({ unidadProveedor: "DI" }) },                                // FACTOR_DUDOSO
    { fila: linea({ excluido: true }) },                                       // EXCLUIDO
    { productos: [prod({ unidadMedida: "kg" })] },                             // BLOQUEADO
  ];
  for (const c of casos) {
    const r = una(c);
    const esperado = r.estado === ESTADO_LINEA.LISTO_PARA_ACTUALIZAR;
    assert.equal(r.seleccionadaPorDefecto, esperado, `${r.estado} quedó ${r.seleccionadaPorDefecto}`);
    assert.equal(r.seleccionable, esperado);
  }
});

test("49. el motor no escribe ningún precio: la entrada no se muta", () => {
  const productos = [prod()];
  const filas = [linea()];
  const antes = JSON.stringify({ productos, filas });
  conciliarLista({ filas, productos, codigosProveedor: [vinculo()], contexto: CTX, config: CONFIG_ARCOR });
  assert.equal(JSON.stringify({ productos, filas }), antes);
  assert.equal(productos[0].precioCostoActual, 1000);
});

// ═══ RESUMEN ═════════════════════════════════════════════════════════════════

test("50. contadores por estado y suma igual al total de filas", () => {
  const productos = [
    prod({ productoBaseId: 1, precioCostoActual: 500 }),
    prod({ productoBaseId: 2, precioCostoActual: 1050 }),
    prod({ productoBaseId: 3, unidadMedida: "kg" }),
  ];
  const codigos = [
    vinculo({ productoBaseId: 1, codigoInterno: "A1" }),
    vinculo({ productoBaseId: 2, codigoInterno: "A2" }),
    vinculo({ productoBaseId: 3, codigoInterno: "A3" }),
  ];
  const filas = [
    linea({ codigoCrudo: "A1", codigoNormalizado: "A1" }),
    linea({ codigoCrudo: "A2", codigoNormalizado: "A2" }),
    linea({ codigoCrudo: "A3", codigoNormalizado: "A3" }),
    linea({ codigoCrudo: "A9", codigoNormalizado: "A9" }),
  ];
  const r = conciliarLista({ filas, productos, codigosProveedor: codigos, contexto: CTX, config: CONFIG_ARCOR });

  assert.equal(r.resumen.totalFilas, 4);
  assert.equal(r.resumen.porEstado.LISTO_PARA_ACTUALIZAR, 1);
  assert.equal(r.resumen.porEstado.SIN_CAMBIOS, 1);
  assert.equal(r.resumen.porEstado.BLOQUEADO, 1);
  assert.equal(r.resumen.porEstado.NO_MACHEADO, 1);

  const suma = Object.values(r.resumen.porEstado).reduce((a, b) => a + b, 0);
  assert.equal(suma, r.resumen.totalFilas);
});

test("51. el resumen cuenta sugerencias, variaciones altas y selección", () => {
  const productos = [
    prod({ productoBaseId: 1, precioCostoActual: 500 }),
    prod({ productoBaseId: 9, codigosBarra: ["7790000000001"] }),
  ];
  const filas = [
    linea({ codigoCrudo: "A1", codigoNormalizado: "A1" }),
    linea({ codigoCrudo: "ZZ", codigoNormalizado: "ZZ", codigoBarraProveedor: "7790000000001" }),
  ];
  const r = conciliarLista({
    filas, productos,
    codigosProveedor: [vinculo({ productoBaseId: 1, codigoInterno: "A1" })],
    contexto: CTX, config: CONFIG_ARCOR,
  });
  // La segunda fila ahora MACHEA por código de barras en vez de sugerir.
  assert.equal(r.resumen.sugerenciasCodigoBarras, 0);
  assert.equal(r.resumen.macheadasPorCodigoBarra, 1);
  assert.equal(r.resumen.variacionAlta, 1); // 500 → 1050
  assert.equal(r.resumen.seleccionables, 2);
  assert.equal(r.resumen.seleccionadas, 2);
});

test("52. productos del proveedor ausentes en la lista", () => {
  const productos = [
    prod({ productoBaseId: 1, nombre: "Presente" }),
    prod({ productoBaseId: 2, nombre: "Ausente" }),
  ];
  const codigos = [
    vinculo({ productoBaseId: 1, codigoInterno: "A1" }),
    vinculo({ productoBaseId: 2, codigoInterno: "A2" }),
  ];
  const r = conciliarLista({
    filas: [linea({ codigoCrudo: "A1", codigoNormalizado: "A1" })],
    productos, codigosProveedor: codigos, contexto: CTX, config: CONFIG_ARCOR,
  });
  assert.equal(r.resumen.faltantes, 1);
  assert.equal(r.faltantes[0].codigoInterno, "A2");
  assert.equal(r.faltantes[0].productoBaseId, 2);
  assert.equal(r.faltantes[0].nombre, "Ausente");
});

test("53. un código INACTIVO ausente NO cuenta como faltante", () => {
  const codigos = [
    vinculo({ productoBaseId: 1, codigoInterno: "A1" }),
    vinculo({ productoBaseId: 2, codigoInterno: "A2", activo: false }),
  ];
  const r = conciliarLista({
    filas: [linea({ codigoCrudo: "A1", codigoNormalizado: "A1" })],
    productos: [prod({ productoBaseId: 1 }), prod({ productoBaseId: 2 })],
    codigosProveedor: codigos, contexto: CTX, config: CONFIG_ARCOR,
  });
  assert.equal(r.resumen.faltantes, 0);
  assert.equal(r.resumen.codigosProveedorInactivos, 1);
});

test("54. el resumen informa el proveedor y sus parámetros comerciales", () => {
  const r = conciliarLista({
    filas: [linea()], productos: [prod()],
    codigosProveedor: [vinculo()], contexto: CTX, config: CONFIG_ARCOR,
  });
  assert.equal(r.resumen.proveedor, "ARCOR");
  assert.equal(r.resumen.recargoPct, 5);
  assert.equal(r.resumen.umbralVariacionPct, 30);
});

test("55. lista vacía: resumen coherente, sin explotar", () => {
  const r = conciliarLista({ filas: [], productos: [], codigosProveedor: [], contexto: CTX, config: CONFIG_ARCOR });
  assert.equal(r.resumen.totalFilas, 0);
  assert.equal(r.filas.length, 0);
  assert.equal(r.resumen.faltantes, 0);
});

test("56. sin configuración, el motor se niega a adivinar", () => {
  assert.throws(() => conciliarLista({ filas: [], productos: [] }), /configuración/);
});

// ═══ GENERALIDAD ═════════════════════════════════════════════════════════════

test("57. el motor no conoce a Arcor: otro proveedor, otras unidades", () => {
  const CONFIG_OTRO = {
    proveedor: "OTRO",
    precioBase: "precioNeto",
    recargoPct: 12,
    umbralVariacionPct: 15,
    unidadesAdmitidas: ["CAJA"],
    pisoPrecioCreible: 0,
    resolverCostoMaestro: ({ precioConRecargo }) => ({
      costoMaestro: Math.round(precioConRecargo * 100) / 100,
      factorAplicado: 1,
      motivo: null,
    }),
    equivalenciaDisplay: null,
  };
  const r = una({
    fila: { ...linea({ unidadProveedor: "CAJA" }), precioNeto: 200, precioConIva: undefined },
    productos: [prod({ precioCostoActual: 1 })],
    config: CONFIG_OTRO,
  });
  assert.equal(r.recargoPct, 12);
  assert.equal(r.precioConRecargo, 224);
  assert.equal(r.costoMaestroPropuesto, 224);
  assert.equal(r.estado, ESTADO_LINEA.LISTO_PARA_ACTUALIZAR);
});

test("58. los índices son reutilizables por separado", () => {
  const idx = indexarCodigosProveedor([vinculo({ codigoInterno: "001234" })]);
  assert.equal(idx.exacto.size, 1);
  assert.equal(idx.sinCeros.size, 1);
  const m = macheePorCodigo(idx, { codigoNormalizado: "001234" });
  assert.equal(m.tipo, TIPO_COINCIDENCIA.CODIGO_INTERNO);

  const idxB = indexarCodigosBarra([prod({ codigosBarra: ["779", ""] })]);
  assert.equal(idxB.size, 1);
  assert.equal(sugerirPorCodigoBarra(idxB, { codigoBarraProveedor: "779" }).producto.productoBaseId, 100);
  assert.equal(sugerirPorCodigoBarra(idxB, { codigoBarraProveedor: null }), null);
});

test("59. conciliarFila se puede usar sola, con sus índices", () => {
  const r = conciliarFila({
    fila: linea(),
    indice: indexarCodigosProveedor([vinculo()]),
    indiceBarra: indexarCodigosBarra([]),
    productosPorId: new Map([[100, prod()]]),
    contexto: CTX,
    config: CONFIG_ARCOR,
  });
  assert.equal(r.estado, ESTADO_LINEA.LISTO_PARA_ACTUALIZAR);
});

test("60. la fila original viaja entera en el resultado", () => {
  const f = linea({ filaExcel: 533, categoriaCruda: "BOLSITAS AG" });
  const r = una({ fila: f });
  assert.equal(r.fila, f);
  assert.equal(r.fila.filaExcel, 533);
  assert.equal(r.fila.categoriaCruda, "BOLSITAS AG");
});
