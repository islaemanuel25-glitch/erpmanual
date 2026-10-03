// UNA VENTA OFFLINE NO SE DA POR GUARDADA SI NO QUEDÓ EN LA COLA.
//
//   node --import ./scripts/alias-loader.mjs --test app/modulos/pos-ventas/helpers/offlineQueue.test.mjs
//
// El cajero ya recibió el efectivo cuando la pantalla encola la venta. Antes,
// `enqueue` ignoraba que `saveQueue` hubiera fallado —almacenamiento lleno,
// bloqueado, ventana privada— y la pantalla imprimía el ticket, vaciaba el
// carrito y decía "Venta guardada offline" de una venta que no existía en
// ningún lado.
//
// Arriba se ejerce el `enqueue` REAL contra un almacenamiento en memoria que
// puede rechazar escrituras, como lo hace el navegador (`setItem` tira). Abajo,
// que la pantalla no haga nada irreversible antes de saber que quedó guardada.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  enqueue,
  encolar,
  loadQueue,
  leerCola,
  leerColasIlegibles,
  marcarSincronizacion,
  quitarDeCola,
  getQueueLength,
  CLAVE_COLA_ILEGIBLE,
  COLA_NO_LEGIBLE,
  NOMBRE_CANDADO_COLA,
  ERROR_VENTA_OFFLINE_NO_GUARDADA,
} from "./offlineQueue.js";

const CLAVE = "posVentasOfflineQueue_v1";

function almacenamiento({ rechaza = () => false } = {}) {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (rechaza(k, v)) {
        const e = new Error("The quota has been exceeded.");
        e.name = "QuotaExceededError";
        throw e;
      }
      m.set(k, String(v));
    },
    removeItem: (k) => m.delete(k),
    _m: m,
  };
}

const venta = (id) => ({ clientVentaId: id, localId: 1, turnoId: 10, total: 100, items: [{ productoBaseId: 1, cantidad: 1, precio: 100 }] });

let errorDeConsola;
beforeEach(() => {
  // `saveQueue` deja el error en la consola; acá no ensucia la salida.
  errorDeConsola = console.error;
  console.error = () => {};
  return () => { console.error = errorDeConsola; };
});

test("se guarda: ok, la venta está en la cola y se informa el largo", () => {
  globalThis.localStorage = almacenamiento();
  assert.deepEqual(enqueue(venta("a")), { ok: true, length: 1 });
  assert.deepEqual(enqueue(venta("b")), { ok: true, length: 2 });
  assert.deepEqual(loadQueue().map((v) => v.clientVentaId), ["a", "b"]);
});

test("el almacenamiento rechaza: NO ok, y lo que ya estaba en la cola sigue intacto", () => {
  globalThis.localStorage = almacenamiento();
  enqueue(venta("a"));
  const antes = globalThis.localStorage.getItem(CLAVE);
  globalThis.localStorage = Object.assign(almacenamiento({ rechaza: () => true }), {});
  // Mismo contenido previo, ahora con un almacenamiento que no acepta escribir.
  globalThis.localStorage._m.set(CLAVE, antes);
  const r = enqueue(venta("b"));
  assert.deepEqual(r, { ok: false });
  assert.equal(globalThis.localStorage.getItem(CLAVE), antes, "la cola anterior no se tocó");
  assert.deepEqual(loadQueue().map((v) => v.clientVentaId), ["a"]);
});

test("setItem no tira pero no guarda: tampoco se da por guardada", () => {
  // Un almacenamiento que acepta en silencio y no persiste (o persiste otra cosa).
  const s = almacenamiento();
  s.setItem = () => {};
  globalThis.localStorage = s;
  assert.deepEqual(enqueue(venta("a")), { ok: false });
});

test("sin localStorage disponible: NO ok, sin excepción hacia la pantalla", () => {
  delete globalThis.localStorage;
  assert.deepEqual(enqueue(venta("a")), { ok: false });
});

// ── A. Varias ventas, y la persistencia que falla ───────────────────────────

test("A: tres ventas seguidas quedan las tres, en orden y cada una con su id", () => {
  globalThis.localStorage = almacenamiento();
  for (const id of ["v1", "v2", "v3"]) assert.equal(enqueue(venta(id)).ok, true);
  assert.deepEqual(loadQueue().map((v) => v.clientVentaId), ["v1", "v2", "v3"]);
  assert.equal(getQueueLength(), 3);
});

