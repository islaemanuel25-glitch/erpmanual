// LA LECTURA CORRE EN SEGUNDO PLANO CON SU ESTADO EN LA BASE.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/lecturaEnSegundoPlano.test.mjs
//
// ── EL CASO (Emanuel, producción, 2026-10-09 ~21:40) ──────────────────────
//
// Pedido 255 de Das, una factura de una hoja. «Leer» dos veces, y las dos:
// "La lectura tardó más de lo que el servidor espera y se cortó". Ese texto es
// el del HTTP 504 en una lectura, y la app solo contesta 504 cuando Flash
// vence su espera (`TARDO_DEMASIADO`), que eran 45 s por un techo de nginx que
// dejó de aplicar el 2026-09-21. El modelo grande no llegó a entrar: escala
// solo sobre una lectura de Flash que salió.
//
// ── QUÉ FIJAN ESTOS CANDADOS ──────────────────────────────────────────────
//
// Las funciones de `lecturaEnSegundoPlano.js` se ejercen contra un cliente que
// aplica las condiciones del `where` como las aplica Postgres para estas
// formas exactas. Que esas mismas consultas corran contra Postgres de verdad se
// comprobó con la app levantada (ver el informe de la tanda), no acá: la suite
// no depende de una base.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  VENCE_LECTURA_MS,
  comoVaLaLectura,
  tomarLaLectura,
  terminarLaLectura,
  respuestaParaGuardar,
  cortarLasQueQuedaronLeyendo,
  respuestaDeLaCortada,
  TEXTO_LECTURA_CORTADA,
  TEXTO_LEYENDO_EN_SEGUNDO_PLANO,
} from "./lecturaEnSegundoPlano.js";
import { esperarLaLectura, pedirLaLectura } from "./leerConTurno.js";
import { arrancarTurno, mirarTurno, vaciarTurnos, ESTADO_TURNO } from "./lector/lecturasEnCurso.js";

/** Un cliente con UNA tabla de comprobantes, que aplica el `where` como Postgres. */
function clienteDeComprobantes(filas) {
  const pasa = (f, where) => {
    if (where.id !== undefined && f.id !== where.id) return false;
    if (where.grupoId !== undefined && f.grupoId !== where.grupoId) return false;
    if (where.lecturaEnCursoDesde?.not === null && f.lecturaEnCursoDesde === null) return false;
    if (where.OR) {
      return where.OR.some((o) =>
        o.lecturaEnCursoDesde === null
          ? f.lecturaEnCursoDesde === null
          : f.lecturaEnCursoDesde !== null && f.lecturaEnCursoDesde < o.lecturaEnCursoDesde.lt
      );
    }
    return true;
  };
  // `Prisma.DbNull` es un objeto; en la fila queda como null, igual que en la base.
  const aplicar = (f, data) => {
    for (const [k, v] of Object.entries(data)) f[k] = v && v.constructor?.name === "DbNull" ? null : v;
  };
  return {
    filas,
    comprobanteProveedor: {
      async updateMany({ where, data }) {
        let count = 0;
        for (const f of filas) if (pasa(f, where)) { aplicar(f, data); count++; }
        return { count };
      },
      async update({ where, data }) {
        const f = filas.find((x) => x.id === where.id);
        aplicar(f, data);
        return f;
      },
    },
  };
}

const fila = (extra = {}) => ({ id: 255, grupoId: 1, lecturaEnCursoDesde: null, ultimaLectura: null, ...extra });

// ══════════════════════════════════════════════════════════════════════════
// LEER CONTESTA EN EL ACTO Y EL COMPROBANTE QUEDA "LEYENDO"
// ══════════════════════════════════════════════════════════════════════════

