// Candados de "el recálculo de aplicar y el valor que se muestra dan lo mismo".
//
// ── EL CASO, CON SUS NÚMEROS ───────────────────────────────────────────────
//
// Importación #12 de M Y F, en producción, con recargo 5 %, impuesto adicional y
// rango 0–2 %. Aplicar corrió dos veces: a las 00:13 escribió 3 costos y a la
// 01:20 evaluó las otras 8 y las OMITIÓ a las ocho, con PROPUESTA_DIFERENTE.
//
// Las 8 estaban tildadas, sin aplicar, sin excluir, vinculadas, confirmadas a
// mano, con la aceptación del fuera de rango puesta, y con el costo del producto
// sin moverse desde la conciliación. Contra las 3 que sí se aplicaron no había
// NINGUNA diferencia de campo: se compararon el recargo, la confirmación, la
// aceptación, los sellos, el multiplicador, los precios por columna, el impuesto
// adicional y la interpretación de la fila.
//
// La diferencia no estaba en las filas: estaba en POR DÓNDE pasaba cada una.
//
//   · Las 3 las resolvió el motor → `costoDeLaFila`, que RECIBE el impuesto
//     adicional y lo aplica.
//   · Las 8 las confirmó una persona → la rama del atajo de `revalidarFila`,
//     que multiplicaba `precioConRecargo` — SOLO el recargo comercial, sin el
//     impuesto—.
//
// Y confirmar a mano las 8 es lo que llevó la hora entre las dos corridas.
//
// La cuenta, sobre un precio de lista de 1.000 con recargo 5 % e impuesto 10,5 %:
// confirmar guardaba 1.000 × 1,05 × 1,105 = 1.160,25 y aplicar recalculaba
// 1.000 × 1,05 = 1.050. La guarda que exige que el recálculo dé lo mismo que lo
// guardado —al centavo— no podía dar otra cosa.
//
// ── POR QUÉ NO SE VIO NUNCA EN DESARROLLO ──────────────────────────────────
//
// Porque con impuesto 0 el defecto NO EXISTE: `aplicarImpuestoAdicional` con 0
// devuelve el costo tal cual, así que las dos cuentas coinciden. Las quince
// importaciones de `erpazul_al` tienen el impuesto en 0. El candado de abajo
// ejerce los tres valores —0, 10,5 y 21— justamente por eso: uno solo, con el
// valor que hay en la base de prueba, habría quedado verde para siempre.
//
// Correr con:
//   node --import ./scripts/alias-loader.mjs --test lib/proveedores/listas/propuestaQueQuedoVieja.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  revalidarFila,
  revisarAntesDeAplicar,
  omitidasPorMotivo,
  MOTIVO_OMISION,
  CAMPOS_PRODUCTO_PARA_REVALIDAR,
} from "./aplicacion.js";
import { contarResultado, resultadoCierra, seVaAEscribir } from "./resultadoDeLaLista.js";
import { resultadoConfirmacion } from "./confirmarPresentacion.js";
import { precioBaseDelCosto } from "./configuracionProveedor.js";
import { resolverParserPorId } from "./registro.js";
import { ESTADO_LINEA } from "./estados.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** El lector genérico, que es con el que se leyó la #12. */
const REG = resolverParserPorId("GENERICO");

const RECARGO = 5;
const PRECIO_LISTA = 1000;
const COSTO_VIEJO = 1000;

/**
 * SELLOS FIJOS Y ORDENADOS, nunca `new Date()` dos veces seguidas.
 *
 * `laEligioUnaPersona` exige que la aceptación del fuera de rango sea POSTERIOR o
 * igual a la confirmación. Con dos `new Date()` consecutivos, que caigan en el
 * mismo milisegundo o no depende de la suerte: escribiendo este candado, el mismo
 * fixture dio "se aplica" y "se omite por fuera de rango" en corridas idénticas
 * del mismo código. Un candado que parpadea no afirma nada.
 */
const CONFIRMADO_EN = new Date("2026-09-19T12:00:00Z");
const ACEPTADO_EN = new Date("2026-09-19T12:00:01Z");

