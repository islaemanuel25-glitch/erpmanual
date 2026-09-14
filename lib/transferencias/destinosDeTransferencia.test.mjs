// A QUIÉN SE LE PUEDE TRANSFERIR: UNA PUERTA, NO DOS CRITERIOS PARECIDOS.
//
//   node --import ./scripts/alias-loader.mjs --test lib/transferencias/destinosDeTransferencia.test.mjs
//
// ── EL DEFECTO QUE ESTO CIERRA ─────────────────────────────────────────────
//
// La pantalla de crear transferencia ofrecía los destinos con
// `getLocalesDeGrupo`, que devuelve todas las filas de `GrupoLocal` y no filtra
// nada. Relevado el 2026-09-13, y las dos mitades del agujero:
//
//   · un local con `activo = false` se ofrecía como destino de una operación
//     NUEVA;
//   · el "EXCLUYE depósitos" de su comentario no es un filtro sino una
//     creencia — se cumple porque los depósitos viven en `GrupoDeposito`.
//
// Estos candados afirman el criterio, no la consulta: por eso el módulo no toca
// Prisma y acá no hace falta base.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  destinosDeTransferencia,
  puedeRecibirTransferencias,
} from "./destinosDeTransferencia.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");

const local = (extra = {}) => ({
  id: 2,
  nombre: "mini el 7",
  activo: true,
  tieneClienteVinculado: true,
  ...extra,
});

// ── EL CRITERIO QUE FALTABA, Y ES EL QUE DEFINE LA PANTALLA ───────────────
//
// Un local opera con el depósito por TRANSFERENCIA solo si tiene un cliente con
// `localVinculadoId` apuntándolo. Sin ese vínculo se le VENDE y nada más, y eso
// es el comportamiento correcto —no un defecto—: ese local no tiene stock en
// este sistema, así que no hay a dónde sumarle mercadería.
//
// Se buscó durante todo el relevamiento como un campo del modelo `Local` —en
// `tipo`, en `activo`— y no estaba ahí. Está en `Cliente.localVinculadoId`, y
// los datos lo habían dicho antes que el código: los dos locales que recibían
// transferencias eran exactamente los dos que tenían cliente vinculado, y los
// dos que no, tenían cero transferencias en toda su historia.

test("SIN CLIENTE VINCULADO NO ES DESTINO: a ese local se le vende, no se le transfiere", () => {
  assert.equal(puedeRecibirTransferencias(local({ tieneClienteVinculado: false })), false);
});

test("y el vínculo tampoco se asume cuando el dato no viene", () => {
  // Mismo criterio que `activo`: se exige el dato explícito. Un `select` que se
  // olvide de resolver el vínculo deja la lista VACÍA y se ve en el acto, en vez
  // de ofrecer destinos que no operan por transferencia.
  const { tieneClienteVinculado, ...sinElCampo } = local();
  assert.equal(puedeRecibirTransferencias(sinElCampo), false);
});

test("un local que opera es destino válido", () => {
  assert.equal(puedeRecibirTransferencias(local()), true);
});

test("UN LOCAL DADO DE BAJA NO ES DESTINO: es empezar algo nuevo contra lo que ya no opera", () => {
  assert.equal(puedeRecibirTransferencias(local({ activo: false })), false);
});

test("el depósito no se transfiere a sí mismo, por los DOS caminos", () => {
  // Por la columna...
  assert.equal(puedeRecibirTransferencias(local({ es_deposito: true })), false);
  // ...y por ser el local del par, que es el camino que hoy manda: en producción
  // el depósito del grupo ni siquiera está en `GrupoLocal`.
  assert.equal(puedeRecibirTransferencias(local({ id: 7 }), { depositoLocalId: 7 }), false);
  // Y el mismo local, con OTRO depósito, sí es destino.
  assert.equal(puedeRecibirTransferencias(local({ id: 7 }), { depositoLocalId: 9 }), true);
});

