// CUÁNTO ATRAPA EL CANDADO ARITMÉTICO — medido sobre las dos facturas reales.
//
// ── QUÉ MIDE ESTO, Y QUÉ NO ────────────────────────────────────────────────
//
// NO mide cuántas veces Flash lee mal. Eso necesita llamadas reales al servicio
// con una clave, y sin eso cualquier número sería inventado.
//
// Mide lo otro, que es lo que de verdad protege al depósito: **de las lecturas
// mal hechas, cuántas se cuelan**. Si el candado atrapa todo, que Flash falle
// más o menos cambia cuánto hay que cargar a mano, pero no cambia el riesgo de
// que entre un costo falso. Ese es el número que hay que conocer antes.
//
// ── CÓMO SE FABRICAN LAS LECTURAS MALAS ────────────────────────────────────
//
// Con mutaciones sobre los números REALES de las dos facturas, del tipo que un
// modelo de visión comete de verdad. No son errores al azar: un modelo no
// devuelve basura, devuelve un número plausible.
//
//   · un dígito cambiado (3↔8, 1↔7, 5↔6, 0↔9)
//   · dos dígitos transpuestos
//   · un dígito de menos
//   · la coma corrida un lugar
//   · una línea entera omitida
//
// Las facturas base son las mismas de `impuestos.test.mjs` y NO son inventadas:
// son la transcripción verificada de dos comprobantes reales.

import { test } from "node:test";
import assert from "node:assert/strict";

import { pasarPorLaPuerta, verificarCoherenciaDeLineas, ESTADO } from "./puerta.js";
import { normalizarLectura } from "./contrato.js";

// ── Las dos facturas reales, tal como las lee un lector que NO se equivocó ──

const DYSSA = {
  nombre: "DYSSA A 0011-00794708",
  receta: {
    ivaPorLinea: true,
    alicuotaIvaPct: 21,
    tieneImpuestoInterno: true,
    ivaIncluyeInternoEnLaBase: false,
    percepciones: [
      { nombre: "IIBB", pct: 3 },
      { nombre: "IVA", pct: 3 },
    ],
    facturaPor: "UNIDAD",
  },
  lineas: [
    { cantidad: 36, netoUnitario: 2580.57, subtotalImpreso: 92900.52, internoUnitario: 535.47 },
    { cantidad: 20, netoUnitario: 1279.37, subtotalImpreso: 25587.4, internoUnitario: 0 },
    { cantidad: 8, netoUnitario: 8892.27, subtotalImpreso: 71138.16, internoUnitario: 549.28 },
    { cantidad: 8, netoUnitario: 9546.63, subtotalImpreso: 76373.04, internoUnitario: 598.0 },
    { cantidad: 30, netoUnitario: 3170.07, subtotalImpreso: 95102.1, internoUnitario: 0 },
    { cantidad: 54, netoUnitario: 657.98, subtotalImpreso: 35530.92, internoUnitario: 0 },
    { cantidad: 3, netoUnitario: 10477.03, subtotalImpreso: 31431.09, internoUnitario: 0 },
  ],
  pie: {
    neto: 428063.23,
    iva: 89893.28,
    interno: 28455.16,
    total: 572095.46,
    percepciones: [
      { nombre: "IIBB", importe: 12841.9 },
      { nombre: "IVA", importe: 12841.9 },
    ],
  },
};

const DAS = {
  nombre: "DAS A 0021-00011125",
  receta: {
    ivaPorLinea: false,
    alicuotaIvaPct: 21,
    tieneImpuestoInterno: false,
    ivaIncluyeInternoEnLaBase: false,
    percepciones: [{ nombre: "IVA", pct: 3 }],
    facturaPor: "UNIDAD",
  },
  lineas: [
    { cantidad: 3, netoUnitario: 24644.77, subtotalImpreso: 73934.32 },
    { cantidad: 6, netoUnitario: 12322.39, subtotalImpreso: 73934.33 },
    { cantidad: 2, netoUnitario: 18963.64, subtotalImpreso: 37927.28 },
  ],
  pie: { neto: 185795.93, iva: 39017.15, interno: null, total: 230386.96, percepciones: [{ nombre: "IVA", importe: 5573.88 }] },
};

const FACTURAS = [DYSSA, DAS];

