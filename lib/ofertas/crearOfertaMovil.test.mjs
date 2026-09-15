// LA PANTALLA DE CREAR OFERTA: LO QUE DICE Y HASTA CUÁNDO DURA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/ofertas/crearOfertaMovil.test.mjs
//
// Todo lo de acá se afirma sobre COMPORTAMIENTO, no sobre forma: qué frase sale
// con qué números, y qué fecha se guarda con qué chip. Ningún candado mira una
// clase de CSS.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  avisaSinStock,
  DURACIONES,
  finDeLaOferta,
  lineasDePrecio,
  money,
  puedePublicar,
  resumenDeLaOferta,
  textoDeVigencia,
  ultimoDiaVigente,
} from "@/lib/ofertas/crearOfertaMovil";

// Un lunes a media mañana, hora argentina: 2026-09-14 13:00 UTC = 10:00 AR.
const LUNES_14 = new Date("2026-09-14T13:00:00.000Z");

const MANI = { nombre: "MANI CASCARA 500G", precioNormal: 25000, costo: 19200 };

// ── 1 · HASTA CUÁNDO DURA ─────────────────────────────────────────────────

test("O1 · «Hoy» termina al arrancar mañana, y el último día vigente es HOY", () => {
  // La ventana es semiabierta: en el instante `finEn` la oferta ya no rige. Por
  // eso el corte es la medianoche siguiente y no las 23:59:59 — ese segundo
  // muerto es donde dos ofertas consecutivas se pisan o dejan un hueco.
  const fin = finDeLaOferta({ duracion: "HOY", desde: LUNES_14 });
  assert.equal(fin.toISOString(), "2026-09-15T03:00:00.000Z");

  // Y lo que se MUESTRA es el último día en que rige, que es hoy.
  assert.match(textoDeVigencia(fin), /lunes 14 de septiembre/);
});

test("O2 · «3 días» y «1 semana» cuentan desde hoy inclusive", () => {
  const tres = finDeLaOferta({ duracion: "TRES_DIAS", desde: LUNES_14 });
  assert.equal(tres.toISOString(), "2026-09-18T03:00:00.000Z");
  assert.match(textoDeVigencia(tres), /jueves 17 de septiembre/);

  const semana = finDeLaOferta({ duracion: "UNA_SEMANA", desde: LUNES_14 });
  assert.equal(semana.toISOString(), "2026-09-22T03:00:00.000Z");
  assert.match(textoDeVigencia(semana), /lunes 21 de septiembre/);
});

test("O3 · la hora del día NO mueve la fecha de fin", () => {
  // Es el defecto que tendría sumar 3×86400000 al instante: una oferta cargada a
  // las 22:00 terminaría a las 22:00 del jueves y no al final del jueves, así
  // que el último día se cobraría a medias.
  const temprano = finDeLaOferta({ duracion: "TRES_DIAS", desde: new Date("2026-09-14T11:00:00.000Z") });
  const tarde = finDeLaOferta({ duracion: "TRES_DIAS", desde: new Date("2026-09-15T02:30:00.000Z") });
  assert.equal(temprano.toISOString(), tarde.toISOString());
});

test("O4 · «Elegir» toma el día elegido como ÚLTIMO día incluido", () => {
  const fin = finDeLaOferta({ duracion: "ELEGIR", fechaElegida: "2026-09-21" });
  assert.equal(fin.toISOString(), "2026-09-22T03:00:00.000Z");
  assert.match(textoDeVigencia(fin), /lunes 21 de septiembre/);

  // Sin fecha no inventa una.
  assert.equal(finDeLaOferta({ duracion: "ELEGIR" }), null);
  assert.equal(finDeLaOferta({ duracion: "ELEGIR", fechaElegida: "" }), null);
  assert.match(textoDeVigencia(null), /Elegí hasta cuándo/);
});

test("O5 · los cuatro chips están y en el orden del diseño", () => {
  assert.deepEqual(
    DURACIONES.map((d) => d.etiqueta),
    ["Hoy", "3 días", "1 semana", "Elegir"]
  );
});

