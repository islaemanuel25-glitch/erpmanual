// Candados de las dos caras de la tarjeta.
//
// ── CÓMO SE COMPRUEBA QUE NO SE REIMPLEMENTÓ NADA ──────────────────────────
//
// La afirmación central de este módulo es "acá no se divide ni se redondea": los
// importes salen de las funciones del POS. Un candado con números escritos a mano
// NO prueba eso — probaría que la cuenta da lo que a quien escribió el test le
// pareció, y si mañana el redondeo cambia, el candado defendería el valor viejo.
//
// Por eso los esperados se calculan LLAMANDO a las funciones existentes
// —`precioUnitarioQueSeCobra`, `precioEnEscalaQueSeCobra`,
// `valorEnLaEscalaDeVenta`, `lineaDeEquivalencia`— y se comparan contra lo que
// devuelven las caras. Si alguien mete una división al lado, los dos números se
// separan y esto se pone rojo.
//
// Los pocos números escritos a mano que hay son de entrada, no de salida.

import test from "node:test";
import assert from "node:assert/strict";

import { carasDeTarjeta, presentacionDe, nombreCortoDe } from "./carasDeTarjeta.js";
import {
  ESCALA_BULTO,
  ESCALA_IMPORTE,
  ESCALA_KG,
  ESCALA_PIEZA,
  ESCALA_UNIDAD,
  escalaDeVentaDe,
  valorEnLaEscalaDeVenta,
} from "@/lib/precios/escalaDeVenta";
import { precioEnEscalaQueSeCobra, precioUnitarioQueSeCobra } from "@/lib/precios/redondeo";
import { lineaDeEquivalencia } from "@/lib/moneda";

/** Un pack de 24, como el `361 LATA X24` que destapó media tanda. */
const PACK = { factor: 24, unidad: "pack" };

test("G1. EL FRENTE ES LA ESCALA EN LA QUE SE VENDE, no la que se guarda", () => {
  // El mismo producto, en dos ubicaciones: el depósito lo vende por bulto y un
  // local por unidad. La escala no la decide este módulo — la decide
  // `escalaDeVentaDe`, que es la del POS— y acá se comprueba que la respeta.
  const producto = { unidadMedida: "pack", factorPack: 24, modoEnvio: "SOLO_BULTO" };

  const enDeposito = escalaDeVentaDe(producto, true);
  const enLocal = escalaDeVentaDe(producto, false);
  assert.equal(enDeposito, ESCALA_BULTO);
  assert.equal(enLocal, ESCALA_UNIDAD);

  const deposito = carasDeTarjeta({ escala: enDeposito, precio: 24000, ...PACK });
  const local = carasDeTarjeta({ escala: enLocal, precio: 24000, ...PACK });

  assert.equal(deposito.frente.escala, ESCALA_BULTO);
  assert.equal(local.frente.escala, ESCALA_UNIDAD);
});

test("G2. DEPÓSITO POR BULTO: el frente es el importe del bulto, y sale del helper", () => {
  const caras = carasDeTarjeta({ escala: ESCALA_BULTO, precio: 24000, ...PACK });

  assert.equal(
    caras.frente.importe,
    precioEnEscalaQueSeCobra({ precio: 24000, factor: 24, unidad: "pack", redondeo100: false })
  );
  assert.equal(caras.frente.presentacion, "PACK X 24");
});

test("G3. LOCAL POR UNIDAD: el frente es el unitario, y sale del helper", () => {
  const caras = carasDeTarjeta({ escala: ESCALA_UNIDAD, precio: 24000, ...PACK });

  assert.equal(
    caras.frente.importe,
    precioUnitarioQueSeCobra({ precio: 24000, factor: 24, unidad: "pack", redondeo100: false })
  );
  assert.equal(caras.frente.presentacion, "UNIDAD");
});

test("G4. EL DORSO ES LA OTRA ESCALA, con el helper que le corresponde", () => {
  const porBulto = carasDeTarjeta({ escala: ESCALA_BULTO, precio: 24000, ...PACK });
  assert.equal(porBulto.dorso.escala, ESCALA_UNIDAD);
  assert.equal(
    porBulto.dorso.importe,
    precioUnitarioQueSeCobra({ precio: 24000, factor: 24, unidad: "pack", redondeo100: false })
  );
  assert.equal(porBulto.dorso.presentacion, "UNIDAD");

  // Y al revés: en un local, el frente es la unidad y el dorso el pack.
  const porUnidad = carasDeTarjeta({ escala: ESCALA_UNIDAD, precio: 24000, ...PACK });
  assert.equal(porUnidad.dorso.escala, ESCALA_BULTO);
  assert.equal(
    porUnidad.dorso.importe,
    precioEnEscalaQueSeCobra({ precio: 24000, factor: 24, unidad: "pack", redondeo100: false })
  );
  assert.equal(porUnidad.dorso.presentacion, "PACK X 24");
});

