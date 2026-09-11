// EL CAMINO COMPLETO DE LA PLATA, DESDE LA FILA HASTA LA CARD.
//
//   node --import ./scripts/alias-loader.mjs --test app/api/transferencias/valorizacionDelDetalle.test.mjs
//
// Los candados de `valorizacionDelRemito.test.mjs` prueban la PIEZA. Éste prueba
// el CAMINO: que el endpoint de detalle use esa pieza para los dos números que
// la card muestra y para el total del documento.
//
// Es la mitad que faltó en el PR #56. Aquellos 12 candados montaban la card con
// `precioCosto: 11400` y `subtotal: 22800` escritos a mano y ya coherentes entre
// sí, y afirmaban que la card los DIBUJA. Eso estaba bien y sigue estando: lo
// que no podían ver es que el endpoint mandara el número equivocado, porque
// nunca ejercían la valorización ni construían una línea con recepción cargada.
// Es la regla 2 de CLAUDE.md: la pieza estaba probada y el camino no.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { valorizarLineaDelRemito, valorizarDetalle } from "@/lib/transferencias/costoTransferencia";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const RUTA = "app/api/transferencias/detalle/route.js";
const MOVIL = "components/transferencias/RecepcionMovil.jsx";
const PAGINA = "app/modulos/transferencias/[id]/page.jsx";

/** La fila 6698 de la transferencia #198, tal como está en producción. */
const LINEA_198 = Object.freeze({
  id: 6698,
  cantidad: 144,
  unidadEnviada: "UNIDAD",
  precioCosto: 5250,
  recibido: 6,
  recibidoUnidadesSueltas: 0,
  presentacionEnvio: "PACK",
  cantidadPresentada: 6,
  factorPresentacion: 24,
  sueltasEnviadas: 0,
  pesoPiezaKg: null,
});

const PANCHO = Object.freeze({
  unidad_medida: "pack",
  factor_pack: 24,
  modoVentaDeposito: "PESO",
  modoCompraProveedor: "BULTO",
  pesoReferenciaKg: null,
  pesoEsFijo: false,
});

/**
 * Lo que el endpoint arma para esa línea, con las MISMAS llamadas que hace la
 * ruta. No se copia la aritmética: se invocan las funciones que la ruta invoca.
 */
