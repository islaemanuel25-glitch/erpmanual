// EL CANDADO DE NETO CONTRA FINAL, con las dos facturas reales.
//
// Es la red contra el único error que ningún control existente del ERP puede
// ver: si el costo se alimenta con el NETO en vez del FINAL, queda deflactado
// alrededor de la alícuota (21 %), y eso cae justo en el rango que el resto del
// sistema considera "aumento esperado de proveedor". Nada lo marcaría.
//
// ── DE DÓNDE SALEN LOS NÚMEROS ─────────────────────────────────────────────
//
// NO son inventados. Son la transcripción verificada de dos facturas reales que
// Emanuel leyó de las fotos. Se eligieron porque cubren las dos formas que toma
// una factura en este negocio:
//
//   · DYSSA — IVA e impuesto interno POR LÍNEA.
//   · DAS   — IVA solo AL PIE, sin impuesto interno.
//
// ── POR QUÉ LA TOLERANCIA ES DE UN CENTAVO ─────────────────────────────────
//
// Las dos cierran, pero con un centavo de diferencia contra el papel, por
// redondeo del proveedor. Un candado que exigiera igualdad exacta fallaría con
// datos reales, que es la peor clase de candado: el que obliga a aflojarlo.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  verificarComprobante,
  finalUnitarioCentavos,
  pareceNeto,
  aCentavos,
  TOLERANCIA_CENTAVOS,
} from "./impuestos.js";

// ── Las dos facturas ───────────────────────────────────────────────────────

const DYSSA = {
  nombre: "DYSSA A 0011-00794708 (10/08/2026)",
  receta: {
    ivaPorLinea: true,
    alicuotaIvaPct: 21,
    tieneImpuestoInterno: true,
    ivaIncluyeInternoEnLaBase: false,
    percepciones: [
      { nombre: "IIBB", pct: 3 },
      { nombre: "IVA", pct: 3 },
    ],
    facturaPor: "UNIDAD",
  },
  lineas: [
    { cantidad: 36, netoUnitario: 2580.57, subtotalImpreso: 92900.52, internoUnitario: 535.47 },
    { cantidad: 20, netoUnitario: 1279.37, subtotalImpreso: 25587.40, internoUnitario: 0 },
    { cantidad: 8, netoUnitario: 8892.27, subtotalImpreso: 71138.16, internoUnitario: 549.28 },
    { cantidad: 8, netoUnitario: 9546.63, subtotalImpreso: 76373.04, internoUnitario: 598.0 },
    { cantidad: 30, netoUnitario: 3170.07, subtotalImpreso: 95102.10, internoUnitario: 0 },
    { cantidad: 54, netoUnitario: 657.98, subtotalImpreso: 35530.92, internoUnitario: 0 },
    { cantidad: 3, netoUnitario: 10477.03, subtotalImpreso: 31431.09, internoUnitario: 0 },
  ],
  pie: { neto: 428063.23, iva: 89893.28, percIIBB: 12841.9, percIVA: 12841.9, interno: 28455.16, total: 572095.46 },
};

const DAS = {
  nombre: "DAS A 0021-00011125 (30/07/2026)",
  receta: {
    ivaPorLinea: false,
    alicuotaIvaPct: 21,
    tieneImpuestoInterno: false,
    ivaIncluyeInternoEnLaBase: false,
    percepciones: [{ nombre: "IVA", pct: 3 }],
    facturaPor: "UNIDAD",
  },
  lineas: [
    { cantidad: 3, netoUnitario: 24644.77, subtotalImpreso: 73934.32 },
    { cantidad: 3, netoUnitario: 30906.25, subtotalImpreso: 92718.75 },
    { cantidad: 2, netoUnitario: 57755.74, subtotalImpreso: 115511.49 },
  ],
  pie: { neto: 282164.57, iva: 59254.56, percIVA: 8464.94, total: 349884.06 },
};

// ── Que cierren ────────────────────────────────────────────────────────────

test("DYSSA CIERRA dentro de la tolerancia de un centavo", () => {
  const r = verificarComprobante(DYSSA);
  assert.equal(r.netoCentavos, aCentavos(DYSSA.pie.neto), "el neto tiene que dar el del pie");
  assert.equal(r.ivaCentavos, aCentavos(DYSSA.pie.iva), "el IVA tiene que dar el del pie");
  assert.equal(r.internoCentavos, aCentavos(DYSSA.pie.interno), "el impuesto interno tiene que dar el del pie");
  assert.equal(r.percepcionesCentavos, aCentavos(DYSSA.pie.percIIBB) + aCentavos(DYSSA.pie.percIVA));
  assert.equal(r.cierra, true, `no cerró: ${r.diferenciaCentavos} centavos`);
  assert.equal(Math.abs(r.diferenciaCentavos), 1, "cierra con exactamente un centavo, como el papel");
});

test("DAS CIERRA dentro de la tolerancia de un centavo", () => {
  const r = verificarComprobante(DAS);
  assert.equal(r.ivaCentavos, aCentavos(DAS.pie.iva));
  assert.equal(r.percepcionesCentavos, aCentavos(DAS.pie.percIVA));
  assert.equal(r.cierra, true, `no cerró: ${r.diferenciaCentavos} centavos`);
});

test("LA TOLERANCIA ES UN CENTAVO POR COMPROBANTE, no por línea", () => {
  // Si fuera por línea, una factura de cuarenta renglones podría acumular
  // cuarenta centavos y seguir "cerrando".
  assert.equal(TOLERANCIA_CENTAVOS, 1);
  const roto = { ...DAS, pie: { ...DAS.pie, total: DAS.pie.total + 0.05 } };
  assert.equal(verificarComprobante(roto).cierra, false, "cinco centavos no pueden pasar");
});

