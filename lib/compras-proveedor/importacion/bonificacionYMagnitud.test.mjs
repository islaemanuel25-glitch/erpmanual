// EL CANDADO DE MAGNITUD NO PUEDE ROMPER EL PRECIO EFECTIVO.
//
// ── LA TRAMPA QUE ESTE ARCHIVO VIGILA ─────────────────────────────────────
//
// Un control que compare `cantidad × precio impreso` contra el importe del
// renglón bloquea TODA factura con bonificación, porque con un descuento la
// columna PRECIO es la de LISTA y nunca multiplica hasta lo que se cobra:
//
//     10 × $100 = $1.000     y el papel cobra $900
//
// O sea que el candado nuevo, mal escrito, desactivaría el arreglo del precio
// efectivo — la tanda anterior entera— y encima lo haría en silencio, porque un
// renglón bloqueado se ve como un renglón mal leído.
//
// Lo que se compara es el precio EFECTIVO: subtotal ÷ cantidad cuando el papel
// trae el importe, precio × (1 − bonificación) cuando no, y el impreso cuando no
// hay ni una cosa ni la otra. La misma prioridad que usa el resto del módulo.
//
// Fixtures sintéticos.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  COHERENCIA,
  representacionesQueCierran,
  toleranciaDeRedondeo,
  verificarImporteDeLinea,
} from "./coherenciaDeLinea.js";
import { cambiarUnidadDelPapel, cambiarUnidadDeLinea, prepararLineasImportadas } from "./prepararLineas.js";
import { TOLERANCIA_ESCALA_POR_DEFECTO_PCT } from "./toleranciaEscala.js";

/** Producto suelto: sin bulto, para que la escala no meta ruido. */
const SUELTO = Object.freeze({
  productoLocalId: 11, baseId: 1101, nombre: "Producto Sintético Suelto",
  codigoInterno: "PS-1", codigosInternos: ["PS-1"], aliasesProveedor: [],
  unidad_medida: "unidad", factor_pack: 1, modoCompra: "UNIDAD", precio_costo: 90,
});

/** El mismo producto, pero comprado por bulto de 10. */
const PORBULTO = Object.freeze({ ...SUELTO, productoLocalId: 12, baseId: 1102, factor_pack: 10, modoCompra: "BULTO", precio_costo: 900 });

/** EL CASO OBLIGATORIO: 10 a $100 con 10 % de bonificación cierran en $900. */
const RENGLON_BONIFICADO = Object.freeze({
  codigo: "PS-1",
  descripcion: "Producto Sintético Suelto",
  cantidad: 10,
  unidad: "UNIDAD",
  precioUnitario: 100,
  bonificacionPct: 10,
  subtotal: 900,
});

const preparar = (producto, linea = RENGLON_BONIFICADO, extra = {}) =>
  prepararLineasImportadas({
    lineas: [linea],
    productos: [producto],
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: true,
    ...extra,
  })[0];

// ── EL CASO OBLIGATORIO ───────────────────────────────────────────────────

test("10 a $100 con 10 % se ACEPTA y conserva los $900", () => {
  const l = preparar(SUELTO);
  assert.equal(l.coherencia.estado, COHERENCIA.CIERRA);
  assert.equal(l.coherencia.bloquea, false, "el candado bloqueó una bonificación legítima");
  assert.equal(l.precioFinalPapelCrudo, 90, "no tomó el precio efectivo");
  assert.equal(l.precioPapel, 90);
  assert.equal(l.cantidadPedido, 10);
  assert.equal(Math.round(l.cantidadPedido * l.precioPapel * 100) / 100, 900);
});

test("Y COMPARAR CONTRA EL PRECIO BRUTO LO HABRÍA BLOQUEADO", () => {
  // La contraprueba del caso: si el candado mirara la columna PRECIO, esta línea
  // —que está perfecta— quedaría bloqueada. Es la comprobación de que la
  // distinción entre bruto y efectivo no es teórica.
  const conBruto = verificarImporteDeLinea({
    cantidadPedido: 10,
    precioPapelEnEsaEscala: 100,
    subtotalOriginalPapel: 900,
  });
  assert.equal(conBruto.bloquea, true, "10 × 100 tendría que dar 1.000 y no cerrar contra 900");
  assert.equal(conBruto.importeCalculado, 1000);
});

