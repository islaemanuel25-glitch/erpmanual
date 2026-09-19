// Candados de "una diferencia de centavos no es un precio distinto".
//
// ── EL CASO, CON SUS NÚMEROS ───────────────────────────────────────────────
//
// Importación #12 de M Y F, después del arreglo del impuesto. El resultado
// avisaba "7 no se van a actualizar: sus precios cambiaron desde que se leyó la
// lista", y las diferencias eran de CENTAVOS:
//
//   Savora 250gr                       $31.428,00 contra $31.427,93   (7 ¢)
//   ALA JABON EN POLVO 400Gr MATIC     $37.217,04 contra $37.217,12   (8 ¢)
//   ALA POLVO 400gr MATIC SOL          $37.217,04 contra $37.217,12   (8 ¢)
//   ALA EN POLVO 400GR LAVADO A MANO   $37.218,96 contra $37.218,89   (7 ¢)
//   ALA POLVO MATIC 800GR              $65.034,96 contra $65.034,90   (6 ¢)
//
// El precio no había cambiado. Son entre el 0,0001 % y el 0,0003 % del costo, y
// el cartel afirmaba un hecho falso sobre filas que se podían aplicar.
//
// ── LA CAUSA ───────────────────────────────────────────────────────────────
//
// `lecturasPosibles` del lector genérico le pasaba a `lecturasDeFila` el precio
// unitario YA REDONDEADO, y `lecturasDeFila` lo multiplica por el factor del
// bulto. O sea que conciliar guardaba round2(round2(P) × F) —el centavo del
// unitario multiplicado por 24— y aplicar recalculaba round2(P × F).
//
// Cuál de las dos es la correcta no es opinión: `calculoCosto.js` lo tiene
// escrito desde el principio, con su caso de $1.480 terminando en $1.479,96.
//
// La tolerancia es la RED, no el arreglo: cubre las filas que ya quedaron
// conciliadas con el número viejo.
//
// Correr con:
//   node --import ./scripts/alias-loader.mjs --test lib/proveedores/listas/centavosDeRedondeo.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  round2,
  difierenSoloEnElRedondeo,
  diferenciaDeCosto,
  toleranciaDeRedondeoCentavos,
  TOLERANCIA_REDONDEO_PCT,
  TOLERANCIA_REDONDEO_PESOS,
} from "./calculoCosto.js";
import { revalidarFila, revisarAntesDeAplicar, MOTIVO_OMISION, omitidasPorMotivo } from "./aplicacion.js";
import { resultadoConfirmacion } from "./confirmarPresentacion.js";
import { resolverParserPorId } from "./registro.js";
import { ESTADO_LINEA } from "./estados.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const REG = resolverParserPorId("GENERICO");
const RECARGO = 5;

/** Los cinco de la #12, tal como los informó la pantalla. */
const LAS_CINCO = [
  { nombre: "Savora 250gr", guardado: 31428.0, recalculado: 31427.93 },
  { nombre: "ALA JABON EN POLVO 400Gr MATIC", guardado: 37217.04, recalculado: 37217.12 },
  { nombre: "ALA POLVO 400gr MATIC SOL", guardado: 37217.04, recalculado: 37217.12 },
  { nombre: "ALA EN POLVO 400GR LAVADO A MANO", guardado: 37218.96, recalculado: 37218.89 },
  { nombre: "ALA POLVO MATIC 800GR", guardado: 65034.96, recalculado: 65034.9 },
];

// Sellos fijos y ordenados: `laEligioUnaPersona` exige que la aceptación del
// fuera de rango sea posterior o igual a la confirmación, y dos `new Date()`
// seguidos caen en el mismo milisegundo o no según la suerte.
const CONFIRMADO_EN = new Date("2026-09-19T12:00:00Z");
const ACEPTADO_EN = new Date("2026-09-19T12:00:01Z");

// ===========================================================================
// 1. LA TOLERANCIA
// ===========================================================================

test("los cinco de la #12 son el mismo precio con otro redondeo", () => {
  for (const c of LAS_CINCO) {
    assert.equal(
      difierenSoloEnElRedondeo(c.guardado, c.recalculado),
      true,
      `${c.nombre}: ${c.guardado} contra ${c.recalculado} se sigue tomando como precio distinto`
    );
    // Y se dice cuánto es, porque es el orden de magnitud lo que justifica la
    // tolerancia: son diezmilésimas de por ciento, no décimas.
    const d = diferenciaDeCosto(c.guardado, c.recalculado);
    assert.ok(
      Math.abs(d.pct) < 0.001,
      `${c.nombre}: la diferencia es del ${d.pct} %, más de lo que este candado da por redondeo`
    );
  }
});