test("A: encolar toma el candado de la cola y devuelve lo mismo que enqueue", async () => {
  globalThis.localStorage = almacenamiento();
  const pedidos = [];
  const navegadorAntes = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    value: { locks: { request: (nombre, fn) => { pedidos.push(nombre); return Promise.resolve(fn()); } } },
    configurable: true,
  });
  try {
    assert.deepEqual(await encolar(venta("a")), { ok: true, length: 1 });
    assert.deepEqual(pedidos, [NOMBRE_CANDADO_COLA]);
  } finally {
    if (navegadorAntes) Object.defineProperty(globalThis, "navigator", navegadorAntes);
    else delete globalThis.navigator;
  }
});

// ── Una cola ilegible NO es una cola vacía ──────────────────────────────────

test("cola rota: se aparta tal cual, se verifica la copia y recién después se libera", () => {
  const s = almacenamiento();
  s._m.set(CLAVE, '[{"clientVentaId":"a"'); // JSON cortado
  globalThis.localStorage = s;
  const r = leerCola();
  assert.deepEqual(r, { ok: true, items: [], apartada: true });
  const apartadas = leerColasIlegibles();
  assert.equal(apartadas.length, 1);
  assert.equal(apartadas[0].crudo, '[{"clientVentaId":"a"', "el contenido se guarda sin tocar");
  assert.equal(s.getItem(CLAVE), null);
  // Y lo apartado sobrevive a una venta nueva.
  assert.equal(enqueue(venta("b")).ok, true);
  assert.equal(leerColasIlegibles()[0].crudo, '[{"clientVentaId":"a"');
});

test("cola que no es lista (un objeto): también se aparta, no se toma como vacía", () => {
  const s = almacenamiento();
  s._m.set(CLAVE, '{"clientVentaId":"a"}');
  globalThis.localStorage = s;
  assert.equal(leerCola().apartada, true);
  assert.equal(leerColasIlegibles()[0].crudo, '{"clientVentaId":"a"}');
});

test("cola rota y la copia no se puede escribir: no se borra nada y no se encola encima", () => {
  const s = almacenamiento({ rechaza: (k) => k === CLAVE_COLA_ILEGIBLE });
  s._m.set(CLAVE, "{roto");
  globalThis.localStorage = s;
  assert.deepEqual(leerCola(), { ok: false, motivo: COLA_NO_LEGIBLE.ILEGIBLE });
  assert.equal(loadQueue(), null, "ilegible no es []");
  assert.equal(getQueueLength(), null);
  assert.deepEqual(enqueue(venta("b")), { ok: false });
  assert.equal(s.getItem(CLAVE), "{roto", "lo que había sigue intacto");
});

test("cola rota y lo apartado antes tampoco se lee: no se pisa ninguno de los dos", () => {
  const s = almacenamiento();
  s._m.set(CLAVE, "{roto");
  s._m.set(CLAVE_COLA_ILEGIBLE, "{tambien-roto");
  globalThis.localStorage = s;
  assert.equal(leerCola().ok, false);
  assert.equal(s.getItem(CLAVE), "{roto");
  assert.equal(s.getItem(CLAVE_COLA_ILEGIBLE), "{tambien-roto");
});

test("contraprueba: con el loadQueue de antes (catch → []) una cola rota se pisaba", () => {
  // El comportamiento viejo, escrito acá para que se vea qué evita el nuevo.
  const s = almacenamiento();
  s._m.set(CLAVE, "{roto");
  const loadViejo = () => { try { const p = JSON.parse(s.getItem(CLAVE)); return Array.isArray(p) ? p : []; } catch { return []; } };
  s.setItem(CLAVE, JSON.stringify([...loadViejo(), venta("b")]));
  assert.ok(!s.getItem(CLAVE).includes("roto"), "el viejo borraba lo que había");
  // El nuevo, sobre el mismo almacenamiento roto, no.
  s._m.set(CLAVE, "{roto");
  globalThis.localStorage = s;
  enqueue(venta("b"));
  assert.equal(leerColasIlegibles()[0].crudo, "{roto");
});

// ── Marcar y quitar: releídos ───────────────────────────────────────────────

