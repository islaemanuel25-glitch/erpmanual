// VIENE MARCADO EL MÁS ALTO, Y FUERA DE LA VARIACIÓN NO VIENE MARCADO NADA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/decisionDeCostoSugerida.test.mjs
//
// ── LOS CUATRO CASOS SON DEL PEDIDO 242, MEDIDOS EN PRODUCCIÓN ────────────
//
// Con la variación normal de Paty en 10 %:
//
//   · PAPAS      papel $8.166,54 · tuyo $9.500     → −14,0 %  → STOP, sin marcar
//   · BARRA      papel $11.018,49 · tuyo $10.120   → +8,9 %   → marcado "aceptar"
//   · MANTECA    papel $90.600 · tuyo $90.600      → +0,0 %   → iguales
//   · HAMBURGUESA el costo del bulto donde va el de la unidad → error de escala
//
// Hasta esta tanda venía marcado "Aceptar el precio nuevo" SIEMPRE, así que en
// las papas el que tocaba "Revisado y seguir" sin mirar se bajaba el costo un
// 14 % solo.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  decisionDeCostoSugerida,
  esErrorDeEscala,
  textoDeLaDiferencia,
  MARCA,
  SITUACION,
  VARIACION_POR_DEFECTO,
} from "@/lib/compras-proveedor/decisionDeCostoSugerida";
import { formatearMoneda } from "@/lib/moneda";

const PATY = { variacionPct: 10 };

test("LAS PAPAS: 14 % MÁS BARATO QUE EL TUYO → STOP, NADA MARCADO", () => {
  const r = decisionDeCostoSugerida({ papel: 8166.54, tuyo: 9500, ...PATY });
  assert.equal(r.situacion, SITUACION.FUERA);
  assert.equal(r.marcado, null, "venía marcado algo sobre una diferencia que no es normal");
  assert.equal(r.exigeElegir, true);
  assert.equal(Math.round(r.diferenciaPct * 10) / 10, -14);
  assert.equal(r.elMasAlto, "tuyo");
});

test("LA BARRA: 8,9 % MÁS CARO EL PAPEL → MARCADO «ACEPTAR EL PRECIO NUEVO»", () => {
  const r = decisionDeCostoSugerida({ papel: 11018.49, tuyo: 10120, ...PATY });
  assert.equal(r.situacion, SITUACION.NORMAL);
  assert.equal(r.marcado, MARCA.ACEPTA);
  assert.equal(r.exigeElegir, false);
  assert.equal(Math.round(r.diferenciaPct * 10) / 10, 8.9);
  assert.equal(r.elMasAlto, "papel");
});

test("Y SI EL MÁS ALTO ES EL TUYO, VIENE MARCADO «DEJAR EL QUE TENÍA»", () => {
  // Es la mitad de la regla que faltaba: hasta hoy venía marcado "aceptar"
  // aunque el papel fuera más barato, y el que no miraba se bajaba el costo.
  const r = decisionDeCostoSugerida({ papel: 9600, tuyo: 10120, ...PATY });
  assert.equal(r.situacion, SITUACION.NORMAL);
  assert.equal(r.marcado, MARCA.DEJA);
  assert.equal(r.elMasAlto, "tuyo");
  assert.equal(Math.round(r.diferenciaPct * 10) / 10, -5.1);
});

test("LA MANTECA: LOS DOS IGUALES, NO HAY NADA QUE DECIDIR", () => {
  const r = decisionDeCostoSugerida({ papel: 90600, tuyo: 90600, ...PATY });
  assert.equal(r.situacion, SITUACION.IGUALES);
  assert.equal(r.marcado, null);
  assert.equal(r.exigeElegir, false);
});

