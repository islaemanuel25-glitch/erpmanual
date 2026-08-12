import test from "node:test";
import assert from "node:assert/strict";

import {
  PREGUNTAS,
  aPreguntas,
  aReceta,
  preguntasVisibles,
  resumenEnCriollo,
} from "@/lib/compras-proveedor/comprobante/recetaEnCriollo";
import { ofrecerRelectura, sePuedeReleer } from "@/lib/compras-proveedor/comprobante/relecturaTrasReceta";
import { normalizarReceta } from "@/lib/compras-proveedor/comprobante/impuestos";

// ── LOS TEXTOS: EN CRIOLLO, NO EL NOMBRE DEL CAMPO ─────────────────────────

test("ninguna opción se llama como el campo de la base", () => {
  // "IVA por línea" obliga a traducir; "el IVA viene en cada renglón" se puede
  // mirar en el papel y contestar. Es para el celular, con la factura en la mano.
  const tecnicismos = [
    /iva por l[ií]nea/i, /ivaPorLinea/, /alicuota/i, /percepcionesEnCosto/,
    /ivaIncluyeInternoEnLaBase/, /facturaPor/, /booleano/i, /campo/i,
  ];
  for (const p of PREGUNTAS) {
    for (const o of p.opciones ?? []) {
      for (const rx of tecnicismos) {
        assert.doesNotMatch(o.texto, rx, `"${o.texto}" en ${p.campo}`);
      }
    }
  }
});

test("toda pregunta tiene título y ayuda, y la ayuda dice dónde mirar", () => {
  for (const p of PREGUNTAS) {
    assert.ok(p.titulo?.length > 5, p.campo);
    assert.ok(p.ayuda?.length > 20, `${p.campo}: la ayuda tiene que explicar algo`);
  }
});

test("los ejemplos son de comprobantes que existen, y están los tres", () => {
  const todos = PREGUNTAS.flatMap((p) => (p.opciones ?? []).map((o) => o.ejemplo ?? ""))
    .concat(PREGUNTAS.map((p) => p.ayuda ?? ""))
    .join(" ");
  for (const quien of ["DYSSA", "DAS", "Mauro"]) {
    assert.match(todos, new RegExp(quien), `falta el ejemplo de ${quien}`);
  }
});

test("las tres formas de traer el IVA están, y una es «ya adentro del precio»", () => {
  const p = PREGUNTAS.find((x) => x.campo === "dondeVieneElIva");
  assert.deepEqual(p.opciones.map((o) => o.valor), ["POR_RENGLON", "AL_PIE", "YA_INCLUIDO"]);
});

// ── LA TRADUCCIÓN DE IDA Y VUELTA ──────────────────────────────────────────

test("EL CERO ES UNA RESPUESTA: alícuota 0 es «ya viene con IVA», no un campo vacío", () => {
  // Es la receta de Mauro. Tratar el 0 como ausente lo mandaría al 21 por
  // defecto y le sumaría un impuesto que no existe — el quinto caso del cero
  // falsy en este módulo si se hubiera escrito con `||`.
  const r = aPreguntas({ alicuotaIvaPct: 0, ivaPorLinea: false });
  assert.equal(r.dondeVieneElIva, "YA_INCLUIDO");
});

test("«ya viene con IVA» se guarda como alícuota 0, que es cuánto hay que agregarle", () => {
  const g = aReceta({ dondeVieneElIva: "YA_INCLUIDO", alicuotaIvaPct: 21 });
  assert.equal(g.alicuotaIvaPct, 0, "la alícuota que quedó escrita antes no manda");
  assert.equal(g.ivaPorLinea, false);
});

test("ida y vuelta no pierde nada — las tres recetas reales", () => {
  const reales = [
    { nombre: "DYSSA", ivaPorLinea: true, alicuotaIvaPct: 21, tieneImpuestoInterno: true,
      ivaIncluyeInternoEnLaBase: false, percepciones: [], percepcionesEnCosto: true, facturaPor: "UNIDAD" },
    { nombre: "DAS", ivaPorLinea: false, alicuotaIvaPct: 21, tieneImpuestoInterno: false,
      ivaIncluyeInternoEnLaBase: false, percepciones: [{ nombre: "IVA", pct: 3 }],
      percepcionesEnCosto: true, facturaPor: "UNIDAD" },
    { nombre: "Mauro", ivaPorLinea: false, alicuotaIvaPct: 0, tieneImpuestoInterno: false,
      ivaIncluyeInternoEnLaBase: false, percepciones: [], percepcionesEnCosto: true, facturaPor: "UNIDAD" },
  ];
  for (const { nombre, ...fila } of reales) {
    const vuelta = aReceta(aPreguntas(fila));
    assert.deepEqual(vuelta, fila, nombre);
  }
});

test("sin impuesto interno, no se guarda una respuesta que nadie dio", () => {
  const g = aReceta({
    dondeVieneElIva: "AL_PIE", alicuotaIvaPct: 21,
    tieneImpuestoInterno: false,
    // Quedó de una edición anterior, y la pregunta ni se mostró.
    ivaIncluyeInternoEnLaBase: true,
  });
  assert.equal(g.ivaIncluyeInternoEnLaBase, false);
});

test("una percepción sin nombre o sin porcentaje no se guarda", () => {
  const g = aReceta({
    dondeVieneElIva: "AL_PIE",
    percepciones: [
      { nombre: "IIBB", pct: 3 },
      { nombre: "", pct: 5 },
      { nombre: "Sin número", pct: null },
      { nombre: "Cero", pct: 0 },
    ],
  });
  assert.deepEqual(g.percepciones, [{ nombre: "IIBB", pct: 3 }]);
});

