// LOS DOS CAMPOS QUE SE SINCRONIZAN, EL REDONDEO Y EL MARGEN REAL.
//
//   node --import ./scripts/alias-loader.mjs --test lib/ofertas/precioConMargen.test.mjs
//
// Todo se afirma sobre comportamiento: qué número sale de qué número. Ningún
// candado mira una clase de CSS.
//
// Los valores son los del diseño aprobado —costo $2.833,33, precio normal
// $3.700— para que un cambio en la cuenta se vea contra los mismos números que
// se aprobaron.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  estadoInicial,
  margenDesdePrecio,
  margenInvalido,
  numeroDeCampo,
  precioDesdeMargen,
  resolverBloque,
  textoDeRedondeo,
} from "@/lib/ofertas/precioConMargen";

const COSTO = 2833.33;
const NORMAL = 3700;
const money = (n) => `$ ${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── 1 · LA CUENTA, EN LOS DOS SENTIDOS ────────────────────────────────────

test("M1 · margen SOBRE EL COSTO, ida y vuelta", () => {
  // La cuenta es `precio = costo × (1 + %/100)`, NO margen sobre la venta.
  assert.equal(precioDesdeMargen(1000, 30), 1300);
  assert.equal(margenDesdePrecio(1000, 1300), 30);

  // Y es reversible: escribir un % y después el precio que salió da el mismo %.
  const p = precioDesdeMargen(COSTO, 18);
  assert.equal(margenDesdePrecio(COSTO, p), 18);
});

test("M2 · NO es margen sobre la venta, y la diferencia se mide", () => {
  // El mismo producto da 30 % sobre el costo y 23,08 % sobre la venta. Si alguien
  // cambia la fórmula por la otra, este candado lo dice con los dos números.
  const sobreCosto = margenDesdePrecio(1000, 1300);
  const sobreVenta = ((1300 - 1000) / 1300) * 100;
  assert.equal(sobreCosto, 30);
  assert.ok(Math.abs(sobreVenta - 23.08) < 0.01);
  assert.notEqual(Math.round(sobreCosto), Math.round(sobreVenta));
});

test("M3 · sin costo no hay margen: devuelve null, no cero ni infinito", () => {
  // Dividir por cero daría Infinity y un 0 sería un valor donde falta el dato.
  for (const c of [0, null, undefined, -5, "x"]) {
    assert.equal(margenDesdePrecio(c, 1300), null, `costo ${c}`);
    assert.equal(precioDesdeMargen(c, 30), null, `costo ${c}`);
  }
});

// ── 2 · EL ARRANQUE ───────────────────────────────────────────────────────

test("M4 · arranca con el margen REAL de hoy, no vacío", () => {
  const e = estadoInicial({ precioNormal: NORMAL, costo: COSTO });
  assert.equal(e.precio, 3700);
  assert.equal(e.margen, margenDesdePrecio(COSTO, NORMAL));
  assert.ok(e.margen > 0, "el margen inicial tiene que ser el que el producto ya tiene");
  assert.equal(e.hayCosto, true);
});

test("M5 · el estado inicial NO es una oferta: publicar arranca apagado", () => {
  // Es el precio normal escrito en dos campos. Si `esOferta` diera true acá, el
  // botón se habilitaría sin que nadie haya bajado nada.
  const e = estadoInicial({ precioNormal: NORMAL, costo: COSTO });
  const b = resolverBloque({
    origen: "PRECIO", precio: String(e.precio), margen: String(e.margen),
    costo: COSTO, precioNormal: NORMAL, redondear: true,
  });
  assert.equal(b.esOferta, false, "el precio normal no es una oferta");

  // Y baja un peso del normal → sí lo es.
  const baja = resolverBloque({
    origen: "PRECIO", precio: "3600", costo: COSTO, precioNormal: NORMAL, redondear: true,
  });
  assert.equal(baja.esOferta, true);
});

test("M6 · SIN COSTO no hay campo de margen, y se dice", () => {
  const e = estadoInicial({ precioNormal: NORMAL, costo: 0 });
  assert.equal(e.hayCosto, false);
  assert.equal(e.margen, null, "sin costo el margen es un dato que falta, no un cero");
  assert.equal(e.precio, 3700, "el precio sí se conoce igual");
});

// ── 3 · LA SINCRONIZACIÓN ─────────────────────────────────────────────────

test("M7 · se escribe el MARGEN y se recalcula el precio", () => {
  const b = resolverBloque({
    origen: "MARGEN", margen: "18", costo: COSTO, precioNormal: NORMAL, redondear: false,
  });
  assert.equal(b.margen, "18", "EL CAMPO QUE SE TOCA NO SE REESCRIBE debajo del dedo");
  // El OTRO campo sí: queda con el precio que sale de ese margen.
  assert.equal(b.precio, precioDesdeMargen(COSTO, 18));
  assert.equal(b.precioFinal, precioDesdeMargen(COSTO, 18));
});

test("M8 · se escribe el PRECIO y se recalcula el margen", () => {
  const b = resolverBloque({
    origen: "PRECIO", precio: "3300", costo: COSTO, precioNormal: NORMAL, redondear: false,
  });
  assert.equal(b.precio, "3300", "el campo tocado vuelve tal cual");
  assert.equal(b.margen, margenDesdePrecio(COSTO, 3300));
  assert.equal(b.precioFinal, 3300);
});

test("M9 · el campo tocado NO se reescribe: se puede tipear de a un dígito", () => {
  // Es el defecto concreto que esto evita: si el campo se reescribiera, tipear
  // "12" daría "1" → reescrito → y el cursor se mueve.
  for (const parcial of ["1", "12", "12.", "12.5"]) {
    const b = resolverBloque({
      origen: "MARGEN", margen: parcial, costo: COSTO, precioNormal: NORMAL,
    });
    assert.equal(b.margen, parcial, `se reescribió mientras se tipeaba «${parcial}»`);
  }
});

// ── 4 · EL REDONDEO, Y EL % QUE SE MUESTRA ────────────────────────────────

test("M10 · con redondeo ENCENDIDO el precio sube al siguiente 100", () => {
  const b = resolverBloque({
    origen: "MARGEN", margen: "18", costo: COSTO, precioNormal: NORMAL, redondear: true,
  });
  const exacto = precioDesdeMargen(COSTO, 18);
  assert.equal(b.precioSinRedondear, exacto);
  assert.equal(b.precioFinal, Math.ceil(exacto / 100) * 100);
  assert.equal(b.redondeoCambioAlgo, true);
});

test("M11 · EL % QUE SE MUESTRA ES EL DE DESPUÉS DEL REDONDEO", () => {
  // Es el punto del pedido: si se tipeó 18 y quedó otro, el campo dice el otro.
  const b = resolverBloque({
    origen: "PRECIO", precio: "3343.33", costo: COSTO, precioNormal: NORMAL, redondear: true,
  });
  assert.equal(b.precioFinal, 3400);
  assert.equal(b.margenReal, margenDesdePrecio(COSTO, 3400));
  assert.notEqual(b.margenReal, margenDesdePrecio(COSTO, 3343.33), "mostró el margen del precio SIN redondear");
});

test("M12 · con redondeo APAGADO se cobra el exacto, con decimales", () => {
  const b = resolverBloque({
    origen: "MARGEN", margen: "18", costo: COSTO, precioNormal: NORMAL, redondear: false,
  });
  assert.equal(b.precioFinal, precioDesdeMargen(COSTO, 18));
  assert.equal(b.redondeoCambioAlgo, false, "apagado, el redondeo no cambió nada");
  assert.equal(b.precioFinal, b.precioSinRedondear);
});

test("M13 · la línea del redondeo solo aparece cuando cambió algo", () => {
  const cambio = resolverBloque({
    origen: "PRECIO", precio: "3343.33", costo: COSTO, precioNormal: NORMAL, redondear: true,
  });
  assert.match(textoDeRedondeo(cambio, money), /Redondeado de \$ 3\.343,33/);
  assert.match(textoDeRedondeo(cambio, money), /el margen real queda en/);

  // Un precio que ya es múltiplo de 100 no genera línea: no hay nada que avisar.
  const redondo = resolverBloque({
    origen: "PRECIO", precio: "3300", costo: COSTO, precioNormal: NORMAL, redondear: true,
  });
  assert.equal(redondo.redondeoCambioAlgo, false);
  assert.equal(textoDeRedondeo(redondo, money), "");
});

test("M14 · el redondeo usa la MISMA regla del POS, incluido su caso de coma flotante", () => {
  // `redondear100` normaliza a centavos antes de subir, porque sin eso
  // 1400,0000000001 daba 1500. Si alguien escribe un `Math.ceil` propio acá,
  // este candado lo dice.
  const b = resolverBloque({
    origen: "PRECIO", precio: "1400.0000000001", costo: COSTO, precioNormal: NORMAL, redondear: true,
  });
  assert.equal(b.precioFinal, 1400, "se redondeó de más: no se usó la regla del POS");
});

// ── 5 · LAS VALIDACIONES ──────────────────────────────────────────────────

test("M15 · el margen NEGATIVO se frena en el campo", () => {
  // Es la única de las tres que bloquea, y el motivo está escrito: nadie pone
  // "-20" queriendo vender bajo costo, para eso escribe el precio.
  assert.match(margenInvalido("-20"), /no puede ser negativo/);
  assert.equal(margenInvalido("0"), null, "margen cero es vender al costo, y es legítimo");
  assert.equal(margenInvalido("15"), null);
  assert.equal(margenInvalido(""), null, "un campo vacío no es un error");
});

test("M16 · un precio BAJO EL COSTO no bloquea: da margen negativo y sigue", () => {
  const b = resolverBloque({
    origen: "PRECIO", precio: "2000", costo: COSTO, precioNormal: NORMAL, redondear: true,
  });
  assert.ok(b.margenReal < 0, "vender bajo costo da margen negativo");
  assert.equal(b.esOferta, true, "y se puede publicar igual: avisa, no bloquea");
});

test("M17 · un precio MAYOR O IGUAL al normal no es oferta", () => {
  for (const p of ["3700", "4000"]) {
    const b = resolverBloque({
      origen: "PRECIO", precio: p, costo: COSTO, precioNormal: NORMAL, redondear: true,
    });
    assert.equal(b.esOferta, false, `${p} no puede ser una oferta contra un normal de ${NORMAL}`);
  }
});

test("M18 · sin nada escrito no inventa números", () => {
  for (const v of ["", null, undefined]) {
    const b = resolverBloque({ origen: "PRECIO", precio: v, costo: COSTO, precioNormal: NORMAL });
    assert.equal(b.precioFinal, null);
    assert.equal(b.esOferta, false);
  }
  assert.equal(numeroDeCampo(""), null);
  assert.equal(numeroDeCampo("3.300,5"), null, "un texto que no es número no se adivina");
  assert.equal(numeroDeCampo("3300,5"), 3300.5, "la coma decimal argentina sí");
});

// ── 6 · LAS DOS VALIDACIONES QUE SE PISABAN ENTRE SÍ ──────────────────────
//
// M15 y M16 dicen cosas opuestas sobre el mismo número, y las dos tienen razón:
// un margen negativo TIPEADO frena, y un precio bajo el costo se publica igual.
// Lo que las hace convivir es que los campos están sincronizados, así que el
// segundo caso DEJA UN MARGEN NEGATIVO ESCRITO en el otro campo sin que nadie lo
// haya tipeado — y si `margenInvalido` no mirara el origen, frenaría justo la
// venta bajo costo que M16 dice que se puede publicar.
//
// Esto no lo atrapaba ningún candado: M15 llamaba a `margenInvalido` suelta y
// M16 miraba `resolverBloque`, y la pantalla es la que las junta.

test("M19 · el margen negativo TIPEADO frena; el DERIVADO de un precio, no", () => {
  assert.match(margenInvalido("-20", "MARGEN"), /no puede ser negativo/);
  assert.equal(
    margenInvalido("-20", "PRECIO"),
    null,
    "frenó un margen que nadie tipeó: sale de un precio bajo el costo, y eso se publica"
  );
});

test("M20 · el caso completo: precio bajo el costo deja publicar", () => {
  // El recorrido tal cual lo hace la pantalla: se escribe un precio por debajo
  // del costo, el otro campo queda con el margen negativo que salió de ahí, y la
  // pregunta que decide el botón se hace con ESE margen y ESE origen.
  const b = resolverBloque({
    origen: "PRECIO", precio: "2000", costo: COSTO, precioNormal: NORMAL, redondear: true,
  });
  const margenEnElCampo = String(b.margenReal);
  assert.ok(Number(margenEnElCampo) < 0);
  assert.equal(
    margenInvalido(margenEnElCampo, "PRECIO"),
    null,
    "la pantalla frenaría una oferta bajo costo, que es legítima"
  );
  assert.equal(b.esOferta, true);
});
