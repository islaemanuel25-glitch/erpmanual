// LA BOLETA DE DYSSA CIERRA, Y EL COSTO LLEVA TODO LO QUE COBRA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/boletaDyssaCierra.test.mjs
//
// ── LOS DOS DEFECTOS ──────────────────────────────────────────────────────
//
// 1. En Recetas de facturas el cartel decía "No cierra por $479.787,05". Es
//    Neto 10,5 + Neto 21: los renglones "Neto" del pie son la SUMA DE LOS
//    PRODUCTOS de cada alícuota y se sumaban como si fueran un cargo. Y el
//    rótulo decía "IVA 10.50% $95.887,53" con la suma de los dos IVA.
//
// 2. El costo era neto + IVA + interno, sin las percepciones. Regla de
//    Emanuel del 2026-10-08: el costo lleva TODO —"aunque sean pago a cuenta
//    es valor al producto"—, con el IVA de cada renglón a SU alícuota, la
//    percepción de IVA repartida por IVA, el IIBB por neto, y el interno por
//    unidad sin el descuento.
//
// ── DE DÓNDE SALEN LOS NÚMEROS ────────────────────────────────────────────
//
// La boleta es la de la foto, transcripta por Emanuel, con la forma que
// devuelve el lector: `boletaDyssa.fixture.json`. Los nueve costos esperados
// son los que dio él en la orden; acá se comprueba que el código los da, no se
// calculan con la misma fórmula del código.
//
// La lectura recorre el camino real: `normalizarLectura` → `pasarPorLaPuerta`
// → lo que la ruta de leer guarda en la base → `repartoDelPie` y
// `analizarPrecioDeLinea`, que es lo que propone el costo en la recepción.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { normalizarLectura } from "@/lib/compras-proveedor/comprobante/lector/contrato";
import { pasarPorLaPuerta, ESTADO } from "@/lib/compras-proveedor/comprobante/lector/puerta";
import { verificarComprobante, aCentavos } from "@/lib/compras-proveedor/comprobante/impuestos";
import { comoLoEntendio, textoDelResultado } from "@/lib/compras-proveedor/comprobante/pruebaDeExplicacion";
import { repartoDelPie } from "@/lib/compras-proveedor/comprobante/repartoDelPie";
import { analizarPrecioDeLinea } from "@/lib/compras-proveedor/comprobante/precioDeLinea";
import { resumenEnCriollo } from "@/lib/compras-proveedor/comprobante/recetaEnCriollo";
import { renglonesDeLaTarjeta } from "@/lib/compras-proveedor/tarjetaDeRecepcion";
import { esquemaDeSalida } from "@/lib/compras-proveedor/comprobante/lector/promptDesdeReceta";

const CRUDA = JSON.parse(fs.readFileSync(new URL("./boletaDyssa.fixture.json", import.meta.url), "utf8"));

// ── LA RECETA, LEÍDA DE LA MIGRACIÓN Y NO ESCRITA DE MEMORIA ────────────────
//
// Las percepciones se sacan del SQL que corre en producción. Si alguien cambia
// la migración, este candado prueba lo que cambió.
const SQL = fs.readFileSync(
  new URL("../../../prisma/migrations/20261008120000_receta_dyssa_iva_por_renglon/migration.sql", import.meta.url),
  "utf8"
);
const PERCEPCIONES_DE_LA_MIGRACION = JSON.parse(SQL.match(/'(\[\{"nombre".*?\}\])'::jsonb/)[1]);
const RECETA_DYSSA = {
  ivaPorLinea: true,
  alicuotaIvaPct: 21,
  tieneImpuestoInterno: true,
  ivaIncluyeInternoEnLaBase: false,
  percepciones: PERCEPCIONES_DE_LA_MIGRACION,
  percepcionesEnCosto: true,
  facturaPor: "UNIDAD",
};

const lectura = () => normalizarLectura(CRUDA);