test("SIN EL DATO `activo` NO ES DESTINO, y eso es a propósito", () => {
  // `activo === true` y no `activo !== false`. Si quien consulta se olvida de
  // pedir la columna, la lista sale VACÍA y se ve en el acto. Con la forma
  // permisiva, un `select` a medias volvería a ofrecer a un local de baja sin
  // que nada avise — la misma familia de defecto que la #97.
  const { activo, ...sinElCampo } = local();
  assert.equal(puedeRecibirTransferencias(sinElCampo), false);
});

test("nada raro pasa como destino", () => {
  assert.equal(puedeRecibirTransferencias(null), false);
  assert.equal(puedeRecibirTransferencias(undefined), false);
  assert.equal(puedeRecibirTransferencias({}), false);
  assert.equal(puedeRecibirTransferencias({ activo: true }), false, "sin id no es nadie");
});

test("la lista filtra los CUATRO casos de una", () => {
  const destinos = destinosDeTransferencia(
    [
      local({ id: 2, nombre: "mini el 7" }),
      local({ id: 3, nombre: "Casiano", activo: false }),
      local({ id: 4, nombre: "otro depósito", es_deposito: true }),
      local({ id: 9, nombre: "el depósito mismo" }),
      local({ id: 11, nombre: "local nuevo sin vincular", tieneClienteVinculado: false }),
    ],
    { depositoLocalId: 9 }
  );
  assert.deepEqual(destinos.map((l) => l.id), [2]);
});

// ── LA OTRA MITAD: QUE LA PANTALLA DE VERDAD LA USE ───────────────────────