function comoLoArmaElEndpoint(detalle, base) {
  const opciones = { origenEsDeposito: true };
  const remito = valorizarLineaDelRemito(detalle, base, opciones);
  const recibido = valorizarDetalle(detalle, base, opciones);
  return {
    // Lo que va al DTO de la card.
    precioCosto: remito.costoPresentacion,
    subtotal: remito.subtotal,
    // Y el otro concepto, con su nombre.
    subtotalRecibido: recibido.subtotal,
    importeEnviado: remito.subtotal,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EL CASO #198, DE PUNTA A PUNTA
// ═══════════════════════════════════════════════════════════════════════════

test("T198 ·CAMINO COMPLETO: costo 5.250, subtotal 31.500, total 31.500", () => {
  const dto = comoLoArmaElEndpoint(LINEA_198, PANCHO);

  // Lo que la card rotula es "PACK x24", así que su costo es el del pack.
  assert.equal(dto.precioCosto, 5250, "la card mostraría $218,75 bajo el rótulo PACK x24");
  assert.equal(dto.subtotal, 31500, "el total de la línea era 1.312,50");
  assert.equal(dto.importeEnviado, 31500, "el total del remito era 1.312,50");
});

test("T198 ·el total del documento no se mueve mientras se cuenta", () => {
  const estados = [
    ["sin contar", { ...LINEA_198, recibido: null, recibidoUnidadesSueltas: null }],
    ["completo", LINEA_198],
    ["faltan 2 packs", { ...LINEA_198, recibido: 4 }],
    ["sobran 3 packs", { ...LINEA_198, recibido: 9 }],
    ["5 packs + 7 sueltas", { ...LINEA_198, recibido: 5, recibidoUnidadesSueltas: 7 }],
  ];
  for (const [caso, linea] of estados) {
    const dto = comoLoArmaElEndpoint(linea, PANCHO);
    assert.equal(dto.importeEnviado, 31500, `el remito cambió de valor (${caso})`);
    assert.equal(dto.precioCosto, 5250, `el costo cambió (${caso})`);
  }
});

test("T198 ·y el valor de lo RECIBIDO sí se mueve, que es su trabajo", () => {
  // Los dos conceptos existen y son distintos. El que cambia es el otro, y
  // tiene otro nombre.
  assert.equal(comoLoArmaElEndpoint(LINEA_198, PANCHO).subtotalRecibido, 31500);
  assert.equal(comoLoArmaElEndpoint({ ...LINEA_198, recibido: 4 }, PANCHO).subtotalRecibido, 21000);
  assert.equal(comoLoArmaElEndpoint({ ...LINEA_198, recibido: 0 }, PANCHO).subtotalRecibido, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// EL CABLEADO: QUE LA RUTA Y LAS PANTALLAS USEN ESO
// ═══════════════════════════════════════════════════════════════════════════

test("la ruta manda el costo DE LA PRESENTACIÓN y el subtotal DEL REMITO", () => {
  const src = codigoDe(RUTA);
  assert.match(src, /valorizarLineaDelRemito\(/, "la ruta no pide el valor del remito");
  assert.match(src, /precioCosto: remito\.costoPresentacion/, "volvió a mandar el costo por unidad");
  assert.match(src, /subtotal: remito\.subtotal/, "volvió a mandar el subtotal de lo recibido");
});

test("la ruta devuelve los DOS totales, con dos nombres", () => {
  const src = codigoDe(RUTA);
  assert.match(src, /importeEnviado \+= remito\.subtotal/);
  assert.match(src, /costoTotal \+= subtotal/, "se perdió el total de lo recibido");
  assert.match(src, /\bimporteEnviado,/);
  assert.match(src, /\bcostoTotal,/);
});

test("EL NOMBRE NO CHOCA CON EL CONTEO DE LÍNEAS DEL CONTROL FÍSICO", () => {
  // `resumenDeRecepcion` ya tiene un `totalRemito` que cuenta LÍNEAS, y la
  // composición móvil recibe los dos resúmenes. Si el importe se llamara igual,
  // en esa pantalla habría dos `totalRemito` con distinta unidad.
  const control = codigoDe("lib/transferencias/controlFisico.js");
  assert.match(control, /totalRemito/, "cambió el resumen del control físico: revisar esta colisión");
  assert.ok(
    !/importeEnviado/.test(control),
    "el conteo de líneas empezó a llamarse como el importe"
  );
});

test("las dos pantallas muestran el importe ENVIADO, no el recibido", () => {
  const movil = codigoDe(MOVIL);
  assert.match(movil, /item\?\.resumen\?\.importeEnviado != null/);
  assert.match(movil, /fmtMoneda\(item\.resumen\.importeEnviado\)/);
  assert.match(movil, /Total remito/);

  const escritorio = codigoDe(PAGINA);
  assert.match(escritorio, /item\.resumen\?\.importeEnviado/);
  assert.ok(
    !/num\(item\.resumen\?\.costoTotal\)/.test(escritorio),
    "el tile de escritorio volvió al total que cambia al contar"
  );
});

test("el total del móvil va en el bloque de cierre, antes del CTA", () => {
  // Es la pregunta del momento en que se firma. Si quedara arriba del todo, se
  // lee antes de contar y no cuando hace falta.
  const src = codigoDe(MOVIL);
  const iTotal = src.indexOf("Total remito");
  const iFalta = src.indexOf("Falta revisar");
  const iCta = src.indexOf("Confirmar recepción");
  assert.ok(iTotal > -1 && iFalta > -1 && iCta > -1);
  assert.ok(iTotal < iFalta, "el total quedó después del renglón de pendientes");
  assert.ok(iFalta < iCta, "se movió el orden del bloque de cierre");
});

test("el móvil NO suma las cards para armar el total", () => {
  // Sumar en el navegador es cómo el mismo documento termina mostrando dos
  // totales: una card filtrada que no entra, o un redondeo distinto.
  const src = codigoDe(MOVIL);
  for (const inventado of [/reduce\([^)]*subtotal/, /reduce\([^)]*precioCosto/]) {
    assert.ok(!inventado.test(src), `el móvil volvió a sumar en el frontend: ${inventado}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// UNA SOLA RESOLUCIÓN DE ESCALA
// ═══════════════════════════════════════════════════════════════════════════

test("EL DINERO PARTE DEL MISMO DESCRIPTOR QUE EL STOCK", () => {
  // La causa del defecto fue tener dos interpretaciones de la escala en el mismo
  // módulo: `escalaDeEnvio` para el stock y los campos crudos para el dinero.
  const costo = codigoDe("lib/transferencias/costoTransferencia.js");
  assert.match(costo, /from "\.\/presentacionEnvio\.js"/, "el dinero volvió a resolver la escala solo");
  assert.match(costo, /escalaDeEnvio\(\{/);
  assert.match(costo, /unidadesFisicasDelDescriptor\(/);
});

test("y la ruta no multiplica por el factor por su cuenta", () => {
  // El parche fácil era `recibido * factor` en el endpoint. Sería una tercera
  // interpretación de la escala al lado de las otras dos.
  const src = codigoDe(RUTA);
  for (const parche of [
    /recibido\s*\*\s*factor/i,
    /\*\s*d\.factorPresentacion/,
    /factorPresentacion\s*\*/,
  ]) {
    assert.ok(!parche.test(src), `apareció una conversión de escala suelta: ${parche}`);
  }
});
