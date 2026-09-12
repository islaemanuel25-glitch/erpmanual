// UNA TRANSFERENCIA DESPACHADA NO SE REINTERPRETA, Y SU RASTRO NO SE PIERDE.
//
//   node --import ./scripts/alias-loader.mjs --test lib/transferencias/confirmarPresentacionCongelada.test.mjs
//
// Dos cosas que `confirmar-recepcion` seguía haciendo mal sobre líneas que YA
// tenían su presentación congelada.
//
// ── LA PRIMERA: UN HILO QUE SEGUÍA COLGANDO DEL CATÁLOGO VIVO ───────────
//
// Preguntaba `esFiambreFijo(d.producto.base)`. El PESO ya salía del snapshot,
// pero la pregunta de SI convertir a kilos seguía saliendo de la ficha de hoy, y
// las dos juntas se contradecían: cambiar `modoVentaDeposito` a PESO después de
// despachar hacía que 2 piezas de 3,5 kg acreditaran 2 KG en vez de 7.
//
// ── LA SEGUNDA: LA AUDITORÍA PERDÍA LAS SUELTAS ────────────────────────
//
// El rastro decía "recibido 5 BULTO" sobre un conteo de 5 cajones más 7 sueltas.
// La fila informaba un movimiento de 1 unidad y el texto no explicaba de dónde
// salía ese 1: quien audite seis meses después no tiene cómo llegar a 47 contra
// 48. Y del lado ENVIADO pasaba lo mismo con un despacho mixto.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { piezasToKg } from "@/lib/conversiones/stock";
import {
  escalaDeRecepcion,
  esPiezaParaRecepcion,
  pesoPiezaParaRecepcion,
  planificarRecepcion,
} from "./recepcionServidor.js";
import { rotuloConSueltas } from "./presentacionEnvio.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const sinComentarios = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const codigoDe = (rel) => sinComentarios(leer(rel));

const CONFIRMAR = "app/api/transferencias/confirmar-recepcion/route.js";

/** La ficha del producto tal como el catálogo la tenía AL DESPACHAR. */
const fiambre = (extra = {}) => ({
  id: 70,
  nombre: "Mortadela",
  unidad_medida: "kg",
  factor_pack: 1,
  modoCompraProveedor: "UNIDAD",
  modoVentaDeposito: "PIEZA",
  pesoReferenciaKg: 3.5,
  pesoEsFijo: null,
  es_combo: false,
  ...extra,
});

/** Una fila de `TransferenciaDetalle` como la devuelve Prisma. */
const fila = (extra = {}, base = fiambre()) => ({
  id: 1,
  cantidad: 2,
  unidadEnviada: "UNIDAD",
  recibido: 2,
  recibidoUnidadesSueltas: null,
  motivoPrincipal: null,
  motivoDetalle: null,
  agregadoEnRecepcion: false,
  presentacionEnvio: "PIEZA",
  cantidadPresentada: 2,
  sueltasEnviadas: 0,
  factorPresentacion: null,
  pesoPiezaKg: 3.5,
  producto: { base },
  ...extra,
});

