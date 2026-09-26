// EL NÚMERO QUE SE DEDUCE NO SE PREGUNTA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/correccionAutomatica.test.mjs
//
// ── LOS NÚMEROS SON LOS DEL PAPEL DEL 242, MEDIDOS EN PRODUCCIÓN ──────────
//
// Comprobante 13, once renglones, total impreso $861.376,07. El yogur de
// vainilla se leyó $46.896,56 y no da su cuenta: por el total da
// 861.376,07 − 814.489,52 = $46.886,55 y por su propia cuenta $46.886,59. El
// dígito mal leído es el del medio: 896 por 886.
//
// Corrido contra la base el 2026-09-22: con el valor que sale del total, la
// puerta deja el comprobante en CARGADO con CERO centavos de diferencia; con el
// de la cuenta del renglón, cierra con 4.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  correccionAutomatica,
  textoDeLaCorreccion,
} from "@/lib/compras-proveedor/comprobante/correccionAutomatica";
import { pasarPorLaPuerta, ESTADO } from "@/lib/compras-proveedor/comprobante/lector/puerta";
import { formatearMoneda } from "@/lib/moneda";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/**
 * Los once renglones del papel de Paty, COPIADOS DE PRODUCCIÓN el 2026-09-22.
 *
 * Con su bonificación, que es la que hace que la cuenta del renglón dé: el
 * Butler son 12 × 18.991,95 × 0,43 = 97.998,46 y no 227.903,40. Un fixture
 * escrito a ojo con bonificación cero convierte a todos en sospechosos y el
 * candado dejaría de ejercer el caso.
 */
const RENGLONES = [
  [1, "BUTLER C. TRAD 9MM X2,5KG -6-", 12, null, 18991.95, 97998.47, 57],
  [2, "TREMS MANTECA X100 GS 60", 60, null, 1984.23, 90481.03, 24],
  [3, "TREMS QUESO RALL 40GR X20 6", 6, null, 25565.43, 122714.07, 20],
  [4, "PATY CLASICO FLOW X80GR X2 30", 90, null, 4113.57, 185110.67, 50],
  [5, "TREMS YOG VAINILLA X 900ML 10", 30, null, 2442.01, 46896.56, 36],
  [6, "TREMS YOG FRUTILLA X 900ML 10", 40, null, 2442.01, 62515.42, 36],
  [7, "TREMS Q.UNT CLASICO X180GR -12-", 12, null, 2502.4, 21020.17, 30],
  [8, "TREMS Q.UNT SALAME X180GR -12-", 12, null, 2502.4, 21020.17, 30],
  [9, "POK SAL BAST CHACAR GRUESO X2U 1", 2, 2.9, 22627, 47245.18, 28],
  [10, "POK SAL PIC FINO X 4U 1", 3, 2.1, 24889.7, 37633.23, 28],
  [11, "TREMS QUESO DANDO (AMARILLO) -1-", 3, 11.685, 16694.69, 128751.11, 34],
];

const TOTAL = 861376.07;

const papel = ({ total = TOTAL, hayTotal = true, cambios = {} } = {}) => ({
  tipo: "FACTURA",
  lineasEnElPapel: RENGLONES.length,
  hayTotalImpreso: hayTotal,
  pie: { neto: null, iva: null, interno: null, total: hayTotal ? total : null, percepciones: [] },
  lineas: RENGLONES.map(([orden, descripcion, cantidad, peso, netoUnitario, subtotalImpreso, bonificacion]) => ({
    orden,
    descripcion,
    cantidad,
    peso,
    netoUnitario,
    subtotalImpreso: cambios[orden] ?? subtotalImpreso,
    internoUnitario: null,
    bonificacion,
  })),
});

/** La receta del proveedor: factura por unidad, sin IVA por línea. */
const RECETA = { facturaPor: "UNIDAD", ivaPorLinea: false, alicuotaIvaPct: 0, percepciones: [] };

test("EL YOGUR SE CORRIGE SOLO, Y CON EL NÚMERO QUE SALE DEL TOTAL", () => {
  const r = correccionAutomatica(papel());
  assert.equal(r.aplica, true, r.porque ?? "no se dedujo el número");
  assert.equal(r.orden, 5);
  assert.equal(r.nombre, "TREMS YOG VAINILLA X 900ML 10");
  assert.equal(r.leido, 46896.56);
  // Las dos cuentas, con los números del papel.
  assert.equal(r.porElTotal, 46886.55);
  assert.equal(r.porSuCuenta, 46886.59);
  assert.equal(r.diferencia, 0.04);
  // Y se corrige con el del total: es el único que hace cerrar el papel.
  assert.equal(r.valor, 46886.55);
});

