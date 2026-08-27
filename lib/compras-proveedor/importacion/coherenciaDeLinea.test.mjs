// EL RENGLÓN CONVERTIDO SIGUE COBRANDO LO QUE COBRA EL PAPEL.
//
// El caso obligatorio del pedido, con sus dos representaciones válidas y sus
// dos inválidas, más los casos de borde que las rodean.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  COHERENCIA,
  explicarDiferencia,
  itemQueNoCierra,
  lineasQueNoCierran,
  representacionesQueCierran,
  textoItemQueNoCierra,
  toleranciaDeRedondeo,
  verificarImporteDeLinea,
} from "./coherenciaDeLinea.js";
import { TOLERANCIA_CENTAVOS } from "../comprobante/impuestos.js";

// El papel del caso real: 10 renglones, $5.050 cada uno, $50.500 el renglón.
const PAPEL = Object.freeze({ cantidad: 10, precio: 5050, subtotal: 50500, factor: 10 });

test("10 unidades × $5.050 cierra contra el subtotal del papel", () => {
  const r = verificarImporteDeLinea({
    cantidadPedido: 10,
    precioPapelEnEsaEscala: 5050,
    subtotalOriginalPapel: PAPEL.subtotal,
  });
  assert.equal(r.estado, COHERENCIA.CIERRA);
  assert.equal(r.bloquea, false);
  assert.equal(r.importeCalculado, 50500);
  assert.equal(r.diferencia, 0);
});

test("1 bulto × $50.500 cierra igual: es el mismo renglón reexpresado", () => {
  const r = verificarImporteDeLinea({
    cantidadPedido: 1,
    precioPapelEnEsaEscala: 50500,
    subtotalOriginalPapel: PAPEL.subtotal,
  });
  assert.equal(r.estado, COHERENCIA.CIERRA);
  assert.equal(r.bloquea, false);
});

test("10 bultos × $50.500 NO cierra y bloquea: son diez veces el papel", () => {
  const r = verificarImporteDeLinea({
    cantidadPedido: 10,
    precioPapelEnEsaEscala: 50500,
    subtotalOriginalPapel: PAPEL.subtotal,
  });
  assert.equal(r.estado, COHERENCIA.NO_CIERRA);
  assert.equal(r.bloquea, true);
  assert.equal(r.importeCalculado, 505000);
  assert.equal(r.diferencia, 454500);
});

test("100 unidades × $5.050 NO cierra y bloquea: el otro camino al mismo error", () => {
  const r = verificarImporteDeLinea({
    cantidadPedido: 100,
    precioPapelEnEsaEscala: 5050,
    subtotalOriginalPapel: PAPEL.subtotal,
  });
  assert.equal(r.estado, COHERENCIA.NO_CIERRA);
  assert.equal(r.bloquea, true);
  assert.equal(r.importeCalculado, 505000);
});

test("un salto de $100 a $1.000.000 no puede pasar por ninguna cantidad", () => {
  // Se recorren cantidades de 1 a 500: ninguna hace que un millón cierre contra
  // un renglón de cien pesos. La tolerancia crece con la cantidad —por el
  // redondeo del unitario— y este candado prueba que crece MUY por debajo del
  // error que tiene que atrapar.
  for (let cantidad = 1; cantidad <= 500; cantidad += 1) {
    const r = verificarImporteDeLinea({
      cantidadPedido: cantidad,
      precioPapelEnEsaEscala: 1_000_000 / cantidad,
      subtotalOriginalPapel: 100,
    });
    assert.equal(r.bloquea, true, `con cantidad ${cantidad} el millón se coló`);
  }
});

