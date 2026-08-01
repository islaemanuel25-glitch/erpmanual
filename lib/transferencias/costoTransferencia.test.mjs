// Tests de la normalización de lectura del costo de transferencias.
//
// El defecto: `TransferenciaDetalle.precioCosto` guarda el costo en la escala
// COMERCIAL del producto (por bulto si la presentación es pack/cajón), mientras
// que `cantidad` y `recibido` están en la escala de `unidadEnviada`. Al enviar
// por UNIDAD un producto con presentación de pack, el documento multiplicaba
// unidades físicas por un precio de bulto y sobrevalorizaba por el factor.
//
// Los casos 10-14 son el caso REAL de la Transferencia 4 en producción.
//
// Las aserciones sobre las rutas se hacen sobre el fuente SIN COMENTARIOS, para
// no validar contra un texto explicativo.
//
// Correr con: node --test lib/transferencias/costoTransferencia.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ERRORES_COSTO,
  UNIDADES_ESCALA_BULTO,
  resolverCostoTransferencia,
  costoEstaEnEscalaDeBulto,
  cantidadAValorizar,
  valorizarDetalle,
} from "./costoTransferencia.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..");

const leerSinComentarios = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const SUPERFICIES = [
  "app/api/transferencias/detalle/route.js",
  "app/api/transferencias/listar/route.js",
  "app/api/transferencias/pdf/route.js",
  "app/api/transferencias/pdf-recepcion/route.js",
];

// Fichas reales de producción.
const AGRIDULCE = { unidad_medida: "pack", factor_pack: 20 };
const AZUCARADAS = { unidad_medida: "pack", factor_pack: 28 };
const CLASICAS = { unidad_medida: "pack", factor_pack: 24 };
const SUELTO = { unidad_medida: "unidad", factor_pack: 1 };
const CAJON = { unidad_medida: "cajon", factor_pack: 12 };

const costo = (precioCosto, unidadEnviada, base) =>
  resolverCostoTransferencia({
    precioCosto,
    unidadEnviada,
    unidadMedida: base.unidad_medida,
    factorPack: base.factor_pack,
  });

// ── 1-5. Matriz unidad × presentación ────────────────────────────────────────

test("1. UNIDAD + producto unidad + factor 1 → costo igual", () => {
  assert.equal(costo(1500, "UNIDAD", SUELTO), 1500);
});

test("2. UNIDAD + pack x20 → costo / 20", () => {
  assert.equal(costo(19200, "UNIDAD", AGRIDULCE), 960);
});

test("3. UNIDAD + cajon x12 → costo / 12", () => {
  assert.equal(costo(8930 * 12, "UNIDAD", CAJON), 8930);
  assert.equal(costo(1200, "UNIDAD", CAJON), 100);
});

test("4. BULTO + pack x20 → costo igual (las escalas ya coinciden)", () => {
  assert.equal(costo(19200, "BULTO", AGRIDULCE), 19200);
});

test("5. BULTO + cajon x12 → costo igual", () => {
  assert.equal(costo(1200, "BULTO", CAJON), 1200);
});

// ── 6-9. Bordes y errores ────────────────────────────────────────────────────

test("6. factor null / 0 / 1 en producto unidad → costo igual, sin dividir", () => {
  for (const f of [null, undefined, 0, 1]) {
    assert.equal(costo(1500, "UNIDAD", { unidad_medida: "unidad", factor_pack: f }), 1500);
  }
});

test("7. factor inválido en producto pack → error tipado, no división silenciosa", () => {
  for (const f of [0, -5, "abc", NaN]) {
    assert.throws(
      () => costo(19200, "UNIDAD", { unidad_medida: "pack", factor_pack: f }),
      (e) => {
        assert.equal(e.code, ERRORES_COSTO.FACTOR_INVALIDO);
        return true;
      },
      `factor ${f} debería fallar`
    );
  }
});

test("7b. pack sin factor (null) devuelve el costo tal cual, no rompe la lectura", () => {
  assert.equal(costo(19200, "UNIDAD", { unidad_medida: "pack", factor_pack: null }), 19200);
});

test("7c. pack con factor 1 no divide", () => {
  assert.equal(costo(19200, "UNIDAD", { unidad_medida: "pack", factor_pack: 1 }), 19200);
});

test("8. unidadEnviada desconocida → error", () => {
  for (const u of ["CAJON", "", null, undefined, "unidades"]) {
    assert.throws(
      () => costo(19200, u, AGRIDULCE),
      (e) => e.code === ERRORES_COSTO.UNIDAD_DESCONOCIDA
    );
  }
});

test("9. precioCosto no numérico → error", () => {
  for (const c of [null, undefined, "abc", {}, [], true, Infinity, NaN]) {
    assert.throws(
      () => costo(c, "UNIDAD", AGRIDULCE),
      (e) => e.code === ERRORES_COSTO.COSTO_INVALIDO,
      `costo ${JSON.stringify(String(c))} debería fallar`
    );
  }
});

