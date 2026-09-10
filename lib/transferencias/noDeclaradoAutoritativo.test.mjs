// EL PRODUCTO NO DECLARADO: LA ESCALA LA DECIDE Y LA CONGELA EL SERVIDOR.
//
//   node --import ./scripts/alias-loader.mjs --test lib/transferencias/noDeclaradoAutoritativo.test.mjs
//
// Dos huecos sobre la misma línea, la que nadie va a poder auditar contra un
// remito porque no tuvo envío.
//
// ── EL PRIMERO: EL SERVIDOR CONFIABA EN LA ESCALA DEL PEDIDO ───────────
//
// El producto ya se relee del catálogo del ORIGEN, así que el servidor TIENE la
// respuesta. Validaba que `unidadEnviada` fuera BULTO o UNIDAD y nada más: un
// cliente viejo que mandara "UNIDAD" sobre un PACK x6 convertía 2 bultos en 2
// unidades, y esas 10 que se le descuentan de menos al origen no aparecen en
// ningún lado.
//
// ── EL SEGUNDO: NO CONGELABA NADA ──────────────────────────────────────
//
// La línea quedaba leyendo el catálogo vivo hasta el momento de confirmar.
// Editar `factor_pack` de 6 a 12 entre agregar y confirmar convertía los 2 packs
// contados en 24 unidades descontadas en vez de 12.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { piezasToKg } from "@/lib/conversiones/stock";
import { presentacionDeProducto } from "@/lib/productos/presentacionDeProducto";
import {
  escalaDeRecepcion,
  esPiezaParaRecepcion,
  pesoPiezaParaRecepcion,
  planificarRecepcion,
} from "./recepcionServidor.js";
import { unidadFisicaDe } from "./presentacionEnvio.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const sinComentarios = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const codigoDe = (rel) => sinComentarios(leer(rel));

const LINEA = "app/api/transferencias/linea-recepcion/route.js";

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
// 3-5. EL NO DECLARADO CONGELA SU ESCALA
// ═══════════════════════════════════════════════════════════════════════════

/** Una línea agregada en recepción, con su presentación ya congelada. */
const agregada = (extra = {}, base = fiambre()) =>
  fila(
    {
      cantidad: 0,
      agregadoEnRecepcion: true,
      cantidadPresentada: 0,
      sueltasEnviadas: 0,
      ...extra,
    },
    base
  );

test("3. un PACK x6 no declarado congela el factor 6", () => {
  const l = agregada(
    {
      unidadEnviada: "BULTO", presentacionEnvio: "PACK", factorPresentacion: 6,
      pesoPiezaKg: null, recibido: 2, recibidoUnidadesSueltas: 1,
    },
    fiambre({ unidad_medida: "pack", factor_pack: 6, modoVentaDeposito: null, modoCompraProveedor: null })
  );
  const escala = escalaDeRecepcion(l);
  assert.equal(escala.registrado, true);
  assert.equal(escala.unidad, "BULTO");
  assert.equal(escala.factorPack, 6);
  // La línea no tuvo envío: enviado 0, y todo lo recibido es la diferencia.
  assert.equal(escala.cantidad, 0);
  assert.equal(incrementoAlDestino(l), 13, "2 × 6 + 1 = 13");
});

test("4. cambiar el factor vivo a 12 DESPUÉS de agregar no cambia la confirmación", () => {
  // El caso concreto: alguien edita `factor_pack` entre agregar y confirmar.
  // Sin congelar, los 2 packs contados pasaban a descontar 24 en vez de 12.
  const l = agregada(
    {
      unidadEnviada: "BULTO", presentacionEnvio: "PACK", factorPresentacion: 6,
      pesoPiezaKg: null, recibido: 2, recibidoUnidadesSueltas: 1,
    },
    fiambre({ unidad_medida: "pack", factor_pack: 12, modoVentaDeposito: null, modoCompraProveedor: null })
  );
  assert.equal(escalaDeRecepcion(l).factorPack, 6, "leyó el factor de hoy");
  assert.equal(incrementoAlDestino(l), 13, "el catálogo nuevo reescribió lo que se contó");

  // Contraprueba: SIN el snapshot, esa misma edición sí se cuela. Es el defecto.
  const sinCongelar = agregada(
    {
      unidadEnviada: "BULTO", presentacionEnvio: null, cantidadPresentada: null,
      sueltasEnviadas: null, factorPresentacion: null, pesoPiezaKg: null,
      recibido: 2, recibidoUnidadesSueltas: 1,
    },
    fiambre({ unidad_medida: "pack", factor_pack: 12, modoVentaDeposito: null, modoCompraProveedor: null })
  );
  assert.equal(incrementoAlDestino(sinCongelar), 25, "2 × 12 + 1 — el catálogo de hoy");
});

test("5. una PIEZA no declarada congela su presentación Y su peso", () => {
  const l = agregada({
    unidadEnviada: "UNIDAD", presentacionEnvio: "PIEZA", factorPresentacion: null,
    pesoPiezaKg: 3.5, recibido: 2,
  });
  assert.equal(esPiezaParaRecepcion(l), true);
  assert.equal(pesoPiezaParaRecepcion(l), 3.5);
  assert.equal(incrementoAlDestino(l), 7);

  // Y si entre agregar y confirmar cambian las dos cosas, sigue dando 7.
  const cambiado = agregada(
    {
      unidadEnviada: "UNIDAD", presentacionEnvio: "PIEZA", factorPresentacion: null,
      pesoPiezaKg: 3.5, recibido: 2,
    },
    fiambre({ modoVentaDeposito: "PESO", pesoReferenciaKg: 9.9 })
  );
  assert.equal(incrementoAlDestino(cambiado), 7);
});

