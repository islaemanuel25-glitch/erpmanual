// EL PIE DEL PAPEL SE LEE ENTERO, Y EL CONTROL USA LO IMPRESO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/conceptosDelPie.test.mjs
//
// ── EL CASO, MEDIDO EN PRODUCCIÓN EL 2026-09-22 ──────────────────────────
//
// Arcor, comprobante 17 del pedido 245. Veinte renglones que suman $412.877,48
// sin IVA; el papel dice $511.968,28. Lo guardado: neto $412.877,64, IVA
// $86.704,30, **percepciones NULL**, total $511.968,28.
//
//   412.877,64 + 86.704,30 = 499.581,94
//   511.968,28 − 499.581,94 = 12.386,34   ← la percepción de IVA impresa
//
// No fue un error de lectura: el esquema de salida pedía las percepciones SOLO
// si la receta estructurada del proveedor las tenía cargadas, y la de Arcor las
// tiene vacías —aunque su explicación en castellano las nombra, "PERC. IVA 5329
// y PER. IIBB"—. Al modelo nunca se le preguntó.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  conceptosDelPie,
  esElIva,
  textoDeLaCuentaDelPie,
} from "@/lib/compras-proveedor/comprobante/conceptosDelPie";
import { verificarComprobante, TOLERANCIA_TOTAL_CENTAVOS } from "@/lib/compras-proveedor/comprobante/impuestos";
import { esquemaDeSalida, instruccionesDesdeReceta } from "@/lib/compras-proveedor/comprobante/lector/promptDesdeReceta";
import { formatearMoneda } from "@/lib/moneda";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/** La receta estructurada de Arcor, tal como está guardada: SIN percepciones. */
const ARCOR = {
  facturaPor: "UNIDAD",
  ivaPorLinea: false,
  alicuotaIvaPct: 21,
  percepciones: [],
  percepcionesEnCosto: true,
  tieneImpuestoInterno: false,
  ivaIncluyeInternoEnLaBase: false,
};

/** El pie impreso del #245, con los cuatro conceptos que trae. */
const PIE_DEL_245 = {
  neto: 412877.64,
  iva: 86704.3,
  total: 511968.28,
  conceptos: [
    { nombre: "IVA 21%", importe: 86704.3 },
    { nombre: "PERC. IVA 5329", importe: 12386.34 },
  ],
};

/** Dos renglones que suman lo mismo que los veinte, para no copiar veinte. */
const LINEAS = [
  { cantidad: 1, netoUnitario: 5067.623, subtotalImpreso: 5067.62, bonificacion: 0 },
  { cantidad: 3, netoUnitario: 5067.623, subtotalImpreso: 15202.87, bonificacion: 0 },
  { cantidad: 1, netoUnitario: 392606.99, subtotalImpreso: 392606.99, bonificacion: 0 },
];