test("lo que sale de aReceta es lo que la verificación espera", () => {
  // Si divergieran, la receta se guardaría con una forma que el motor completa
  // con defaults, y el comprobante dejaría de cerrar sin que nada lo diga.
  const g = aReceta({ dondeVieneElIva: "POR_RENGLON", alicuotaIvaPct: 21, tieneImpuestoInterno: true });
  const normalizada = normalizarReceta(g);
  for (const k of Object.keys(g)) {
    assert.deepEqual(normalizada[k], g[k], `la clave ${k} no sobrevive la normalización`);
  }
});

// ── QUÉ SE PREGUNTA Y CUÁNDO ───────────────────────────────────────────────

test("si el precio ya trae el IVA, no se pregunta la alícuota", () => {
  const visibles = preguntasVisibles({ dondeVieneElIva: "YA_INCLUIDO" }).map((p) => p.campo);
  assert.ok(!visibles.includes("alicuotaIvaPct"), "no hay alícuota que aplicar");
});

test("la pregunta del interno en la base solo aparece si hay interno", () => {
  assert.ok(!preguntasVisibles({ tieneImpuestoInterno: false }).some((p) => p.campo === "ivaIncluyeInternoEnLaBase"));
  assert.ok(preguntasVisibles({ tieneImpuestoInterno: true }).some((p) => p.campo === "ivaIncluyeInternoEnLaBase"));
});

test("lo de las percepciones en el costo solo se pregunta si hay percepciones", () => {
  assert.ok(!preguntasVisibles({ percepciones: [] }).some((p) => p.campo === "percepcionesEnCosto"));
  assert.ok(preguntasVisibles({ percepciones: [{ nombre: "IIBB", pct: 3 }] }).some((p) => p.campo === "percepcionesEnCosto"));
});

test("el plural de percepción no lleva acento, y el singular sí", () => {
  // Salió agregándole "es" al singular, que en castellano no funciona con las
  // terminadas en -ción: quedaba "2 percepciónes" en la pantalla.
  const una = resumenEnCriollo({ alicuotaIvaPct: 21, percepciones: [{ nombre: "IVA", pct: 3 }] });
  const dos = resumenEnCriollo({
    alicuotaIvaPct: 21,
    percepciones: [{ nombre: "IIBB", pct: 3 }, { nombre: "IVA", pct: 3 }],
  });
  assert.match(una, /1 percepción\b/);
  assert.match(dos, /2 percepciones\b/);
  for (const t of [una, dos]) assert.doesNotMatch(t, /percepciónes/);
});

test("el resumen se lee de un vistazo y distingue no tener receta", () => {
  assert.match(resumenEnCriollo(null), /sin receta/i);
  assert.match(resumenEnCriollo({ alicuotaIvaPct: 0 }), /ya trae el IVA/i);
  assert.match(resumenEnCriollo({ ivaPorLinea: true, alicuotaIvaPct: 21 }), /en cada renglón/i);
});

// ── RELEER DESPUÉS DE GUARDAR ──────────────────────────────────────────────

test("un comprobante CONFIRMADO no se relee: ya movió costos", () => {
  assert.equal(sePuedeReleer({ id: 1, confirmadoEn: new Date() }), false);
  assert.equal(sePuedeReleer({ id: 2, estado: "ANULADO" }), false);
  assert.equal(sePuedeReleer({ id: 3, imagenBorradaEn: new Date() }), false, "ya no hay foto");
  assert.equal(sePuedeReleer({ id: 4, estado: "MAL_LEIDO" }), true);
});

test("EL COSTO EN LECTURAS SE DICE ANTES, con el número", () => {
  const o = ofrecerRelectura({
    comprobantes: Array.from({ length: 8 }, (_, i) => ({ id: i + 1, estado: "MAL_LEIDO" })),
    cuota: { quedan: 20 },
  });
  assert.equal(o.cuantos, 8);
  assert.match(o.aviso, /8 lecturas/);
  assert.match(o.aviso, /20/, "y contra cuántas quedan");
  assert.equal(o.sePuedeAhora, true);
});

test("si no alcanzan, dice cuántas entran y no bloquea", () => {
  const o = ofrecerRelectura({
    comprobantes: Array.from({ length: 8 }, (_, i) => ({ id: i + 1, estado: "MAL_LEIDO" })),
    cuota: { quedan: 3 },
  });
  assert.equal(o.entran, 3);
  assert.match(o.aviso, /se van a releer 3/);
  assert.match(o.aviso, /5 quedan para mañana/);
  assert.equal(o.sePuedeAhora, true, "releer tres igual sirve");
});

test("sin lecturas disponibles se avisa y NO se ofrece el botón", () => {
  const o = ofrecerRelectura({
    comprobantes: [{ id: 1, estado: "MAL_LEIDO" }],
    cuota: { quedan: 0 },
  });
  assert.equal(o.sePuedeAhora, false, "un botón que no puede hacer nada se aprieta igual");
  assert.match(o.aviso, /no quedan lecturas/i);
  assert.match(o.aviso, /se guarda igual/i, "y la receta sí se guarda");
});

test("si no se pudo saber la cuota, no se inventa ni un permiso ni un impedimento", () => {
  const o = ofrecerRelectura({ comprobantes: [{ id: 1, estado: "MAL_LEIDO" }], cuota: null });
  assert.equal(o.quedan, null);
  assert.equal(o.sePuedeAhora, true);
  assert.match(o.aviso, /no se puede saber cuántas quedan/i);
});

test("sin comprobantes que releer, no se ofrece nada", () => {
  const o = ofrecerRelectura({ comprobantes: [{ id: 1, confirmadoEn: new Date() }], cuota: { quedan: 20 } });
  assert.equal(o.hayQueOfrecer, false);
  assert.equal(o.texto, null);
});