test("LA HAMBURGUESA CON EL COSTO DEL BULTO: ERROR DE ESCALA, NO UN PRECIO", () => {
  // $61.703 es el bulto de 30 y $2.056,79 la unidad. El cociente ES el factor.
  const r = decisionDeCostoSugerida({ papel: 61703, tuyo: 2056.79, ...PATY, factorPack: 30 });
  assert.equal(r.situacion, SITUACION.ESCALA);
  assert.equal(r.marcado, null);
  assert.equal(r.exigeElegir, true);
  // Y se mira ANTES que el porcentaje: un cociente de 30 también está fuera de
  // la variación, y decirlo así sería verdad y no serviría de nada.
  assert.equal(esErrorDeEscala({ papel: 61703, tuyo: 2056.79, factorPack: 30 }), true);
  assert.equal(esErrorDeEscala({ papel: 11018.49, tuyo: 10120, factorPack: 30 }), false);
  // Sin factor de bulto no hay escala que confundir.
  assert.equal(esErrorDeEscala({ papel: 61703, tuyo: 2056.79, factorPack: 1 }), false);
});

test("LA VARIACIÓN LA PONE EL PROVEEDOR, Y POR DEFECTO ES 10", () => {
  assert.equal(VARIACION_POR_DEFECTO, 10);
  // El mismo 8,9 % de la barra, con un proveedor que no mueve precios: frena.
  const estricto = decisionDeCostoSugerida({ papel: 11018.49, tuyo: 10120, variacionPct: 5 });
  assert.equal(estricto.situacion, SITUACION.FUERA);
  assert.equal(estricto.marcado, null);
  // Y con uno que se mueve mucho, las papas pasan a ser normales.
  const flexible = decisionDeCostoSugerida({ papel: 8166.54, tuyo: 9500, variacionPct: 20 });
  assert.equal(flexible.situacion, SITUACION.NORMAL);
  assert.equal(flexible.marcado, MARCA.DEJA, "el más alto es el tuyo");
  // Sin variación cargada, el 10 %.
  assert.equal(decisionDeCostoSugerida({ papel: 8166.54, tuyo: 9500 }).situacion, SITUACION.FUERA);
});

test("SIN LOS DOS PRECIOS NO SE AFIRMA NADA", () => {
  for (const falta of [{ papel: null, tuyo: 9500 }, { papel: 8166, tuyo: null }, { papel: 0, tuyo: 9500 }]) {
    const r = decisionDeCostoSugerida({ ...falta, ...PATY });
    assert.equal(r.situacion, SITUACION.SIN_DATOS);
    assert.equal(r.marcado, null);
    assert.equal(r.exigeElegir, false, "frenó una hoja sobre la que no se puede afirmar nada");
  }
});

test("EL AVISO NOMBRA AL PROVEEDOR, LOS DOS IMPORTES Y QUÉ MIRAR", () => {
  const r = decisionDeCostoSugerida({ papel: 8166.54, tuyo: 9500, ...PATY });
  const t = textoDeLaDiferencia(r, { proveedor: "Paty", moneda: formatearMoneda, papel: 8166.54, tuyo: 9500 });
  assert.match(t, /Paty cobra \$8\.166,54/);
  assert.match(t, /tu precio es \$9\.500,00/);
  assert.match(t, /14 % de diferencia no es normal para Paty/);
  assert.match(t, /Revisá la cantidad y el producto antes de elegir/);

  // El de escala dice otra cosa, porque es otra cosa.
  const e = decisionDeCostoSugerida({ papel: 61703, tuyo: 2056.79, ...PATY, factorPack: 30 });
  const te = textoDeLaDiferencia(e, { proveedor: "Paty", moneda: formatearMoneda, papel: 61703, tuyo: 2056.79 });
  assert.match(te, /es 30 veces, justo lo que trae el bulto/);
  assert.match(te, /no es un precio distinto, es un precio en otra unidad/);

  // Dentro de la variación no hay nada que avisar.
  assert.equal(textoDeLaDiferencia(decisionDeCostoSugerida({ papel: 11018.49, tuyo: 10120, ...PATY })), null);
  assert.equal(textoDeLaDiferencia(null), null);
});

// ── Y LOS TRES LUGARES LA USAN, QUE ES DONDE ESTABA EL DEFECTO ───────────

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