test("la ruta de opciones del POS usa esta puerta y NO `getLocalesDeGrupo`", () => {
  // Un criterio que nadie llama no defiende nada. Se lee el fuente sin
  // comentarios: un candado que busca en prosa no afirma nada.
  const src = fs
    .readFileSync(path.join(RAIZ, "app/api/pos-transferencias/opciones/route.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

  assert.match(src, /destinosDeTransferencia\(/, "el modo depósito no filtra los destinos");
  assert.match(src, /puedeRecibirTransferencias\(/, "el modo admin no aplica el mismo criterio");
  assert.doesNotMatch(
    src,
    /getLocalesDeGrupo/,
    "volvió a ofrecer los destinos sin filtrar: `getLocalesDeGrupo` no mira `activo`"
  );
});

test("`getLocalesDeGrupo` SIGUE EXISTIENDO y sin filtro, porque contesta otra pregunta", () => {
  // Sus tres consumidores la usan para replicar el CATÁLOGO. Filtrar ahí por
  // `activo` rompería algo que hoy funciona: un local dado de baja y reactivado
  // después quedaría sin los productos creados durante su baja.
  //
  // Este candado existe para que el día que alguien "unifique" las dos
  // funciones, lo haga a propósito y leyendo esto.
  const src = fs
    .readFileSync(path.join(RAIZ, "lib/grupos.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

  const cuerpo = /export async function getLocalesDeGrupo[\s\S]*?\n}/.exec(src)?.[0] || "";
  assert.ok(cuerpo, "no se encontró getLocalesDeGrupo");
  assert.doesNotMatch(
    cuerpo,
    /activo/,
    "se le agregó un filtro por `activo`: eso deja huecos en el catálogo de un local reactivado"
  );

  const consumidores = ["app/api/productos/crear/route.js", "app/api/productos/import/apply/route.js", "app/api/productos/promover-a-deposito/route.js"];
  for (const ruta of consumidores) {
    const texto = fs.readFileSync(path.join(RAIZ, ruta), "utf8");
    assert.match(texto, /getLocalesDeGrupo/, `${ruta} dejó de usarla: revisar por qué`);
  }
});

// ── EL ORDEN ES PARTE DE LO QUE ESTA PUERTA DEVUELVE ──────────────────────
//
// Visto en producción el 2026-09-14: la entrada de Transferencias arrancaba por
// "Casiano casas" en una carga y por "mini el 7" en la siguiente. La causa es
// que `relacionesDelDeposito` consulta `grupoLocal` **sin `orderBy`**, y sin
// `ORDER BY` Postgres devuelve las filas en el orden que le conviene al plan.
//
// El orden se puso acá y no en la pantalla que lo reportó porque los CUATRO
// consumidores tenían el mismo problema y ninguno tiene un orden propio que
// defender. El de la vista del depósito sí lo tiene —por plata, con los vacíos
// al final— y lo aplica DESPUÉS, en `bloquesPorLocal`, así que este no lo pisa.

test("el orden es por nombre y no depende de cómo vengan las filas", () => {
  const nombres = ["mini el 7", "Casiano casas", "Minimarket ayala", "Mini unidas"];
  const filas = nombres.map((nombre, i) => local({ id: i + 2, nombre }));

  const salida = destinosDeTransferencia(filas, { depositoLocalId: 1 }).map((l) => l.nombre);

  // ── SE AFIRMA CONTRA DOS ENTRADAS DISTINTAS, NO CONTRA UNA ─────────────
  //
  // El defecto era justamente que el orden de entrada mandaba. Un candado con
  // una sola entrada pasaría con la función devolviendo la lista tal cual vino.
  const alReves = destinosDeTransferencia([...filas].reverse(), { depositoLocalId: 1 }).map(
    (l) => l.nombre
  );
  assert.deepEqual(salida, alReves, "el orden de salida depende del orden de entrada");

  // Y es el alfabético que espera una persona: "mini el 7" en minúscula NO se
  // va al final. Con una comparación de strings a secas iría después de todos
  // los que empiezan en mayúscula, porque en ASCII las minúsculas van después.
  //
  // ── "Mini unidas" VA ANTES QUE "Minimarket ayala", Y NO ES UN ERROR ────
  //
  // Es lo que hace cualquier intercalación local: el ESPACIO ordena antes que
  // una letra, así que "Mini " < "Minim". La primera versión de este candado lo
  // esperaba al revés y se puso roja sobre una salida correcta. Queda escrito
  // para que la próxima vez que alguien lea esta línea y le parezca invertida,
  // sepa que ya se miró — y no lo "arregle" invirtiendo el comparador.
  assert.deepEqual(salida, ["Casiano casas", "mini el 7", "Mini unidas", "Minimarket ayala"]);
  assert.notEqual(
    salida[salida.length - 1],
    "mini el 7",
    "la minúscula se fue al final: falta `sensitivity: base`"
  );
});

test("ordenar no toca el array que entró ni se traga los que filtra", () => {
  const filas = [
    local({ id: 5, nombre: "Zeta" }),
    local({ id: 6, nombre: "Alfa" }),
    // Éste NO es destino: no tiene cliente vinculado. Tiene que salir de la
    // lista igual que antes — el orden se agregó al filtro, no lo reemplazó.
    local({ id: 7, nombre: "Beta", tieneClienteVinculado: false }),
  ];
  const original = filas.map((l) => l.nombre);

  const salida = destinosDeTransferencia(filas, { depositoLocalId: 1 }).map((l) => l.nombre);

  assert.deepEqual(salida, ["Alfa", "Zeta"], "el filtro dejó de filtrar, o el orden salió mal");
  assert.deepEqual(
    filas.map((l) => l.nombre),
    original,
    "ordenó EN EL LUGAR: el array que entró quedó cambiado"
  );
});

test("un nombre vacío o ausente no rompe el orden", () => {
  // No es un caso inventado: `nombre` viene de un `select` de Prisma y una fila
  // sin nombre llegaría como null. Ordenar con `localeCompare` sobre null tira
  // TypeError, y eso dejaría la pantalla entera en un cartel de error por una
  // fila mal cargada.
  const filas = [local({ id: 5, nombre: "Beta" }), local({ id: 6, nombre: null }), local({ id: 7 })];
  const salida = destinosDeTransferencia(filas, { depositoLocalId: 1 });
  assert.equal(salida.length, 3, "se perdió una fila al ordenar");
  assert.equal(salida[0].nombre, null, "el vacío tiene que ordenar primero, no explotar");
});
