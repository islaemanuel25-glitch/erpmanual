// UN PDF CON CUATRO FACTURAS SE LEE COMO CUATRO, POR SU TEXTO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/arcor582.test.mjs
//
// ── EL CASO (Emanuel, 2026-11-10 ~14:58, pedido #582) ─────────────────────
//
// `arcor582.fixture.pdf` es el archivo real del comprobante 81 —«Isla.pdf», de
// Ros ArC SRL, "Microsoft Print To PDF"—, el mismo hash que el guardado. Cuatro
// facturas B, una por página:
//
//   00371634  14 renglones  $842.488,58
//   00371635   5 renglones  $125.796,71
//   00371636   7 renglones  $667.991,14
//   00371637   2 renglones  $132.602,99      total $1.768.879,42
//
// Se leía entero, como un papel, y volvía con cero productos aun con el lector
// grande. Lo que decidió Emanuel, y lo que este candado ata:
//   · el PDF se parte en hojas, una por página, y cada una cierra contra su
//     propio total (`hojasDelPdf.js`, `agruparHojas`);
//   · si el PDF trae texto se lee el texto, con las columnas en su lugar
//     (`textoDelPapel.js`): el IMPORTE vacío queda vacío;
//   · si falta el IMPORTE, sale de cantidad × precio unitario y se valida contra
//     el total, con el redondeo de los tres decimales (`completarElRenglon`);
//   · los regalos a precio simbólico entran al stock y no tocan el costo
//     (`esPrecioSimbolico`).
//
// Lo que hace el modelo —pasar el texto a renglones— acá lo hace `renglonesDelTexto`,
// con la forma exacta de su respuesta y sin `costoFinal`, que es el peor caso:
// un lector que no dio ninguno. Las dos fichas de los regalos son las de la base.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { partirPdfEnHojas } from "./hojasDelPdf.js";
import { agruparHojas } from "./agruparHojas.js";
import { textoDelPdf, ENCABEZADO_DEL_TEXTO } from "./lector/textoDelPapel.js";
import { normalizarLectura } from "./lector/contrato.js";
import { verificarLecturaInterpretada } from "./lector/lecturaInterpretada.js";
import { analizarPrecioDeLinea, esPrecioSimbolico } from "./precioDeLinea.js";

/** Un número impreso a la argentina —"6.968,536", "842.488,58"— como lo copia el lector. */
const numeroDeLista = (texto) => Number(String(texto).replace(/\./g, "").replace(",", "."));

const PDF = fs.readFileSync(new URL("./arcor582.fixture.pdf", import.meta.url));

const FACTURAS = [
  { numero: "00371634", renglones: 14, total: 842488.58 },
  { numero: "00371635", renglones: 5, total: 125796.71 },
  { numero: "00371636", renglones: 7, total: 667991.14 },
  { numero: "00371637", renglones: 2, total: 132602.99 },
];

/**
 * Los renglones de la tabla, como los devolvería el lector: código, cantidad,
 * en qué viene, descripción, precio impreso (tres decimales) y el importe solo
 * si está impreso (dos decimales).
 */
function renglonesDelTexto(texto) {
  const filas = texto.split("\n");
  const desde = filas.findIndex((f) => /\bARTICULO\b.*\bCANTIDAD\b/.test(f));
  const hasta = filas.findIndex((f, i) => i > desde && /\bSUBTOTAL\b/.test(f));
  const total = numeroDeLista(filas[hasta + 1].trim().split(/\s+/).at(-1));
  const lineas = filas.slice(desde + 1, hasta).map((f) => {
    const m = f.trim().match(/^(\d+)\s+(\d+)\s+(DI|UN)\s+(.+?)\s{2,}(\d[\d.]*,\d{3})(?:\s+(\d[\d.]*,\d{2}))?$/);
    assert.ok(m, `renglón que no se entiende: «${f}»`);
    return {
      codigoProveedor: m[1],
      cantidad: Number(m[2]),
      enQueViene: m[3],
      descripcion: m[4].replace(/\s+/g, " "),
      precioImpreso: numeroDeLista(m[5]),
      ...(m[6] ? { importeImpreso: numeroDeLista(m[6]) } : {}),
      tipo: "MERCADERIA",
    };
  });
  return { lineas, total };
}

async function hojas() {
  const partes = await partirPdfEnHojas(PDF);
  return Promise.all(partes.map((h) => textoDelPdf(h)));
}

