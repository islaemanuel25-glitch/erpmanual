// UN PEDIDO CON VARIAS FACTURAS SE COMPARA CONTRA TODAS.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/variasFacturasEnUnPedido.test.mjs
//
// ── LA DEUDA QUE ESTO CIERRA ──────────────────────────────────────────────
//
// La pantalla tomaba el PRIMER grupo con líneas y se olvidaba del resto, con el
// caso anotado en un comentario: «con varios, se muestra el primero… se
// resuelve en la tanda del cierre». Un pedido de Arcor de 50 productos llega
// con cuatro o cinco facturas, así que esa pantalla comparaba el pedido entero
// contra una sola y todo lo que venía en las otras figuraba como no llegado.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  filasDeConciliacion,
  totalImpresoDeLasFacturas,
} from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";
import { coberturaDelPedido } from "@/lib/compras-proveedor/comprobante/cobertura";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// ── LA SUMA DE LO FACTURADO ───────────────────────────────────────────────

test("«TE FACTURÓ» SUMA LAS CUATRO FACTURAS", () => {
  const grupos = [
    { comprobante: { id: 1, totalDelPapel: 348711.61 } },
    { comprobante: { id: 2, totalDelPapel: 511968.28 } },
    { comprobante: { id: 3, totalDelPapel: 861376.07 } },
    { comprobante: { id: 4, totalDelPapel: 100000 } },
  ];
  assert.equal(totalImpresoDeLasFacturas(grupos).toFixed(2), "1822055.96");
});

test("UN REMITO SIN TOTAL NO SUMA CERO: NO SUMA", () => {
  // Sumarle un cero lo haría desaparecer de la cuenta como si hubiera
  // facturado nada. Que la suma quede corta es correcto: es lo impreso.
  const grupos = [
    { comprobante: { id: 1, totalDelPapel: 500 } },
    { comprobante: { id: 2, totalDelPapel: null } },
  ];
  assert.equal(totalImpresoDeLasFacturas(grupos), 500);
});

test("Y SI NINGUNA TRAE TOTAL ES NULL, NO CERO", () => {
  // Cero es una afirmación falsa sobre plata: es el defecto que mostró
  // "Te facturó Mauro $0,00". Null hace caer a la suma de lo comparable.
  assert.equal(totalImpresoDeLasFacturas([{ comprobante: { totalDelPapel: null } }]), null);
  assert.equal(totalImpresoDeLasFacturas([]), null);
  assert.equal(totalImpresoDeLasFacturas(null), null);
});

// ── EL PEDIDO CONTRA TODAS ────────────────────────────────────────────────

test("UN PRODUCTO REPARTIDO ENTRE DOS FACTURAS LLEGÓ IGUAL", () => {
  // La conciliación es del PEDIDO contra la SUMA de las facturas: 48 de 50
  // llegaron, sin importar en cuál de las cuatro vino cada uno.
  const detalles = Array.from({ length: 50 }, (_, i) => ({
    id: i + 1,
    productoBaseId: 100 + i,
    nombre: `producto ${i + 1}`,
    cantidad: 1,
  }));
  // Las cuatro facturas traen 48 de los 50, repartidos, y una repite un
  // producto que ya vino en otra —pasa: mitad en una factura, mitad en otra—.
  const lineas = [
    ...detalles.slice(0, 14).map((d) => ({ productoBaseId: d.productoBaseId, comprobanteId: 1 })),
    ...detalles.slice(14, 26).map((d) => ({ productoBaseId: d.productoBaseId, comprobanteId: 2 })),
    ...detalles.slice(26, 40).map((d) => ({ productoBaseId: d.productoBaseId, comprobanteId: 3 })),
    ...detalles.slice(40, 48).map((d) => ({ productoBaseId: d.productoBaseId, comprobanteId: 4 })),
    { productoBaseId: detalles[0].productoBaseId, comprobanteId: 4 },
  ];

  const c = coberturaDelPedido({ detalles, lineasDeComprobantes: lineas });
  assert.equal(c.totalPedido, 50);
  assert.equal(c.cubiertas, 48);
  assert.equal(c.sinCubrir, 2, "lo que no vino en ninguna tiene que quedar a la vista");
});

test("Y LOS RENGLONES DE LAS CUATRO SALEN EN GRUPOS SEPARADOS", () => {
  // El endpoint ya devolvía un grupo por comprobante: lo que faltaba era que la
  // pantalla los usara todos. Acá se afirma la forma sobre la que se apoya.
  const r = filasDeConciliacion({
    comprobantes: [
      { id: 1, estado: "CARGADO", totalLeido: 100, lineas: [{ id: 1, orden: 1, cantidad: 1 }] },
      { id: 2, estado: "CARGADO", totalLeido: 200, lineas: [{ id: 2, orden: 1, cantidad: 1 }] },
    ],
    detalles: [],
  });
  assert.equal(r.grupos.length, 2);
  assert.deepEqual(r.grupos.map((g) => g.comprobante.id), [1, 2]);
  assert.equal(totalImpresoDeLasFacturas(r.grupos), 300);
});