test("O6 · el último día vigente es un instante ANTES del corte", () => {
  const fin = new Date("2026-09-22T03:00:00.000Z");
  assert.equal(ultimoDiaVigente(fin).toISOString(), "2026-09-22T02:59:59.000Z");
  // Que en Argentina es el lunes 21 a las 23:59:59.
  assert.match(textoDeVigencia(fin), /lunes 21/);
  assert.equal(ultimoDiaVigente(null), null);
});

// ── 2 · LAS DOS LÍNEAS DEL PRECIO ─────────────────────────────────────────

test("O7 · el caso bueno: descuento y margen, los dos números", () => {
  const r = lineasDePrecio({ precioNormal: 25000, precioOferta: 22500, costo: 19200 });
  assert.equal(r.tono, "ok");
  assert.equal(r.principal, "De $ 25.000,00 a $ 22.500,00 · 10 % menos");
  assert.equal(r.secundaria, "Te queda 14.67 % de margen sobre el costo");
  assert.equal(r.puedePublicar, true);
});

test("O8 · BAJO COSTO: avisa a pérdida y DEJA PUBLICAR", () => {
  // Es la regla que ya está escrita en `validarPrecioOferta` y que este módulo
  // no puede contradecir: vender bajo costo es una decisión comercial legítima
  // —un líder de pérdida— y el sistema no opina sobre el negocio.
  const r = lineasDePrecio({ precioNormal: 25000, precioOferta: 18000, costo: 19200 });
  assert.equal(r.tono, "perdida");
  assert.match(r.principal, /a pérdida/);
  assert.match(r.secundaria, /\$ 1\.200,00/);
  assert.equal(r.puedePublicar, true, "vender bajo costo AVISA, no bloquea");
});

test("O9 · precio MAYOR O IGUAL al normal: eso no es una oferta y no se publica", () => {
  for (const p of [25000, 26000]) {
    const r = lineasDePrecio({ precioNormal: 25000, precioOferta: p, costo: 19200 });
    assert.equal(r.tono, "invalida");
    assert.match(r.principal, /no es una oferta/);
    assert.equal(r.puedePublicar, false);
  }
});

test("O10 · sin precio escrito todavía no dice nada", () => {
  // Un aviso de error mientras el campo está vacío es un reproche por no haber
  // empezado a escribir.
  for (const p of [null, "", 0, undefined]) {
    const r = lineasDePrecio({ precioNormal: 25000, precioOferta: p, costo: 19200 });
    assert.equal(r.tono, "neutro");
    assert.equal(r.principal, "");
    assert.equal(r.puedePublicar, false);
  }
});

test("O11 · un producto sin precio normal no se puede ofertar, y se dice", () => {
  const r = lineasDePrecio({ precioNormal: 0, precioOferta: 100, costo: 50 });
  assert.equal(r.tono, "invalida");
  assert.match(r.principal, /no tiene precio normal/);
  assert.equal(r.puedePublicar, false);
});

test("O12 · sin costo cargado, la línea del margen NO se inventa", () => {
  const r = lineasDePrecio({ precioNormal: 25000, precioOferta: 22500, costo: 0 });
  assert.equal(r.tono, "ok");
  assert.match(r.principal, /10 % menos/);
  // Con costo 0 el margen daría 100 % y sería mentira: no hay costo cargado.
  assert.ok(!/margen/.test(r.secundaria) || r.secundaria === "");
});

// ── 3 · EL RESUMEN DEL PIE ────────────────────────────────────────────────

test("O13 · el resumen dice los MISMOS números que se van a guardar", () => {
  // Es lo último que se lee antes de publicar. Si dijera otro precio, el error
  // se descubre cuando un cliente reclama en el mostrador.
  const texto = resumenDeLaOferta({
    producto: MANI,
    precioOferta: 22500,
    finEn: finDeLaOferta({ duracion: "UNA_SEMANA", desde: LUNES_14 }),
    nombreDelLocal: "Mini el 7",
    soloEfectivo: false,
  });
  assert.equal(
    texto,
    "MANI CASCARA 500G pasa de $ 25.000,00 a $ 22.500,00 hasta el lunes 21, en Mini el 7, con cualquier medio de pago."
  );
});

