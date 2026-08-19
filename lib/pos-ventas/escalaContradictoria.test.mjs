// EL CANDADO DE LA LÍNEA QUE SE CONTRADICE, CON LOS DATOS REALES.
//
// Lo que defiende: que una línea marcada UNIDAD_REMANENTE con el costo del BULTO
// quede registrada. Y —lo que decide si sirve— que NO marque las ventas
// unitarias legítimas, que son 89 de las 103 sospechosas medidas en producción.
//
// Las fichas de abajo son reales, del depósito, medidas el 2026-08-19.

import test from "node:test";
import assert from "node:assert/strict";

import { detectarEscalaContradictoria, MOTIVO } from "./escalaContradictoria.js";

// ── LO QUE TIENE QUE DETECTAR ───────────────────────────────────────────────

test("1. dice UNIDAD pero trae el costo del BULTO → contradice", () => {
  // PURE LA HUERTA 530G X12: costo de bulto 9.660, factor 12.
  const r = detectarEscalaContradictoria({
    modoVentaLinea: "UNIDAD_REMANENTE",
    costoCliente: 9660,
    costoBulto: 9660,
    factorPack: 12,
  });
  assert.equal(r.contradice, true);
  assert.equal(r.motivo, MOTIVO.COSTO_DE_BULTO_EN_LINEA_UNITARIA);
  assert.equal(r.costoUnitarioEsperado, 805, "tiene que decir cuál era el costo unitario correcto");
});

test("2. y con un factor grande también", () => {
  // FunDipperz x12: 13.650 el bulto.
  const r = detectarEscalaContradictoria({
    modoVentaLinea: "UNIDAD_REMANENTE", costoCliente: 13650, costoBulto: 13650, factorPack: 12,
  });
  assert.equal(r.contradice, true);
  assert.equal(r.costoUnitarioEsperado, 1137.5);
});

// ── EL REPARO: LAS VENTAS UNITARIAS LEGÍTIMAS NO SE MARCAN ──────────────────
//
// Éste es el que decide si el candado sirve. Si marcara estas, sería ruido sobre
// 89 líneas reales y se leería salteado.

test("3. LAS LEGÍTIMAS NO SE MARCAN: costo unitario exacto", () => {
  // Las tres son de la venta 1351, medidas: cobraron el unitario exacto.
  const casos = [
    { nombre: "POETT PERFUMINA", costoCliente: 1400, costoBulto: 16800, factorPack: 12 },
    { nombre: "CIF LIMON 500ml", costoCliente: 2685, costoBulto: 32220, factorPack: 12 },
    { nombre: "ALA DETERGENTE", costoCliente: 1435, costoBulto: 17220, factorPack: 12 },
  ];
  for (const c of casos) {
    const r = detectarEscalaContradictoria({ modoVentaLinea: "UNIDAD_REMANENTE", ...c });
    assert.equal(r.contradice, false, `${c.nombre} se marcó y es legítima`);
  }
});

test("4. y tampoco si el unitario no divide exacto", () => {
  // ALA DETERGENTE de la misma venta: 18.100 ÷ 12 = 1.508,33.
  const r = detectarEscalaContradictoria({
    modoVentaLinea: "UNIDAD_REMANENTE", costoCliente: 1508.33, costoBulto: 18100, factorPack: 12,
  });
  assert.equal(r.contradice, false);
});

test("4b. un costo que NO es ni el del bulto ni el unitario tampoco se marca", () => {
  // Éste es el candado que EJERCE la comparación con el bulto, y hacía falta:
  // sin él, ni `esElUnitario` ni `esElDelBulto` quedaban cubiertos por separado
  // —se tapaban entre sí— y una mutación que marcara todo pasaba en verde.
  //
  // El caso es real: un costo editado a mano en la línea, o un producto cuyo
  // costo cambió entre que se agregó al carrito y se cobró.
  const r = detectarEscalaContradictoria({
    modoVentaLinea: "UNIDAD_REMANENTE", costoCliente: 1234.56, costoBulto: 16800, factorPack: 12,
  });
  assert.equal(r.contradice, false, "solo se marca lo que coincide con el costo del BULTO");
});