/** Lo que guarda la ruta de leer: el mismo mapeo de columnas que `leer/[id]/route.js`. */
function comprobanteGuardado() {
  const r = pasarPorLaPuerta({ lectura: lectura(), receta: RECETA_DYSSA, recetaVersion: 2 });
  return {
    ...r.aGuardar,
    lineas: lectura().lineas.map((l, i) => ({
      orden: i + 1,
      textoCrudo: l.descripcion,
      codigoProveedor: l.codigoProveedor,
      cantidad: l.cantidad,
      netoUnitario: l.netoUnitario,
      subtotalImpreso: l.subtotalImpreso,
      internoUnitario: l.internoUnitario,
      pesoKg: l.peso ?? null,
      bonificacionPct: l.bonificacion ?? null,
      ivaPct: l.alicuotaIva ?? null,
    })),
  };
}

/** Los nueve, en el orden del papel. `null` = bonificado, no escribe costo. */
const COSTO_ESPERADO = [4023.07, 1739.84, 1539.13, 13190.5, 11775.1, 1784.84, 13358.21, 13358.21, null];

// ── DEFECTO 1: EL PIE ───────────────────────────────────────────────────────

test("LA BOLETA CIERRA: un centavo de diferencia, dentro de la tolerancia", () => {
  const r = pasarPorLaPuerta({ lectura: lectura(), receta: RECETA_DYSSA });
  assert.equal(r.estado, ESTADO.CARGADO, r.porque);
  assert.equal(r.cierra, true);
  assert.equal(Math.abs(r.diferenciaCentavos), 1, "cierra por el centavo de redondeo del proveedor");
  assert.equal(r.proponeCostos, true);
});

test("LOS NETOS DEL PIE SON BASES: no se suman, se controlan contra su alícuota", () => {
  const v = verificarComprobante({ lineas: lectura().lineas, pie: lectura().pie, receta: RECETA_DYSSA });
  assert.equal(v.percepcionesCentavos, 1679255 + 69539 + 1300282, "solo las tres percepciones son cargos");
  assert.ok(
    !v.conceptosSumados.some((c) => /neto/i.test(c.nombre)),
    "ningún Neto entra en la cuenta del cartel"
  );
  const base = (alicuota) => v.bases.find((b) => b.alicuotaPct === alicuota);
  assert.equal(base(10.5).impresoCentavos, 4635960);
  assert.equal(base(10.5).sumaCentavos, 4635960, "Neto 10,5 = la harina");
  assert.equal(base(21).sumaCentavos, 43342746, "Neto 21 = el resto");
  assert.ok(v.bases.every((b) => b.cierra));
});

test("CADA IVA CON SU ALÍCUOTA, POR SEPARADO", () => {
  const v = verificarComprobante({ lineas: lectura().lineas, pie: lectura().pie, receta: RECETA_DYSSA });
  const ivas = v.conceptosSumados.filter((c) => /^iva/i.test(c.nombre));
  assert.deepEqual(
    ivas.map((c) => [c.nombre, c.importe]),
    [["IVA 10.50%", 4867.76], ["IVA 21.00%", 91019.77]]
  );
  assert.ok(!v.conceptosSumados.some((c) => c.importe === 95887.53), "la suma de los dos no se rotula con una alícuota");
  // Y la alícuota de cada renglón da exactamente su IVA impreso.
  const ivaDe = (alicuota) => v.lineas.filter((l) => l.alicuotaPct === alicuota).reduce((a, l) => a + l.ivaLineaCentavos, 0);
  assert.equal(ivaDe(10.5), 486776);
  assert.equal(ivaDe(21), 9101977);
});