test("5b. la ruta escribe los cinco campos, con las cantidades en cero", () => {
  const src = codigoDe(LINEA);
  assert.match(src, /presentacionEnvio: presentacion\.presentacion/);
  // Cero porque no hubo envío: es el dato honesto, no un hueco.
  assert.match(src, /cantidadPresentada: 0/);
  assert.match(src, /sueltasEnviadas: 0/);
  // La escala sí se congela: de ella sale cuánto stock se mueve.
  assert.match(src, /factorPresentacion: agrupa\(presentacion\.presentacion\) \? presentacion\.factor : null/);
  assert.match(src, /pesoPiezaKg:/);
  assert.match(src, /presentacion\.presentacion === PRESENTACION\.PIEZA \? presentacion\.pesoPiezaKg : null/);
  // Y la línea sigue naciendo sin envío y con su procedencia.
  assert.match(src, /cantidad: 0,/);
  assert.match(src, /agregadoEnRecepcion: true/);
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. LA ESCALA LA DECIDE EL SERVIDOR, NO EL PEDIDO
// ═══════════════════════════════════════════════════════════════════════════

test("6. el servidor rechaza una unidad que contradiga al catálogo del origen", () => {
  const src = codigoDe(LINEA);

  // La resolución autoritativa sale de los helpers canónicos, sin `contadoEn`:
  // el pedido no puede influir en QUÉ ES el producto.
  assert.match(src, /const presentacion = presentacionDeProducto\(\{/);
  assert.match(src, /const unidadAutoritativa = unidadFisicaDe\(presentacion\)/);
  assert.ok(
    !/contadoEn:/.test(src),
    "la resolución del servidor volvió a mirar lo que mandó el cliente"
  );

  // Se COMPARA y se rechaza. No se reinterpreta en silencio.
  assert.match(src, /uni\.unidad !== unidadAutoritativa/);
  assert.match(src, /UNIDAD_CONTRADICE_CATALOGO/);
  assert.match(src, /status: 409/);

  // Y la fila se crea con la del catálogo, no con la del pedido.
  assert.match(src, /unidadEnviada: unidadAutoritativa/);
  assert.ok(
    !/unidadEnviada: uni\.unidad/.test(src),
    "la línea volvió a crearse con la unidad que mandó el cliente"
  );

  // El desglose también se juzga contra la autoritativa: preguntarle a la del
  // cliente dejaría habilitar sueltas sobre un producto por kilo.
  assert.match(src, /traeSueltas && uni\.ok && unidadAutoritativa !== "BULTO"/);
});

test("6a. el catálogo del origen manda los tres campos del predicado de pieza", () => {
  // La pantalla deriva la unidad con lo que este endpoint proyecta. Si le
  // faltara un campo que el servidor SÍ mira, las dos resolverían distinto sobre
  // la misma ficha: la pantalla mostraría "KG" y el servidor congelaría PIEZA.
  //
  // `pesoEsFijo` faltaba. Es el fallback de los productos no migrados —el que
  // `esFiambreFijo` consulta cuando `modoVentaDeposito` está vacío— así que el
  // hueco solo se abre en esos, que son justamente los que nadie revisó.
  const src = codigoDe("lib/productos/buscarCatalogoLocal.js");
  for (const campo of ["modoVentaDeposito", "modoCompraProveedor", "pesoReferenciaKg", "pesoEsFijo"]) {
    assert.ok(
      new RegExp(`${campo}:\\s*item\\.${campo}`).test(src),
      `la proyección de recepción no manda ${campo}`
    );
    assert.ok(
      new RegExp(`${campo}:[\\s\\S]{0,40}base\\??\\.${campo}`).test(src),
      `el mapper del catálogo no lee ${campo} de la base`
    );
  }
});

test("6b. y la resolución autoritativa contesta lo mismo que la pantalla", () => {
  // Las dos preguntan a `presentacionDeProducto` + `unidadFisicaDe`. Si alguna
  // vez discreparan, el servidor rechazaría todo lo que la pantalla manda.
  const casos = [
    [{ unidad_medida: "pack", factor_pack: 6 }, "BULTO"],
    [{ unidad_medida: "cajon", factor_pack: 8 }, "BULTO"],
    [{ unidad_medida: "unidad", factor_pack: 1 }, "UNIDAD"],
    [{ unidad_medida: "kg" }, "UNIDAD"],
    [{ unidad_medida: "kg", modoCompraProveedor: "UNIDAD", modoVentaDeposito: "PIEZA", pesoReferenciaKg: 3.5 }, "UNIDAD"],
    // Agrupa pero sin factor conocido: no se inventa un bulto.
    [{ unidad_medida: "pack", factor_pack: 1 }, "UNIDAD"],
  ];
  for (const [base, espera] of casos) {
    const p = presentacionDeProducto({
      unidadMedida: base.unidad_medida,
      factorPack: base.factor_pack,
      modoVentaDeposito: base.modoVentaDeposito,
      pesoReferenciaKg: base.pesoReferenciaKg,
      modoCompraProveedor: base.modoCompraProveedor,
      pesoEsFijo: base.pesoEsFijo,
    });
    assert.equal(unidadFisicaDe(p), espera, `${base.unidad_medida} resolvió mal`);
  }
});