test("la tolerancia absorbe el redondeo del unitario y nada más", () => {
  // 87.045,75 entre 12 da 7.253,8125, que redondeado al centavo es 7.253,81.
  // Multiplicado de vuelta da 87.045,72: tres centavos menos que el papel, y son
  // redondeo legítimo.
  const r = verificarImporteDeLinea({
    cantidadPedido: 12,
    precioPapelEnEsaEscala: 7253.81,
    subtotalOriginalPapel: 87045.75,
  });
  assert.equal(r.estado, COHERENCIA.CIERRA);
  assert.equal(r.diferencia, -0.03);

  // CONTRAPRUEBA: un peso de más ya no es redondeo con esta cantidad.
  const conUnPeso = verificarImporteDeLinea({
    cantidadPedido: 12,
    precioPapelEnEsaEscala: 7254.81,
    subtotalOriginalPapel: 87045.75,
  });
  assert.equal(conUnPeso.estado, COHERENCIA.NO_CIERRA);
  assert.equal(conUnPeso.bloquea, true);
});

test("la tolerancia sale de la división, no de un número elegido", () => {
  assert.equal(toleranciaDeRedondeo(1), TOLERANCIA_CENTAVOS + 1);
  assert.equal(toleranciaDeRedondeo(10), TOLERANCIA_CENTAVOS + 5);
  assert.equal(toleranciaDeRedondeo(100), TOLERANCIA_CENTAVOS + 50);
  // Sin cantidad válida queda la del papel a secas: no se inventa margen.
  assert.equal(toleranciaDeRedondeo(null), TOLERANCIA_CENTAVOS);
  assert.equal(toleranciaDeRedondeo(0), TOLERANCIA_CENTAVOS);
});

test("sin columna de subtotal se dice SIN_SUBTOTAL, no CIERRA", () => {
  const r = verificarImporteDeLinea({
    cantidadPedido: 10,
    precioPapelEnEsaEscala: 50500,
    subtotalOriginalPapel: 50500,
    haySubtotalImpreso: false,
  });
  assert.equal(r.estado, COHERENCIA.SIN_SUBTOTAL);
  assert.equal(r.bloquea, false);
  // Y no se afirma que cierre: el importe se informa, pero sin nada contra qué
  // compararlo. Decir que no se pudo probar es distinto de darlo por bueno.
  assert.equal(r.subtotal, null);
  assert.equal(r.diferencia, null);
  assert.ok(r.porque);
});

test("un subtotal que el lector no leyó no puede validarse contra sí mismo", () => {
  // Es el agujero del total del pie, trasladado al renglón: si el subtotal se
  // calculó como cantidad × precio, compararlo contra cantidad × precio cierra
  // siempre — y cierra justo donde no hay con qué controlar.
  const calculado = 10 * 50500;
  const r = verificarImporteDeLinea({
    cantidadPedido: 10,
    precioPapelEnEsaEscala: 50500,
    subtotalOriginalPapel: calculado,
    haySubtotalImpreso: false,
  });
  assert.notEqual(r.estado, COHERENCIA.CIERRA);
});

test("sin cantidad o sin precio no se inventa un importe", () => {
  const sinPrecio = verificarImporteDeLinea({
    cantidadPedido: 10,
    precioPapelEnEsaEscala: null,
    subtotalOriginalPapel: 50500,
  });
  assert.equal(sinPrecio.estado, COHERENCIA.SIN_SUBTOTAL);
  assert.equal(sinPrecio.importeCalculado, null);
  assert.equal(sinPrecio.bloquea, false);

  const sinCantidad = verificarImporteDeLinea({
    cantidadPedido: null,
    precioPapelEnEsaEscala: 5050,
    subtotalOriginalPapel: 50500,
  });
  assert.equal(sinCantidad.importeCalculado, null);
  assert.equal(sinCantidad.bloquea, false);
});