const comoLectura = (f) =>
  normalizarLectura({
    identidad: { tipo: "A", puntoVenta: "0011", numero: "00794708", fecha: "2026-08-10" },
    lineas: f.lineas,
    pie: f.pie,
    consumo: { tokensEntrada: 1500, tokensSalida: 400, costoMicroUsd: 0 },
    modelo: "gemini-2.5-flash",
  });

// ── Primero: la lectura BUENA tiene que pasar ──────────────────────────────

test("LA LECTURA CORRECTA PASA LA PUERTA — las dos facturas reales", () => {
  // Si el candado no dejara pasar una lectura buena, sería inútil de la otra
  // manera: nada entraría nunca y todo habría que cargarlo a mano.
  for (const f of FACTURAS) {
    const r = pasarPorLaPuerta({ lectura: comoLectura(f), receta: f.receta, recetaVersion: 1 });
    assert.equal(r.cierra, true, `${f.nombre}: ${r.porque ?? ""}`);
    assert.equal(r.estado, ESTADO.CARGADO, f.nombre);
    assert.equal(r.proponeCostos, true, f.nombre);
    assert.ok(Math.abs(r.diferenciaCentavos) <= 1, `${f.nombre} difiere ${r.diferenciaCentavos}`);
  }
});

// ── Las mutaciones: cómo se equivoca de verdad un modelo de visión ──────────

const CONFUSIONES = [
  ["3", "8"], ["8", "3"], ["1", "7"], ["7", "1"],
  ["5", "6"], ["6", "5"], ["0", "9"], ["9", "0"],
];

function mutaciones(valor) {
  const s = String(valor);
  const salida = [];

  // Un dígito confundido por otro parecido.
  for (const [de, a] of CONFUSIONES) {
    const i = s.indexOf(de);
    if (i >= 0) salida.push(Number(s.slice(0, i) + a + s.slice(i + 1)));
  }
  // Dos dígitos transpuestos.
  const d = s.replace(".", "");
  for (let i = 0; i < d.length - 1; i++) {
    if (d[i] !== d[i + 1] && /\d/.test(d[i]) && /\d/.test(d[i + 1])) {
      const t = d.slice(0, i) + d[i + 1] + d[i] + d.slice(i + 2);
      const punto = s.indexOf(".");
      const rearmado = punto >= 0 ? `${t.slice(0, punto)}.${t.slice(punto)}` : t;
      const n = Number(rearmado);
      if (Number.isFinite(n)) salida.push(n);
      break;
    }
  }
  // Un dígito de menos, y la coma corrida.
  const sinUno = Number(s.replace(/\d/, ""));
  if (Number.isFinite(sinUno) && sinUno > 0) salida.push(sinUno);
  salida.push(Number(valor) * 10);
  salida.push(Number(valor) / 10);

  return salida.filter((n) => Number.isFinite(n) && n !== Number(valor) && n > 0);
}

/** Todas las lecturas MALAS que se pueden fabricar sobre una factura real. */
function lecturasMalas(f) {
  const casos = [];
  for (let li = 0; li < f.lineas.length; li++) {
    for (const campo of ["netoUnitario", "cantidad"]) {
      for (const mutado of mutaciones(f.lineas[li][campo])) {
        const lineas = f.lineas.map((l, i) => (i === li ? { ...l, [campo]: mutado } : l));
        casos.push({ etiqueta: `${f.nombre} L${li + 1}.${campo}=${mutado}`, lineas, pie: f.pie });
      }
    }
  }
  // Una línea entera omitida: el modelo se saltea un renglón del papel.
  for (let li = 0; li < f.lineas.length; li++) {
    casos.push({
      etiqueta: `${f.nombre} sin L${li + 1}`,
      lineas: f.lineas.filter((_, i) => i !== li),
      pie: f.pie,
    });
  }
  return casos;
}

