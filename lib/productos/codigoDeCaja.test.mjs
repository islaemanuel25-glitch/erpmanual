// Candados del código de caja y del código de unidad que se deduce de él.
//
// ── POR QUÉ ESTOS CASOS Y NO OTROS ─────────────────────────────────────────
//
// El verificador EAN-13 se prueba contra códigos PUBLICADOS, cuyo dígito de
// control es conocido de antemano y no lo calculó esta función. Es la diferencia
// entre probar y acompañar: si el candado usara un código que este mismo archivo
// generó, pasaría en verde con el algoritmo equivocado.
//
// Los dos canónicos son los que documenta GS1 y repite la literatura:
//
//   4006381333931  (Wikipedia / GS1, el ejemplo clásico de EAN-13)
//   5901234123457  (el segundo ejemplo canónico)
//
// El error que esto ataja es concreto: arrancar la suma con peso 3 en vez de 1.
// Da un dígito plausible y equivocado en la mitad de los códigos, así que un
// candado que solo mirara "devuelve un número de 0 a 9" no lo vería.
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/productos/codigoDeCaja.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  soloDigitos,
  verificadorEan13,
  ean13Valido,
  esCodigoDeCaja,
  indicadorDeEmpaque,
  unidadDesdeLaCaja,
  sinCodigoDeBarras,
  LARGO_CAJA,
  LARGO_UNIDAD,
} from "./codigoDeCaja.js";

// ===========================================================================
// 1. El verificador, contra códigos conocidos
// ===========================================================================

test("el verificador de los dos EAN-13 canónicos de GS1", () => {
  assert.equal(verificadorEan13("400638133393"), 1, "4006381333931");
  assert.equal(verificadorEan13("590123412345"), 7, "5901234123457");
});

test("CONTRAPRUEBA: con el peso invertido, 4006381333931 se rompe — y el otro NO", () => {
  // ── POR QUÉ HACEN FALTA DOS CÓDIGOS Y NO UNO ────────────────────────────
  //
  // Éste es EL error de la cuenta: arrancar la suma con peso 3 en vez de 1. Acá
  // se calcula a propósito así, y el resultado es más interesante de lo que yo
  // esperaba al escribirlo:
  //
  //   400638133393 → el correcto da 1 y el invertido da 7. Los distingue.
  //   590123412345 → los DOS dan 7. No los distingue.
  //
  // O sea que un candado escrito solo con el segundo canónico —que es un código
  // publicado, legítimo y perfectamente razonable de elegir— pasaría en verde
  // con el algoritmo equivocado. La coincidencia no es rara: con doce dígitos
  // hay una chance en diez de que las dos sumas caigan en la misma decena.
  //
  // Por eso el candado de arriba prueba los dos, y por eso este de acá afirma
  // exactamente cuál discrimina y cuál no, en vez de decir "ninguno coincide" —
  // que es lo que yo había escrito primero y era falso.
  const alReves = (doce) => {
    let suma = 0;
    for (let i = 0; i < doce.length; i += 1) suma += Number(doce[i]) * (i % 2 === 0 ? 3 : 1);
    return (10 - (suma % 10)) % 10;
  };
  assert.notEqual(alReves("400638133393"), 1, "éste es el que ataja el error");
  assert.equal(alReves("590123412345"), 7, "éste NO lo ataja, y por eso no alcanza solo");
});

test("cuando la suma cierra en cero el verificador es CERO, no diez", () => {
  // El borde que devuelve 10 si el módulo se escribe `10 - suma % 10` sin el
  // segundo `% 10`. Un verificador de dos cifras arma un código de 14 dígitos
  // que después este mismo módulo leería como código de caja.
  const doce = "000000000000";
  assert.equal(verificadorEan13(doce), 0);
  const v = verificadorEan13("123456789012");
  assert.ok(Number.isInteger(v) && v >= 0 && v <= 9, `dio ${v}`);
});

test("el verificador exige DOCE dígitos, ni once ni trece", () => {
  assert.equal(verificadorEan13("40063813339"), null, "once");
  assert.equal(verificadorEan13("4006381333931"), null, "trece");
  assert.equal(verificadorEan13(""), null);
  assert.equal(verificadorEan13(null), null);
  assert.equal(verificadorEan13("40063813339X"), null, "con letra");
});

test("un EAN-13 se valida contra su propio verificador", () => {
  assert.equal(ean13Valido("4006381333931"), true);
  assert.equal(ean13Valido("5901234123457"), true);
  // El mismo código con el verificador cambiado ya no valida.
  assert.equal(ean13Valido("4006381333932"), false);
  assert.equal(ean13Valido("400638133393"), false, "doce dígitos no es un EAN-13");
});

// ===========================================================================
// 2. Reconocer el código de caja
// ===========================================================================

test("catorce dígitos es código de caja; trece y quince no", () => {
  assert.equal(esCodigoDeCaja("14006381333938"), true);
  assert.equal(esCodigoDeCaja("4006381333931"), false, "trece es la unidad");
  assert.equal(esCodigoDeCaja("140063813339381"), false, "quince no es nada");
  assert.equal(esCodigoDeCaja(""), false);
  assert.equal(esCodigoDeCaja(null), false);
  assert.equal(esCodigoDeCaja("1400638133393A"), false, "con letra no");
  assert.equal(LARGO_CAJA - LARGO_UNIDAD, 1, "la caja tiene un dígito más que la unidad");
});