test("O14 · con solo efectivo, el resumen lo dice", () => {
  const texto = resumenDeLaOferta({
    producto: MANI,
    precioOferta: 22500,
    finEn: finDeLaOferta({ duracion: "HOY", desde: LUNES_14 }),
    nombreDelLocal: "Mini el 7",
    soloEfectivo: true,
  });
  assert.match(texto, /solo si paga en efectivo\.$/);
  assert.ok(!/cualquier medio/.test(texto));
});

test("O15 · el resumen no miente cuando falta algo", () => {
  assert.match(resumenDeLaOferta({}), /Elegí un producto/);
  assert.match(
    resumenDeLaOferta({ producto: MANI, precioOferta: 0 }),
    /falta el precio de oferta/
  );
});

// ── 4 · EL BOTÓN DE PUBLICAR ──────────────────────────────────────────────

test("O16 · publicar necesita producto, precio válido Y fecha de fin", () => {
  const fin = finDeLaOferta({ duracion: "HOY", desde: LUNES_14 });

  assert.equal(puedePublicar({ producto: MANI, precioOferta: 22500, finEn: fin }), true);
  assert.equal(puedePublicar({ producto: null, precioOferta: 22500, finEn: fin }), false);
  assert.equal(puedePublicar({ producto: MANI, precioOferta: 0, finEn: fin }), false);
  assert.equal(puedePublicar({ producto: MANI, precioOferta: 30000, finEn: fin }), false);
  // Sin fecha de fin no se publica: una oferta sin ventana es un dato roto, y el
  // estado derivado la trataría como VENCIDA.
  assert.equal(puedePublicar({ producto: MANI, precioOferta: 22500, finEn: null }), false);

  // Y a pérdida SÍ se publica, que es el otro lado de O8.
  assert.equal(puedePublicar({ producto: MANI, precioOferta: 18000, finEn: fin }), true);
});

test("O17 · el importe se escribe siempre igual", () => {
  assert.equal(money(22500), "$ 22.500,00");
  assert.equal(money(0), "$ 0,00");
  assert.equal(money(null), "$ 0,00");
});

// ── EL AVISO DE STOCK, CON LAS DOS RAMAS EJERCIDAS ────────────────────────
//
// Vive acá y no adentro del JSX porque adentro del JSX la rama que SÍ dibuja el
// aviso no se puede alcanzar desde el arnés: en la base de pruebas todos los
// productos tienen stock, así que la afirmación del navegador medía siempre el
// mismo lado. Es el defecto que más se repite en este repo —un candado que no
// puede ponerse rojo— y la salida es la de siempre: sacar la decisión a una
// función y ejercer las dos ramas con números elegidos.

test("O18 · sin stock y con la venta sin stock DESHABILITADA, avisa", () => {
  assert.equal(avisaSinStock({ permiteVenderSinStock: false, stock: 0 }), true);
  assert.equal(avisaSinStock({ permiteVenderSinStock: false, stock: -4 }), true);
});

test("O19 · con la venta sin stock HABILITADA no avisa NUNCA", () => {
  // Un negativo es normal ahí: el local vende igual y el stock se regulariza
  // después. Un aviso permanente se deja de leer, y el día que importe tampoco
  // se va a leer.
  assert.equal(avisaSinStock({ permiteVenderSinStock: true, stock: 0 }), false);
  assert.equal(avisaSinStock({ permiteVenderSinStock: true, stock: -120 }), false);
});

test("O20 · con stock no avisa, y un stock ausente se trata como cero", () => {
  assert.equal(avisaSinStock({ permiteVenderSinStock: false, stock: 3 }), false);
  // El endpoint puede no mandar el campo. Tratarlo como "hay stock" sería callar
  // el aviso justo cuando no se sabe; se trata como cero y se avisa.
  assert.equal(avisaSinStock({ permiteVenderSinStock: false }), true);
  assert.equal(avisaSinStock({}), true);
  // Y `permiteVenderSinStock` tiene que ser el booleano `true`: un string
  // "false" o un `undefined` del endpoint no pueden apagar el aviso.
  assert.equal(avisaSinStock({ permiteVenderSinStock: "false", stock: 0 }), true);
});