test("CONTRAPRUEBA: una diferencia REAL se sigue tomando como precio distinto", () => {
  // Dos pesos sobre el mismo costo: el doble del umbral. Tiene que frenar.
  const guardado = 31428.0;
  assert.equal(
    difierenSoloEnElRedondeo(guardado, guardado + 2),
    false,
    "dos pesos pasarían como redondeo"
  );

  // Y el borde, de los dos lados. El umbral es UN PESO, no un porcentaje: sobre
  // $31.428 el 0,1 % serían $31,43, y hasta el 2026-09-19 eso es lo que se
  // admitía sin avisar.
  assert.equal(toleranciaDeRedondeoCentavos(guardado), 100);
  assert.equal(difierenSoloEnElRedondeo(guardado, guardado + 0.99), true, "justo por debajo tiene que pasar");
  assert.equal(difierenSoloEnElRedondeo(guardado, guardado + 1.01), false, "justo por encima tiene que frenar");
  // El caso que motivó el ajuste: $31,42 de diferencia ya NO pasa.
  assert.equal(
    difierenSoloEnElRedondeo(guardado, guardado + 31.42),
    false,
    "volvió el 0,1 %: sobre $31.428 se estarían admitiendo $31 sin avisar"
  );
});

test("EL CORTE CAE EN EL MISMO LUGAR, sea el costo de $40 o de $65.000", () => {
  // Es la razón entera del ajuste. Con el mayor entre el 0,1 % y un peso, el
  // umbral CRECÍA con el costo: cuatro centavos sobre $40 y $65 sobre $65.000.
  // Lo que hay que tolerar son centavos, así que el corte no puede depender del
  // tamaño del número.
  const chico = 40;
  const grande = 65034.96;

  assert.equal(toleranciaDeRedondeoCentavos(chico), TOLERANCIA_REDONDEO_PESOS * 100);
  assert.equal(toleranciaDeRedondeoCentavos(grande), TOLERANCIA_REDONDEO_PESOS * 100);
  assert.equal(
    toleranciaDeRedondeoCentavos(chico),
    toleranciaDeRedondeoCentavos(grande),
    "el umbral volvió a depender del tamaño del costo"
  );

  // Y el corte, ejercido de los dos lados sobre los dos tamaños.
  for (const costo of [chico, grande]) {
    assert.equal(difierenSoloEnElRedondeo(costo, costo + 0.99), true, `sobre ${costo} no pasa un centavo`);
    assert.equal(difierenSoloEnElRedondeo(costo, costo + 1.01), false, `sobre ${costo} pasa más de un peso`);
  }

  // Lo que el umbral viejo dejaba pasar sobre el grande, y ahora no.
  assert.equal(difierenSoloEnElRedondeo(grande, grande + 60), false, "$60 sobre $65.000 no es un redondeo");
});

test("el término porcentual está APAGADO, y eso se afirma", () => {
  // La constante sigue existiendo —volver a encenderla es cambiar un número— y
  // hoy vale cero. Se afirma el valor Y el efecto: si alguien la sube sin
  // pensarlo, el umbral vuelve a crecer con el costo y este candado lo dice.
  assert.equal(TOLERANCIA_REDONDEO_PCT, 0, "el componente porcentual dejó de estar apagado");
  const grande = 1000000;
  assert.equal(
    toleranciaDeRedondeoCentavos(grande),
    TOLERANCIA_REDONDEO_PESOS * 100,
    "sobre un millón el umbral tiene que seguir siendo un peso"
  );
});

test("sin uno de los dos números, falla CERRADO", () => {
  // No se puede afirmar que dos costos son el mismo si falta uno. Frenar y
  // avisar es el lado seguro: es un costo lo que se escribe.
  assert.equal(difierenSoloEnElRedondeo(null, 100), false);
  assert.equal(difierenSoloEnElRedondeo(100, null), false);
  assert.equal(difierenSoloEnElRedondeo(undefined, undefined), false);
  assert.equal(difierenSoloEnElRedondeo("", 100), false);
});

// ===========================================================================
// 2. CONCILIAR Y APLICAR DAN EL MISMO NÚMERO
// ===========================================================================