/** Lo que `confirmar-recepcion` le suma al destino, por su misma expresión. */
function incrementoAlDestino(d) {
  const r = planificarRecepcion([d]);
  assert.equal(r.ok, true, `la línea no se pudo planificar: ${r.error}`);
  const plan = r.planes.get(d.id);
  return esPiezaParaRecepcion(d)
    ? piezasToKg(plan.recibida, pesoPiezaParaRecepcion(d))
    : plan.recibidaUnidades;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1-2. LA PIEZA NO DEJA DE SER PIEZA PORQUE CAMBIÓ EL CATÁLOGO
// ═══════════════════════════════════════════════════════════════════════════

test("1. una PIEZA registrada sigue siendo PIEZA aunque el catálogo pase a PESO", () => {
  // Despachada como 2 PIEZA de 3,5 kg. Después alguien edita la ficha.
  const cambiado = fila({}, fiambre({ modoVentaDeposito: "PESO" }));

  assert.equal(
    esPiezaParaRecepcion(cambiado),
    true,
    "la línea dejó de contarse en piezas porque cambiaron la ficha del producto"
  );
  assert.equal(incrementoAlDestino(cambiado), 7, "al destino tienen que entrar 7 KG");
});

test("2. y usa el peso CONGELADO aunque `pesoReferenciaKg` cambie en vivo", () => {
  const cambiado = fila({}, fiambre({ pesoReferenciaKg: 9.9 }));
  assert.equal(pesoPiezaParaRecepcion(cambiado), 3.5);
  assert.equal(incrementoAlDestino(cambiado), 7, "el peso vivo reescribió el remito");
});

test("2b. las dos cosas a la vez tampoco lo mueven", () => {
  const cambiado = fila({}, fiambre({ modoVentaDeposito: "PESO", pesoReferenciaKg: 9.9 }));
  assert.equal(incrementoAlDestino(cambiado), 7);
});

test("2c. un HISTÓRICO sin snapshot conserva el comportamiento anterior", () => {
  // Sin snapshot no hay nada congelado: la pregunta la contesta el catálogo, que
  // es exactamente lo que hacía antes. No se reinterpreta el pasado.
  const historica = fila({
    presentacionEnvio: null, cantidadPresentada: null, sueltasEnviadas: null,
    factorPresentacion: null, pesoPiezaKg: null,
  });
  assert.equal(esPiezaParaRecepcion(historica), true, "un fiambre fijo sigue siendo pieza");
  assert.equal(incrementoAlDestino(historica), 7);

  // Y si el catálogo dice que ya no es pieza, la histórica SÍ lo sigue —no tiene
  // otra fuente—. Es la deuda conocida de las líneas anteriores a la migración.
  const historicaCambiada = fila(
    { presentacionEnvio: null, cantidadPresentada: null, factorPresentacion: null, pesoPiezaKg: null },
    fiambre({ modoVentaDeposito: "PESO" })
  );
  assert.equal(esPiezaParaRecepcion(historicaCambiada), false);
});

test("2d. y una línea registrada que NO es pieza no se convierte a kilos", () => {
  const cajon = fila(
    {
      cantidad: 48, presentacionEnvio: "CAJON", cantidadPresentada: 6,
      factorPresentacion: 8, pesoPiezaKg: null, recibido: 6,
    },
    fiambre({ unidad_medida: "cajon", factor_pack: 8, modoVentaDeposito: null, modoCompraProveedor: null })
  );
  assert.equal(esPiezaParaRecepcion(cajon), false);
  assert.equal(incrementoAlDestino(cajon), 48);
});

test("2e. confirmar pregunta por la resolución canónica y no por el catálogo", () => {
  const src = codigoDe(CONFIRMAR);
  assert.match(src, /const esFijo = esPiezaParaRecepcion\(d\)/);
  assert.ok(
    !/esFiambreFijo\(d\.producto\.base\)/.test(src),
    "volvió el predicado leído del catálogo vivo"
  );
  assert.match(src, /piezasToKg\(recibida, pesoPiezaParaRecepcion\(d\)\)/);
});

// ═══════════════════════════════════════════════════════════════════════════
// 7-8. LA AUDITORÍA NO PIERDE LAS SUELTAS
// ═══════════════════════════════════════════════════════════════════════════

test("7. el rótulo de un CAJÓN conserva completos Y sueltas", () => {
  assert.equal(
    rotuloConSueltas({ presentacion: "CAJON", cantidad: 5, sueltas: 7, factor: 8 }),
    "5 CAJÓN x8 + 7 unidades sueltas"
  );
  // Una sola suelta se dice en singular: un rastro que dice "1 unidades" se lee
  // como un error del sistema y hace dudar del resto de la fila.
  assert.equal(
    rotuloConSueltas({ presentacion: "PACK", cantidad: 2, sueltas: 1, factor: 6 }),
    "2 PACK x6 + 1 unidad suelta"
  );
  // Sin sueltas no se agrega ruido.
  assert.equal(
    rotuloConSueltas({ presentacion: "CAJON", cantidad: 6, sueltas: 0, factor: 8 }),
    "6 CAJÓN x8"
  );
  // Y donde no hay bulto, un desglose no significa nada y no se muestra.
  //
  // Los tres decimales son del peso y no de este candado: `rotuloConSueltas`
  // compone `rotuloDeEnvio`, que desde la tanda del peso escribe los ceros a la
  // derecha en KG. Lo que este renglón afirma sigue siendo que las sueltas NO se
  // dicen donde no hay bulto que abrir. Ver `decimalesDeCantidad`.
  assert.equal(rotuloConSueltas({ presentacion: "KG", cantidad: 3.25, sueltas: 4 }), "3,250 KG");
  assert.equal(rotuloConSueltas({ presentacion: "PIEZA", cantidad: 2, sueltas: 4 }), "2 PIEZA");
});

test("8. un despacho MIXTO no pierde las sueltas del lado ENVIADO", () => {
  // 4 packs de 6 más 5 sueltas: 29 unidades salieron. Documentarlo como
  // "enviado 4 PACK x6" pierde 5 unidades del remito.
  const envio = escalaDeRecepcion({
    cantidad: 29, unidadEnviada: "UNIDAD",
    presentacionEnvio: "PACK", cantidadPresentada: 4, sueltasEnviadas: 5, factorPresentacion: 6,
    producto: { base: { unidad_medida: "pack", factor_pack: 6 } },
  }).envio;

  assert.equal(rotuloConSueltas(envio), "4 PACK x6 + 5 unidades sueltas");
});

test("8b. la auditoría de confirmar usa los dos rótulos y no arma el texto a mano", () => {
  const src = codigoDe(CONFIRMAR);

  assert.match(src, /const rotuloEnviado = rotuloConSueltas\(envio\)/);
  assert.match(src, /cantidad: plan\.recibida/);
  assert.match(src, /sueltas: plan\.recibidaSueltas/);
  assert.match(src, /enviado \$\{rotuloEnviado\}/);
  assert.match(src, /recibido \$\{rotuloRecibido\}/);

  // Lo que ya no puede volver: la unidad pelada, que perdía el desglose.
  assert.ok(
    !/recibido \$\{fmt\(plan\.recibida\)\} \$\{plan\.unidad\}/.test(src),
    "volvió el rótulo que pierde las sueltas"
  );
  assert.ok(
    !/enviado \$\{fmt\(plan\.enviada\)\} \$\{plan\.unidad\}/.test(src),
    "volvió el rótulo que pierde las sueltas del envío"
  );

  // La magnitud del movimiento sigue en unidades de stock y con su aclaración:
  // es lo único que la fila de auditoría suma, y confundirlo con bultos sería
  // peor que no tener el texto.
  assert.match(src, /\(unidades de stock\)/);
});

test("8c. el rótulo compuesto sale del módulo de presentación, no de la ruta", () => {
  const src = codigoDe(CONFIRMAR);
  assert.match(src, /import \{ rotuloConSueltas \} from "@\/lib\/transferencias\/presentacionEnvio"/);
  // Ninguna ruta arma el nombre de una presentación por su cuenta.
  assert.ok(
    !/PACK x|CAJÓN x/.test(src),
    "la ruta volvió a escribir el nombre de una presentación a mano"
  );
});