// ── Y LA PANTALLA LAS USA TODAS ───────────────────────────────────────────

test("LA PANTALLA CONCATENA LOS RENGLONES DE TODAS LAS FACTURAS", () => {
  const pagina = codigoDe("app/modulos/compras-proveedor/[id]/page.jsx");
  // Ya no se queda con el primero: los junta.
  assert.match(pagina, /gruposConFilas\.flatMap\(\(g\) => g\.filas \|\| \[\]\)/);
  assert.ok(
    !/\(conciliacion\?\.grupos \|\| \[\]\)\.find\(/.test(pagina),
    "la pantalla volvió a quedarse con el primer grupo"
  );
  // Y el total lo saca de la función que se puede ejercer, no de un reduce
  // escrito en el JSX.
  assert.match(pagina, /totalImpresoDeLasFacturas\(conciliacion\?\.grupos\)/);
});

test("LA TARJETA ES DE FACTURAS, Y DICE EL PEDIDO CONTRA TODAS", () => {
  const panel = codigoDe("components/comprobantes/PanelComprobantes.jsx");
  assert.match(panel, /\+ Agregar factura/);
  assert.match(panel, /Pedido contra facturas/);
  assert.match(panel, /de \$\{cobertura\.totalPedido\} llegaron/);
  // "Leyendo" también cuando la lectura la lanzó otra pantalla o la misma antes
  // de cerrarse: el estado vive en la base desde el 2026-10-10.
  assert.match(panel, /chipDeFactura\(c\.estado, \{ leyendo: leyendo === c\.id \|\| c\.leyendo === true \}\)/);
});

test("Y NO SE PREGUNTA MÁS SI ES UNA FACTURA NUEVA O UNA HOJA", () => {
  // CONTRAPRUEBA del cambio: lo decide el papel. La función que armaba la
  // pregunta se borró en vez de dejarse sin usar —una función que nadie llama
  // se lee como cubierta y no cubre nada—, así que esto también afirma que no
  // volvió por la puerta de atrás.
  const panel = codigoDe("components/comprobantes/PanelComprobantes.jsx");
  assert.ok(!/¿Es una factura nueva o otra hoja\?/.test(panel));
  assert.ok(!/debePreguntarPorAgrupar/.test(panel));
  const pantalla = codigoDe("lib/compras-proveedor/comprobante/pantalla.js");
  assert.ok(!/export function debePreguntarPorAgrupar/.test(pantalla));
});

test("EL PROMPT DICE QUE «TRANSPORTE» Y «VIENEN» NO SON PRODUCTOS", () => {
  // Una factura de varias hojas arrastra el acumulado de una a la siguiente,
  // impreso en la misma tabla y con importe. Transcripto como producto, el
  // importe queda contado dos veces y la verificación no cierra por un motivo
  // que no existe. Con una sola hoja no aparece nunca.
  const prompt = codigoDe("lib/compras-proveedor/comprobante/lector/promptDesdeReceta.js");
  for (const palabra of ["TRANSPORTE", "VAN", "VIENEN", "SUBTOTAL DE LA HOJA"]) {
    assert.match(prompt, new RegExp(`«${palabra}»`), `el prompt no nombra ${palabra}`);
  }
  assert.match(prompt, /NO son renglones de mercader/);
  // Y tampoco se cuentan en el control de renglones, o el control avisaría que
  // faltan líneas que no había que transcribir.
  assert.match(prompt, /Tampoco los cuentes en `lineasEnElPapel`/);
});

test("LA FOTO VIAJA ACHICADA, Y ESO PASA EN LA RUTA DE LEER", () => {
  const ruta = codigoDe("app/api/compras-proveedor/comprobantes/leer/[id]/route.js");
  assert.match(ruta, /achicarTodas\(archivosLeidos, sharp\)/);
  // Y lo que se manda a la cadena es lo achicado, no lo que salió del volumen:
  // sin esto el módulo estaría escrito y no lo usaría nadie.
  assert.match(ruta, /archivos: paraLeer/);
  // La original no se toca: en toda la ruta no hay una escritura de archivo.
  assert.ok(!/writeFile/.test(ruta), "la ruta de leer escribe archivos");

  // Y la PRUEBA de la receta manda lo mismo. Si la prueba mandara la foto
  // entera y la recepción una achicada, probar la explicación estaría midiendo
  // otra cosa — que es peor que no medir.
  const prueba = codigoDe("app/api/compras-proveedor/recetas/explicacion/route.js");
  assert.match(prueba, /achicarTodas\(archivos, sharp\)/);
  assert.match(prueba, /archivos: paraLeer/);
});