/** El producto, con los campos que `revalidarFila` mira. */
const producto = (extra = {}) => ({
  id: 1,
  nombre: "PRODUCTO DE PRUEBA",
  precio_costo: COSTO_VIEJO,
  precio_venta: 1500,
  margen: 50,
  redondeo_100: true,
  es_combo: false,
  creadoEnLocalId: 1,
  unidad_medida: "unidad",
  factor_pack: 1,
  modoCompraProveedor: "BULTO",
  pesoReferenciaKg: null,
  activo: true,
  locales: [{ activo: true }],
  ...extra,
});

/** La cabecera de la importación, con el impuesto que se quiera ejercer. */
const cabecera = ({ impuesto, minPct = 0, maxPct = 40 }) => ({
  aumentoEsperadoMinPct: minPct,
  aumentoEsperadoMaxPct: maxPct,
  impuestoAdicionalPct: impuesto,
  modo: null,
});

/** La fila, antes de que nadie la confirme. */
const filaSinConfirmar = ({ minPct = 0, maxPct = 40 } = {}) => ({
  id: 1,
  filaExcel: 1,
  precioConIva: PRECIO_LISTA,
  unidadProveedor: "",
  unidadesPorBulto: null,
  descripcionProveedor: "COSA",
  estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR,
  aplicada: false,
  excluidaManual: false,
  seleccionada: true,
  productoBaseId: 1,
  costoAnterior: COSTO_VIEJO,
  factorErp: 1,
  aumentoEsperadoMinPct: minPct,
  aumentoEsperadoMaxPct: maxPct,
  vinculadoEn: null,
  fueraDeRangoAceptadaEn: ACEPTADO_EN,
});

/**
 * UNA FILA CONFIRMADA A MANO, COMO LA DEJA EL PANEL.
 *
 * El `costoMaestroPropuesto` NO se escribe a mano: sale de `resultadoConfirmacion`,
 * que es la función que el endpoint de confirmar usa de verdad y la que calculó
 * los números que Emanuel vio en pantalla. Es la diferencia entre probar el
 * sistema y probar un fixture plausible — y este repo ya tiene tres candados que
 * quedaron verdes para siempre por haber escrito el fixture a mano.
 */
function filaConfirmadaAMano({ impuesto, minPct = 0, maxPct = 40 }) {
  const base = producto();
  const cruda = filaSinConfirmar({ minPct, maxPct });
  const conf = resultadoConfirmacion({
    fila: cruda,
    base,
    clave: "MISMA_PRESENTACION",
    cantidadPresentacion: null,
    recargoPct: RECARGO,
    rango: { minPct, maxPct },
    impuestoAdicionalPct: impuesto,
    lecturasPosibles: REG.config.lecturasPosibles,
    aceptarFueraDeRango: true,
  });
  assert.equal(conf.ok, true, `confirmar rechazó la fila: ${conf.motivo}`);
  return {
    fila: {
      ...cruda,
      confirmadoEn: CONFIRMADO_EN,
      multiplicadorConfirmado: conf.multiplicador,
      baseConfirmada: null,
      precioConRecargo: conf.precioConRecargo,
      costoMaestroPropuesto: conf.costoNuevo,
    },
    base,
    guardado: conf.costoNuevo,
  };
}

/** Lo que hace la ruta de aplicar: revalidar con la config de la importación. */
function revalidar({ fila, base, impuesto, minPct = 0, maxPct = 40 }) {
  return revalidarFila({
    fila,
    base,
    contexto: { operandoEnLocalId: 1, depositoLocalId: null, cabecera: cabecera({ impuesto, minPct, maxPct }) },
    config: { ...REG.config, impuestoAdicionalPct: impuesto },
    recargoPct: RECARGO,
  });
}

// ===========================================================================
// 1. EL CASO DE LAS 8 DE LA #12
// ===========================================================================

test("una fila confirmada a mano se aplica: el recálculo da lo mismo que se guardó", () => {
  // Los TRES impuestos, y no solo el 0 que tiene la base de prueba. Con 0 el
  // defecto no existe, así que un candado que ejerciera solo ese valor estaría
  // verde con el defecto puesto.
  for (const impuesto of [0, 10.5, 21]) {
    const { fila, base, guardado } = filaConfirmadaAMano({ impuesto });
    const v = revalidar({ fila, base, impuesto });

    assert.equal(
      v.aplicable,
      true,
      `con impuesto ${impuesto} % la fila se omitió por ${v.motivo}`
    );
    assert.equal(
      v.costoNuevo,
      guardado,
      `con impuesto ${impuesto} %: aplicar recalcula ${v.costoNuevo} y se había guardado ${guardado}`
    );
  }
});