/**
 * Una fila confirmada a mano, como la deja el panel, CON FACTOR DE BULTO.
 *
 * El factor es el punto: sin multiplicación, redondear antes o después da lo
 * mismo, y el defecto no se ve. El candado de la tanda anterior usaba factor 1 y
 * por eso pasó por al lado de esto.
 *
 * El costo no se escribe a mano: sale de `resultadoConfirmacion`, que es la
 * función que el endpoint de confirmar usa de verdad.
 */
function filaConfirmada({ precio, factor, impuesto }) {
  const base = {
    id: 1, nombre: "PRODUCTO DE PRUEBA", precio_costo: 1000, precio_venta: 1500,
    margen: 50, redondeo_100: true, es_combo: false, creadoEnLocalId: 1,
    unidad_medida: "pack", factor_pack: factor, modoCompraProveedor: "BULTO",
    pesoReferenciaKg: null, activo: true, locales: [{ activo: true }],
  };
  // Rango ancho a propósito: lo que se está midiendo es la CUENTA, no si el
  // aumento cae en rango. Con un rango estrecho el veredicto lo decidiría otra
  // guarda y el candado estaría afirmando otra cosa.
  const rango = { minPct: 0, maxPct: 9000 };
  const cruda = {
    id: 1, filaExcel: 1, precioConIva: precio, unidadProveedor: "", unidadesPorBulto: null,
    descripcionProveedor: "COSA", estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR, aplicada: false,
    excluidaManual: false, seleccionada: true, productoBaseId: 1, costoAnterior: 1000,
    factorErp: factor, aumentoEsperadoMinPct: rango.minPct, aumentoEsperadoMaxPct: rango.maxPct,
    vinculadoEn: null, fueraDeRangoAceptadaEn: ACEPTADO_EN,
  };
  const conf = resultadoConfirmacion({
    fila: cruda, base, clave: `PACK_${factor}`, cantidadPresentacion: null,
    recargoPct: RECARGO, rango, impuestoAdicionalPct: impuesto,
    lecturasPosibles: REG.config.lecturasPosibles, aceptarFueraDeRango: true,
  });
  assert.equal(conf.ok, true, `confirmar rechazó la fila: ${conf.motivo}`);
  assert.equal(conf.multiplicador, factor, "la lectura confirmada no es la del bulto");

  const fila = {
    ...cruda, confirmadoEn: CONFIRMADO_EN, multiplicadorConfirmado: conf.multiplicador,
    baseConfirmada: null, precioConRecargo: conf.precioConRecargo,
    costoMaestroPropuesto: conf.costoNuevo,
  };
  const contexto = {
    operandoEnLocalId: 1, depositoLocalId: null,
    cabecera: {
      aumentoEsperadoMinPct: rango.minPct, aumentoEsperadoMaxPct: rango.maxPct,
      impuestoAdicionalPct: impuesto, modo: null,
    },
  };
  const config = { ...REG.config, impuestoAdicionalPct: impuesto };
  return { fila, base, contexto, config, guardado: conf.costoNuevo };
}

/** Precios cuyo unitario NO cae justo en un centavo, que es donde se separan. */
const CASOS = [
  { precio: 1234.56, factor: 24, impuesto: 0 },
  { precio: 1234.56, factor: 24, impuesto: 10.5 },
  { precio: 987.65, factor: 12, impuesto: 21 },
  { precio: 2095.1953, factor: 15, impuesto: 0 },
  { precio: 1550.7133, factor: 24, impuesto: 0 },
];

test("la cuenta de conciliar y la de aplicar dan EXACTAMENTE el mismo número", () => {
  for (const c of CASOS) {
    const { fila, base, contexto, config, guardado } = filaConfirmada(c);
    const v = revalidarFila({ fila, base, contexto, config, recargoPct: RECARGO });

    assert.equal(
      v.costoNuevo,
      guardado,
      `precio ${c.precio} ×${c.factor} imp ${c.impuesto} %: conciliar dio ${guardado} y aplicar ${v.costoNuevo}`
    );
    assert.equal(v.aplicable, true, `se omitió por ${v.motivo}`);
  }
});

test("CONTRAPRUEBA: el redondeo temprano es lo que las separaba", () => {
  // Se reproduce a mano la cuenta vieja —redondear el unitario y DESPUÉS
  // multiplicar— y se comprueba que da distinto de la buena. Sin esto, el
  // candado de arriba no distingue "está arreglado" de "el caso no lo ejerce".
  const base = 1234.56 * 1.05; // precio con recargo, a precisión completa
  const factor = 24;
  const vieja = round2(round2(base) * factor);
  const buena = round2(base * factor);
  assert.notEqual(vieja, buena, "este caso no ejerce el defecto: elegí otro precio");
  assert.equal(vieja, 31110.96);
  assert.equal(buena, 31110.91);
  // Y la diferencia es de las que la tolerancia perdona, que es el otro punto:
  // las filas ya conciliadas con el número viejo se aplican igual.
  assert.equal(difierenSoloEnElRedondeo(vieja, buena), true);
});