test("los espacios y guiones de un código tipeado a mano no lo descalifican", () => {
  // "7790 0000 12345 6" es como lo escribe una persona. Sin esto, un código
  // válido se leería como no numérico y el producto no entraría en el control.
  assert.equal(soloDigitos(" 1400 6381-333938 "), "14006381333938");
  assert.equal(esCodigoDeCaja("1400 6381 3339 38"), true);
  // Pero una letra sí: no es un dígito perdido, es otro dato.
  assert.equal(soloDigitos("14006381,33393B"), null);
});

// ===========================================================================
// 3. De la caja a la unidad
// ===========================================================================

test("el código de la unidad sale del cuerpo, con el verificador RECALCULADO", () => {
  // Se arma el 14 a partir del 13 canónico —indicador 1 + los doce del cuerpo +
  // el verificador del 14— que es exactamente como lo forma el fabricante.
  // Volver atrás tiene que devolver el 13 original.
  const r = unidadDesdeLaCaja("14006381333938");
  assert.equal(r.ok, true, r.motivo);
  assert.equal(r.unidad, "4006381333931");
  assert.equal(r.indicador, 1);
  assert.equal(r.cuerpo, "400638133393");
});

test("el verificador del 14 NO se reusa como verificador del 13", () => {
  // Es el error que hace que todo parezca andar: el último dígito del 14 se ve
  // como si fuera el del 13, y sale un código que no existe. Acá los dos códigos
  // de caja terminan en dígitos distintos y los dos tienen que dar el MISMO 13.
  const a = unidadDesdeLaCaja("14006381333938");
  const b = unidadDesdeLaCaja("24006381333935");
  assert.equal(a.ok && b.ok, true);
  assert.equal(a.unidad, b.unidad, "el cuerpo es el mismo, así que la unidad también");
  assert.equal(a.unidad, "4006381333931");
  // Y ninguno de los dos termina en el último dígito de su propio 14.
  assert.notEqual(a.unidad.at(-1), "8");
  assert.notEqual(b.unidad.at(-1), "5");
});

test("el segundo canónico también vuelve entero", () => {
  const r = unidadDesdeLaCaja("15901234123454");
  assert.equal(r.ok, true, r.motivo);
  assert.equal(r.unidad, "5901234123457");
});

test("indicador 9 es medida variable y NO se convierte", () => {
  // Adentro del código viaja el peso o el importe, no una unidad de catálogo.
  // Proponer un EAN-13 acá sería inventarlo.
  const r = unidadDesdeLaCaja("95901234123451");
  assert.equal(r.ok, false);
  assert.equal(r.motivo, "MEDIDA_VARIABLE");
  assert.equal(indicadorDeEmpaque("95901234123451"), 9);
});

test("los dos «no se pudo» se distinguen, porque la pantalla dice cosas distintas", () => {
  assert.equal(unidadDesdeLaCaja("4006381333931").motivo, "NO_ES_DE_CAJA", "trece dígitos");
  assert.equal(unidadDesdeLaCaja("ABC").motivo, "NO_NUMERICO");
  assert.equal(unidadDesdeLaCaja(null).motivo, "NO_NUMERICO");
  assert.equal(unidadDesdeLaCaja("").motivo, "NO_NUMERICO");
});

test("el código que sale siempre es un EAN-13 válido", () => {
  // La propiedad que hace que valga la pena proponerlo: sea cual sea el 14 bien
  // formado que entre, lo que sale se puede escanear.
  for (const indicador of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const cuerpo = "400638133393";
    const catorce = `${indicador}${cuerpo}0`; // el verificador del 14 da igual
    const r = unidadDesdeLaCaja(catorce);
    assert.equal(r.ok, true, `indicador ${indicador}: ${r.motivo}`);
    assert.equal(ean13Valido(r.unidad), true, `indicador ${indicador} dio ${r.unidad}`);
    assert.equal(r.unidad.length, LARGO_UNIDAD);
  }
});

// ===========================================================================
// 4. Sin código de barras
// ===========================================================================

test("sin código mira los TRES campos, no solo el principal", () => {
  // El propio de la ubicación se escanea igual que los otros dos. Contar como
  // "sin código" a un producto que el local identifica con el suyo mandaría a
  // alguien a cargar un código que ya existe.
  assert.equal(sinCodigoDeBarras({}), true);
  assert.equal(sinCodigoDeBarras({ codigo_barra: null, codigo_barra_secundario: null }), true);
  assert.equal(sinCodigoDeBarras({ codigo_barra: "4006381333931" }), false);
  assert.equal(sinCodigoDeBarras({ codigo_barra_secundario: "4006381333931" }), false);
  assert.equal(sinCodigoDeBarras({ codigo_barra_propio: "INT-77" }), false);
});

test("un código con letras CUENTA como código cargado", () => {
  // Un código interno no es un EAN y se escanea igual. Si acá se reusara la
  // limpieza numérica, este producto se contaría como faltante y el control
  // mandaría a cargar algo que ya está.
  assert.equal(sinCodigoDeBarras({ codigo_barra: "INT-0099" }), false);
  // Pero los espacios en blanco no son un código.
  assert.equal(sinCodigoDeBarras({ codigo_barra: "   " }), true);
});