test("LA HOJA MARCA LO QUE DICE LA REGLA Y NO AVANZA SIN ELEGIR", () => {
  const hoja = codigoDe("components/compras-proveedor/HojaCorregirLinea.jsx");
  // Arranca sin marcar: `null` es "todavía no eligió nadie".
  assert.match(hoja, /const \[aceptaPrecio, setAceptaPrecio\] = useState\(null\);/);
  assert.ok(
    !/useState\(true\);[\s\S]{0,80}aceptaPrecio/.test(hoja),
    "volvió el default que marcaba «aceptar» siempre"
  );
  // La regla decide, con la variación del proveedor y los dos precios en la
  // unidad del depósito.
  assert.match(hoja, /decisionDeCostoSugerida\(\{/);
  assert.match(hoja, /papel: fila\?\.costoFactura/);
  assert.match(hoja, /tuyo: fila\?\.costoCatalogo/);
  assert.match(hoja, /variacionPct: variacionNormalPct/);
  // Y guardar no avanza mientras la regla exija elegir.
  assert.match(hoja, /sugerida\.exigeElegir && aceptaPrecio === null/);
  assert.match(hoja, /\{avisoDeLaDiferencia && \(/);
});

test("EL CIERRE FRENA POR LA VARIACIÓN DEL PROVEEDOR, NO POR UN NÚMERO DEL SISTEMA", () => {
  const cierre = codigoDe("app/api/compras-proveedor/recibir/[id]/route.js");
  assert.match(cierre, /variacionPct: variacionNormalPct/);
  // Frena si la persona no aceptó ESE costo en esta recepción —lo que manda
  // quien llama o lo que la hoja de Corregir dejó guardado en el renglón— y
  // solo sobre lo que se va a escribir.
  assert.match(cierre, /const aceptada = costosAceptados\.has\(det\.id\) \|\| aceptadoEnElPapel\(det\.id, costoFinal\)/);
  assert.match(cierre, /escribeCosto && sugerida\.exigeElegir && !aceptada/);
  // Y el freno de "más de tres veces" se fue: lo reemplaza esto.
  assert.ok(!/SALTO_DE_COSTO_QUE_FRENA/.test(cierre), "quedó el freno viejo de las tres veces");
  // La variación sale de la receta del proveedor.
  assert.match(cierre, /recetaProveedor\.findFirst\(\{/);
  assert.match(cierre, /select: \{ variacionNormalPct: true \}/);
});

test("LA CONCILIACIÓN Y LA RECETA LA LLEVAN Y LA GUARDAN", () => {
  const conc = codigoDe("app/api/compras-proveedor/conciliacion/[pedidoId]/route.js");
  assert.match(conc, /variacionNormalPct:/);
  const receta = codigoDe("app/api/compras-proveedor/recetas/explicacion/route.js");
  // Se guarda con el mismo botón que la explicación, y un valor ausente NO la
  // borra: el formulario puede mandar la explicación sola.
  assert.match(receta, /variacion !== undefined \? \{ variacionNormalPct: variacion \} : \{\}/);
  assert.match(receta, /va de 0 a 100 por ciento/);
  const pantalla = codigoDe("components/compras-proveedor/ExplicacionDelPapel.jsx");
  assert.match(pantalla, /Variación normal de precios/);
  assert.match(pantalla, /if \(d\.variacionNormalPct != null\) setVariacion/);
});

test("LAS PANTALLAS QUE TOCÓ ESTA TANDA IMPORTAN TODAS LAS PIEZAS QUE DIBUJAN", () => {
  // ── EL DEFECTO QUE ESTO ATAJA, Y YA PASÓ DOS VECES ──────────────────
  //
  // `SunmiInput` usado sin importar: es JSX, así que COMPILA, y explota en el
  // navegador con "Application error: a client-side exception has occurred".
  // El 2026-09-22 se desplegó así y la pantalla de la receta de Paty quedó en
  // blanco; lo encontró la sonda de consola, no el build ni la suite.
  for (const rel of [
    "components/compras-proveedor/ExplicacionDelPapel.jsx",
    "components/compras-proveedor/HojaCorregirLinea.jsx",
  ]) {
    const crudo = fs.readFileSync(path.join(RAIZ, rel), "utf8");
    const codigo = codigoDe(rel);
    const usadas = new Set([...codigo.matchAll(/<(Sunmi[A-Za-z]+)/g)].map((m) => m[1]));
    for (const pieza of usadas) {
      assert.ok(
        new RegExp(`import\\s+\\{?\\s*${pieza}\\b`).test(crudo),
        `${rel} dibuja <${pieza}> y no lo importa: compila y explota en el navegador`
      );
    }
  }
});