test("UN PACK NO SE BLOQUEA SOLO POR EL REDONDEO DEL UNITARIO", () => {
  // ── EL DEFECTO QUE ESTE CANDADO ATAJA, Y LO ENCONTRÓ LA SONDA ───────────
  //
  // 12 unidades a $8.168,94 con 14 % cierran en $87.045,75. El unitario
  // efectivo es $87.045,75 ÷ 12 = $7.253,8125, que al centavo es $7.253,81; por
  // 12 vuelve $87.045,72 — TRES centavos menos, y son redondeo legítimo.
  //
  // Como el producto viene en bultos de 12, esas 12 unidades quedan guardadas
  // como 1 BULTO. La tolerancia se calculaba sobre la cantidad DEL PEDIDO —1—
  // y daba 2 centavos, así que la línea se bloqueaba sola. Una factura con
  // bonificación, perfectamente sana, sin poder guardarse.
  //
  // Ninguno de los candados de la aritmética lo veía: ninguno ejercía una
  // cantidad de pedido MÁS CHICA que la del papel, que es justo lo que produce
  // un pack. Lo encontró abrir la pantalla.
  const packDe12 = { ...SUELTO, productoLocalId: 13, baseId: 1103, factor_pack: 12, modoCompra: "BULTO", precio_costo: 90000 };
  const l = preparar(packDe12, {
    codigo: "PS-1",
    descripcion: "Producto Sintético Suelto",
    cantidad: 12,
    unidad: "UNIDAD",
    precioUnitario: 8168.94,
    bonificacionPct: 14,
    subtotal: 87045.75,
  });
  assert.equal(l.cantidadPedido, 1, "el fixture no ejerce el caso: no agrupó en bulto");
  assert.equal(l.unidadPedido, "BULTO");
  assert.equal(l.coherencia.diferencia, -0.03, "el redondeo medido cambió");
  assert.equal(l.coherencia.bloquea, false, "bloqueó una bonificación sana por tres centavos");

  // Y la tolerancia sale de las unidades del papel, no de la cantidad del
  // pedido: con 12 unidades son 7 centavos, con 1 bulto serían 2.
  assert.equal(toleranciaDeRedondeo(1, 12), toleranciaDeRedondeo(12, null));
  assert.ok(toleranciaDeRedondeo(1, 12) > toleranciaDeRedondeo(1, null));
});

test("y aflojar esa tolerancia NO deja pasar un factor de más", () => {
  // La tolerancia ahora crece con las unidades del papel. Este candado
  // comprueba que sigue estando MUY por debajo del error que tiene que atrapar,
  // para cualquier tamaño de pack.
  for (const unidades of [1, 12, 50, 500, 5000]) {
    const r = verificarImporteDeLinea({
      cantidadPedido: 1,
      precioPapelEnEsaEscala: 900 * 10,
      subtotalOriginalPapel: 900,
      unidadesDelPapel: unidades,
    });
    assert.equal(r.bloquea, true, `con ${unidades} unidades del papel, un factor de 10 se coló`);
  }
});

test("el mismo renglón con la unidad MAL interpretada SÍ se bloquea", () => {
  const bien = preparar(PORBULTO);
  assert.equal(bien.coherencia.bloquea, false);

  const mal = cambiarUnidadDelPapel(bien, PORBULTO, {
    unidadPapel: "BULTO",
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: true,
  });
  assert.equal(mal.cantidadBaseUnidades, 100, "la lectura mala no cambió la base");
  assert.equal(mal.coherencia.bloquea, true, "una lectura de bultos no bloqueó");
  assert.equal(mal.coherencia.importeCalculado, 9000);
  assert.equal(mal.coherencia.subtotal, 900);
});