test("EL CARTEL DE RECETAS DE FACTURAS DICE QUE CIERRA, Y NOMBRA LA CUENTA SIN LOS NETOS", () => {
  const r = comoLoEntendio({ lectura: lectura(), receta: RECETA_DYSSA });
  assert.equal(r.cierra, true);
  const t = textoDelResultado(r);
  assert.equal(t.tono, "ok");
  assert.match(t.titulo, /cierra en \$633686\.4/);
  assert.doesNotMatch(t.detalle, /Neto/);
  assert.match(t.detalle, /IVA 10\.50% \$4867\.76/);
});

// ── DEFECTO 2: EL COSTO ─────────────────────────────────────────────────────

test("LOS NUEVE COSTOS DE LA RECEPCIÓN, CON TODO ADENTRO", () => {
  const c = comprobanteGuardado();
  const reparto = repartoDelPie(c);
  const producto = { precio_costo: 1000, factor_pack: 1, unidad_medida: "UNIDAD" };
  const costos = c.lineas.map((l) => {
    const a = analizarPrecioDeLinea({
      linea: l,
      producto,
      receta: c.recetaUsada,
      percepcionDeLaLinea: reparto.get(l.orden),
    });
    return a.bonificado ? null : a.precioFinal;
  });
  assert.deepEqual(costos, COSTO_ESPERADO);
});

test("Y LA PANTALLA DE RECETAS DICE LOS MISMOS NUEVE", () => {
  const r = comoLoEntendio({ lectura: lectura(), receta: RECETA_DYSSA });
  assert.deepEqual(r.productos.map((p) => (p.bonificado ? null : p.costoUnitario)), COSTO_ESPERADO);
});

test("LOS RENGLONES SUMAN 633.686,39: el papel menos su centavo de redondeo", () => {
  const v = verificarComprobante({ lineas: lectura().lineas, pie: lectura().pie, receta: RECETA_DYSSA });
  const suma = v.lineas.reduce(
    (a, l) => a + l.subtotalCentavos + l.ivaLineaCentavos + l.percepcionLineaCentavos + l.internoLineaCentavos,
    0
  );
  assert.equal(suma, 63368639);
});

test("LA PERCEPCIÓN DE IVA SE REPARTE POR IVA: la harina carga la mitad que un renglón del 21", () => {
  // Contraprueba del reparto por neto: con el mismo neto, la harina recibiría
  // la misma percepción de IVA que un renglón del 21. Por IVA recibe la mitad,
  // que es lo que cobra RG 5329 (1,5 % contra 3 %).
  const v = verificarComprobante({ lineas: lectura().lineas, pie: lectura().pie, receta: RECETA_DYSSA });
  const harina = v.lineas[5];
  const iibbHarina = Math.round((4635960 / 47978706) * 1679255);
  assert.equal(harina.percepcionLineaCentavos - iibbHarina, 69539, "a la harina le toca exactamente la del 10,5");
});

test("EL INTERNO DEL GANCIA VA ENTERO, SIN EL DESCUENTO", () => {
  const v = verificarComprobante({ lineas: lectura().lineas, pie: lectura().pie, receta: RECETA_DYSSA });
  const gancia = v.lineas[4];
  assert.equal(gancia.internoUnitarioCentavos, 60147);
  assert.equal(gancia.internoLineaCentavos, 8 * 60147, "8 × 601,47, no 8 × 601,47 × 0,9");
  // El descuento está en el neto, no en el interno.
  assert.equal(gancia.subtotalCentavos, 7010906);
  assert.equal(
    gancia.finalUnitarioCentavos - Math.round((gancia.subtotalCentavos + gancia.ivaLineaCentavos + gancia.percepcionLineaCentavos) / 8),
    60147
  );
});

