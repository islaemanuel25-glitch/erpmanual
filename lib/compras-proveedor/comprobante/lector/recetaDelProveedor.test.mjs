// Candados de la receta que va del proveedor al lector, y de la fecha del papel.

import { test } from "node:test";
import assert from "node:assert/strict";

import { recetaDelProveedor, fechaLeidaONull } from "./recetaDelProveedor.js";
import { RECETA_POR_DEFECTO, verificarComprobante } from "../impuestos.js";
import { elegirLector, lectoresRegistrados } from "./index.js";

// ── El registro se llena solo al importar el índice ────────────────────────

test("IMPORTAR EL ÍNDICE ALCANZA: el registro no queda vacío", () => {
  // La trampa que este archivo existe para evitar: si una ruta importara
  // `elegirLector` de contrato.js, el registro estaría VACÍO —nadie habría
  // importado gemini.js— y el módulo diría "no hay ningún lector configurado"
  // con la configuración perfectamente puesta.
  assert.ok(lectoresRegistrados().includes("gemini"), lectoresRegistrados().join(","));
  assert.equal(elegirLector({ nombre: "gemini", env: { GEMINI_API_KEY: "x" } }).ok, true);
});

// ── La receta ──────────────────────────────────────────────────────────────

test("sin receta propia se usa la genérica, Y SE NOTA", () => {
  // Que se note es el punto: es la señal de que hay que cargarle la receta al
  // proveedor. Una genérica silenciosa haría que nadie se enterara nunca.
  const r = recetaDelProveedor(null);
  assert.deepEqual(r.receta, { ...RECETA_POR_DEFECTO });
  assert.equal(r.version, null);
  assert.equal(r.esGenerica, true);
});

test("LOS DECIMAL DE PRISMA SE CONVIERTEN A NÚMERO", () => {
  // Prisma devuelve los Decimal como objeto. Sin el Number, la alícuota se
  // concatenaría como texto en vez de sumarse, y el desvío sería del tamaño del
  // IVA — que es justo el error que impuestos.js existe para impedir.
  const filaConDecimalDePrisma = {
    ivaPorLinea: false,
    alicuotaIvaPct: { toString: () => "21", valueOf: () => "21" }, // como llega de Prisma
    tieneImpuestoInterno: false,
    ivaIncluyeInternoEnLaBase: false,
    percepciones: [],
    percepcionesEnCosto: true,
    facturaPor: "UNIDAD",
    version: 3,
  };
  const { receta, version, esGenerica } = recetaDelProveedor(filaConDecimalDePrisma);
  assert.equal(typeof receta.alicuotaIvaPct, "number");
  assert.equal(receta.alicuotaIvaPct, 21);
  assert.equal(version, 3);
  assert.equal(esGenerica, false);
});

test("la receta convertida SIRVE de verdad para verificar", () => {
  // No alcanza con que los campos estén: tienen que funcionar en la cuenta. Se
  // ejerce con una línea real de DAS.
  const { receta } = recetaDelProveedor({
    ivaPorLinea: false,
    alicuotaIvaPct: "21",
    tieneImpuestoInterno: false,
    ivaIncluyeInternoEnLaBase: false,
    percepciones: [{ nombre: "IVA", pct: 3 }],
    percepcionesEnCosto: true,
    facturaPor: "UNIDAD",
    version: 1,
  });
  const v = verificarComprobante({
    lineas: [
      { cantidad: 3, netoUnitario: 24644.77, subtotalImpreso: 73934.32 },
      { cantidad: 6, netoUnitario: 12322.39, subtotalImpreso: 73934.33 },
      { cantidad: 2, netoUnitario: 18963.64, subtotalImpreso: 37927.28 },
    ],
    pie: { neto: 185795.93, iva: 39017.15, total: 230386.96, percIVA: 5573.88 },
    receta,
  });
  assert.equal(v.cierra, true, `difiere ${v.diferenciaCentavos} centavos`);
});

test("percepciones que no son lista no rompen la cuenta", () => {
  const { receta } = recetaDelProveedor({ percepciones: null, alicuotaIvaPct: "21" });
  assert.deepEqual(receta.percepciones, []);
});

// ── La fecha del papel ─────────────────────────────────────────────────────

test("una fecha ilegible queda en null, NUNCA en hoy", () => {
  // Un fallback a "hoy" sería peor que un null: la fecha del comprobante decide
  // en qué período cae la compra.
  for (const v of ["", null, undefined, "no se lee", "31/31/2026", "abc"]) {
    assert.equal(fechaLeidaONull(v), null, String(v));
  }
});

test("UNA FECHA ABSURDA TAMBIÉN SE RECHAZA", () => {
  // 1900 o 2999 salen de un dígito mal leído en el año, y entrarían sin que
  // nada las mirara: son fechas válidas para `new Date`.
  assert.equal(fechaLeidaONull("1900-08-10"), null);
  assert.equal(fechaLeidaONull("2999-08-10"), null);
  assert.equal(fechaLeidaONull("0202-08-10"), null);
});

test("una fecha buena pasa", () => {
  const d = fechaLeidaONull("2026-08-10");
  assert.ok(d instanceof Date);
  assert.equal(d.toISOString().slice(0, 10), "2026-08-10");
});
