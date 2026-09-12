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

// ── ESTOS DOS CANDADOS CAMBIARON DE CONTRATO EL 2026-09-11 ─────────────────
//
// Afirmaban que las dos pantallas muestran el importe ENVIADO. Era correcto
// mientras confirmar una recepción NO tocaba la plata: el único importe
// defendible era el del remito, porque el otro se movía mientras alguien contaba
// y después no se registraba en ningún lado.
//
// Ahora confirmar corrige la venta vinculada, así que el importe VIGENTE de la
// operación es el corregido. Lo que se conserva —y es lo que estos candados
// siguen defendiendo— es que el enviado NO desaparezca y que el número no se
// arme sumando cards en el navegador.

test("las dos pantallas destacan el CORREGIDO y conservan el enviado", () => {
  const movil = codigoDe(MOVIL);
  assert.match(movil, /importeCorregido/, "el móvil dejó de mostrar el importe vigente");
  assert.match(movil, /importeOriginal/, "el móvil perdió el antecedente");
  assert.match(movil, /diferenciaImporte/);
  assert.match(movil, /Importe corregido/);
  assert.match(movil, /Importe enviado/, "el original tiene que seguir a la vista: con eso se reclama");

  const escritorio = codigoDe(PAGINA);
  assert.match(escritorio, /importeCorregido/);
  assert.match(escritorio, /importeOriginal/);
  assert.ok(
    !/num\(item\.resumen\?\.costoTotal\)/.test(escritorio),
    "el tile volvió a leer costoTotal crudo en vez del contrato con nombre"
  );
});

test("SIN diferencia se muestra UN importe, no tres renglones iguales", () => {
  // Tres números idénticos en el momento de firmar es ruido, y el ruido en una
  // pantalla de control es cómo se deja de leer lo que importa.
  const movil = codigoDe(MOVIL);
  assert.match(movil, /hayDiferenciaDeImporte \?/, "el móvil muestra siempre los tres");
  assert.match(movil, /importeSinDiferencia/);
  const escritorio = codigoDe(PAGINA);
  assert.match(escritorio, /hayDiferenciaDeImporte &&/, "el escritorio muestra siempre los tres tiles");
});

test("la diferencia lleva SIGNO en el número, no un color", () => {
  // Un más o un menos se lee igual en cualquier tema y en cualquier pantalla.
  for (const rel of [MOVIL, PAGINA]) {
    assert.match(codigoDe(rel), /diferenciaImporte > 0 \? "\+" : ""/, `${rel} perdió el signo`);
  }
});

test("el importe del móvil va en el bloque de cierre, antes del CTA", () => {
  // Es la pregunta del momento en que se firma. Si quedara arriba del todo, se
  // lee antes de contar y no cuando hace falta.
  //
  // ── EL ANCLA DEL MEDIO SE CAYÓ, Y NO ES QUE SE AFLOJÓ EL CANDADO ────────
  //
  // Comparaba tres posiciones y la del medio era el texto "Falta revisar". El
  // V15 lo movió a `avisoDeCierre`, una constante derivada que se declara
  // arriba de todo junto con el resto de lo que la composición calcula — así
  // que su `indexOf` dejó de decir dónde se RENDERIZA y pasó a decir dónde se
  // DECLARA. Seguir comparando contra eso sería medir otra cosa con el mismo
  // nombre.
  //
  // Lo que el candado afirma no cambió: el importe va en el cierre y antes del
  // botón. Se mide contra las dos anclas que siguen siendo de render.
  const src = codigoDe(MOVIL);
  const iTotal = src.indexOf("Importe corregido");
  const iBarra = src.indexOf("sticky bottom-0");
  const iCta = src.indexOf("Confirmar recepción");
  assert.ok(iTotal > -1 && iBarra > -1 && iCta > -1, "falta alguna de las tres piezas del cierre");
  assert.ok(iTotal < iBarra, "el importe quedó después de la barra de cierre");
  assert.ok(iBarra < iCta, "el botón de confirmar se salió de la barra");

  // Y el aviso sigue existiendo, con las dos causas que traban el cierre.
  assert.match(src, /Falta revisar/);
  assert.match(src, /diferencias sin motivo/);
});

test("EL CONTRATO DE LA API TIENE LOS TRES NOMBRES, y no rompe los viejos", () => {
  const ruta = codigoDe(RUTA);
  for (const campo of ["importeOriginal:", "importeCorregido:", "diferenciaImporte:"]) {
    assert.ok(ruta.includes(campo), `la ruta no emite ${campo}`);
  }
  // Los dos viejos siguen saliendo: los leen los candados del PR #57 y cualquier
  // consumidor que no se haya enumerado. Romperlos en silencio sería cambiar un
  // contrato sin que nada se ponga rojo.
  assert.match(ruta, /^\s*importeEnviado,$/m, "se borró importeEnviado del resumen");
  assert.match(ruta, /^\s*costoTotal,$/m, "se borró costoTotal del resumen");
});

test("importeCorregido es null mientras NADIE contó", () => {
  // Mandar el enviado con nombre de corregido afirmaría un conteo que no ocurrió.
  const ruta = codigoDe(RUTA);
  assert.match(ruta, /importeCorregido: itemsRecibidos > 0 \? costoTotal : null/);
  assert.match(ruta, /diferenciaImporte: itemsRecibidos > 0 \?/);
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