test("CUÁNTAS LECTURAS MALAS SE CUELAN — el número", () => {
  let total = 0;
  let atrapadas = 0;
  const coladas = [];

  for (const f of FACTURAS) {
    for (const caso of lecturasMalas(f)) {
      total += 1;
      const lectura = normalizarLectura({
        identidad: { tipo: "A", puntoVenta: "0011", numero: "00794708", fecha: "2026-08-10" },
        lineas: caso.lineas,
        pie: caso.pie,
        consumo: {},
        modelo: "gemini-2.5-flash",
      });
      const r = pasarPorLaPuerta({ lectura, receta: f.receta, recetaVersion: 1 });
      if (r.cierra) coladas.push(caso.etiqueta);
      else atrapadas += 1;
    }
  }

  const pct = (atrapadas / total) * 100;
  console.log(
    `\n    COBERTURA DEL CANDADO: ${atrapadas}/${total} lecturas mal hechas atrapadas ` +
      `(${pct.toFixed(2)} %)\n` +
      `    coladas: ${coladas.length}${coladas.length ? " → " + coladas.slice(0, 5).join("; ") : ""}\n`
  );

  // El candado tiene que atrapar TODAS. Si alguna se cuela, es un costo falso
  // que puede entrar al ERP, y quiero que este test lo diga con nombre y
  // apellido en vez de con un porcentaje que suene bien.
  assert.deepEqual(coladas, [], `Se colaron ${coladas.length} de ${total} lecturas mal hechas`);
  assert.ok(total > 100, `Muy pocos casos para afirmar nada: ${total}`);
});

test("EL CENTAVO REAL DE DAS NO ES UN ERROR — no apretar esta tolerancia", () => {
  // En la factura de DAS, dos de las tres líneas difieren UN CENTAVO de verdad
  // entre cantidad × unitario y el subtotal impreso, porque el proveedor
  // redondea el unitario antes de multiplicar. Ese centavo es del papel, no de
  // la lectura.
  //
  // Si alguien baja la tolerancia por línea a cero para "ser más estricto", DAS
  // entero pasa a MAL_LEIDO y nadie va a poder recibirle nada. Este candado
  // está para que ese cambio salga en rojo con el motivo al lado.
  const r = verificarCoherenciaDeLineas(DAS.lineas);
  assert.equal(r.ok, true, JSON.stringify(r.incoherentes));

  const diferencias = DAS.lineas.map((l) =>
    Math.round(Math.round(l.netoUnitario * 100) * l.cantidad - Math.round(l.subtotalImpreso * 100))
  );
  assert.deepEqual(diferencias, [-1, 1, 0]); // el centavo real, medido
});

test("la segunda ecuación atrapa el unitario aunque el pie cierre", () => {
  // El caso exacto que se colaba: se cambia el precio unitario y NO el subtotal
  // impreso, así que la suma del pie sigue dando perfecto. Es el más peligroso
  // de todos, porque el unitario es el que se convierte en costo.
  const lineas = DAS.lineas.map((l, i) => (i === 0 ? { ...l, netoUnitario: 24644.77 + 1000 } : l));
  const pieCierra = pasarPorLaPuerta({
    lectura: normalizarLectura({ lineas, pie: DAS.pie, consumo: {} }),
    receta: DAS.receta,
  });
  assert.equal(pieCierra.verificacion.cierra, true, "el pie tiene que seguir cerrando");
  assert.equal(pieCierra.cierra, false, "pero la puerta NO puede dejarlo pasar");
  assert.equal(pieCierra.lineasIncoherentes.length, 1);
  assert.match(pieCierra.porque, /precio por unidad/i);
});

test("una lectura sin líneas no cierra por accidente", () => {
  const r = pasarPorLaPuerta({
    lectura: normalizarLectura({ lineas: [], pie: DAS.pie, consumo: {} }),
    receta: DAS.receta,
  });
  assert.equal(r.cierra, false);
  assert.equal(r.estado, ESTADO.MAL_LEIDO);
  assert.match(r.porque, /ninguna línea/i);
});

test("una lectura sin total no cierra por accidente", () => {
  // Sin total al pie no hay contra qué comparar. Que "no haya diferencia" NO
  // puede leerse como que cierra.
  const r = pasarPorLaPuerta({
    lectura: normalizarLectura({ lineas: DAS.lineas, pie: { ...DAS.pie, total: null }, consumo: {} }),
    receta: DAS.receta,
  });
  assert.equal(r.cierra, false);
  assert.equal(r.estado, ESTADO.MAL_LEIDO);
});

// ── Qué queda guardado ─────────────────────────────────────────────────────