test("G5. EL REDONDEO ES EL DE LAS FUNCIONES EXISTENTES, en las dos caras", () => {
  // ── EL CANDADO QUE MÁS FALTA HACE ────────────────────────────────────────
  //
  // El redondeo a 100 se aplica sobre el UNITARIO y no sobre el bulto, porque el
  // POS no cobra bultos. Cualquiera que reescriba esta cuenta va a redondear lo
  // que tenga a mano, y el catálogo va a mostrar un número que el mostrador no
  // cobra — que es exactamente el defecto que costó la tanda del redondeo.
  const con = { escala: ESCALA_BULTO, precio: 31900, redondeo100: true, ...PACK };
  const caras = carasDeTarjeta(con);

  assert.equal(
    caras.frente.importe,
    precioEnEscalaQueSeCobra({ precio: 31900, factor: 24, unidad: "pack", redondeo100: true })
  );
  assert.equal(
    caras.dorso.importe,
    precioUnitarioQueSeCobra({ precio: 31900, factor: 24, unidad: "pack", redondeo100: true })
  );

  // Y el redondeo cambia el número: si diera lo mismo con y sin, este candado
  // estaría pasando sin ejercer nada.
  const sin = carasDeTarjeta({ ...con, redondeo100: false });
  assert.notEqual(caras.dorso.importe, sin.dorso.importe);
});

test("G6. UN SUELTO NO TIENE SEGUNDA CARA, y la tarjeta funciona igual", () => {
  // Sin bulto no hay conversión: mostrar un dorso sería inventar una referencia.
  const suelto = carasDeTarjeta({
    escala: ESCALA_UNIDAD,
    precio: 1500,
    factor: 1,
    unidad: "unidad",
  });
  assert.equal(suelto.dorso, null);
  assert.equal(suelto.frente.presentacion, "UNIDAD");
  assert.equal(
    suelto.frente.importe,
    valorEnLaEscalaDeVenta({ escala: ESCALA_UNIDAD, valor: 1500, factor: 1, unidad: "unidad" })
  );
});

test("G7. contraprueba de G6: la condición de bulto NO se escribió acá", () => {
  // El módulo no pregunta "¿unidad es pack y factor > 1?" — le pide los dos
  // importes a las funciones y compara. Este candado ejerce los casos donde esa
  // condición decide, para que se note si alguien la reescribe distinto.
  //
  // factor 1 → no hay bulto aunque la unidad diga pack.
  assert.equal(carasDeTarjeta({ escala: ESCALA_UNIDAD, precio: 100, factor: 1, unidad: "pack" }).dorso, null);
  // unidad suelta → no hay bulto aunque el factor sea grande.
  assert.equal(carasDeTarjeta({ escala: ESCALA_UNIDAD, precio: 100, factor: 12, unidad: "unidad" }).dorso, null);
  // cajón sí es bulto, igual que pack.
  assert.notEqual(carasDeTarjeta({ escala: ESCALA_BULTO, precio: 1200, factor: 6, unidad: "cajon" }).dorso, null);
});

test("G8. KILO: la referencia es la que ya existía, no una conversión nueva", () => {
  const caras = carasDeTarjeta({ escala: ESCALA_KG, precio: 1300, factor: null, unidad: "kg" });

  assert.equal(caras.frente.presentacion, "KG");
  // El dorso NO tiene un importe con otra escala: no hay pack ↔ unidad acá.
  assert.equal(caras.dorso.importe, null);
  assert.equal(caras.dorso.presentacion, null);
  // Y su texto sale de `lineaDeEquivalencia`, la misma función que dibujaba la
  // franja. No se escribe una frase parecida al lado.
  assert.equal(
    caras.dorso.detalle,
    lineaDeEquivalencia({ precio: 1300, factor: null, unidad: "kg", escala: ESCALA_KG })
  );
});