test("marcarSincronizacion cambia solo `sync` de esa venta y lo relee", () => {
  globalThis.localStorage = almacenamiento();
  enqueue(venta("a"));
  enqueue(venta("b"));
  const sync = { estado: "REVISION", codigo: null, mensaje: "x", intentos: 1, ultimoIntentoEn: 5 };
  assert.deepEqual(marcarSincronizacion("a", sync), { ok: true });
  const [a, b] = loadQueue();
  assert.deepEqual(a.sync, sync);
  assert.equal(b.sync, undefined);
  assert.deepEqual({ ...a, sync: undefined }, { ...venta("a"), sync: undefined }, "el contenido del cobro no cambia");
  assert.deepEqual(marcarSincronizacion("no-esta", sync), { ok: false });
});

test("quitarDeCola saca una sola y comprueba que las demás siguen", () => {
  globalThis.localStorage = almacenamiento();
  for (const id of ["a", "b", "c"]) enqueue(venta(id));
  assert.deepEqual(quitarDeCola("b"), { ok: true, length: 2 });
  assert.deepEqual(loadQueue().map((v) => v.clientVentaId), ["a", "c"]);
  assert.deepEqual(quitarDeCola("b"), { ok: true, length: 2 }, "quitar lo que no está no rompe nada");
});

test("quitarDeCola con un almacenamiento que no guarda: NO ok", () => {
  const s = almacenamiento();
  globalThis.localStorage = s;
  enqueue(venta("a"));
  s.setItem = () => {};
  assert.deepEqual(quitarDeCola("a"), { ok: false });
  assert.equal(loadQueue().length, 1);
});

test("quitar o marcar sobre una cola que no se puede leer: no escribe", () => {
  const s = almacenamiento({ rechaza: (k) => k === CLAVE_COLA_ILEGIBLE });
  s._m.set(CLAVE, "{roto");
  globalThis.localStorage = s;
  assert.deepEqual(quitarDeCola("a"), { ok: false });
  assert.deepEqual(marcarSincronizacion("a", {}), { ok: false });
  assert.equal(s.getItem(CLAVE), "{roto");
});

test("el mensaje dice que NO está registrada y que el carrito sigue", () => {
  assert.match(ERROR_VENTA_OFFLINE_NO_GUARDADA, /NO se pudo guardar/);
  assert.match(ERROR_VENTA_OFFLINE_NO_GUARDADA, /NO está registrada/);
  assert.match(ERROR_VENTA_OFFLINE_NO_GUARDADA, /carrito sigue/);
});