test("SE OFRECEN EXACTAMENTE LAS DOS VÁLIDAS DEL PEDIDO, Y NINGUNA INVÁLIDA", () => {
  const opciones = representacionesQueCierran({
    cantidadPapel: PAPEL.cantidad,
    precioImpresoPapel: PAPEL.precio,
    subtotalOriginalPapel: PAPEL.subtotal,
    unidadesPorBultoErp: PAPEL.factor,
    facturaPor: "UNIDAD",
  });
  assert.deepEqual(
    opciones.map((o) => `${o.cantidad} ${o.unidad} × ${o.precio}`),
    ["10 UNIDAD × 5050", "1 BULTO × 50500"]
  );
  // Las dos salen de leer el papel como UNIDADES. Las dos lecturas "10 bultos"
  // dan $505.000 y por eso no aparecen.
  assert.ok(opciones.every((o) => o.lectura === "UNIDAD"));

  for (const o of opciones) {
    const r = verificarImporteDeLinea({
      cantidadPedido: o.cantidad,
      precioPapelEnEsaEscala: o.precio,
      subtotalOriginalPapel: PAPEL.subtotal,
    });
    assert.equal(r.estado, COHERENCIA.CIERRA, `${o.cantidad} ${o.unidad} no cerró`);
  }
});

test("NO SE OFRECE REPARTIR EL SUBTOTAL: el precio impreso es el control", () => {
  // ── EL DEFECTO QUE ESTE CANDADO ATAJA ───────────────────────────────────
  //
  // La primera versión de esto repartía el subtotal entre la cantidad de cada
  // representación —`subtotal ÷ cantidad`— y así cerraba SIEMPRE, para
  // cualquier lectura. Ofrecía como corrección la misma lectura equivocada con
  // el precio ajustado para taparla.
  //
  // Acá el papel dice 10 renglones a $5.050 y un importe de $77.777. Ninguna
  // lectura lo explica: ni 10 unidades ($50.500), ni 10 bultos ($505.000). El
  // papel se contradice consigo mismo y lo correcto es no ofrecer nada.
  //
  // Repartiendo el subtotal se habrían ofrecido dos "correcciones" —$7.777,70
  // por unidad y $77.777 por bulto—, las dos cerrando por construcción y las dos
  // inventando un precio que no está impreso en ningún lado.
  const opciones = representacionesQueCierran({
    cantidadPapel: 10,
    precioImpresoPapel: 5050,
    subtotalOriginalPapel: 77777,
    unidadesPorBultoErp: 10,
    facturaPor: "UNIDAD",
  });
  assert.equal(opciones.length, 0);
  // Y la prueba de que el reparto habría cerrado: 10 × 7.777,70 da 77.777.
  assert.equal(Math.round(77777 / 10 * 100) * 10, 7777700);
});

test("UNA MISMA CANTIDAD CON DOS LECTURAS: se ofrecen las dos si las dos cierran", () => {
  // Papel: 10 renglones a $5.050, importe $505.000. Eso NO es una
  // contradicción: se explica perfectamente leyendo "10 bultos de 10 a $5.050
  // la unidad". La función lo dice, y decirlo es más correcto que descartarlo.
  const opciones = representacionesQueCierran({
    cantidadPapel: 10,
    precioImpresoPapel: 5050,
    subtotalOriginalPapel: 505000,
    unidadesPorBultoErp: 10,
    facturaPor: "UNIDAD",
  });
  assert.ok(opciones.length >= 1);
  assert.ok(opciones.every((o) => o.lectura === "BULTO"), JSON.stringify(opciones));
});

test("con el papel en BULTOS la lectura correcta es la otra", () => {
  // Mismo producto, pero el renglón dice 10 y $50.500 con importe $505.000: eso
  // sí se explica leyendo "10 bultos".
  const opciones = representacionesQueCierran({
    cantidadPapel: 10,
    precioImpresoPapel: 50500,
    subtotalOriginalPapel: 505000,
    unidadesPorBultoErp: 10,
    facturaPor: "BULTO",
  });
  assert.ok(opciones.length >= 1);
  assert.ok(opciones.some((o) => o.unidad === "BULTO" && o.cantidad === 10 && o.precio === 50500));
});