test("Y CON ESE NÚMERO EL PAPEL CIERRA CON CERO DE DIFERENCIA", () => {
  const conElTotal = pasarPorLaPuerta({ lectura: papel({ cambios: { 5: 46886.55 } }), receta: RECETA });
  assert.equal(conElTotal.estado, ESTADO.CARGADO);
  assert.equal(conElTotal.cierra, true);
  assert.equal(conElTotal.diferenciaCentavos, 0);

  // CONTRAPRUEBA: con el de la cuenta del renglón también cierra, pero deja 4
  // centavos. Por eso se elige el del total y no el otro.
  const conSuCuenta = pasarPorLaPuerta({ lectura: papel({ cambios: { 5: 46886.59 } }), receta: RECETA });
  assert.equal(conSuCuenta.cierra, true);
  assert.equal(conSuCuenta.diferenciaCentavos, 4);

  // Y sin corregir, no cierra: son los $10,01 del dígito mal leído.
  const sinTocar = pasarPorLaPuerta({ lectura: papel(), receta: RECETA });
  assert.equal(sinTocar.estado, ESTADO.MAL_LEIDO);
  assert.equal(sinTocar.diferenciaCentavos, 1001);
});

test("LA LÍNEA QUE SE MUESTRA DICE LOS DOS NÚMEROS", () => {
  const texto = textoDeLaCorreccion(correccionAutomatica(papel()), { moneda: formatearMoneda });
  assert.match(texto, /TREMS YOG VAINILLA/);
  assert.match(texto, /leyó \$46\.896,56/);
  assert.match(texto, /corregido a \$46\.886,55/);
  // Sin valor no hay nada que decir.
  assert.equal(textoDeLaCorreccion({}), null);
});

test("CON DOS PRODUCTOS SEÑALADOS NO SE DEDUCE NADA", () => {
  // Cómo se reparte la diferencia entre dos no es único: cualquier número
  // sería una invención. Vuelve el bloque de preguntar.
  const r = correccionAutomatica(papel({ cambios: { 5: 46896.56, 6: 62599.42 } }));
  assert.equal(r.aplica, false);
  assert.match(r.porque, /2 productos señalados/);
});

test("SI LAS DOS CUENTAS NO COINCIDEN, TAMPOCO", () => {
  // El total impreso movido: la resta contra el total deja de dar lo que da la
  // cuenta del renglón, y ahí hay DOS números y ninguno decidido.
  const r = correccionAutomatica(papel({ total: TOTAL + 500 }));
  assert.equal(r.aplica, false);
  assert.match(r.porque, /no coinciden/);
  assert.equal(r.porElTotal, 47386.55);
  assert.equal(r.porSuCuenta, 46886.59);
});

test("SIN TOTAL IMPRESO NO HAY PRIMERA CUENTA — ES EL REMITO", () => {
  const r = correccionAutomatica(papel({ hayTotal: false }));
  assert.equal(r.aplica, false);
  assert.match(r.porque, /no trae total impreso/);
});

test("Y SI NINGÚN RENGLÓN ESTÁ SEÑALADO, NO HAY NADA QUE CORREGIR", () => {
  const r = correccionAutomatica(papel({ cambios: { 5: 46886.59 } }));
  assert.equal(r.aplica, false);
  assert.match(r.porque, /Ningún renglón/);
});

test("EL RENGLÓN SEÑALADO NO SE SUMA A SÍ MISMO", () => {
  // ── EL DEFECTO QUE ESTO ATAJA ───────────────────────────────────────
  //
  // Los renglones se descartan POR POSICIÓN y no por `orden`: una lectura
  // recién hecha todavía no tiene `orden` —se numera al guardarla— y comparar
  // dos `undefined` no descarta nada. El renglón señalado entraría en la suma
  // de "los demás" y la resta contra el total daría cualquier cosa.
  const sinOrden = papel();
  sinOrden.lineas = sinOrden.lineas.map(({ orden, ...resto }) => resto);
  const r = correccionAutomatica(sinOrden);
  assert.equal(r.aplica, true, r.porque ?? "");
  assert.equal(r.valor, 46886.55, "se sumó a sí mismo");
  assert.equal(r.orden, 5, "sin `orden` tiene que numerar por posición");
});

// ── Y LO QUE SE DECIDIÓ SE GUARDA, QUE ES LA OTRA MITAD ──────────────────