test("EL BONIFICADO ENTRA SIN PISAR EL COSTO: no hay precio que escribir, y la línea lo dice", () => {
  const c = comprobanteGuardado();
  const lemon = c.lineas[8];
  const a = analizarPrecioDeLinea({
    linea: lemon,
    producto: { precio_costo: 2500, factor_pack: 1, unidad_medida: "UNIDAD" },
    receta: c.recetaUsada,
    percepcionDeLaLinea: repartoDelPie(c).get(lemon.orden),
  });
  assert.equal(a.bonificado, true);
  assert.equal(a.precioAEscribir, null, "un cero acá le rompería el margen");
  assert.equal(a.precioFinal, null);
  assert.equal(a.costoAnterior, 2500, "conserva el que tenía");
  // La tarjeta de la recepción dice "bonificado" donde iría el importe.
  const r = renglonesDeLaTarjeta({ bonificado: true, costoFactura: null, costoCatalogo: 2500 });
  assert.equal(r.papel.bonificado, true);
  assert.equal(r.erp, null, "sin precio del papel no hay comparación");
});

test("LA VERIFICACIÓN DE RENGLONES APLICA EL DESCUENTO: el Gancia y el Dr. Lemon no dan falso error", () => {
  const r = pasarPorLaPuerta({ lectura: lectura(), receta: RECETA_DYSSA });
  assert.deepEqual(r.lineasIncoherentes ?? [], []);
});

// ── LA RECETA ───────────────────────────────────────────────────────────────

test("LA RECETA DE LA MIGRACIÓN CIERRA SOLA, CON UN PIE QUE NO IMPRIME LAS PERCEPCIONES", () => {
  // Las percepciones de la receta son el respaldo. Con el pie sin conceptos
  // tienen que dar los tres importes impresos: 3 % del Neto 21, 1,5 % del
  // Neto 10,5 y 3,5 % del neto total.
  const pieSinConceptos = { ...lectura().pie, conceptos: [] };
  const v = verificarComprobante({ lineas: lectura().lineas, pie: pieSinConceptos, receta: RECETA_DYSSA });
  assert.deepEqual(
    v.percepciones.map((p) => p.importeCentavos),
    [1300282, 69539, 1679255]
  );
  assert.equal(v.cierra, true);
  // Y los costos dan los mismos nueve.
  assert.deepEqual(v.lineas.map((l) => (l.bonificado ? null : l.finalUnitarioCentavos / 100)), COSTO_ESPERADO);
});

test("LA RECETA DICE TRES PERCEPCIONES, Y EL LECTOR PIDE LA ALÍCUOTA DE CADA RENGLÓN", () => {
  assert.match(resumenEnCriollo(RECETA_DYSSA), /3 percepciones/);
  const linea = esquemaDeSalida(RECETA_DYSSA).properties.lineas.items;
  assert.equal(linea.properties.alicuotaIva?.nullable, true);
  assert.ok(!linea.required.includes("alicuotaIva"), "un campo obligatorio es una orden de inventar");
  assert.ok(linea.properties.bonificacion, "el descuento se lee por renglón");
  assert.ok(linea.properties.internoImpreso, "y el interno también");
});

test("LA MIGRACIÓN BUSCA A DYSSA POR IGUALDAD EXACTA Y SUBE LA VERSIÓN", () => {
  const sinComentarios = SQL.replace(/--[^\n]*/g, "");
  assert.match(sinComentarios, /p\.nombre = 'Dyssa'/);
  assert.doesNotMatch(sinComentarios, /\bLIKE\b|ILIKE/i);
  assert.match(sinComentarios, /"version" = "RecetaProveedor"\."version" \+ 1/);
  assert.doesNotMatch(sinComentarios, /explicacion/, "la explicación en palabras es de Emanuel");
});

// ── LOS OTROS PROVEEDORES ───────────────────────────────────────────────────

const RECETA_MAURO = {
  ivaPorLinea: false, alicuotaIvaPct: 0, tieneImpuestoInterno: false, ivaIncluyeInternoEnLaBase: false,
  percepciones: [], percepcionesEnCosto: true, facturaPor: "UNIDAD",
};
const LINEAS_MAURO = [[40, 3360, 134400], [130, 2250, 292500], [60, 5250, 315000], [100, 4650, 465000], [200, 3650, 730000]]
  .map(([cantidad, netoUnitario, subtotalImpreso], i) => ({ orden: i + 1, cantidad, netoUnitario, subtotalImpreso, bonificacion: 0 }));