test("las 8 de la #12: con impuesto, el número guardado LLEVA el impuesto", () => {
  // La cuenta exacta del caso, para que el candado falle con el número a la vista
  // si alguien cambia el orden de los factores.
  const { guardado } = filaConfirmadaAMano({ impuesto: 10.5 });
  assert.equal(guardado, 1160.25, "1.000 × 1,05 × 1,105 = 1.160,25");

  // Y el que sale SIN el impuesto —lo que la rama vieja multiplicaba— es otro.
  const sinImpuesto = precioBaseDelCosto({
    precioLista: PRECIO_LISTA,
    recargoPct: RECARGO,
    impuestoAdicionalPct: 0,
  });
  assert.equal(sinImpuesto, 1050, "1.000 × 1,05 = 1.050");
  assert.notEqual(guardado, sinImpuesto, "si estos dos coincidieran, el candado no distinguiría nada");
});

test("CONTRAPRUEBA: si el recálculo NO coincide, la fila no se aplica y dice por qué", () => {
  // Se ejerce la rama al revés: la propuesta guardada se cambia a mano a un
  // número que el recálculo no puede dar. Es la única forma de comprobar que la
  // guarda está viva — con el arreglo puesto, la coincidencia es la normal.
  const impuesto = 10.5;
  const { fila, base, guardado } = filaConfirmadaAMano({ impuesto });
  const vieja = { ...fila, costoMaestroPropuesto: 1050 };

  const v = revalidar({ fila: vieja, base, impuesto });
  assert.equal(v.aplicable, false);
  assert.equal(v.motivo, MOTIVO_OMISION.PROPUESTA_DIFERENTE);
  // Y devuelve el número de HOY, que es la mitad del aviso.
  assert.equal(v.costoNuevo, guardado);
});

// ===========================================================================
// 2. LA OMISIÓN SE INFORMA CON LOS DOS NÚMEROS
// ===========================================================================

test("la omitida viaja con el guardado Y el recalculado, que es lo que la pantalla muestra", () => {
  const impuesto = 10.5;
  const { fila, base } = filaConfirmadaAMano({ impuesto });
  const vieja = { ...fila, costoMaestroPropuesto: 1050 };

  const revision = revisarAntesDeAplicar({
    filas: [vieja],
    productoDe: () => base,
    contexto: { operandoEnLocalId: 1, depositoLocalId: null, cabecera: cabecera({ impuesto }) },
    config: { ...REG.config, impuestoAdicionalPct: impuesto },
    recargoPct: RECARGO,
  });

  assert.equal(revision.cuantasAplicables, 0);
  const diferentes = omitidasPorMotivo(revision, MOTIVO_OMISION.PROPUESTA_DIFERENTE);
  assert.equal(diferentes.length, 1);

  const o = diferentes[0];
  assert.equal(o.costoGuardado, 1050, "sin el valor de ANTES, el aviso no se puede escribir");
  assert.equal(o.costoRecalculado, 1160.25, "sin el valor de AHORA, tampoco");
  assert.equal(o.nombre, "PRODUCTO DE PRUEBA", "sin el nombre, no se sabe cuál fila es");
  assert.equal(o.filaExcel, 1);
  // El texto dice qué pasó y qué hacer, no el nombre del motivo.
  assert.match(o.texto, /costo da distinto/i);
});

test("CONTRAPRUEBA: la que coincide no aparece entre las omitidas", () => {
  const impuesto = 10.5;
  const { fila, base } = filaConfirmadaAMano({ impuesto });

  const revision = revisarAntesDeAplicar({
    filas: [fila],
    productoDe: () => base,
    contexto: { operandoEnLocalId: 1, depositoLocalId: null, cabecera: cabecera({ impuesto }) },
    config: { ...REG.config, impuestoAdicionalPct: impuesto },
    recargoPct: RECARGO,
  });

  assert.equal(revision.cuantasAplicables, 1);
  assert.equal(revision.omitidas.length, 0);
  assert.deepEqual(revision.idsOmitidas, []);
  // Y vuelve CON su costo, para que quien sume no tenga que revalidar otra vez.
  assert.equal(revision.aplicables[0].costoNuevo, 1160.25);
});

// ===========================================================================
// 3. EL CONTADOR NO CUENTA LO QUE EL RECÁLCULO VA A OMITIR
// ===========================================================================