test("9b. acepta Decimal de Prisma y strings numéricos", () => {
  assert.equal(costo("19200.00", "UNIDAD", AGRIDULCE), 960);
  assert.equal(costo({ toString: () => "26880.00" }, "UNIDAD", AZUCARADAS), 960);
});

// ── 10-14. Caso real: Transferencia 4 ────────────────────────────────────────

test("10. Agridulce: 19.200 / 20 = 960", () => {
  assert.equal(costo(19200, "UNIDAD", AGRIDULCE), 960);
});

test("11. Azucaradas: 26.880 / 28 = 960", () => {
  assert.equal(costo(26880, "UNIDAD", AZUCARADAS), 960);
});

test("12. Clásicas: 23.040 / 24 = 960", () => {
  assert.equal(costo(23040, "UNIDAD", CLASICAS), 960);
});

test("13. subtotal por producto: 5 recibidas × 960 = 4.800", () => {
  const v = valorizarDetalle(
    { cantidad: 10, recibido: 5, unidadEnviada: "UNIDAD", precioCosto: 26880 },
    AZUCARADAS
  );
  assert.equal(v.costoUnitario, 960);
  assert.equal(v.cantidad, 5);
  assert.equal(v.subtotal, 4800);
});

test("14. total de la Transferencia 4 = 14.400 (antes 345.600)", () => {
  const filas = [
    { detalle: { cantidad: 10, recibido: 5, unidadEnviada: "UNIDAD", precioCosto: 19200 }, base: AGRIDULCE },
    { detalle: { cantidad: 10, recibido: 5, unidadEnviada: "UNIDAD", precioCosto: 26880 }, base: AZUCARADAS },
    { detalle: { cantidad: 10, recibido: 5, unidadEnviada: "UNIDAD", precioCosto: 23040 }, base: CLASICAS },
  ];
  const total = filas.reduce((acc, f) => acc + valorizarDetalle(f.detalle, f.base).subtotal, 0);
  assert.equal(total, 14400);

  // Lo que mostraba antes, para dejar el defecto documentado.
  const totalViejo = filas.reduce((acc, f) => acc + 5 * f.detalle.precioCosto, 0);
  assert.equal(totalViejo, 345600);
});

// ── 15-17. Compatibilidad y cantidad a valorizar ─────────────────────────────

test("15. transferencia manual por BULTO mantiene el costo de pack", () => {
  // Fila real: 361 LATA X24, cantidad 3 bultos, costo 23.500 por bulto.
  const v = valorizarDetalle(
    { cantidad: 3, recibido: 3, unidadEnviada: "BULTO", precioCosto: 23500 },
    { unidad_medida: "pack", factor_pack: 24 }
  );
  assert.equal(v.costoUnitario, 23500, "no se divide: la cantidad ya está en bultos");
  assert.equal(v.subtotal, 70500);
});

test("16. recibido 0 → subtotal 0, no el total enviado", () => {
  const v = valorizarDetalle(
    { cantidad: 10, recibido: 0, unidadEnviada: "UNIDAD", precioCosto: 26880 },
    AZUCARADAS
  );
  assert.equal(v.cantidad, 0);
  assert.equal(v.subtotal, 0);
});

test("17. recibido null → valoriza lo enviado", () => {
  const v = valorizarDetalle(
    { cantidad: 10, recibido: null, unidadEnviada: "UNIDAD", precioCosto: 26880 },
    AZUCARADAS
  );
  assert.equal(v.cantidad, 10);
  assert.equal(v.subtotal, 9600);
});

test("17b. cantidadAValorizar no usa truthiness", () => {
  assert.equal(cantidadAValorizar({ cantidad: 20, recibido: 0 }), 0);
  assert.equal(cantidadAValorizar({ cantidad: 20, recibido: null }), 20);
  assert.equal(cantidadAValorizar({ cantidad: 20, recibido: 18 }), 18);
});

test("17c. el remito de envío valoriza siempre lo enviado", () => {
  const v = valorizarDetalle(
    { cantidad: 10, recibido: 5, unidadEnviada: "UNIDAD", precioCosto: 26880 },
    AZUCARADAS,
    { cantidadModo: "ENVIADA" }
  );
  assert.equal(v.cantidad, 10);
  assert.equal(v.subtotal, 9600);
});

// ── 18-20. Invariantes de integración ────────────────────────────────────────