// ── La pantalla, leída SIN comentarios ──────────────────────────────────────
const pantalla = readFileSync("app/modulos/pos-ventas/page.jsx", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

function cuerpoDe(nombre) {
  const inicio = pantalla.indexOf(`const ${nombre} = `);
  assert.ok(inicio >= 0, `no está ${nombre}`);
  const fin = pantalla.indexOf("\n  const ", inicio + 1);
  return pantalla.slice(inicio, fin < 0 ? undefined : fin);
}

test("guardarVentaPendiente: nada irreversible antes de confirmar que quedó en la cola", () => {
  const cuerpo = cuerpoDe("guardarVentaPendiente");
  // Desde PR B encola con el candado de la cola (`encolar`, que envuelve a
  // `enqueue`); la afirmación es la misma: se mira el resultado y nada pasa antes.
  const encolar = cuerpo.indexOf("encolada = await encolar(ventaPendiente)");
  assert.ok(encolar > 0, "la pantalla tiene que mirar el resultado de encolar");
  assert.doesNotMatch(cuerpo, /\benqueue\(/, "encolar sin candado");
  const corte = cuerpo.indexOf("if (!encolada.ok)", encolar);
  assert.ok(corte > encolar, "sin cortar ante un fallo");
  const rama = cuerpo.slice(corte, cuerpo.indexOf("}", corte) + 1);
  assert.match(rama, /ERROR_VENTA_OFFLINE_NO_GUARDADA/);
  assert.match(rama, /return;/);
  assert.doesNotMatch(rama, /CLEAR_CART|posUltimoTicket_v1|showSuccess|setUltimoTicketOffline/);

  const antes = cuerpo.slice(0, encolar);
  for (const irreversible of ["CLEAR_CART", "posUltimoTicket_v1", "setUltimoTicketOffline", "showSuccess", "Venta guardada offline"]) {
    assert.ok(!antes.includes(irreversible), `${irreversible} pasa ANTES de confirmar el guardado`);
    assert.ok(cuerpo.indexOf(irreversible, corte) > corte, `${irreversible} tiene que pasar después de confirmar`);
  }
});

test("guardarVentaPendiente: sin caja no guarda, y un segundo toque no encola dos veces", () => {
  const cuerpo = cuerpoDe("guardarVentaPendiente");
  const encolar = cuerpo.indexOf("encolada = await encolar(ventaPendiente)");
  const sinCaja = cuerpo.indexOf("if (!turnoActual?.id)");
  assert.ok(sinCaja > 0 && sinCaja < encolar, "tiene que frenar sin turno antes de encolar");
  assert.match(cuerpo.slice(sinCaja, cuerpo.indexOf("}", sinCaja)), /MENSAJE_SIN_CAJA_OFFLINE[\s\S]*return;/);
  const reentrada = cuerpo.indexOf("if (guardandoOfflineRef.current) return;");
  assert.ok(reentrada > 0 && reentrada < encolar);
  const marca = cuerpo.indexOf("guardandoOfflineRef.current = true;");
  assert.ok(marca > reentrada && marca < encolar);
  // Se suelta en un finally: un error al encolar no deja trabado el guardado.
  assert.match(cuerpo.slice(encolar, cuerpo.indexOf("if (!encolada.ok)")), /finally \{\s*guardandoOfflineRef\.current = false;/);
});

test("al cobrar sin turno, offline también se frena", () => {
  const cuerpo = cuerpoDe("handleCobrar");
  const guarda = cuerpo.slice(cuerpo.indexOf("if (!turnoActual?.id)"), cuerpo.indexOf("return;") + 7);
  assert.doesNotMatch(guarda, /!offlineMode/, "volvió la excepción offline");
  assert.match(guarda, /MENSAJE_SIN_CAJA_OFFLINE/);
});

// ── B. El grupo sale del contexto canónico ──────────────────────────────────

test("B: el grupo es el del contexto activo, no un pedido a /api/locales que nunca lo traía", () => {
  assert.match(pantalla, /const grupoId = contexto\?\.grupoId \?\? null;/);
  // /api/locales/[id] se sigue pidiendo para la política de crédito; lo que no
  // vuelve es leer el grupo de ahí.
  assert.doesNotMatch(pantalla, /item\?\.grupoId|setGrupoId/);
  const hook = readFileSync("hooks/useContextoActivo.js", "utf8");
  assert.match(hook, /grupoId: data\.grupoId \?\? null/);
  const ruta = readFileSync("app/api/contexto-activo/get/route.js", "utf8").replace(/\/\/[^\n]*/g, "");
  assert.match(ruta, /grupoId: await getGrupoIdDeLocal\(local\.id\)/, "la misma fuente que resolveLocalAndGrupo");
});

// ── Un solo motor, y cuándo corre ───────────────────────────────────────────

const hookSync = readFileSync("app/modulos/pos-ventas/helpers/useSincronizacionOffline.js", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

test("el hook corre el motor al montar/reconectar, tras el PIN esperado y al volver al frente", () => {
  assert.equal(hookSync.split("sincronizarCola(").length - 1, 1, "un solo llamado al motor");
  // Montaje, cambio de local y vuelta de la red: el mismo efecto.
  assert.match(hookSync, /if \(cargandoOperador\) return;\s*if \(!offlineMode && localId && hayQueMirar\(leida, localId\)\) sincronizar\(\);\s*\}, \[offlineMode, localId, cargandoOperador,/);
  // El PIN que se esperaba.
  assert.match(hookSync, /if \(operadorActivoId != null && esperaPinRef\.current && !vivo\.current\.offlineMode\) sincronizar\(\);\s*\}, \[operadorActivoId,/);
  // Al volver al frente.
  assert.match(hookSync, /document\.addEventListener\("visibilitychange", alVolver\)/);
  // Una espera de PIN lo pide.
  assert.match(hookSync, /if \(esperaPinRef\.current\) vivo\.current\.requerirOperador\?\.\(\);/);
  // Con candado entre pestañas.
  assert.match(hookSync, /const candado = candadoEntrePestanas\(\);/);
  assert.match(hookSync, /sincronizarCola\(\{\s*cola: COLA,\s*api: API,\s*localId: local,\s*operadorActivoId: operador,\s*candado,\s*textoDeRechazo: vivo\.current\.textoDeRechazo,\s*\}\)/);
  // Y la pantalla le pasa la traducción con su decisión de stock.
  assert.match(pantalla, /textoDeRechazo: textoDeRechazoOffline,/);
  assert.match(pantalla, /mensajeErrorVenta\(data, "No se pudo sincronizar la venta\.", mostrarStockPos\)/);
});

test("el hook registra primero en /cobros-offline/registrar y la venta va a /pos-ventas/crear", () => {
  assert.match(hookSync, /pedir\("\/api\/pos-ventas\/cobros-offline\/registrar", \{ relojDispositivo: Date\.now\(\), cobros: \[item\] \}\)/);
  assert.match(hookSync, /crear: \(cuerpo\) => pedir\("\/api\/pos-ventas\/crear", cuerpo\)/);
});

test("F: 'sin turno' por falta de PIN no manda a la apertura: el POS sigue montado esperando el PIN", () => {
  // Medido en la pantalla real: con el corte a la apertura, el POS se desmontaba
  // y la venta que esperaba el PIN quedaba en ESPERA_OPERADOR para siempre.
  const efecto = pantalla.slice(pantalla.indexOf("const verificarTurno = async"), pantalla.indexOf("verificarTurno();"));
  const guarda = efecto.indexOf("if (data.ok && !data.turno && data.needsOperador) {");
  const nulo = efecto.indexOf("setTurnoActual(data.ok && data.turno ? data.turno : null)");
  assert.ok(guarda > 0 && nulo > guarda, "el turno nulo se fija antes de mirar needsOperador");
  assert.match(efecto.slice(guarda, nulo), /setTurnoActual\(undefined\);[\s\S]*return;/);
  // Y la redirección sigue siendo solo para un turno nulo de verdad.
  assert.match(pantalla, /if \(localActual && me && turnoActual === null\) \{\s*return <RedirigirAApertura/);
});

test("el botón Procesar cola llama al mismo motor que la sincronización automática", () => {
  const cuerpo = cuerpoDe("procesarCola");
  assert.match(cuerpo, /await sincronizarCola\(\)/);
  assert.doesNotMatch(cuerpo, /fetch\(/);
  assert.match(pantalla, /sincronizar: sincronizarCola,/);
});

test("Pendientes: no hay Vaciar, y quitar solo deja una venta en revisión", () => {
  assert.doesNotMatch(pantalla, /handleVaciarPendientes|onVaciar|clearQueue/);
  const cuerpo = cuerpoDe("handleEliminarPendiente");
  const guarda = cuerpo.indexOf("if (item?.sync?.estado !== ESTADO_LOCAL.REVISION)");
  const quita = cuerpo.indexOf("quitarDeCola(");
  assert.ok(guarda > 0 && quita > guarda, "quitar sin mirar que esté en revisión");
  const modal = readFileSync("components/pos-ventas/ModalPendientesOffline.jsx", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(modal, /Vaciar|onVaciar/);
  assert.match(modal, /\{estado\.puedeQuitar && \(/);
});

test("J: el POS verifica la cola antes de abrir el cierre, y la pantalla del cierre antes del corte", () => {
  const inicio = pantalla.indexOf("const abrirCierre = async (turnoId) => {");
  assert.ok(inicio > 0);
  const cuerpo = pantalla.slice(inicio, pantalla.indexOf("\n  };", inicio));
  const verifica = cuerpo.indexOf("await verificarCierre(turnoId)");
  const abre = cuerpo.indexOf("abrirPantallaCaja(");
  assert.ok(verifica > 0 && abre > verifica, "abre el cierre sin verificar");
  assert.match(cuerpo.slice(verifica, abre), /if \(!control\.permitido\) \{[\s\S]*return;/);
  assert.match(hookSync, /await sincronizar\(\);\s*return verificarCierreConCola\(/, "con conexión intenta sincronizar antes de negar");

  const cierre = readFileSync("app/modulos/pos-ventas/cierres/iniciar/page.jsx", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  const mira = cierre.indexOf("verificarCierreConCola(leerCola(), { localId: contexto?.localId, turnoId: turno.id })");
  const corta = cierre.indexOf('fetch("/api/pos-ventas/cierres/iniciar"');
  assert.ok(mira > 0 && corta > mira, "el corte se pide sin mirar la cola");
  assert.match(cierre.slice(mira, corta), /if \(!cola\.permitido\) \{[\s\S]*return;/);
});

test("guardarVentaPendiente: la copia del ticket no puede abortar una venta ya guardada", () => {
  const cuerpo = cuerpoDe("guardarVentaPendiente");
  const copia = cuerpo.indexOf('localStorage.setItem("posUltimoTicket_v1"');
  assert.ok(copia > 0);
  const previo = cuerpo.slice(0, copia);
  assert.ok(previo.lastIndexOf("try {") > previo.lastIndexOf("}"), "el setItem del ticket va dentro de un try");
});
