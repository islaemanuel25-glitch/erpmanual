// CANDADO: QUÉ LOCALES VE FINANZAS Y CUÁL PUEDE ABRIR QUIEN PREGUNTA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/finanzas/alcanceFinanciero.test.mjs
//
// Las dos mitades del alcance, y las dos tienen su contraprueba:
//
//   · el DEPÓSITO tiene que estar en la lista. Reusar la puerta de
//     Transferencias lo habría sacado, en silencio y sin que nada falle;
//   · un local NO puede consultar otro. `resolveVistaOperativa` no cubre este
//     caso porque el local llega como `destino` y no como `localId`, que es el
//     nombre que aquél vigila.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ERROR_DESTINO_INVALIDO,
  ERROR_FUERA_DE_ALCANCE,
  esVistaDeDeposito,
  localesFinancieros,
  resolverLocalPedido,
} from "@/lib/finanzas/alcanceFinanciero";
import { destinosDeTransferencia } from "@/lib/transferencias/destinosDeTransferencia";

// Los nombres son los REALES de producción: un fixture de "local a / local b"
// no habría mostrado el orden ni los acentos.
const DEPOSITO = { id: 1, nombre: "Depósito Central", activo: true, es_deposito: true };
const VINCULOS = [
  { id: 2, nombre: "mini el 7", activo: true, es_deposito: false },
  { id: 4, nombre: "Casiano casas", activo: true, es_deposito: false },
  { id: 6, nombre: "Minimarket ayala", activo: true, es_deposito: false },
  { id: 7, nombre: "Mini unidas", activo: false, es_deposito: false },
];

// ══════════════════════════════════════════════════════════════════════════
// 5 · EL DEPÓSITO APARECE COMO LOCAL FINANCIERO
// ══════════════════════════════════════════════════════════════════════════

test("A1 · el depósito está en la lista, y PRIMERO", () => {
  const lista = localesFinancieros({ deposito: DEPOSITO, locales: VINCULOS });
  assert.equal(lista[0].localId, 1);
  assert.equal(lista[0].esDeposito, true);
  assert.ok(
    lista.some((l) => l.localId === 1),
    "el depósito no aparece: su venta quedaría fuera de Finanzas sin que nada falle"
  );
});

test("A2 · LA CONTRAPRUEBA: la puerta de Transferencias SÍ lo saca", () => {
  // Es la medición que justifica no reusarla. `destinosDeTransferencia`
  // contesta "a quién se le puede MANDAR mercadería", y el depósito no se
  // transfiere a sí mismo. Usarla acá habría hecho desaparecer su caja.
  const deTransferencias = destinosDeTransferencia([DEPOSITO, ...VINCULOS], {
    depositoLocalId: 1,
  });
  assert.ok(
    !deTransferencias.some((l) => l.id === 1),
    "si Transferencias ya incluyera al depósito, este módulo sobra"
  );

  const deFinanzas = localesFinancieros({ deposito: DEPOSITO, locales: VINCULOS });
  assert.ok(deFinanzas.some((l) => l.localId === 1));
});

test("A3 · el depósito entra aunque NO esté en `GrupoLocal`", () => {
  // En producción no está: viene solo por `GrupoDeposito`. Una lista armada con
  // una sola de las dos tablas lo perdería.
  const lista = localesFinancieros({ deposito: DEPOSITO, locales: VINCULOS });
  assert.equal(lista.filter((l) => l.localId === 1).length, 1);

  // Y si viniera por las dos, no se duplica y conserva la marca.
  const porLasDos = localesFinancieros({
    deposito: DEPOSITO,
    locales: [...VINCULOS, DEPOSITO],
  });
  assert.equal(porLasDos.filter((l) => l.localId === 1).length, 1);
  assert.equal(porLasDos[0].esDeposito, true);
});

test("A4 · un local DADO DE BAJA aparece, y aparece MARCADO", () => {
  // Cerrar un local no borra lo que vendió, y mirar el mes en que cerró es
  // justamente lo que se va a querer hacer. Acá no se puede empezar ninguna
  // operación —es una pantalla de lectura— así que el motivo por el que
  // Transferencias lo saca no aplica. Lo que NO puede pasar es que se dibuje
  // igual que uno abierto.
  const lista = localesFinancieros({ deposito: DEPOSITO, locales: VINCULOS });
  const baja = lista.find((l) => l.localId === 7);
  assert.ok(baja, "el local dado de baja desapareció: su historia queda inalcanzable");
  assert.equal(baja.inactivo, true);

  // Y los activos NO quedan marcados.
  assert.equal(lista.find((l) => l.localId === 2).inactivo, false);
});