test("y al bloquear OFRECE las representaciones, que con bonificación existen", () => {
  const mal = cambiarUnidadDelPapel(preparar(PORBULTO), PORBULTO, {
    unidadPapel: "BULTO",
    facturaPor: "UNIDAD",
    hayColumnaSubtotal: true,
  });
  assert.ok(
    mal.representacionesValidas.length >= 1,
    "un renglón bonificado quedó bloqueado y sin una sola salida que ofrecer"
  );
  // Todas cierran contra los $900 y todas salen de leer el papel en unidades.
  for (const o of mal.representacionesValidas) {
    assert.equal(o.lectura, "UNIDAD");
    assert.equal(Math.round(o.cantidad * o.precio * 100) / 100, 900);
  }
});

test("las representaciones usan el precio EFECTIVO, no la columna PRECIO", () => {
  const opciones = representacionesQueCierran({
    cantidadPapel: 10,
    precioImpresoPapel: 100,
    bonificacionPct: 10,
    subtotalOriginalPapel: 900,
    haySubtotalImpreso: true,
    unidadesPorBultoErp: 10,
    facturaPor: "UNIDAD",
  });
  const enUnidades = opciones.find((o) => o.unidad === "UNIDAD");
  assert.ok(enUnidades, JSON.stringify(opciones));
  assert.equal(enUnidades.precio, 90, "ofreció el precio de lista en vez del efectivo");

  // CONTRAPRUEBA: sin pasarle la bonificación ni el subtotal, el efectivo cae al
  // impreso y ninguna representación cierra. O sea que lo que hace que esto
  // funcione es justamente el precio efectivo.
  const sinDescuento = representacionesQueCierran({
    cantidadPapel: 10,
    precioImpresoPapel: 100,
    subtotalOriginalPapel: 900,
    haySubtotalImpreso: false,
    unidadesPorBultoErp: 10,
    facturaPor: "UNIDAD",
  });
  assert.equal(sinDescuento.length, 0);
});

test("SIN SUBTOTAL, la bonificación sigue mandando sobre el precio de lista", () => {
  // El escalón del medio de la prioridad: sin importe impreso, el efectivo sale
  // de precio × (1 − bonificación). No se compara contra nada —no hay subtotal—
  // pero el precio que viaja tiene que seguir siendo el de $90.
  const l = preparar(SUELTO, { ...RENGLON_BONIFICADO, subtotal: null }, { hayColumnaSubtotal: false });
  assert.equal(l.precioFinalPapelCrudo, 90);
  assert.equal(l.coherencia.estado, COHERENCIA.SIN_SUBTOTAL);
  assert.equal(l.coherencia.bloquea, false);
});

// ── PUNTO 5: LOS CUATRO CASOS PEDIDOS ─────────────────────────────────────

test("LÍNEA SIN SUBTOTAL: no se inventa un cierre y se pide confirmación", () => {
  const l = preparar(
    PORBULTO,
    { codigo: "PS-1", descripcion: "Producto Sintético Suelto", cantidad: 10, unidad: null, precioUnitario: 90, bonificacionPct: null, subtotal: null },
    { hayColumnaSubtotal: false }
  );
  // NO dice que cierra: dice que no se pudo comprobar, que es otra afirmación.
  assert.equal(l.coherencia.estado, COHERENCIA.SIN_SUBTOTAL);
  assert.notEqual(l.coherencia.estado, COHERENCIA.CIERRA);
  assert.equal(l.coherencia.subtotal, null);
  assert.equal(l.coherencia.diferencia, null);
  assert.ok(l.coherencia.porque, "no dijo por qué no se pudo comprobar");
  // Y la línea queda pidiendo revisión: sin unidad en el papel y sin subtotal, la
  // escala no se puede demostrar.
  assert.equal(l.requiereRevision, true);
  assert.equal(l.confirmada, false);
});

test("y sin subtotal la confianza baja: la unidad no queda confirmada", () => {
  const l = preparar(
    PORBULTO,
    { codigo: "PS-1", descripcion: "Producto Sintético Suelto", cantidad: 10, unidad: null, precioUnitario: 5000, bonificacionPct: null, subtotal: null },
    { hayColumnaSubtotal: false }
  );
  // $5.000 no se parece ni al costo por unidad ($90) ni al del bulto ($900): la
  // evidencia por precio no alcanza y hay que preguntar.
  assert.equal(l.unidadCantidadPapel, null);
  assert.equal(l.unidadPapelConfirmada, false);
  assert.ok(l.preguntaUnidadPapel, "no armó la pregunta");
  assert.match(l.preguntaUnidadPapel.titulo, /La factura dice 10/);
});