test("18. las cuatro superficies usan el helper compartido, sin duplicar la fórmula", () => {
  for (const ruta of SUPERFICIES) {
    const src = leerSinComentarios(ruta);
    // La fórmula puede llegar de dos maneras y las dos valen, porque en las dos
    // vive en UN solo lugar: importando el helper directamente, o a través de
    // lib/transferencias/agregadosPeriodo.js, que lo importa (ver 18d). Lo que
    // el invariante prohíbe es reimplementarla, no la indirección.
    const directo = /from "@\/lib\/transferencias\/costoTransferencia"/.test(src);
    const viaAgregados = /from "@\/lib\/transferencias\/agregadosPeriodo"/.test(src);
    assert.ok(
      directo || viaAgregados,
      `${ruta} debe llegar al helper, directo o vía agregadosPeriodo`
    );
    assert.ok(
      /resolverCostoTransferencia|valorizarDetalle|importeDeDetalle/.test(src),
      `${ruta} debe usar el helper`
    );
    assert.ok(
      !/precioCosto\s*\/\s*factor|\/\s*factor_pack/.test(src),
      `${ruta} no debe reimplementar la división`
    );
  }
});

test("18d. agregadosPeriodo no reimplementa la fórmula: la importa", () => {
  const src = leerSinComentarios("lib/transferencias/agregadosPeriodo.js");
  assert.ok(
    /from "\.\/costoTransferencia\.js"/.test(src),
    "agregadosPeriodo debe importar el helper de costo"
  );
  assert.ok(/valorizarDetalle/.test(src), "agregadosPeriodo debe usar valorizarDetalle");
  assert.ok(
    !/precioCosto\s*\/\s*factor|\/\s*factor_pack/.test(src),
    "agregadosPeriodo no debe reimplementar la división"
  );
});

test("18b. ninguna superficie conserva la valorización vieja por truthiness", () => {
  for (const ruta of SUPERFICIES) {
    const src = leerSinComentarios(ruta);
    assert.ok(
      !/cantidadRecibida\s*>\s*0\s*\?\s*cantidadRecibida\s*:\s*cantidadEnviada/.test(src),
      `${ruta} todavía decide la cantidad con truthiness`
    );
  }
});

test("18c. listar carga los campos que el helper necesita", () => {
  const src = leerSinComentarios("app/api/transferencias/listar/route.js");
  for (const campo of ["unidadEnviada: true", "unidad_medida: true", "factor_pack: true"]) {
    assert.ok(src.includes(campo), `falta el select ${campo}`);
  }
});

test("19. no se modifica el precioCosto persistido", () => {
  for (const ruta of SUPERFICIES) {
    const src = leerSinComentarios(ruta);
    assert.ok(
      !/transferenciaDetalle\.update/.test(src),
      `${ruta} es de lectura: no debe escribir el detalle`
    );
  }
  // El helper es puro: no muta la entrada.
  const detalle = { cantidad: 10, recibido: 5, unidadEnviada: "UNIDAD", precioCosto: 26880 };
  const copia = { ...detalle };
  valorizarDetalle(detalle, AZUCARADAS);
  assert.deepEqual(detalle, copia, "el helper no debe mutar el detalle");
});

test("20. no se toca ProductoLocal.precio_costo", () => {
  for (const ruta of SUPERFICIES) {
    const src = leerSinComentarios(ruta);
    assert.ok(
      !/productoLocal\.(update|upsert|create)/.test(src),
      `${ruta} no debe escribir ProductoLocal`
    );
  }
});

test("20b. el enum de presentaciones no incluye valores inexistentes", () => {
  // El enum real es: unidad | pack | cajon | kg.
  assert.deepEqual(UNIDADES_ESCALA_BULTO, ["pack", "cajon"]);
  assert.ok(!UNIDADES_ESCALA_BULTO.includes("caja"));
  assert.ok(!UNIDADES_ESCALA_BULTO.includes("carton"));
});

test("20c. costoEstaEnEscalaDeBulto refleja la regla de buscar-producto", () => {
  assert.equal(costoEstaEnEscalaDeBulto({ unidadMedida: "pack", factorPack: 28 }), true);
  assert.equal(costoEstaEnEscalaDeBulto({ unidadMedida: "cajon", factorPack: 12 }), true);
  assert.equal(costoEstaEnEscalaDeBulto({ unidadMedida: "pack", factorPack: 1 }), false);
  assert.equal(costoEstaEnEscalaDeBulto({ unidadMedida: "unidad", factorPack: 20 }), false);
  assert.equal(costoEstaEnEscalaDeBulto({ unidadMedida: "kg", factorPack: 20 }), false);
});

test("20d. la presentación manda, no modo_envio: pack + SOLO_UNIDAD igual divide", () => {
  // Es exactamente el caso de 9 de Oro: modo_envio SOLO_UNIDAD pero el costo
  // está cargado por bulto. Mirar modo_envio en vez de la presentación fue lo
  // que dejó pasar el defecto.
  assert.equal(costo(26880, "UNIDAD", { unidad_medida: "pack", factor_pack: 28 }), 960);
});