test("TOMAR LA LECTURA LA DEJA 'LEYENDO' EN LA BASE, y al terminar queda su respuesta", async () => {
  const c = clienteDeComprobantes([fila({ ultimaLectura: { status: 504, cuerpo: { ok: false } } })]);
  const ahora = new Date("2026-10-09T21:40:00Z");
  assert.equal(await tomarLaLectura(c, { comprobanteId: 255, grupoId: 1, ahora }), true);
  assert.equal(comoVaLaLectura(c.filas[0], new Date(ahora.getTime() + 20_000)).estado, "LEYENDO");
  assert.equal(c.filas[0].ultimaLectura, null, "la respuesta vieja se borra: la que pregunte espera la nueva");

  // Termina: queda la respuesta de la ruta, tal cual, con su estado HTTP.
  const respuesta = await respuestaParaGuardar(
    new Response(JSON.stringify({ ok: true, estado: "MAL_LEIDO", cierra: false, lineas: 1 }), { status: 200 })
  );
  await terminarLaLectura(c, { comprobanteId: 255, respuesta });
  const como = comoVaLaLectura(c.filas[0]);
  assert.equal(como.estado, "TERMINADA");
  assert.deepEqual(como.respuesta, { status: 200, cuerpo: { ok: true, estado: "MAL_LEIDO", cierra: false, lineas: 1 } });
  assert.equal(c.filas[0].lecturaEnCursoDesde, null);
});

test("DOS «LEER» SEGUIDOS LANZAN UNA SOLA LECTURA", async () => {
  const c = clienteDeComprobantes([fila()]);
  const ahora = new Date();
  const [a, b] = await Promise.all([
    tomarLaLectura(c, { comprobanteId: 255, grupoId: 1, ahora }),
    tomarLaLectura(c, { comprobanteId: 255, grupoId: 1, ahora }),
  ]);
  assert.deepEqual([a, b].sort(), [false, true], "las dos la tomaron");
  // Y la de otro grupo no existe: no la toma ni la pisa.
  assert.equal(await tomarLaLectura(c, { comprobanteId: 255, grupoId: 2, ahora }), false);
});