test("47 UNIDADES → BULTO → UNIDADES vuelve exactamente a 47", () => {
  const linea = { codigo: "PS-1", descripcion: "Producto Sintético Suelto", cantidad: 47, unidad: "UNIDAD", precioUnitario: 100, bonificacionPct: null, subtotal: 4700 };
  let l = preparar(PORBULTO, linea);
  assert.equal(l.cantidadBaseUnidades, 47);

  const aBulto = cambiarUnidadDeLinea(l, PORBULTO, {
    unidadDestino: "BULTO", facturaPor: "UNIDAD", hayColumnaSubtotal: true, redondear: true,
  });
  assert.equal(aBulto.cantidadPedido, 5);
  assert.equal(aBulto.cantidadRedondeadaHaciaArriba, true);

  const vuelta = cambiarUnidadDeLinea(aBulto, PORBULTO, {
    unidadDestino: "UNIDAD", facturaPor: "UNIDAD", hayColumnaSubtotal: true,
  });
  assert.equal(vuelta.cantidadPedido, 47, "volvió con unidades que el papel no traía");

  // Diez vueltas más y sigue en 47: el redondeo no se acumula porque ninguna
  // vuelta parte de la anterior.
  let x = vuelta;
  for (let i = 0; i < 10; i += 1) {
    x = cambiarUnidadDeLinea(x, PORBULTO, { unidadDestino: "BULTO", facturaPor: "UNIDAD", hayColumnaSubtotal: true, redondear: true });
    x = cambiarUnidadDeLinea(x, PORBULTO, { unidadDestino: "UNIDAD", facturaPor: "UNIDAD", hayColumnaSubtotal: true });
  }
  assert.equal(x.cantidadPedido, 47);
  assert.equal(x.cantidadBaseUnidades, 47);
});

test("UN SALTO DE $100 A $1.000.000 QUEDA BLOQUEADO", () => {
  for (let cantidad = 1; cantidad <= 200; cantidad += 1) {
    const r = verificarImporteDeLinea({
      cantidadPedido: cantidad,
      precioPapelEnEsaEscala: 1_000_000 / cantidad,
      subtotalOriginalPapel: 100,
    });
    assert.equal(r.bloquea, true, `con cantidad ${cantidad} el millón se coló`);
  }
});

test("LA TOLERANCIA COMERCIAL AL 100 % NO APAGA EL CANDADO ARITMÉTICO", () => {
  // Son dos tolerancias distintas y viven en archivos distintos justamente para
  // que ensanchar la comercial —algo que va a pasar en cuanto un proveedor
  // aumente fuerte— no afloje en silencio la aritmética.
  const l = preparar(PORBULTO, RENGLON_BONIFICADO, { toleranciaEscalaPct: 100 });
  const mal = cambiarUnidadDelPapel(l, PORBULTO, {
    unidadPapel: "BULTO", facturaPor: "UNIDAD", hayColumnaSubtotal: true,
  });
  assert.equal(mal.coherencia.bloquea, true, "la tolerancia comercial apagó la aritmética");
  assert.equal(mal.coherencia.importeCalculado, 9000);

  // Y al 1000 %, que es el tope, tampoco.
  const alTope = cambiarUnidadDelPapel(
    preparar(PORBULTO, RENGLON_BONIFICADO, { toleranciaEscalaPct: 1000 }),
    PORBULTO,
    { unidadPapel: "BULTO", facturaPor: "UNIDAD", hayColumnaSubtotal: true }
  );
  assert.equal(alTope.coherencia.bloquea, true);
});

test("el default de la tolerancia comercial sigue siendo 40 y se define una vez", () => {
  // Queda provisionalmente en 40 % y no se ajusta con una sola factura: es un
  // punto de partida, no una medición.
  assert.equal(TOLERANCIA_ESCALA_POR_DEFECTO_PCT, 40);
});