test("LA CORRECCIÓN VA EN SU PROPIA COLUMNA, NO PISA LO LEÍDO", () => {
  const ruta = codigoDe("app/api/compras-proveedor/comprobantes/corregir/[id]/route.js");
  assert.match(ruta, /data: \{ subtotalCorregido: valor \}/);
  assert.ok(
    !/data: \{ subtotalImpreso: valor \}/.test(ruta),
    "volvió a pisar lo que el lector leyó, y con eso se pierde la explicación"
  );
  // El número de la automática lo calcula el SERVIDOR, no llega hecho.
  assert.match(ruta, /auto = correccionAutomatica\(lecturaDesdeLoGuardado\(c\)\)/);
  assert.match(ruta, /correcciones = auto\s*\n?\s*\? \[\{ orden: auto\.orden, valor: auto\.valor \}\]/);

  // La lectura rearmada usa lo corregido cuando lo hay: sin esto, corregir no
  // cambiaría nada de lo que se verifica y concilia.
  const guardada = codigoDe("lib/compras-proveedor/comprobante/lecturaGuardada.js");
  assert.match(guardada, /subtotalImpreso: aNumero\(l\.subtotalCorregido\) \?\? aNumero\(l\.subtotalImpreso\)/);

  // Y se hereda cuando el papel se vuelve a leer.
  const herencia = codigoDe("lib/compras-proveedor/comprobante/herenciaDelRenglon.js");
  assert.match(herencia, /"subtotalCorregido",/);
  assert.match(herencia, /viejo\.subtotalCorregido != null/);
  const lectura = codigoDe("app/api/compras-proveedor/comprobantes/leer/[id]/route.js");
  assert.match(lectura, /subtotalCorregido: true,/, "la fotografía previa a borrar no trae la corrección");
});

test("LA PANTALLA APLICA LA AUTOMÁTICA Y NO OFRECE BOTONES MIENTRAS TANTO", () => {
  const comp = codigoDe("components/compras-proveedor/CorregirComprobante.jsx");
  // Pide aplicarla; el número no viaja desde el navegador.
  assert.match(comp, /body: JSON\.stringify\(\{ automatica: true \}\)/);
  assert.ok(!/automatica: true, valor/.test(comp), "la pantalla está mandando el número");
  // El bloque de preguntar solo aparece si NO se deduce.
  assert.match(comp, /\{!automatica\?\.aplica && !aplicando && \(/);
  // Y lo ya corregido se dibuja en una línea, desde lo que vino de la base.
  assert.match(comp, /yaCorregidas\.map\(\(c\) => \(/);
  assert.match(comp, /textoDeLaCorreccion\(c, \{ moneda: formatearMoneda \}\)/);
});

test("Y LO CORREGIDO LLEGA A LA CONCILIACIÓN Y AL CIERRE", () => {
  // ── LA MITAD QUE FALTABA Y SE VIO EN PRODUCCIÓN ─────────────────────
  //
  // Corregido el yogur, el comprobante quedó en CARGADO y la pantalla del
  // pedido seguía sumando $861.386,87: la conciliación leía `subtotalImpreso`
  // derecho de la base, sin mirar la corrección. Dos pantallas diciendo cosas
  // distintas del mismo renglón es peor que no corregir.
  const filas = codigoDe("lib/compras-proveedor/comprobante/filasDeConciliacion.js");
  assert.match(filas, /subtotal: l\.subtotalCorregido \?\? l\.subtotalImpreso \?\? null/);
  const conciliacion = codigoDe("app/api/compras-proveedor/conciliacion/[pedidoId]/route.js");
  assert.match(conciliacion, /subtotalCorregido: true,/);
  // El costo que se propone sale del importe corregido.
  const precio = codigoDe("lib/compras-proveedor/comprobante/precioDeLinea.js");
  assert.match(precio, /linea\?\.subtotalCorregido \?\? linea\?\.subtotalImpreso/);
  // Y el control de escala del cierre compara contra el importe de verdad.
  const cierre = codigoDe("app/api/compras-proveedor/recibir/[id]/route.js");
  assert.match(cierre, /subtotal: delPapel\.subtotalCorregido \?\? delPapel\.subtotalImpreso/);
  // Los dos importes vienen en la consulta de renglones del cierre. El select
  // pasó a un campo por renglón al sumarle `costoFinalUnitario`: lo que se
  // exige es que los dos estén, no en qué renglón.
  assert.match(cierre, /subtotalImpreso: true,\s*subtotalCorregido: true/);
});