test("SI NO CIERRA, NO SE ESCRIBE LA IDENTIDAD", () => {
  // Un número de comprobante sacado de una lectura que no cierra iría al índice
  // único de identidad y bloquearía el número verdadero cuando alguien lo
  // cargue bien.
  const mala = normalizarLectura({
    identidad: { tipo: "A", puntoVenta: "0011", numero: "00794708" },
    lineas: DAS.lineas.map((l, i) => (i === 0 ? { ...l, netoUnitario: 99999 } : l)),
    pie: DAS.pie,
    consumo: {},
  });
  const r = pasarPorLaPuerta({ lectura: mala, receta: DAS.receta });
  assert.equal(r.cierra, false);
  assert.equal(r.aGuardar.numero, undefined);

  // El 2026-08-12 este candado también exigía que NO se guardara el total, y se
  // cambió a propósito: el pie sí se guarda. Son dos cosas con motivos
  // distintos. La identidad va al índice único —guardarla mal bloquea el número
  // verdadero—; el pie son números leídos del papel, y sin ellos no se puede
  // saber si falló la lectura o la receta. Con el comprobante de Mauro hubo que
  // reconstruir el total haciendo la cuenta al revés porque no estaban.
  assert.equal(r.aGuardar.totalLeido, DAS.pie.total, "el pie SÍ se guarda: es el dato de diagnóstico");
});

test("EL CONSUMO SE GUARDA AUNQUE LA LECTURA HAYA SALIDO MAL", () => {
  // Es cuando más importa: una lectura fallida consumió igual. Registrar solo
  // las buenas daría un costo medido más bajo que el real justamente en los
  // meses en que el lector anduvo peor.
  const mala = normalizarLectura({
    lineas: DAS.lineas.map((l, i) => (i === 0 ? { ...l, netoUnitario: 1 } : l)),
    pie: DAS.pie,
    consumo: { tokensEntrada: 2000, tokensSalida: 500, costoMicroUsd: 0 },
    modelo: "gemini-2.5-flash",
  });
  const r = pasarPorLaPuerta({ lectura: mala, receta: DAS.receta });
  assert.equal(r.estado, ESTADO.MAL_LEIDO);
  assert.equal(r.aGuardar.tokensEntrada, 2000);
  assert.equal(r.aGuardar.tokensSalida, 500);
  assert.equal(r.aGuardar.modeloLectura, "gemini-2.5-flash");
});

test("LA RECETA SE COPIA, con su versión", () => {
  const r = pasarPorLaPuerta({ lectura: comoLectura(DAS), receta: DAS.receta, recetaVersion: 7 });
  assert.equal(r.aGuardar.recetaVersion, 7);
  assert.deepEqual(r.aGuardar.recetaUsada, DAS.receta);
});

test("el motivo dice cuánto y qué hacer, no «no cierra»", () => {
  const mala = normalizarLectura({
    lineas: DAS.lineas.map((l, i) => (i === 0 ? { ...l, netoUnitario: 24644.77 * 10 } : l)),
    pie: DAS.pie,
    consumo: {},
  });
  const r = pasarPorLaPuerta({ lectura: mala, receta: DAS.receta });
  assert.match(r.porque, /\$/);
  assert.match(r.porque, /dígito/i);
  assert.match(r.porque, /no se propone/i);
});

test("EL PIE SE GUARDA AUNQUE NO CIERRE: es lo que hace falta para diagnosticar", () => {
  // Estaba adentro del bloque que solo corría al cerrar, y eso dejaba sin datos
  // justo el caso que hay que investigar. El 2026-08-12, con el comprobante de
  // Mauro en MAL_LEIDO, hubo que reconstruir el total del papel desde
  // `diferenciaCentavos` haciendo la cuenta al revés.
  //
  // Guardar el pie NO afirma que la lectura sea buena: dice QUÉ SE LEYÓ, que es
  // lo que permite distinguir si falló la lectura o la receta.
  const mala = normalizarLectura({
    identidad: { tipo: "A", puntoVenta: "0011", numero: "00794708" },
    lineas: DAS.lineas.map((l, i) => (i === 0 ? { ...l, netoUnitario: 99999 } : l)),
    pie: DAS.pie,
    consumo: {},
  });
  const r = pasarPorLaPuerta({ lectura: mala, receta: DAS.receta });
  assert.equal(r.cierra, false);

  // El pie está.
  assert.equal(r.aGuardar.totalLeido, DAS.pie.total);
  assert.equal(r.aGuardar.netoLeido, DAS.pie.neto);
  assert.equal(r.aGuardar.ivaLeido, DAS.pie.iva);

  // La identidad NO: va al índice único y bloquearía el número verdadero.
  assert.equal(r.aGuardar.numero, undefined);
  assert.equal(r.aGuardar.tipo, undefined);
});