// ── LAS DOS EXCEPCIONES DECLARADAS ──────────────────────────────────────────

test("5. EXCEPCIÓN costo cero: no se puede distinguir y no se marca", () => {
  // Con 0 el del bulto y el unitario son el mismo número. Marcarlo sería un
  // falso positivo garantizado en todo producto sin costo cargado.
  //
  // ⚠️ Este candado afirma el COMPORTAMIENTO, no la guarda del código: la
  // condición `bulto <= 0` es redundante —con costo 0 la comparación del unitario
  // ya devuelve "sin contradicción"— y este test pasa igual sin ella, comprobado
  // sacándola. Queda escrito para que no se lo lea como su guardián.
  const r = detectarEscalaContradictoria({
    modoVentaLinea: "UNIDAD_REMANENTE", costoCliente: 0, costoBulto: 0, factorPack: 12,
  });
  assert.equal(r.contradice, false);
});

test("5b. y un costo NEGATIVO tampoco marca — eso sí lo cubre la guarda", () => {
  // Acá la guarda `bulto <= 0` no es redundante: con costo negativo el unitario
  // también es negativo y las dos comparaciones podrían no coincidir.
  const r = detectarEscalaContradictoria({
    modoVentaLinea: "UNIDAD_REMANENTE", costoCliente: -9660, costoBulto: -9660, factorPack: 12,
  });
  assert.equal(r.contradice, false);
});

test("6. EXCEPCIÓN factor 1: no hay dos escalas", () => {
  const r = detectarEscalaContradictoria({
    modoVentaLinea: "UNIDAD_REMANENTE", costoCliente: 9660, costoBulto: 9660, factorPack: 1,
  });
  assert.equal(r.contradice, false);
});

test("7. y sin factor cargado tampoco", () => {
  for (const fp of [null, undefined, 0]) {
    const r = detectarEscalaContradictoria({
      modoVentaLinea: "UNIDAD_REMANENTE", costoCliente: 9660, costoBulto: 9660, factorPack: fp,
    });
    assert.equal(r.contradice, false, `factor ${fp} no puede marcar`);
  }
});

// ── LO QUE NO MIRA ──────────────────────────────────────────────────────────

test("8. una línea NORMAL nunca se marca", () => {
  // La rama NORMAL sí multiplica por el factor, así que traer el costo del bulto
  // es exactamente lo correcto.
  const r = detectarEscalaContradictoria({
    modoVentaLinea: "NORMAL", costoCliente: 9660, costoBulto: 9660, factorPack: 12,
  });
  assert.equal(r.contradice, false);
});

test("9. sin costo del cliente no hay contradicción posible", () => {
  // Es el caso de la cola offline, que NO guarda `precioCosto`: el servidor lo
  // calcula como costoBulto/factorPack. Marcarlo sería marcar el camino sano.
  for (const c of [null, undefined, ""]) {
    const r = detectarEscalaContradictoria({
      modoVentaLinea: "UNIDAD_REMANENTE", costoCliente: c, costoBulto: 9660, factorPack: 12,
    });
    assert.equal(r.contradice, false, `costo ${c} no puede marcar`);
  }
});

test("10. el Decimal de Prisma llega como string y se compara igual", () => {
  const r = detectarEscalaContradictoria({
    modoVentaLinea: "UNIDAD_REMANENTE", costoCliente: "9660.00", costoBulto: "9660.00", factorPack: "12",
  });
  assert.equal(r.contradice, true);
});

test("11. NO ESCRIBE NI DECIDE: solo informa", () => {
  // El candado del propio diseño: esto detecta y devuelve, no corrige el costo ni
  // rechaza la venta. Si alguien le agrega una corrección, deja de ser lo que
  // Emanuel aprobó — no se frena una venta en el mostrador por esto.
  const r = detectarEscalaContradictoria({
    modoVentaLinea: "UNIDAD_REMANENTE", costoCliente: 9660, costoBulto: 9660, factorPack: 12,
  });
  assert.deepEqual(Object.keys(r).sort(), ["contradice", "costoUnitarioEsperado", "motivo"]);
});