test("ARCOR #582: EL PDF SE PARTE EN CUATRO HOJAS, CADA UNA CON SU FACTURA Y SU TOTAL", async () => {
  const partes = await partirPdfEnHojas(PDF);
  assert.equal(partes.length, 4);
  const textos = await hojas();
  textos.forEach((t, i) => {
    assert.ok(t.startsWith(ENCABEZADO_DEL_TEXTO), "se lee el texto, no la imagen");
    assert.match(t, new RegExp(FACTURAS[i].numero));
    for (const otra of FACTURAS.filter((_, j) => j !== i)) assert.doesNotMatch(t, new RegExp(otra.numero));
  });
  // Cuatro hojas con total son cuatro facturas: la agrupación no junta ninguna.
  const { facturas } = agruparHojas(textos.map((_, i) => ({ id: i + 1, leido: true, tieneTotal: true })));
  assert.equal(facturas.length, 4);
});

test("EL TEXTO DEJA EL IMPORTE VACÍO DONDE EL PAPEL NO LO IMPRIME", async () => {
  const [primera, segunda] = await hojas();
  const fila = primera.split("\n").find((f) => f.includes("12393"));
  assert.match(fila, /OSITOS\s+6\.968,536$/, "el número es el precio, y después no hay importe");
  assert.match(segunda.split("\n").find((f) => f.includes("11835")), /5\.669,806\s+34\.018,84$/);
});

test("CADA FACTURA CIERRA CONTRA SU PROPIO TOTAL, CON EL IMPORTE QUE FALTA SACADO DE CANTIDAD × PRECIO", async () => {
  const textos = await hojas();
  let suma = 0;
  textos.forEach((t, i) => {
    const { lineas, total } = renglonesDelTexto(t);
    assert.equal(lineas.length, FACTURAS[i].renglones, `factura ${FACTURAS[i].numero}`);
    assert.equal(total, FACTURAS[i].total);
    const cruda = {
      identidad: { tipo: "B", numero: FACTURAS[i].numero, fecha: "10/11/2026" },
      lineas,
      pie: { total, iva: 0, neto: total },
      hayTotalImpreso: true,
      lineasEnElPapel: lineas.length,
      explicacion: "Factura B de Arcor: cantidad, precio unitario con tres decimales, importe casi siempre vacío.",
    };
    const lectura = normalizarLectura(cruda, { interpretada: true });
    assert.equal(lectura.lineas.length, FACTURAS[i].renglones);
    const sinCosto = lectura.lineas.filter((l) => l.costoFinal === null).map((l) => l.descripcion);
    assert.deepEqual(sinCosto, [], "ningún renglón sin costo");
    const v = verificarLecturaInterpretada(lectura);
    assert.deepEqual(v.invalidos, []);
    assert.equal(v.cierra, true, `factura ${FACTURAS[i].numero}: ${v.sumaCentavos} contra ${v.totalDeclaradoCentavos}`);
    suma += total;
  });
  assert.equal(Math.round(suma * 100), 176887942, "$1.768.879,42 entre las cuatro");
});

test("LOS REGALOS A PRECIO SIMBÓLICO ENTRAN AL STOCK Y NO PROPONEN BAJAR EL COSTO", async () => {
  const textos = await hojas();
  const de = (i, codigo) => {
    const { lineas, total } = renglonesDelTexto(textos[i]);
    const lectura = normalizarLectura({ identidad: { tipo: "B" }, lineas, pie: { total, iva: 0 }, hayTotalImpreso: true, explicacion: "x" }, { interpretada: true });
    return { ...lectura.lineas.find((l) => l.codigoProveedor === codigo), orden: 1 };
  };
  const MASTI = { id: 2143, nombre: "Mogul masti extreme 30gr", unidad_medida: "pack", factor_pack: 16, modoCompraProveedor: "BULTO", modoVentaDeposito: "PESO", pesoEsFijo: false, pesoReferenciaKg: null, precio_costo: 14296.72 };
  const GUSANITOS = { id: 1713, nombre: "Mogul extreme mini gusanitos 50g", unidad_medida: "pack", factor_pack: 12, modoCompraProveedor: "BULTO", modoVentaDeposito: "PESO", pesoEsFijo: false, pesoReferenciaKg: null, precio_costo: 6030 };
  for (const [linea, producto] of [[de(2, "15589"), MASTI], [de(3, "15271"), GUSANITOS]]) {
    const a = analizarPrecioDeLinea({ linea, producto, proveedor: { nombre: "Arcor" } });
    assert.equal(a.precioSimbolico, true, linea.descripcion);
    assert.equal(a.bonificado, true, "entra al stock por el camino del bonificado");
    assert.equal(a.precioAEscribir, null, "no escribe $1 como costo");
  }
  // Un precio de verdad no es simbólico, aunque sea barato.
  assert.equal(esPrecioSimbolico({ precioFinal: 6968.54, costoAnterior: 6222, factorPack: 78 }), false);
  assert.equal(esPrecioSimbolico({ precioFinal: 1.36, costoAnterior: 0, factorPack: 16 }), false, "sin costo real, el del papel es el único");
});