test("G9. PIEZA FIJA: lo mismo, y el peso lo resuelve el helper", () => {
  const entrada = {
    escala: ESCALA_PIEZA,
    precio: 1000,
    factor: null,
    unidad: "kg",
    pesoReferenciaKg: 6,
  };
  const caras = carasDeTarjeta(entrada);

  assert.equal(caras.frente.presentacion, "PIEZA");
  // El importe del frente es la pieza, y sale de la función que sabe multiplicar
  // por el peso — la misma cuenta que hace el POS.
  assert.equal(
    caras.frente.importe,
    valorEnLaEscalaDeVenta({
      escala: ESCALA_PIEZA,
      valor: 1000,
      factor: null,
      unidad: "kg",
      pesoReferenciaKg: 6,
    })
  );
  assert.equal(caras.dorso.importe, null);
  assert.equal(
    caras.dorso.detalle,
    lineaDeEquivalencia({
      precio: 1000,
      factor: null,
      unidad: "kg",
      escala: ESCALA_PIEZA,
      pesoReferenciaKg: 6,
    })
  );
});

test("G10. una pieza SIN peso de referencia no inventa un dorso", () => {
  // Sin peso no hay cuenta posible. La respuesta es "no hay segunda cara", no un
  // número aproximado.
  const caras = carasDeTarjeta({ escala: ESCALA_PIEZA, precio: 1000, unidad: "kg" });
  assert.equal(caras.dorso, null);
});

test("G11. IMPORTE VARIABLE: sin precio y sin dorso", () => {
  // La columna de precio es obligatoria y el formulario les guarda 0. Cero no es
  // gratis: el frente tiene que decir que no hay precio, y no "$0,00".
  const caras = carasDeTarjeta({ escala: ESCALA_IMPORTE, precio: 0, factor: 24, unidad: "pack" });
  assert.equal(caras.frente.importe, null);
  assert.equal(caras.frente.presentacion, "IMPORTE VARIABLE");
  assert.equal(caras.dorso, null);
});

test("G12. sin precio cargado no hay dorso, en vez de un dorso en cero", () => {
  for (const precio of [null, undefined, ""]) {
    const caras = carasDeTarjeta({ escala: ESCALA_BULTO, precio, ...PACK });
    assert.equal(caras.frente.importe, null);
    assert.equal(caras.dorso, null, `con precio ${JSON.stringify(precio)} apareció un dorso`);
  }
});

test("G13. la presentación no afirma un pack que no existe", () => {
  // "PACK X 1" no es una presentación: es un producto suelto mal declarado, y
  // escribirlo lo daría por bueno.
  assert.equal(presentacionDe({ escala: ESCALA_BULTO, factor: 1, unidad: "pack" }), "BULTO");
  assert.equal(presentacionDe({ escala: ESCALA_BULTO, factor: null, unidad: "pack" }), "BULTO");
  assert.equal(presentacionDe({ escala: ESCALA_BULTO, factor: 6, unidad: "cajon" }), "CAJÓN X 6");
});

test("G14. el botón nombra la cara a la que lleva, y sale del mismo rótulo", () => {
  // Si el nombre corto se escribiera aparte, el botón podría decir "Ver unidad"
  // y llevar al pack.
  assert.equal(nombreCortoDe("PACK X 24"), "pack");
  assert.equal(nombreCortoDe("CAJÓN X 6"), "cajón");
  assert.equal(nombreCortoDe("UNIDAD"), "unidad");
  assert.equal(nombreCortoDe("KG"), "kilo");
  assert.equal(nombreCortoDe("PIEZA"), "pieza");
  // Un dorso sin presentación —kilo, pieza— igual tiene que poder nombrarse.
  assert.equal(nombreCortoDe(null), "referencia");
});

test("G15. EL COMBO NO PIERDE SU MARCA al irse la franja", () => {
  // Era lo único que distinguía un combo en toda la tarjeta, y vivía en la franja
  // de equivalencia. Ahora viaja con el frente.
  assert.equal(carasDeTarjeta({ escala: ESCALA_UNIDAD, precio: 100, esCombo: true }).frente.esCombo, true);
  assert.equal(carasDeTarjeta({ escala: ESCALA_UNIDAD, precio: 100 }).frente.esCombo, false);
  // Y no se dice dos veces: el dorso de kilo no repite el prefijo.
  const combo = carasDeTarjeta({ escala: ESCALA_KG, precio: 1300, unidad: "kg", esCombo: true });
  assert.doesNotMatch(String(combo.dorso.detalle), /Combo/);
});