test("EL ESQUEMA PIDE LOS CONCEPTOS DEL PIE SIEMPRE, SIN MIRAR LA RECETA", () => {
  // ── LA CAUSA, AFIRMADA DONDE VIVE ───────────────────────────────────
  //
  // Con `percepciones: []` el esquema no tenía ninguna propiedad donde poner la
  // percepción impresa. Ahora la tiene, y no depende de nada configurado.
  const esquema = esquemaDeSalida(ARCOR);
  const pie = esquema.properties.pie;
  assert.ok(pie.properties.conceptos, "el esquema no pide los conceptos del pie");
  assert.equal(pie.properties.conceptos.type, "array");
  assert.deepEqual(pie.properties.conceptos.items.required, ["nombre", "importe"]);
  assert.ok(pie.properties.conceptos.items.properties.resta, "no se puede marcar un descuento");

  // CONTRAPRUEBA: el código ya no condiciona la lista a la receta.
  const prompt = codigoDe("lib/compras-proveedor/comprobante/lector/promptDesdeReceta.js");
  assert.ok(
    !/if \(receta\.percepciones\.length\) \{\s*propiedadesPie\.percepciones/.test(prompt),
    "volvió el esquema que solo pide percepciones si la receta las tiene cargadas"
  );
});

test("Y LA INSTRUCCIÓN DEL PIE ES FIJA, NO SALE DE LA EXPLICACIÓN", () => {
  const texto = instruccionesDesdeReceta(ARCOR, { proveedorNombre: "Arcor" });
  assert.match(texto, /EL PIE DEL PAPEL SE TRANSCRIBE ENTERO/);
  assert.match(texto, /percepción de IVA/);
  assert.match(texto, /IIBB/);
  assert.match(texto, /impuestos internos/);
  assert.match(texto, /con su nombre TAL CUAL está impreso/);
  assert.match(texto, /No inventes ninguno/);
});

test("EL #245 CIERRA CON LA PERCEPCIÓN IMPRESA, Y NO SIN ELLA", () => {
  const conPercepcion = verificarComprobante({ lineas: LINEAS, pie: PIE_DEL_245, receta: ARCOR });
  assert.equal(conPercepcion.cierra, true, "no cierra con el pie completo");
  // −16 centavos, no cero, y es un dato del papel real: los veinte renglones
  // suman $412.877,48 y el SUBTOTAL impreso dice $412.877,64. Esos 16 centavos
  // son del proveedor y entran holgados en la tolerancia de un peso.
  assert.equal(conPercepcion.diferenciaCentavos, -16);
  assert.equal(TOLERANCIA_TOTAL_CENTAVOS, 100);

  // CONTRAPRUEBA: sin los conceptos —como venía— falta la percepción, y la
  // diferencia es **−$12.386,53**: exactamente el número que la pantalla le
  // mostró a Emanuel. No son los $12.386,34 impresos porque el IVA también se
  // calculaba por la alícuota sobre la suma de los renglones (86.704,27) en vez
  // de tomar el impreso (86.704,30): 19 centavos de diferencia entre las dos
  // formas de llegar al mismo IVA.
  const { conceptos, ...sinConceptos } = PIE_DEL_245;
  const viejo = verificarComprobante({ lineas: LINEAS, pie: sinConceptos, receta: ARCOR });
  assert.equal(viejo.cierra, false);
  assert.equal(viejo.diferenciaCentavos, -1238653);
});

test("«PERC. IVA» NO ES EL IVA, Y LA DIFERENCIA IMPORTA", () => {
  // Si se contara como IVA, el IVA quedaría contado dos veces en el costo.
  assert.equal(esElIva("IVA 21%"), true);
  assert.equal(esElIva("I.V.A. 10,5"), true);
  assert.equal(esElIva("PERC. IVA 5329"), false);
  assert.equal(esElIva("RETENC. IVA"), false);
  assert.equal(esElIva("PER. IIBB"), false);
  assert.equal(esElIva("IMP. INTERNOS"), false);

  const c = conceptosDelPie(PIE_DEL_245);
  assert.equal(c.hay, true);
  assert.equal(c.ivaCentavos, 8670430);
  assert.equal(c.otrosCentavos, 1238634, "la percepción se contó como IVA");
});

test("UN DESCUENTO DEL PIE RESTA", () => {
  const pie = {
    total: 1000,
    conceptos: [
      { nombre: "IVA 21%", importe: 210 },
      { nombre: "DESCUENTO", importe: 210, resta: true },
    ],
  };
  const c = conceptosDelPie(pie);
  assert.equal(c.descuentosCentavos, 21000);
  // Y un importe negativo impreso dice lo mismo sin la marca.
  const negativo = conceptosDelPie({ conceptos: [{ nombre: "DESCUENTO", importe: -210 }] });
  assert.equal(negativo.descuentosCentavos, 21000);

  const v = verificarComprobante({
    lineas: [{ cantidad: 1, netoUnitario: 1000, subtotalImpreso: 1000, bonificacion: 0 }],
    pie,
    receta: ARCOR,
  });
  assert.equal(v.totalCalculadoCentavos, 100000, "el descuento no restó");
  assert.equal(v.cierra, true);
});

test("SIN CONCEPTOS IMPRESOS MANDA LA RECETA, COMO HASTA HOY", () => {
  // El papel que no trae el pie desglosado —o una lectura vieja, guardada antes
  // de esta tanda— se sigue verificando con las alícuotas configuradas.
  const v = verificarComprobante({
    lineas: [{ cantidad: 1, netoUnitario: 1000, subtotalImpreso: 1000, bonificacion: 0 }],
    pie: { total: 1210 },
    receta: ARCOR,
  });
  assert.equal(v.ivaCentavos, 21000, "dejó de calcular el IVA por la alícuota de la receta");
  assert.equal(v.cierra, true);
});

test("EL CARTEL DICE LA MISMA CUENTA QUE HIZO EL CONTROL", () => {
  // Decía "los productos suman $412.877,48 y el papel dice $511.968,28" —que
  // son $99.090,80— arriba de un "no cierra por $12.386,53". Dos cuentas
  // distintas en el mismo cartel.
  const texto = textoDeLaCuentaDelPie({
    suma: 412877.64,
    conceptos: conceptosDelPie(PIE_DEL_245),
    total: 511968.28,
    moneda: formatearMoneda,
  });
  assert.match(texto, /los productos suman \$412\.877,64/);
  assert.match(texto, /más IVA 21% \$86\.704,30/);
  assert.match(texto, /más PERC\. IVA 5329 \$12\.386,34/);
  assert.match(texto, /el papel dice \$511\.968,28/);
});

test("LA PERCEPCIÓN SE REPARTE EN EL COSTO, CON EL MOTOR QUE YA ESTÁ", () => {
  // Decisión de agosto: el costo lleva IVA, percepciones, IIBB e internos
  // adentro, repartidos en proporción al neto de cada renglón y con el resto de
  // redondeo en el de mayor neto. No se escribió un motor nuevo: se le pasan
  // los importes IMPRESOS al que ya hacía eso con los porcentajes de la receta.
  const v = verificarComprobante({ lineas: LINEAS, pie: PIE_DEL_245, receta: ARCOR });
  const repartido = v.lineas.reduce((a, l) => a + l.percepcionLineaCentavos, 0);
  assert.equal(repartido, 1238634, "la percepción repartida no da la impresa");
  // El resto de redondeo va al renglón de mayor neto.
  const mayor = v.lineas.reduce((a, l) => (l.subtotalCentavos > a.subtotalCentavos ? l : a));
  assert.ok(mayor.percepcionLineaCentavos > 0);
  // Y el unitario final la lleva adentro.
  assert.ok(v.lineas[0].finalUnitarioCentavos > v.lineas[0].finalSinPercepcionCentavos);
});

test("LOS CONCEPTOS LLEGAN DESDE LA PUERTA AL VERIFICADOR", () => {
  // ── LA MITAD QUE FALTABA, ENCONTRADA RELEYENDO DE VERDAD ────────────
  //
  // El lector leyó los cuatro conceptos del papel de Arcor y se guardaron bien
  // —"PERC. IVA 5329 $12.386,34" está en la base— y el comprobante SEGUÍA sin
  // cerrar por los mismos $12.386,53. `piePlano` aplanaba el pie a cuatro
  // números antes de dárselo al verificador, así que la lista se perdía justo
  // en el último paso.
  const puerta = codigoDe("lib/compras-proveedor/comprobante/lector/puerta.js");
  assert.match(puerta, /conceptos: Array\.isArray\(p\.conceptos\) \? p\.conceptos : \[\]/);
  // Y el contrato del lector los normaliza en vez de tirarlos.
  const contrato = codigoDe("lib/compras-proveedor/comprobante/lector/contrato.js");
  assert.match(contrato, /conceptos: \(Array\.isArray\(pie\.conceptos\)/);
  // Y se guardan, para que una corrección no vuelva a verificar sin ellos.
  assert.match(puerta, /conceptosDelPieLeidos: Array\.isArray\(l\.pie\?\.conceptos\)/);
});