/** Una fila con la forma que `CAMPOS_CONTEO` trae, ya lista y tildada. */
const filaDelConteo = (extra = {}) => ({
  id: 1,
  estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR,
  motivo: null,
  costoAnterior: COSTO_VIEJO,
  productoBaseId: 1,
  excluidaManual: false,
  aplicada: false,
  seleccionada: true,
  diferenciaPct: 16,
  aumentoEsperadoMinPct: 0,
  aumentoEsperadoMaxPct: 40,
  confirmadoEn: CONFIRMADO_EN,
  vinculadoEn: null,
  multiplicadorConfirmado: 1,
  fueraDeRangoAceptadaEn: ACEPTADO_EN,
  costoMaestroPropuesto: 1160.25,
  ...extra,
});

const RANGO_DEL_CONTEO = { minPct: 0, maxPct: 40 };

test("el contador saca de los listos las filas que el recálculo va a omitir", () => {
  const filas = [filaDelConteo({ id: 1 }), filaDelConteo({ id: 2 }), filaDelConteo({ id: 3 })];

  // Las 11 de la #12, en chico: tres listas, una que el recálculo omite.
  const c = contarResultado(filas, RANGO_DEL_CONTEO, new Set([2]));

  assert.equal(c.listos, 2, "el botón prometería escribir una que aplicar va a saltear");
  assert.equal(c.omitidasAlAplicar, 1, "y tiene que tener su propio número, no desaparecer");
  assert.equal(c.listosSinTildar, 0, "no es lo mismo que una destildada: se arregla distinto");
  assert.equal(resultadoCierra(c), true, "los contadores dejaron de cerrar contra el total");
});

test("`seVaAEscribir` contesta que NO sobre una que el recálculo va a omitir", () => {
  // ── POR QUÉ ESTE CANDADO EXISTE APARTE DEL DE ARRIBA ───────────────────
  //
  // Se descubrió haciendo la contraprueba, que es lo único que lo podía
  // descubrir: sacándole a `seVaAEscribir` el chequeo del recálculo, los doce
  // candados de este archivo seguían VERDES. `contarResultado` pregunta por el
  // conjunto ANTES de llamarla, así que su propio chequeo tapaba el de la
  // función — y la defensa quedaba escrita y sin nadie que la afirme.
  //
  // Y no sobra: `seVaAEscribir` es LA pregunta pública "¿esta fila se va a
  // escribir?". El día que otra pantalla la consulte, una versión que ignore el
  // recálculo vuelve a prometer escrituras que no ocurren.
  const f = filaDelConteo({ id: 7 });
  assert.equal(seVaAEscribir(f, RANGO_DEL_CONTEO, new Set([7])), false);
  assert.equal(seVaAEscribir(f, RANGO_DEL_CONTEO, new Set([99])), true, "sacó una que no estaba en el conjunto");
  assert.equal(seVaAEscribir(f, RANGO_DEL_CONTEO, new Set()), true);
  assert.equal(seVaAEscribir(f, RANGO_DEL_CONTEO, null), true, "sin averiguar, sigue siendo el techo");
});

test("CONTRAPRUEBA: sin ninguna omitida, los tres siguen siendo listos", () => {
  const filas = [filaDelConteo({ id: 1 }), filaDelConteo({ id: 2 }), filaDelConteo({ id: 3 })];
  const c = contarResultado(filas, RANGO_DEL_CONTEO, new Set());

  assert.equal(c.listos, 3, "si esto diera menos, el conjunto vacío estaría sacando filas buenas");
  assert.equal(c.omitidasAlAplicar, 0);
  assert.equal(resultadoCierra(c), true);
});

test("sin averiguar el recálculo, el contador contesta lo de antes y NO cero", () => {
  // `null` es "no se averiguó" y no se puede confundir con "ninguna". Fallar
  // cerrado acá dejaría el número en cero en cuanto una consulta se olvidara de
  // pasar el conjunto — y un cero en el número grande es tan falso como un ocho.
  const filas = [filaDelConteo({ id: 1 }), filaDelConteo({ id: 2 })];
  const c = contarResultado(filas, RANGO_DEL_CONTEO, null);

  assert.equal(c.listos, 2);
  assert.equal(c.omitidasAlAplicar, 0);
  assert.equal(resultadoCierra(c), true);
});

