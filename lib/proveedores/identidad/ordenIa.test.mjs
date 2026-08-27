// LA IA ORDENA. NO ELIGE, NO CONFIRMA, NO INVENTA Y NO PISA A NADIE.

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { admiteReorden, aplicarOrden, ordenFiltrado, propuestaUtilizable } from "./ordenIa.js";

const SISTEMA = ["11", "22", "33"];

test("SOLO IDS REALES: lo inventado se descarta y se informa", () => {
  const r = ordenFiltrado({ candidatosDelSistema: SISTEMA, ordenPropuesto: ["33", "999", "11"] });
  assert.deepEqual(r.orden, ["33", "11", "22"]);
  assert.deepEqual(r.invento, ["999"]);
  // El 22, que la IA no mencionó, NO desaparece: va al final. Perder un
  // candidato por omisión sería peor que ordenarlo mal — el producto correcto
  // podría ser justamente el que no nombró.
  assert.deepEqual(r.faltantes, ["22"]);
});

test("un id inventado no se busca ni se corrige: se tira", () => {
  const r = ordenFiltrado({ candidatosDelSistema: SISTEMA, ordenPropuesto: ["1", "2", "3"] });
  // "1" no es "11". Buscar a qué se habrá referido sería inventar el vínculo.
  assert.deepEqual(r.invento, ["1", "2", "3"]);
  assert.deepEqual(r.orden, SISTEMA);
});

test("un id repetido entra una sola vez", () => {
  const r = ordenFiltrado({ candidatosDelSistema: SISTEMA, ordenPropuesto: ["33", "33", "11"] });
  assert.deepEqual(r.orden, ["33", "11", "22"]);
});

test("NO CONFIRMA NADA: el producto y la confirmación quedan como estaban", () => {
  const linea = {
    sugeridos: SISTEMA,
    productoLocalId: "",
    confirmada: false,
    precioConfirmado: false,
    coherencia: { bloquea: true },
    cantidadPedido: 10,
  };
  const r = aplicarOrden(linea, ["33", "11"]);
  assert.deepEqual(r.sugeridos, ["33", "11", "22"]);
  assert.equal(r.productoLocalId, "", "la IA eligió un producto");
  assert.equal(r.confirmada, false, "la IA confirmó una línea");
  assert.equal(r.precioConfirmado, false);
  assert.equal(r.cantidadPedido, 10);
  assert.equal(r.ordenadoPorIa, true);
});

test("LA IA NO PUEDE SALTEARSE EL CANDADO ARITMÉTICO", () => {
  // Es la regla que manda sobre todas las demás: los candados deterministas
  // tienen prioridad. Ninguna cantidad de reordenamiento habilita una línea
  // cuyo importe no cierra.
  const bloqueada = { sugeridos: SISTEMA, coherencia: { bloquea: true, diferencia: 454500 } };
  const r = aplicarOrden(bloqueada, ["33", "22", "11"]);
  assert.equal(r.coherencia.bloquea, true);
  assert.equal(r.coherencia.diferencia, 454500);

  // Y el archivo no NOMBRA la coherencia fuera de los comentarios: no la lee ni
  // la escribe, así que no hay ningún camino por el que pudiera apagarla.
  const codigo = readFileSync(new URL("./ordenIa.js", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert.ok(!codigo.includes("coherencia"), "el ordenador toca la coherencia");
  assert.ok(!codigo.includes("bloquea"));
});

test("NO PISA UNA CONFIRMACIÓN HUMANA", () => {
  const elegidaAMano = {
    sugeridos: SISTEMA,
    productoLocalId: "22",
    productoElegidoAMano: true,
  };
  const r = aplicarOrden(elegidaAMano, ["33", "11", "22"]);
  assert.deepEqual(r.sugeridos, SISTEMA, "le reordenó los candidatos a una decisión tomada");
  assert.equal(r, elegidaAMano, "devolvió un objeto nuevo en vez de la misma línea");

  const confirmada = { sugeridos: SISTEMA, confirmada: true };
  assert.equal(aplicarOrden(confirmada, ["33"]), confirmada);

  assert.equal(admiteReorden(elegidaAMano), false);
  assert.equal(admiteReorden(confirmada), false);
  assert.equal(admiteReorden({ sugeridos: SISTEMA }), true);
  assert.equal(admiteReorden(null), false);
});

test("NO HAY FORMA DE FORZARLO", () => {
  // Un parámetro para saltear el candado 3 sería la manera en que ese candado
  // deja de existir dentro de seis meses. `aplicarOrden` recibe dos cosas y
  // ninguna es una opción.
  // `.length` no sirve para comprobarlo —los parámetros con default no cuentan—
  // así que se mira la firma escrita: recibe la línea y el orden, y nada más.
  const codigo = readFileSync(new URL("./ordenIa.js", import.meta.url), "utf8");
  assert.match(codigo, /export function aplicarOrden\(linea, ordenPropuesto = \[\]\) \{/);

  const elegidaAMano = { sugeridos: SISTEMA, productoElegidoAMano: true };
  // Ni pasando algo de más.
  assert.equal(aplicarOrden(elegidaAMano, ["33"], { forzar: true }), elegidaAMano);
});

test("ANTE LA DUDA SUGIERE: una propuesta que no distingue no se usa", () => {
  // Con un solo candidato no hay nada que ordenar.
  assert.equal(propuestaUtilizable({ candidatosDelSistema: ["11"], ordenPropuesto: ["11"] }), false);
  // Con un solo id mencionado tampoco: quedarse con uno no es un orden, es una
  // elección disfrazada de orden.
  assert.equal(propuestaUtilizable({ candidatosDelSistema: SISTEMA, ordenPropuesto: ["33"] }), false);
  // Y si inventó aunque sea uno, la propuesta entera se descarta.
  assert.equal(propuestaUtilizable({ candidatosDelSistema: SISTEMA, ordenPropuesto: ["33", "11", "999"] }), false);
  // Dos reales y sin invento sí sirve.
  assert.equal(propuestaUtilizable({ candidatosDelSistema: SISTEMA, ordenPropuesto: ["33", "11"] }), true);
});

test("un orden idéntico no se anuncia como aporte de la IA", () => {
  const linea = { sugeridos: SISTEMA };
  const r = aplicarOrden(linea, SISTEMA);
  assert.equal(r.ordenadoPorIa, false);
  assert.equal(r.idsInventadosPorIa, null);
});

test("sin candidatos no se rompe ni inventa una lista", () => {
  const r = aplicarOrden({ sugeridos: [] }, ["999"]);
  assert.deepEqual(r.sugeridos, []);
  assert.deepEqual(r.idsInventadosPorIa, ["999"]);
});

test("ESTE ARCHIVO NO PERSISTE NADA", () => {
  // Después de que una persona confirme, el alias lo aprende la identidad
  // compartida que ya existe. Si acá se escribiera, habría dos memorias del
  // proveedor y el día que difieran nadie sabría cuál manda.
  const codigo = readFileSync(new URL("./ordenIa.js", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  for (const prohibido of ["prisma", "persistir", "upsert", "create", "update", "$transaction"]) {
    assert.ok(!codigo.includes(prohibido), `el ordenador nombra "${prohibido}"`);
  }
});