test("el lector genérico NO redondea el precio antes de multiplicar", () => {
  // El candado de arriba prueba el resultado; éste prueba que el arreglo siga
  // en su lugar. Se leen los comentarios fuera: un candado que busca código no
  // puede encontrar su patrón en una línea de prosa, y en este repo eso ya dio
  // un verde falso.
  const src = fs
    .readFileSync(path.join(RAIZ, "lib/proveedores/listas/configuraciones/generico.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(
    src,
    /precio:\s*round2\s*\(/,
    "volvió el round2 sobre el precio que se le pasa a lecturasDeFila: la cuenta se separa otra vez"
  );
});

// ===========================================================================
// 3. LO QUE LA PANTALLA MUESTRA
// ===========================================================================

test("una diferencia de centavos se aplica y NO aparece informada", () => {
  // La fila ya conciliada con el número viejo: es el caso de las 7 de la #12.
  const { fila, base, contexto, config, guardado } = filaConfirmada(CASOS[0]);
  const conElViejo = { ...fila, costoMaestroPropuesto: round2(guardado + 0.07) };

  const revision = revisarAntesDeAplicar({
    filas: [conElViejo],
    productoDe: () => base,
    contexto,
    config,
    recargoPct: RECARGO,
  });

  assert.equal(revision.cuantasAplicables, 1, "una diferencia de 7 centavos sigue frenando la escritura");
  assert.equal(revision.omitidas.length, 0, "y además la informaría, afirmando algo que no pasó");
  // Y lo que se escribe es el RECALCULADO, que es el que sale de los datos de hoy.
  assert.equal(revision.aplicables[0].costoNuevo, guardado);
});

test("una diferencia real se frena Y se informa CON CUÁNTO DIFIERE", () => {
  const { fila, base, contexto, config, guardado } = filaConfirmada(CASOS[0]);
  // Un 1 % abajo: no es redondeo.
  const viejoDeVerdad = round2(guardado * 0.99);
  const conOtroPrecio = { ...fila, costoMaestroPropuesto: viejoDeVerdad };

  const revision = revisarAntesDeAplicar({
    filas: [conOtroPrecio],
    productoDe: () => base,
    contexto,
    config,
    recargoPct: RECARGO,
  });

  assert.equal(revision.cuantasAplicables, 0);
  const diferentes = omitidasPorMotivo(revision, MOTIVO_OMISION.PROPUESTA_DIFERENTE);
  assert.equal(diferentes.length, 1);

  const o = diferentes[0];
  assert.equal(o.costoGuardado, viejoDeVerdad);
  assert.equal(o.costoRecalculado, guardado);
  // SIN ESTO EL CARTEL NO PUEDE DECIR EN CUÁNTO DIFIERE, y vuelve a tener que
  // afirmar que el precio cambió, que es lo que no sabe.
  assert.ok(o.diferencia, "la omitida viaja sin la diferencia");
  assert.equal(o.diferencia.pesos, round2(guardado - viejoDeVerdad));
  assert.ok(Math.abs(o.diferencia.pct - 1.0101) < 0.01, `el porcentaje dio ${o.diferencia.pct}`);
});

test("el cartel dejó de afirmar que el precio cambió", () => {
  // Es el texto que la #12 mostró sobre siete filas donde el precio no se había
  // movido. Un candado de texto, porque es una afirmación sobre el mundo que la
  // pantalla no puede sostener.
  const src = fs.readFileSync(
    path.join(RAIZ, "app/modulos/proveedores/listas/[id]/page.jsx"),
    "utf8"
  );
  // Se busca en el JSX, sin los comentarios: el caso viejo está citado en un
  // comentario a propósito, para que se entienda por qué se sacó.
  const jsx = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(jsx, /sus precios cambiaron/, "volvió la afirmación que la #12 desmintió");
  assert.doesNotMatch(jsx, /su precio cambió/, "volvió la afirmación que la #12 desmintió");
  // Y sí dice cuánto difiere.
  assert.match(jsx, /de diferencia/, "el cartel no dice en cuánto difieren");
});