// ===========================================================================
// 4. QUE LAS DOS RUTAS SIGAN PREGUNTANDO LO MISMO
// ===========================================================================
//
// Los candados de arriba prueban piezas. Lo que se escapa entre las piezas es
// que una de las dos rutas deje de usarlas — y eso no lo ve ninguna función
// pura. Estos tres leen el fuente.

/** El texto del archivo, SIN comentarios: un candado que busca código no puede
 *  encontrar su patrón en una línea de prosa. Ya pasó tres veces en este repo, y
 *  la tercera dio VERDE con el chequeo que defendía sacado. */
function fuenteSinComentarios(rel) {
  const texto = fs.readFileSync(path.join(RAIZ, rel), "utf8");
  return texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

test("aplicar y el resultado revalidan con la MISMA función", () => {
  for (const rel of [
    "app/api/proveedores/listas/[id]/aplicar/route.js",
    "app/api/proveedores/listas/[id]/resultado/route.js",
  ]) {
    const src = fuenteSinComentarios(rel);
    assert.match(
      src,
      /revisarAntesDeAplicar\s*\(/,
      `${rel} dejó de preguntarle a revisarAntesDeAplicar: la pantalla y el motor pueden decir cosas distintas`
    );
  }
});

test("las dos rutas piden los MISMOS campos del producto", () => {
  // El defecto que más veces pisó este módulo es el campo que una guarda necesita
  // y el `select` no trae. Con el `select` escrito a mano en cada ruta, agregarle
  // un campo a `revalidarFila` arregla una y deja la otra sobre un `undefined`.
  for (const rel of [
    "app/api/proveedores/listas/[id]/aplicar/route.js",
    "app/api/proveedores/listas/[id]/resultado/route.js",
    "app/api/proveedores/listas/[id]/releer-propuestas/route.js",
  ]) {
    const src = fuenteSinComentarios(rel);
    assert.match(src, /CAMPOS_PRODUCTO_PARA_REVALIDAR/, `${rel} volvió a escribir su propio select`);
  }

  // Y la constante trae lo que las guardas miran. Se nombran de a uno: si alguien
  // saca `activo`, el producto dado de baja pasa a llegar con el campo en
  // `undefined` y `productoEstaDeBaja` contesta que no.
  for (const campo of [
    "id", "nombre", "precio_costo", "es_combo", "creadoEnLocalId",
    "unidad_medida", "factor_pack", "modoCompraProveedor", "activo",
  ]) {
    assert.equal(
      CAMPOS_PRODUCTO_PARA_REVALIDAR[campo],
      true,
      `falta ${campo}: la revalidación decidiría sobre un undefined`
    );
  }
  assert.deepEqual(CAMPOS_PRODUCTO_PARA_REVALIDAR.locales, { select: { activo: true } });
});

test("el resultado consulta las filas con el MISMO where que aplicar", () => {
  // Si el resultado revalidara otro conjunto de filas, contaría bien y omitiría
  // mal: la pregunta es la misma y el universo tiene que ser el mismo.
  const where = /seleccionada:\s*true,\s*aplicada:\s*false/;
  for (const rel of [
    "app/api/proveedores/listas/[id]/aplicar/route.js",
    "app/api/proveedores/listas/[id]/resultado/route.js",
    "app/api/proveedores/listas/[id]/releer-propuestas/route.js",
  ]) {
    const src = fuenteSinComentarios(rel);
    assert.match(src, where, `${rel} cambió el universo de filas que revalida`);
  }
});

test("el precio del que sale el costo se arma en UN solo lugar", () => {
  // La composición recargo → impuesto estaba escrita en dos archivos y FALTABA en
  // el tercero, que es el que escribe costos. Ahora la hace `precioBaseDelCosto`
  // y los tres preguntan. Este candado se pone rojo si alguien la vuelve a
  // escribir al lado.
  for (const rel of [
    "lib/proveedores/listas/aplicacion.js",
    "lib/proveedores/listas/confirmarPresentacion.js",
    "lib/proveedores/listas/configuraciones/generico.js",
  ]) {
    const src = fuenteSinComentarios(rel);
    assert.match(src, /precioBaseDelCosto\s*\(/, `${rel} dejó de usar precioBaseDelCosto`);
    assert.doesNotMatch(
      src,
      /aplicarImpuestoAdicional\s*\(\s*\n?\s*aplicarRecargo/,
      `${rel} volvió a escribir la composición a mano en vez de pedirla`
    );
  }
});