test("A5 · si falta la columna `activo`, TODOS salen marcados —falla ruidoso—", () => {
  // La forma permisiva (`activo !== false`) haría que un `select` a medias
  // dibujara un local cerrado como abierto y nadie se enteraría. Ésta se ve en
  // el acto. Es la lección de la #97 aplicada a esta puerta.
  const sinColumna = VINCULOS.map(({ id, nombre, es_deposito }) => ({ id, nombre, es_deposito }));
  const lista = localesFinancieros({ deposito: DEPOSITO, locales: sinColumna });
  assert.ok(lista.filter((l) => !l.esDeposito).every((l) => l.inactivo));
});

test("A6 · el resto va por nombre, con acentos bien ordenados", () => {
  const lista = localesFinancieros({ deposito: DEPOSITO, locales: VINCULOS });
  assert.deepEqual(
    lista.map((l) => l.nombre),
    ["Depósito Central", "Casiano casas", "mini el 7", "Mini unidas", "Minimarket ayala"]
  );
});

test("A7 · la ruta no usa `destinosDeTransferencia` para armar su lista", () => {
  // El candado de arriba prueba el resultado; éste, que no haya una segunda
  // puerta. Comentarios afuera: la ruta NOMBRA esa función en su encabezado para
  // explicar por qué no la usa.
  const ruta = readFileSync("app/api/finanzas/tablero/route.js", "utf8")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(ruta, /destinosDeTransferencia|relacionesDelDeposito/);
  assert.match(ruta, /localesDeFinanzas/, "la ruta dejó de usar la puerta de Finanzas");
});

// ══════════════════════════════════════════════════════════════════════════
// QUIÉN VE LA LISTA
// ══════════════════════════════════════════════════════════════════════════

test("A8 · ve la lista el depósito y el admin en vista global; un local no", () => {
  assert.equal(esVistaDeDeposito({ modo: "GLOBAL", localPropio: null }), true);
  assert.equal(
    esVistaDeDeposito({ modo: "LOCAL", localPropio: { es_deposito: true } }),
    true
  );
  assert.equal(
    esVistaDeDeposito({ modo: "LOCAL", localPropio: { es_deposito: false } }),
    false
  );
  // Sin el dato, NO es depósito: ante la duda, el alcance más chico.
  assert.equal(esVistaDeDeposito({ modo: "LOCAL", localPropio: null }), false);
  assert.equal(esVistaDeDeposito({}), false);
});

// ══════════════════════════════════════════════════════════════════════════
// 6 · UN LOCAL RESTRINGIDO NO PUEDE CONSULTAR OTRO
// ══════════════════════════════════════════════════════════════════════════

const LISTA = localesFinancieros({ deposito: DEPOSITO, locales: VINCULOS });

test("A9 · UN LOCAL QUE PIDE OTRO RECIBE 403, no el suyo en silencio", () => {
  // Desviarlo a su propio local sería peor que rechazarlo: la pantalla mostraría
  // números correctos del local equivocado y alguien sacaría conclusiones de
  // ahí. Un 403 se ve.
  const r = resolverLocalPedido({
    esDeposito: false,
    localDeLaSesion: 4,
    destinoPedido: 2,
    localesDelGrupo: LISTA,
  });
  assert.equal(r.error, ERROR_FUERA_DE_ALCANCE);
  assert.equal(r.localId, null);
});

test("A10 · y tampoco puede pedir el DEPÓSITO", () => {
  const r = resolverLocalPedido({
    esDeposito: false,
    localDeLaSesion: 4,
    destinoPedido: 1,
    localesDelGrupo: LISTA,
  });
  assert.equal(r.error, ERROR_FUERA_DE_ALCANCE);
});

test("A11 · un local sin pedir nada mira el suyo", () => {
  const r = resolverLocalPedido({
    esDeposito: false,
    localDeLaSesion: 4,
    destinoPedido: null,
    localesDelGrupo: LISTA,
  });
  assert.deepEqual(r, { localId: 4 });
});

test("A12 · pedir EL PROPIO por la URL está bien: es el mismo alcance", () => {
  const r = resolverLocalPedido({
    esDeposito: false,
    localDeLaSesion: 4,
    destinoPedido: 4,
    localesDelGrupo: LISTA,
  });
  assert.deepEqual(r, { localId: 4 });
});