test("LA RUTA: la pregunta 'ya está leyendo' va ANTES de la cuota, y el UPDATE condicional ANTES de arrancar", () => {
  const ruta = codigoDe("app/api/compras-proveedor/comprobantes/leer/[id]/route.js");
  const post = ruta.slice(ruta.indexOf("export async function POST"), ruta.indexOf("export async function GET"));
  const yaLeyendo = post.indexOf('comoVaLaLectura(comprobante).estado === "LEYENDO"');
  const cuota = post.indexOf("hayCuota(");
  const toma = post.indexOf("await tomarLaLectura(prisma");
  const arranca = post.indexOf("arrancarTurno(");
  assert.ok(yaLeyendo > 0 && yaLeyendo < cuota, "engancharse no puede gastar cuota ni frenarse por ella");
  assert.ok(toma > cuota && toma < arranca, "la lectura se toma en la base antes de arrancar");
  assert.match(post, /if \(!\(await tomarLaLectura\(prisma, \{ comprobanteId: comprobante\.id, grupoId \}\)\)\) return leyendoYa\(\);/);
  // Lo que contesta la lectura se guarda SIEMPRE —también si revienta—.
  assert.match(post, /await terminarLaLectura\(prisma, \{ comprobanteId: comprobante\.id, respuesta \}\)/);
  assert.match(post, /catch \(e\) \{[\s\S]*?status: 500/);
  // El GET lee de la base, no de la memoria.
  const get = ruta.slice(ruta.indexOf("export async function GET"));
  assert.match(get, /select: \{ lecturaEnCursoDesde: true, ultimaLectura: true \}/);
  assert.doesNotMatch(get, /mirarTurno\(/);
});

// ══════════════════════════════════════════════════════════════════════════
// NUNCA COLGADA: REINICIO Y VENCIMIENTO
// ══════════════════════════════════════════════════════════════════════════

test("UN REINICIO CON UNA LECTURA 'LEYENDO' LA DEJA CORTADA, con su mensaje", async () => {
  const c = clienteDeComprobantes([
    fila({ lecturaEnCursoDesde: new Date() }),
    fila({ id: 256 }),
    fila({ id: 257, ultimaLectura: { status: 200, cuerpo: { ok: true } } }),
  ]);
  assert.equal(await cortarLasQueQuedaronLeyendo(c), 1, "solo la que estaba leyendo");
  const como = comoVaLaLectura(c.filas[0]);
  assert.equal(como.estado, "TERMINADA");
  assert.deepEqual(como.respuesta, respuestaDeLaCortada());
  assert.match(como.respuesta.cuerpo.error, /se cortó porque el sistema se reinició/);
  assert.match(como.respuesta.cuerpo.error, /tocá «Leer» de nuevo/);
  assert.deepEqual(c.filas[2].ultimaLectura, { status: 200, cuerpo: { ok: true } }, "las terminadas no se tocan");
  // Y el arranque lo llama.
  const arranque = codigoDe("instrumentation.js");
  assert.match(arranque, /await cortarLasQueQuedaronLeyendo\(prisma\)/);
});

test("UNA LECTURA QUE LLEVA MÁS DE LO QUE PUEDE DURAR SE DA POR CORTADA, y se puede volver a tomar", async () => {
  const hace = new Date(Date.now() - VENCE_LECTURA_MS - 1000);
  assert.equal(comoVaLaLectura(fila({ lecturaEnCursoDesde: hace })).estado, "VENCIDA");
  const c = clienteDeComprobantes([fila({ lecturaEnCursoDesde: hace })]);
  assert.equal(await tomarLaLectura(c, { comprobanteId: 255, grupoId: 1 }), true);
  // El GET la corta al mirarla: nunca queda "leyendo" para siempre.
  const get = codigoDe("app/api/compras-proveedor/comprobantes/leer/[id]/route.js");
  assert.match(get, /como\.estado === "VENCIDA"[\s\S]*?respuestaDeLaCortada\(\)[\s\S]*?terminarLaLectura/);
});

// ══════════════════════════════════════════════════════════════════════════
// LA PANTALLA
// ══════════════════════════════════════════════════════════════════════════

/** Un servidor de mentira que contesta "leyendo" N veces y después el resultado. */
function servidorQueLee({ vecesLeyendo = 2, final = { status: 200, cuerpo: { ok: true, estado: "CARGADO" } } } = {}) {
  const pedidos = [];
  let preguntas = 0;
  const fetchImpl = async (url, init = {}) => {
    pedidos.push({ url, metodo: init.method ?? "GET" });
    if (init.method === "POST") {
      return new Response(JSON.stringify({ ok: true, leyendo: true, turno: "255", texto: TEXTO_LEYENDO_EN_SEGUNDO_PLANO }));
    }
    preguntas++;
    if (preguntas <= vecesLeyendo) return new Response(JSON.stringify({ ok: true, leyendo: true, texto: TEXTO_LEYENDO_EN_SEGUNDO_PLANO }));
    return new Response(JSON.stringify(final.cuerpo), { status: final.status });
  };
  return { fetchImpl, pedidos };
}

test("ENGANCHARSE A UNA LECTURA EN CURSO SOLO PREGUNTA: NUNCA HACE EL POST", async () => {
  const s = servidorQueLee();
  const avisos = [];
  const { respuesta, cuerpo } = await esperarLaLectura({
    comprobanteId: 255, fetchImpl: s.fetchImpl, dormir: async () => {}, alAvisar: (t) => avisos.push(t),
  });
  assert.equal(respuesta.status, 200);
  assert.equal(cuerpo.estado, "CARGADO");
  assert.ok(s.pedidos.every((p) => p.metodo === "GET"), "engancharse lanzó una lectura");
  assert.deepEqual(avisos, [TEXTO_LEYENDO_EN_SEGUNDO_PLANO], "dice una vez que está leyendo");
  // Y la pantalla lo usa desde el efecto, no `leer`.
  const panel = codigoDe("components/comprobantes/PanelComprobantes.jsx");
  assert.match(panel, /if \(enCurso\) seguirLeyendo\(enCurso\.id\);/);
  assert.match(panel, /function seguirLeyendo\(id\) \{\s*return esperarYMostrar\(id, \(alAvisar\) =>\s*esperarLaLectura\(/);
});

test("UN FALLO TRAE SU MOTIVO: el cuerpo se lee una vez y viaja", async () => {
  const s = servidorQueLee({ final: respuestaDeLaCortada() });
  const { respuesta, cuerpo } = await pedirLaLectura({ comprobanteId: 255, origen: "BOTON", fetchImpl: s.fetchImpl, dormir: async () => {} });
  assert.equal(respuesta.status, 503);
  assert.equal(cuerpo.error, TEXTO_LECTURA_CORTADA, "antes llegaba null y quedaba el texto por estado HTTP");
  assert.equal(s.pedidos.filter((p) => p.metodo === "POST").length, 1);
});

test("LA LISTA DICE QUÉ FACTURA SE ESTÁ LEYENDO, sin contar las vencidas", () => {
  const listar = codigoDe("app/api/compras-proveedor/comprobantes/listar/route.js");
  assert.match(listar, /lecturaEnCursoDesde: true,/);
  assert.match(listar, /leyendo: comoVaLaLectura\(\{ lecturaEnCursoDesde \}\)\.estado === "LEYENDO"/);
});

// ══════════════════════════════════════════════════════════════════════════
// PROBAR, EN RECETAS DE FACTURAS
// ══════════════════════════════════════════════════════════════════════════

test("PROBAR: una prueba por papel a la vez, antes de la cuota, y un reinicio se dice", async () => {
  const ruta = codigoDe("app/api/compras-proveedor/recetas/explicacion/route.js");
  const probar = ruta.slice(ruta.indexOf("body?.probar === true"), ruta.indexOf("body?.confirmarPropuesta === true"));
  assert.match(probar, /const turno = `probar-\$\{grupoId\}-\$\{papel\.id\}`;/);
  assert.ok(
    probar.indexOf("mirarTurno(turno).estado === ESTADO_TURNO.LEYENDO") < probar.indexOf("hayCuota("),
    "engancharse a la prueba en curso no puede gastar cuota"
  );
  // Ejercido con el registro de turnos de verdad: el segundo ve la primera.
  vaciarTurnos();
  let corridas = 0;
  let soltar;
  const trabajo = () => { corridas++; return new Promise((r) => { soltar = r; }); };
  const id = "probar-1-255";
  if (mirarTurno(id).estado !== ESTADO_TURNO.LEYENDO) arrancarTurno({ id, trabajo });
  await new Promise((r) => setImmediate(r));
  if (mirarTurno(id).estado !== ESTADO_TURNO.LEYENDO) arrancarTurno({ id, trabajo });
  await new Promise((r) => setImmediate(r));
  assert.equal(corridas, 1, "dos «Probar» seguidos lanzaron dos pruebas");
  soltar({ ok: true });
  await new Promise((r) => setImmediate(r));
  assert.equal(mirarTurno(id).estado, ESTADO_TURNO.LISTO);
  vaciarTurnos();
  // Un reinicio pierde la prueba —no escribe nada— y el GET lo dice.
  assert.equal(mirarTurno(id).estado, ESTADO_TURNO.NO_ESTA);
});

test("LA DURACIÓN DE CADA LLAMADA LLEGA AL CONTADOR, en las dos rutas", () => {
  // Desde el 2026-10-10 la duración y los tokens se traducen en un solo
  // lugar, `medicionDeLaLlamada`, que usan las dos rutas.
  for (const r of ["app/api/compras-proveedor/comprobantes/leer/[id]/route.js", "app/api/compras-proveedor/recetas/explicacion/route.js"]) {
    assert.match(codigoDe(r), /\.\.\.medicionDeLaLlamada\(i\),/, r);
  }
});

function codigoDe(ruta) {
  return fs
    .readFileSync(new URL(`../../../${ruta}`, import.meta.url), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