// ── EL IVA VA SOBRE EL NETO SOLO ───────────────────────────────────────────

test("EL IVA SE CALCULA SOBRE EL NETO, NO SOBRE NETO + IMPUESTO INTERNO", () => {
  // Medido en DYSSA, que es la única de las dos con impuesto interno. Con la
  // base equivocada el IVA daría 95.868,86 en vez de 89.893,28: casi seis mil
  // pesos de diferencia en una factura de quinientos mil.
  const conBaseMala = verificarComprobante({
    ...DYSSA,
    receta: { ...DYSSA.receta, ivaIncluyeInternoEnLaBase: true },
  });
  assert.notEqual(conBaseMala.ivaCentavos, aCentavos(DYSSA.pie.iva));
  assert.equal(conBaseMala.cierra, false, "con la base mal, el comprobante NO tiene que cerrar");
});

// ── EL SUBTOTAL IMPRESO MANDA ──────────────────────────────────────────────

test("EL SUBTOTAL SE TOMA COMO VIENE IMPRESO, no se recalcula", () => {
  // En DAS, dos de las tres líneas tienen el subtotal impreso un centavo
  // arriba de cantidad × unitario. Recalculando, el comprobante se va TRES
  // centavos y no cierra.
  const r = verificarComprobante(DAS);
  const desviadas = r.lineas.filter((l) => l.subtotalCentavos !== l.subtotalRecalculado);
  assert.equal(desviadas.length, 2, "las dos líneas de DAS que el proveedor redondea distinto");

  const recalculando = verificarComprobante({
    ...DAS,
    lineas: DAS.lineas.map(({ subtotalImpreso, ...resto }) => resto),
  });
  assert.equal(recalculando.cierra, false, "recalculando NO cierra");
  assert.equal(Math.abs(recalculando.diferenciaCentavos), 3, "se va tres centavos");
});

// ── NETO CONTRA FINAL: el candado que pediste ──────────────────────────────

test("EL COSTO RESULTANTE SE PARECE AL FINAL, NO AL NETO", () => {
  // La red contra el error invisible. Para cada línea de las dos facturas, el
  // final tiene que estar por encima del neto en la alícuota, y el detector
  // tiene que distinguirlos.
  for (const f of [DYSSA, DAS]) {
    const r = verificarComprobante(f);
    for (const [i, l] of r.lineas.entries()) {
      const neto = l.netoUnitarioCentavos;
      const final = l.finalUnitarioCentavos;
      assert.ok(final > neto, `${f.nombre} L${i + 1}: el final tiene que superar al neto`);

      // Alimentar la comparación con el FINAL: no parece neto.
      assert.equal(
        pareceNeto({ costoResultante: final / 100, netoUnitario: l.netoUnitarioCentavos / 100, receta: f.receta, internoUnitario: l.internoUnitarioCentavos / 100 }),
        false,
        `${f.nombre} L${i + 1}: el final no puede confundirse con el neto`
      );

      // Alimentarla con el NETO: el candado lo agarra.
      assert.equal(
        pareceNeto({ costoResultante: neto / 100, netoUnitario: l.netoUnitarioCentavos / 100, receta: f.receta, internoUnitario: l.internoUnitarioCentavos / 100 }),
        true,
        `${f.nombre} L${i + 1}: EL NETO TIENE QUE SER DETECTADO`
      );
    }
  }
});

test("el final de una línea con impuesto interno lo incluye", () => {
  // Primera línea de DYSSA: 2580,57 de neto + 535,47 de interno + 21 % del neto.
  const final = finalUnitarioCentavos({ netoUnitario: 2580.57, internoUnitario: 535.47, receta: DYSSA.receta });
  const esperado = aCentavos(2580.57) + aCentavos(535.47) + Math.round(aCentavos(2580.57) * 0.21);
  assert.equal(final, esperado);
  assert.ok(final > aCentavos(2580.57) + aCentavos(535.47), "el IVA también está adentro");
});

test("una línea sin impuesto interno solo suma IVA", () => {
  const final = finalUnitarioCentavos({ netoUnitario: 1279.37, receta: DYSSA.receta });
  assert.equal(final, aCentavos(1279.37) + Math.round(aCentavos(1279.37) * 0.21));
});

test("las percepciones NO entran en el costo unitario", () => {
  // Son pago a cuenta de otro impuesto y se reparten sobre el comprobante
  // entero. Si se decidiera lo contrario, este candado lo marca.
  const conPerc = finalUnitarioCentavos({ netoUnitario: 1000, receta: DAS.receta });
  const sinPerc = finalUnitarioCentavos({ netoUnitario: 1000, receta: { ...DAS.receta, percepciones: [] } });
  assert.equal(conPerc, sinPerc, "agregar percepciones a la receta no puede mover el costo unitario");
});

test("un comprobante sin impuestos también cierra: la receta no se impone", () => {
  // El mismo proveedor puede mandar uno sin impuestos, y eso avisa pero no
  // reescribe la receta. Acá se comprueba que la aritmética lo soporta.
  const simple = {
    receta: { ivaPorLinea: false, alicuotaIvaPct: 0, tieneImpuestoInterno: false, ivaIncluyeInternoEnLaBase: false, percepciones: [], facturaPor: "UNIDAD" },
    lineas: [{ cantidad: 2, netoUnitario: 100, subtotalImpreso: 200 }],
    pie: { total: 200 },
  };
  const r = verificarComprobante(simple);
  assert.equal(r.cierra, true);
  assert.equal(r.ivaCentavos, 0);
});

test("sin argumentos no explota", () => {
  const r = verificarComprobante();
  assert.equal(r.netoCentavos, 0);
  assert.equal(typeof r.cierra, "boolean");
});