test("A13 · una sesión sin local no mira nada", () => {
  const r = resolverLocalPedido({
    esDeposito: false,
    localDeLaSesion: null,
    destinoPedido: 4,
    localesDelGrupo: LISTA,
  });
  assert.equal(r.error, "Sin alcance autorizado.");
});

test("A14 · el depósito puede pedir cualquiera DE SU GRUPO", () => {
  for (const id of [1, 2, 4, 6, 7]) {
    const r = resolverLocalPedido({
      esDeposito: true,
      localDeLaSesion: 1,
      destinoPedido: id,
      localesDelGrupo: LISTA,
    });
    assert.deepEqual(r, { localId: id }, `el depósito no pudo abrir el local ${id}`);
  }
});

test("A15 · y NO uno de otro grupo, aunque sea el depósito", () => {
  // El grupo se comprueba contra la lista que YA se leyó —que salió de
  // `GrupoDeposito` y `GrupoLocal` del grupo de la sesión— y no contra el número
  // que vino en la URL. Sin esto, un admin podría mirar la caja de otro cliente.
  const r = resolverLocalPedido({
    esDeposito: true,
    localDeLaSesion: 1,
    destinoPedido: 99,
    localesDelGrupo: LISTA,
  });
  assert.equal(r.error, ERROR_FUERA_DE_ALCANCE);
});

test("A16 · el depósito sin pedir nada recibe la LISTA, no un local al azar", () => {
  const r = resolverLocalPedido({
    esDeposito: true,
    localDeLaSesion: 1,
    destinoPedido: null,
    localesDelGrupo: LISTA,
  });
  assert.deepEqual(r, { localId: null });
});

test("A17 · basura en `destino` se RECHAZA, no se ignora", () => {
  // Ignorarla y devolver el local propio sería el mismo desvío silencioso que
  // A9 prohíbe: la pantalla mostraría números correctos del local equivocado.
  // Una URL rota tiene que contestar que está rota.
  for (const basura of ["abc", "0", "-3", "4; DROP TABLE", "1.5", "NaN"]) {
    const r = resolverLocalPedido({
      esDeposito: false,
      localDeLaSesion: 4,
      destinoPedido: basura,
      localesDelGrupo: LISTA,
    });
    assert.equal(r.error, ERROR_DESTINO_INVALIDO, `"${basura}" no fue rechazada`);
    assert.equal(r.localId, null);
  }
});

test("A18 · AUSENTE no es inválido: es 'no pidió ninguno'", () => {
  // La distinción que hace que la pantalla del local funcione sin mandar nada, y
  // que el depósito reciba su lista. Confundirlas rompería las dos entradas.
  for (const vacio of [null, undefined, ""]) {
    assert.deepEqual(
      resolverLocalPedido({
        esDeposito: false,
        localDeLaSesion: 4,
        destinoPedido: vacio,
        localesDelGrupo: LISTA,
      }),
      { localId: 4 }
    );
    assert.deepEqual(
      resolverLocalPedido({
        esDeposito: true,
        localDeLaSesion: 1,
        destinoPedido: vacio,
        localesDelGrupo: LISTA,
      }),
      { localId: null }
    );
  }
});

// ══════════════════════════════════════════════════════════════════════════
// LAS DOS RUTAS APLICAN LA PUERTA
// ══════════════════════════════════════════════════════════════════════════

test("A19 · las dos rutas pasan por `resolverLocalPedido` y piden `finanzas.ver`", () => {
  // Un chequeo escrito en la pantalla no protege nada: la API se llama con
  // `fetch`. Y el detalle de turno lo necesita por su cuenta, porque el turno
  // llega por la RUTA y `resolveVistaOperativa` no lo ve.
  for (const ruta of [
    "app/api/finanzas/tablero/route.js",
    "app/api/finanzas/turno/[turnoId]/route.js",
  ]) {
    const codigo = readFileSync(ruta, "utf8")
      .replace(/\/\/[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    assert.match(codigo, /checkPerm\(session, "finanzas\.ver"\)/, `${ruta} no chequea el permiso`);
    assert.match(codigo, /resolverLocalPedido\(/, `${ruta} no acota el alcance`);
    assert.match(codigo, /resolveVistaOperativa\(req\)/, `${ruta} no resuelve la vista`);
  }
});