test("MAURO NO CAMBIA: el precio ya trae el IVA y el costo es el impreso", () => {
  const producto = { precio_costo: 1000, factor_pack: 1, unidad_medida: "UNIDAD" };
  const costos = LINEAS_MAURO.map((l) => analizarPrecioDeLinea({ linea: l, producto, receta: RECETA_MAURO }).precioFinal);
  assert.deepEqual(costos, [3360, 2250, 5250, 4650, 3650]);
  const v = verificarComprobante({ lineas: LINEAS_MAURO, pie: {}, receta: RECETA_MAURO });
  assert.deepEqual(v.lineas.map((l) => l.finalUnitarioCentavos), [336000, 225000, 525000, 465000, 365000]);
  assert.equal(v.ivaCentavos, 0);
});

const RECETA_DAS = {
  ivaPorLinea: false, alicuotaIvaPct: 21, tieneImpuestoInterno: false, ivaIncluyeInternoEnLaBase: false,
  percepciones: [{ nombre: "IVA", pct: 3 }], facturaPor: "UNIDAD",
};
const DAS = {
  lineas: [
    { orden: 1, cantidad: 3, netoUnitario: 24644.77, subtotalImpreso: 73934.32 },
    { orden: 2, cantidad: 6, netoUnitario: 12322.39, subtotalImpreso: 73934.33 },
    { orden: 3, cantidad: 2, netoUnitario: 18963.64, subtotalImpreso: 37927.28 },
  ],
  pie: { neto: 185795.93, iva: 39017.15, total: 230386.96, percepciones: [{ nombre: "IVA", importe: 5573.88 }] },
};

test("DAS NO CAMBIA LA CUENTA: cierra con el mismo IVA, la misma percepción y la misma diferencia", () => {
  // Medido contra el código anterior a esta tanda, con este mismo papel: cierra
  // con diferencia 0, IVA 39.017,15 y percepción 5.573,88.
  const v = verificarComprobante({ lineas: DAS.lineas, pie: DAS.pie, receta: RECETA_DAS });
  assert.equal(v.cierra, true);
  assert.equal(v.diferenciaCentavos, 0);
  assert.equal(v.ivaCentavos, 3901715);
  assert.equal(v.percepcionesCentavos, 557388);
});

test("DAS: el costo se mueve como mucho UN CENTAVO, por redondear por renglón", () => {
  // Medido contra el código anterior a esta tanda, con este mismo papel:
  // 30.559,51 · 15.279,76 · 23.514,91. Ahora da 30.559,52 · 15.279,76 ·
  // 23.514,92. La fórmula decidida suma IVA y percepción POR RENGLÓN y recién
  // después divide; el código anterior redondeaba el neto y el IVA por unidad.
  // En el tercero: IVA del renglón 7.964,73, contra 2 × 3.982,36 = 7.964,72.
  // Es la única diferencia y está acotada acá: la cuenta del papel no cambia.
  const ANTES = [30559.51, 15279.76, 23514.91];
  const comprobante = { recetaUsada: RECETA_DAS, totalLeido: DAS.pie.total, ivaLeido: DAS.pie.iva, lineas: DAS.lineas };
  const reparto = repartoDelPie(comprobante);
  const producto = { precio_costo: 1000, factor_pack: 1, unidad_medida: "UNIDAD" };
  const ahora = DAS.lineas.map(
    (l) => analizarPrecioDeLinea({ linea: l, producto, receta: RECETA_DAS, percepcionDeLaLinea: reparto.get(l.orden) }).precioFinal
  );
  ahora.forEach((c, i) => assert.ok(Math.abs(aCentavos(c) - aCentavos(ANTES[i])) <= 1, `renglón ${i + 1}: ${c} contra ${ANTES[i]}`));
});