test("no se ofrece un bulto que no da entero: sería pedir otra cantidad", () => {
  const opciones = representacionesQueCierran({
    cantidadPapel: 47,
    precioImpresoPapel: 100,
    subtotalOriginalPapel: 4700,
    unidadesPorBultoErp: 10,
    facturaPor: "UNIDAD",
  });
  assert.ok(opciones.length >= 1);
  assert.ok(opciones.every((o) => o.unidad === "UNIDAD"));
});

test("sin precio impreso o sin subtotal no se ofrece ninguna representación", () => {
  assert.deepEqual(
    representacionesQueCierran({ cantidadPapel: 10, precioImpresoPapel: null, subtotalOriginalPapel: 100 }),
    []
  );
  assert.deepEqual(
    representacionesQueCierran({ cantidadPapel: 10, precioImpresoPapel: 10, subtotalOriginalPapel: null }),
    []
  );
});

test("itemQueNoCierra atrapa del lado del servidor lo mismo que la pantalla", () => {
  const bueno = { origenPrecio: "PAPEL", cantidad: 10, precioCosto: 5050, subtotalPapel: 50500 };
  assert.equal(itemQueNoCierra([bueno]), null);

  const malo = { origenPrecio: "PAPEL", cantidad: 10, precioCosto: 50500, subtotalPapel: 50500 };
  const r = itemQueNoCierra([bueno, malo]);
  assert.ok(r);
  assert.equal(r.calculado, 505000);
  assert.equal(r.subtotal, 50500);
  assert.ok(textoItemQueNoCierra(r).includes("505000") || textoItemQueNoCierra(r).includes("505.000"));
});

test("itemQueNoCierra NO frena un costo elegido del sistema ni un pedido sin papel", () => {
  // Con el costo del sistema, `cantidad × costo` no tiene por qué dar el importe
  // del renglón: alguien miró los dos precios y eligió el suyo.
  const delSistema = { origenPrecio: "SISTEMA", cantidad: 10, precioCosto: 99999, subtotalPapel: 50500 };
  assert.equal(itemQueNoCierra([delSistema]), null);

  // Y "Nuevo pedido" manda items sin ningún papel detrás: no hay nada que
  // comprobar, y exigir un subtotal ahí frenaría una pantalla que no importa
  // nada. Es el motivo por el que la comprobación se saltea en vez de fallar.
  const sinPapel = { origenPrecio: "PAPEL", cantidad: 3, precioCosto: 100 };
  assert.equal(itemQueNoCierra([sinPapel]), null);
  assert.equal(itemQueNoCierra([{ ...sinPapel, subtotalPapel: null }]), null);
});

test("la explicación dice qué se interpretó y con qué números", () => {
  const e = explicarDiferencia({
    cantidadPapel: 10,
    unidadCantidadPapel: "BULTO",
    unidadesPorBultoErp: 10,
    cantidadPedido: 10,
    unidadPedido: "BULTO",
    importeCalculado: 505000,
    subtotal: 50500,
  });
  assert.match(e.comoSeLeyo, /10 bultos de 10/);
  assert.ok(e.cuenta.includes("505.000"), e.cuenta);
  assert.ok(e.cuenta.includes("50.500"), e.cuenta);
});

test("una lectura sin resolver se dice así, no se rellena con una suposición", () => {
  const e = explicarDiferencia({ cantidadPapel: 10, unidadCantidadPapel: null });
  assert.match(e.comoSeLeyo, /Todavía no está resuelto/);
});

test("lineasQueNoCierran mira solo las incluidas", () => {
  const bloqueada = { coherencia: { bloquea: true } };
  assert.equal(lineasQueNoCierran([bloqueada]).length, 1);
  assert.equal(lineasQueNoCierran([{ ...bloqueada, incluida: false }]).length, 0);
  assert.equal(lineasQueNoCierran([{ coherencia: { bloquea: false } }]).length, 0);
  // Una línea sin el campo no bloquea: `undefined` no es `true`. Si bloqueara,
  // cualquier objeto ajeno frenaría el borrador sin decir por qué.
  assert.equal(lineasQueNoCierran([{}]).length, 0);
});
