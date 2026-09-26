// PRUEBA DE BASE DE LA CORRECCIÓN HISTÓRICA DE CAJA.
//
// Ejerce contra PostgreSQL el motor que ensaya y aplica correcciones: el mismo
// que usan las rutas de `app/api/caja/correcciones`. Los incidentes se arman con
// las rutas reales del circuito —cortes, confirmaciones, sobres, retiros—, con
// el error ×1000 cargado a propósito y confirmado en pesos, que es la única
// forma de que el circuito de hoy lo acepte.
//
// Qué afirma, a grandes rasgos:
//   · el ensayo corre los UPDATE y deshace todo: ni registro, ni bitácora, ni cambios;
//   · un PROPUESTO no se aplica; un AUTORIZADO solo con la huella exacta;
//   · un valor anterior distinto, o un cambio entre ensayo y aplicación, frena;
//   · la aplicación deja registro y bitácora en la misma transacción;
//   · un fallo a mitad deshace todo;
//   · mismo código y huella: ya aplicada; otra huella: error;
//   · nada fuera del alcance se toca, y vencidos / sin conteo / exclusiones no entran.
//
// Siembra sus propios datos con una marca única y los borra al terminar.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/correccionCaja.mjs

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });
const jwt = (await import("jsonwebtoken")).default;

const rutaIniciar = await import("../../app/api/pos-ventas/cierres/iniciar/route.js");
const rutaConfirmar = await import("../../app/api/pos-ventas/cierres/[token]/confirmar/route.js");
const rutaSinConteo = await import("../../app/api/pos-ventas/cierres/[token]/cerrar-sin-conteo/route.js");
const rutaReservar = await import("../../app/api/pos-ventas/cambios-pendientes/reservar/route.js");
const rutaAbrirConCambio = await import("../../app/api/pos-ventas/turnos/abrir-con-cambio/route.js");
const rutaRetiroIniciar = await import("../../app/api/pos-ventas/retiros/iniciar/route.js");
const rutaRetiroConfirmar = await import("../../app/api/pos-ventas/retiros/[token]/confirmar/route.js");
const rutaListar = await import("../../app/api/caja/correcciones/route.js");
const rutaEnsayo = await import("../../app/api/caja/correcciones/ensayo/route.js");
const rutaAplicar = await import("../../app/api/caja/correcciones/aplicar/route.js");

const { ejecutarCorreccion, RESULTADO } = await import("../../lib/caja/correcciones/motor.js");
const { PERMISO_CORREGIR_HISTORICO, ACCION_CORRECCION_HISTORICA } = await import("../../lib/caja/correcciones/plan.js");
const { PERMISO_CERRAR_SIN_CONTEO } = await import("../../lib/caja/cierreRelevo.js");

// ═══════════════════════════════════════════════════════════════════════════
// ARNÉS
// ═══════════════════════════════════════════════════════════════════════════

let pasadas = 0;
const fallas = [];
let seccionActual = "";
const seccion = (t) => { seccionActual = t; console.log(`\n── ${t} ${"─".repeat(Math.max(0, 64 - t.length))}`); };
function ok(t, c, d = "") {
  if (c) { pasadas += 1; console.log(`  ✓ ${t}`); }
  else { fallas.push(`[${seccionActual}] ${t} — ${d || "falló"}`); console.log(`  ✗ ${t} — ${d || "falló"}`); }
}
const igual = (t, o, e) =>
  ok(t, JSON.stringify(o) === JSON.stringify(e), `esperado ${JSON.stringify(e)}, obtenido ${JSON.stringify(o)}`);

const SECRETO = process.env.AUTH_SECRET;
const PERMISOS = ["pos.usar", "pos.turnos"];
const token = (usuario, localId, grupoId, permisos = PERMISOS) =>
  jwt.sign({ id: usuario.id, nombre: usuario.nombre, email: usuario.email, localId, grupoId, permisos }, SECRETO, {
    expiresIn: "1h",
  });
const pedido = (url, sesion, cuerpo) =>
  new Request(url, {
    method: "POST",
    headers: { cookie: `erpazul_sesion=${sesion}`, "content-type": "application/json" },
    body: JSON.stringify(cuerpo ?? {}),
  });
const pedidoGet = (url, sesion) => {
  const req = new Request(url, { headers: { cookie: `erpazul_sesion=${sesion}` } });
  Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
  return req;
};
const leer = async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) });
const conToken = (t) => ({ params: Promise.resolve({ token: t }) });
const BASE = "http://ci/api/pos-ventas";

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

const marca = `ci-correccion-caja-${Date.now()}`;
const creado = { grupoId: null, localId: null, usuarioId: null, rolId: null };
const codigosDePrueba = [];

async function montar() {
  const rol = await prisma.rol.create({ data: { nombre: `${marca}-rol`, permisos: PERMISOS } });
  creado.rolId = rol.id;
  const grupo = await prisma.grupo.create({ data: { nombre: `${marca}-grupo` } });
  creado.grupoId = grupo.id;
  const local = await prisma.local.create({ data: { nombre: `${marca}-local`, tipo: "local" } });
  creado.localId = local.id;
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: local.id } });
  await prisma.configuracionLocal.create({ data: { localId: local.id, exigirOperador: false, allowNegativeStock: true } });
  const usuario = await prisma.usuario.create({
    data: { nombre: `${marca}-cajero`, email: `${marca}@ci.local`, passwordHash: "x", rolId: rol.id, localId: local.id },
  });
  creado.usuarioId = usuario.id;
  return {
    local,
    usuario,
    sesion: token(usuario, local.id, grupo.id),
    sesionCorrector: token(usuario, local.id, grupo.id, [...PERMISOS, PERMISO_CORREGIR_HISTORICO]),
    sesionSinConteo: token(usuario, local.id, grupo.id, [...PERMISOS, PERMISO_CERRAR_SIN_CONTEO]),
  };
}

async function desmontar() {
  if (!creado.grupoId) return;
  const localId = creado.localId;
  const turnos = (await prisma.turno.findMany({ where: { localId }, select: { id: true } })).map((t) => t.id);
  await prisma.correccionCaja.deleteMany({ where: { codigo: { in: codigosDePrueba } } });
  await prisma.auditoriaBitacora.deleteMany({ where: { OR: [{ localId }, { entidadId: { in: codigosDePrueba } }] } });
  await prisma.cambioPendiente.deleteMany({ where: { localId } });
  await prisma.cierrePreparacion.deleteMany({ where: { localId } });
  await prisma.retiroPreparacion.deleteMany({ where: { localId } });
  await prisma.arqueoCaja.deleteMany({ where: { turnoId: { in: turnos } } });
  await prisma.cajaMovimiento.deleteMany({ where: { turnoId: { in: turnos } } });
  await prisma.turno.deleteMany({ where: { localId } });
  await prisma.configuracionLocal.deleteMany({ where: { localId } });
  await prisma.usuario.deleteMany({ where: { id: creado.usuarioId } });
  await prisma.grupoLocal.deleteMany({ where: { grupoId: creado.grupoId } });
  await prisma.local.deleteMany({ where: { id: localId } });
  await prisma.grupo.deleteMany({ where: { id: creado.grupoId } });
  await prisma.rol.deleteMany({ where: { id: creado.rolId } });
}

/** Cierra a mano los abiertos que dejó la prueba: un cajero no puede tener dos. */
const cerrarAbiertos = (f) =>
  prisma.turno.updateMany({
    where: { localId: f.local.id, vendedorId: f.usuario.id, cierre: null, cierreEnPreparacionEn: null },
    data: { cierre: new Date() },
  });

async function turnoNuevo(f, montoInicial) {
  await cerrarAbiertos(f);
  return prisma.turno.create({ data: { localId: f.local.id, vendedorId: f.usuario.id, montoInicial } });
}

/** Toma el corte y lo confirma por las rutas reales. El ×1000 entra confirmado en pesos. */
async function cortarYConfirmar(f, turnoId, { cambio, confirmaCambio, retiro, confirmaRetiro }) {
  const r = await leer(
    await rutaIniciar.POST(
      pedido(`${BASE}/cierres/iniciar`, f.sesion, { turnoId, desgloseCambio: cambio, totalConfirmado: confirmaCambio ?? null })
    )
  );
  if (!r.ok) throw new Error(`iniciar corte: ${r.error}`);
  const tok = r.cierre.token;
  const c = await leer(
    await rutaConfirmar.POST(
      pedido(`${BASE}/cierres/${tok}/confirmar`, f.sesion, { desgloseRetiroContado: retiro, totalConfirmado: confirmaRetiro ?? null }),
      conToken(tok)
    )
  );
  if (!c.ok) throw new Error(`confirmar corte: ${c.error}`);
  return prisma.cierrePreparacion.findFirst({ where: { token: tok } });
}

async function retiroParcial(f, turnoId, { cambio, retiro }) {
  const r = await leer(await rutaRetiroIniciar.POST(pedido(`${BASE}/retiros/iniciar`, f.sesion, { turnoId, desgloseCambio: cambio })));
  if (!r.ok) throw new Error(`iniciar retiro: ${r.error}`);
  const tok = r.retiro.token;
  const c = await leer(
    await rutaRetiroConfirmar.POST(pedido(`${BASE}/retiros/${tok}/confirmar`, f.sesion, { desgloseRetiroContado: retiro }), conToken(tok))
  );
  if (!c.ok) throw new Error(`confirmar retiro: ${c.error}`);
  return prisma.retiroPreparacion.findFirst({ where: { token: tok } });
}

async function recibirSobre(f, sobreId, desgloseRecibido, extra = {}) {
  await cerrarAbiertos(f);
  const res = await leer(await rutaReservar.POST(pedido(`${BASE}/cambios-pendientes/reservar`, f.sesion, { cambioPendienteId: sobreId })));
  if (!res.ok) throw new Error(`reservar: ${res.error}`);
  const r = await leer(
    await rutaAbrirConCambio.POST(pedido(`${BASE}/turnos/abrir-con-cambio`, f.sesion, { cambioPendienteId: sobreId, desgloseRecibido, ...extra }))
  );
  if (!r.ok) throw new Error(`recibir sobre: ${r.error}`);
  return prisma.turno.findUnique({ where: { id: r.turno.id } });
}

/** Una foto de TODAS las filas de caja del local: sirve para afirmar que nada cambió. */
async function fotoDelLocal(localId) {
  const turnos = await prisma.turno.findMany({ where: { localId }, orderBy: { id: "asc" } });
  const ids = turnos.map((t) => t.id);
  const [cortes, retiros, sobres, arqueos, movimientos, correcciones, bitacora] = await Promise.all([
    prisma.cierrePreparacion.findMany({ where: { localId }, orderBy: { id: "asc" } }),
    prisma.retiroPreparacion.findMany({ where: { localId }, orderBy: { id: "asc" } }),
    prisma.cambioPendiente.findMany({ where: { localId }, orderBy: { id: "asc" } }),
    prisma.arqueoCaja.findMany({ where: { turnoId: { in: ids } }, orderBy: { id: "asc" } }),
    prisma.cajaMovimiento.findMany({ where: { turnoId: { in: ids } }, orderBy: { id: "asc" } }),
    prisma.correccionCaja.count({ where: { codigo: { in: codigosDePrueba } } }),
    prisma.auditoriaBitacora.count({ where: { accion: ACCION_CORRECCION_HISTORICA } }),
  ]);
  return JSON.stringify({ turnos, cortes, retiros, sobres, arqueos, movimientos, correcciones, bitacora });
}

const codigo = (c) => { codigosDePrueba.push(c); return c; };

// ═══════════════════════════════════════════════════════════════════════════

async function correr(f) {
  const u = f.usuario.id;
  const ensayar = (m) => ejecutarCorreccion(prisma, m, { modo: "ensayo", usuarioId: u });
  const aplicar = (m, ganchos) => ejecutarCorreccion(prisma, m, { modo: "aplicar", usuarioId: u, ganchos });
  const autorizado = (m, hash) => ({ ...m, estado: "AUTORIZADO", autorizacion: { hash, autorizadoPorUsuarioId: u } });

  // ── EL INCIDENTE EN CADENA, ARMADO POR EL CIRCUITO ──
  // Turno A: fondo $50.000, deja de cambio {1000: 23000} (el ×1000) y retira $27.000.
  const tA = await turnoNuevo(f, 50000);
  const corteA = await cortarYConfirmar(f, tA.id, {
    cambio: { 1000: 23000 }, confirmaCambio: "23000000", retiro: { 1000: 27 },
  });
  const sobreA = await prisma.cambioPendiente.findFirst({ where: { cierrePreparacionId: corteA.id } });
  // Turno B recibe ese sobre tal cual dice (23.000 billetes), hace un retiro
  // parcial de $21.000 dejando $2.000 y corta sin retiro.
  const tB = await recibirSobre(f, sobreA.id, { 1000: 23000 });
  const retiroB = await retiroParcial(f, tB.id, { cambio: { 2000: 1 }, retiro: { 1000: 21 } });
  const corteB = await cortarYConfirmar(f, tB.id, { cambio: { 2000: 1 }, retiro: {} });
  // Turno C: el conteo ×1000. Retira {1000: 8000} donde eran 8 billetes.
  const tC = await turnoNuevo(f, 10000);
  const corteC = await cortarYConfirmar(f, tC.id, { cambio: { 2000: 1 }, retiro: { 1000: 8000 }, confirmaRetiro: "8000000" });
  // Turno D: un control que nadie corrige.
  const tD = await turnoNuevo(f, 12345);
  await cortarYConfirmar(f, tD.id, { cambio: { 1000: 5 }, retiro: { 1000: 7, 100: 3 } });
  await cerrarAbiertos(f);

  seccion("0. El incidente quedó armado como en producción");
  igual("0: el sobre de A dice $23.000.000", Number(sobreA.total), 23000000);
  igual("0: B abrió con $23.000.000", Number(tB.montoInicial), 23000000);
  const movC = await prisma.cajaMovimiento.findFirst({ where: { turnoId: tC.id, tipo: "RETIRO" } });
  igual("0: el retiro de cierre de C es $8.000.000", Number(movC.monto), 8000000);

  const CADENA = {
    codigo: codigo(`CI-CADENA-${Date.now()}`),
    estado: "PROPUESTO",
    motivo: "Cambio ×1000 en el corte de A, arrastrado al turno B",
    evidencia: "Prueba de base",
    correcciones: [
      { tipo: "CORTE", cierrePreparacionId: corteA.id, antes: { desgloseCambio: { 1000: 23000 } }, despues: { desgloseCambio: { 1000: 23 } } },
      { tipo: "RECEPCION_SOBRE", cambioPendienteId: sobreA.id, antes: { desgloseRecibido: { 1000: 23000 } }, despues: { desgloseRecibido: { 1000: 23 } } },
    ],
  };
  const CONTEO = {
    codigo: codigo(`CI-CONTEO-${Date.now()}`),
    estado: "PROPUESTO",
    motivo: "Retiro contado ×1000 en el corte de C",
    evidencia: "Prueba de base",
    correcciones: [
      { tipo: "CORTE", cierrePreparacionId: corteC.id, antes: { desgloseRetiroContado: { 1000: 8000 } }, despues: { desgloseRetiroContado: { 1000: 8 } } },
    ],
  };

  // ═════════════════════════════════════════════════════════════════════════
  seccion("1. Permiso: sin caja.corregir_historico no se ve ni se ensaya ni se aplica");
  {
    const g = await leer(await rutaListar.GET(pedidoGet("http://ci/api/caja/correcciones", f.sesion)));
    igual("1: listar sin permiso es 403", g.status, 403);
    const e = await leer(await rutaEnsayo.POST(pedido("http://ci/api/caja/correcciones/ensayo", f.sesion, { codigo: "X" })));
    igual("1: ensayar sin permiso es 403", e.status, 403);
    const a = await leer(await rutaAplicar.POST(pedido("http://ci/api/caja/correcciones/aplicar", f.sesion, { codigo: "X", confirmacion: "X" })));
    igual("1: aplicar sin permiso es 403", a.status, 403);
    const g2 = await leer(await rutaListar.GET(pedidoGet("http://ci/api/caja/correcciones", f.sesionCorrector)));
    ok("1: con permiso lista, y el repo no trae ningún manifiesto", g2.ok === true && Array.isArray(g2.items) && g2.items.length === 0,
      JSON.stringify(g2).slice(0, 200));
    const e2 = await leer(await rutaEnsayo.POST(pedido("http://ci/api/caja/correcciones/ensayo", f.sesionCorrector, { codigo: "I4" })));
    igual("1: I4 no existe todavía como manifiesto", e2.status, 404);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("2. Ensayo en seco: el mismo motor, con los UPDATE, y rollback total");
  let fotoAntes = await fotoDelLocal(f.local.id);
  let hashCadena;
  {
    let escritas = 0;
    const r = await ejecutarCorreccion(prisma, CADENA, {
      modo: "ensayo", usuarioId: u, ganchos: { despuesDeEscribirFila: ({ escritas: n }) => { escritas = n; } },
    });
    igual("2: resultado ENSAYO", r.resultado, RESULTADO.ENSAYO);
    igual("2: sin errores", r.errores, []);
    ok("2: el ensayo llegó a escribir las filas antes de deshacer", escritas > 5, `escribió ${escritas}`);
    ok("2: trae la huella", /^[0-9a-f]{64}$/.test(r.hash ?? ""), r.hash);
    ok("2: todas las invariantes, leídas de lo escrito, se cumplen", r.invariantes.length > 0 && r.invariantes.every((i) => i.ok),
      JSON.stringify(r.invariantes.filter((i) => !i.ok)));
    hashCadena = r.hash;
    const v = (e, id, campo) => r.cambios.find((c) => c.entidad === e && c.id === id && c.campo === campo);
    igual("2: corte A: cambio → $23.000", v("CierrePreparacion", corteA.id, "totalCambio")?.despues, 23000);
    igual("2: corte A: retiro esperado → $27.000", v("CierrePreparacion", corteA.id, "efectivoRetiradoEsperado")?.despues, 27000);
    igual("2: corte A: diferencia → 0", v("CierrePreparacion", corteA.id, "diferencia")?.despues, 0);
    igual("2: sobre: total → $23.000", v("CambioPendiente", sobreA.id, "total")?.despues, 23000);
    igual("2: sobre: desglose ANTES preservado en el plan", v("CambioPendiente", sobreA.id, "desglose")?.antes, { 1000: 23000 });
    igual("2: turno B: fondo → $23.000", v("Turno", tB.id, "montoInicial")?.despues, 23000);
    igual("2: retiro parcial de B: esperado → $23.000", v("RetiroPreparacion", retiroB.id, "efectivoEsperadoCorte")?.despues, 23000);
    igual("2: retiro parcial de B: diferencia → 0", v("RetiroPreparacion", retiroB.id, "diferencia")?.despues, 0);
    igual("2: corte B: esperado → $2.000", v("CierrePreparacion", corteB.id, "efectivoEsperadoCorte")?.despues, 2000);
    igual("2: corte B: diferencia → 0", v("CierrePreparacion", corteB.id, "diferencia")?.despues, 0);
    ok("2: el turno D no está en el alcance", !r.filasQueCambian.concat(r.filasSinCambio).includes(`Turno#${tD.id}`));
    ok("2: el turno C no está en el alcance", !r.filasQueCambian.concat(r.filasSinCambio).includes(`Turno#${tC.id}`));
    ok("2: informa filas del alcance que no cambian", r.filasSinCambio.length > 0, JSON.stringify(r.filasSinCambio));
    igual("2: después del ensayo, NADA cambió en la base (ni registro, ni bitácora)", await fotoDelLocal(f.local.id), fotoAntes);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("3. PROPUESTO no se aplica; AUTORIZADO con huella equivocada tampoco");
  {
    const r = await aplicar(CADENA);
    ok("3: un PROPUESTO no se aplica", r.resultado === RESULTADO.RECHAZADA && /PROPUESTO/.test(r.errores.join(" ")), r.errores.join(" "));
    const r2 = await aplicar(autorizado(CADENA, "0".repeat(64)));
    ok("3: huella distinta a la del plan de hoy: no se aplica", r2.resultado === RESULTADO.RECHAZADA && /no es el autorizado/.test(r2.errores.join(" ")),
      r2.errores.join(" "));
    igual("3: la base sigue igual", await fotoDelLocal(f.local.id), fotoAntes);
  }

  seccion("4. Un valor anterior que no coincide frena");
  {
    const mal = { ...CADENA, correcciones: [{ ...CADENA.correcciones[0], antes: { desgloseCambio: { 1000: 22000 } } }] };
    const r = await ensayar(mal);
    ok("4: el ensayo lo rechaza nombrando el campo", /no tiene el desgloseCambio que declara/.test(r.errores.join(" ")), r.errores.join(" "));
    const r2 = await aplicar(autorizado(mal, hashCadena));
    ok("4: y la aplicación también", r2.resultado === RESULTADO.RECHAZADA, r2.resultado);
    igual("4: la base sigue igual", await fotoDelLocal(f.local.id), fotoAntes);
  }

  seccion("5. Un cambio entre el ensayo y la aplicación frena");
  {
    // Algo del alcance cambia después del ensayo: la observación no, un importe sí.
    const arq = await prisma.arqueoCaja.findFirst({ where: { turnoId: tB.id, tipo: "PARCIAL" } });
    await prisma.arqueoCaja.update({ where: { id: arq.id }, data: { efectivoContado: Number(arq.efectivoContado) + 1 } });
    const r = await aplicar(autorizado(CADENA, hashCadena));
    ok("5: la huella autorizada ya no es la de hoy: no se aplica", r.resultado === RESULTADO.RECHAZADA && r.hash !== hashCadena,
      `${r.resultado} ${r.errores.join(" ")}`);
    igual("5: no quedó registro", await prisma.correccionCaja.count({ where: { codigo: CADENA.codigo } }), 0);
    await prisma.arqueoCaja.update({ where: { id: arq.id }, data: { efectivoContado: arq.efectivoContado } });
    // Restaurar el importe mueve el `actualizadoEn` de esa fila —es una escritura
    // de verdad—, así que la foto de referencia se vuelve a sacar acá.
    const restaurado = await prisma.arqueoCaja.findUnique({ where: { id: arq.id } });
    igual("5: restaurado el importe original", Number(restaurado.efectivoContado), Number(arq.efectivoContado));
    fotoAntes = await fotoDelLocal(f.local.id);
  }

  seccion("6. Un fallo a mitad de la escritura deshace todo");
  {
    const r = await aplicar(autorizado(CADENA, hashCadena), {
      despuesDeEscribirFila: ({ escritas }) => { if (escritas === 3) throw new Error("fallo provocado a mitad"); },
    });
    ok("6: la aplicación no se da por hecha", r.resultado === RESULTADO.RECHAZADA && /fallo provocado/.test(r.errores.join(" ")),
      `${r.resultado} ${r.errores.join(" ")}`);
    igual("6: la base sigue exactamente igual", await fotoDelLocal(f.local.id), fotoAntes);
  }

  seccion("7. Dependencias: un tramo no se aplica antes que su origen");
  {
    const tramo = { ...CONTEO, codigo: codigo(`CI-TRAMO-${Date.now()}`), dependeDe: [CADENA.codigo] };
    const r = await ensayar(tramo);
    ok("7: el ensayo avisa que falta el origen", /todavía no se aplicó/.test(r.errores.join(" ")), r.errores.join(" "));
  }

  seccion("8. Aplicar el AUTORIZADO con su huella exacta");
  let fotoAplicada;
  {
    const r = await aplicar(autorizado(CADENA, hashCadena));
    igual("8: APLICADA", r.resultado, RESULTADO.APLICADA);
    igual("8: sin errores", r.errores, []);
    const a = await prisma.cierrePreparacion.findUnique({ where: { id: corteA.id } });
    igual("8: corte A: cambio $23.000", Number(a.totalCambio), 23000);
    igual("8: corte A: desglose corregido", a.desgloseCambio, { 1000: 23 });
    igual("8: corte A: diferencia 0", Number(a.diferencia), 0);
    const ta = await prisma.turno.findUnique({ where: { id: tA.id } });
    igual("8: turno A: contado $50.000 y diferencia 0", [Number(ta.montoRealEfectivo), Number(ta.diferenciaEfectivo)], [50000, 0]);
    const s = await prisma.cambioPendiente.findUnique({ where: { id: sobreA.id } });
    igual("8: sobre: total, recibido y diferencia", [Number(s.total), Number(s.totalRecibido), Number(s.diferencia)], [23000, 23000, 0]);
    const tb = await prisma.turno.findUnique({ where: { id: tB.id } });
    igual("8: turno B: fondo $23.000, esperado $2.000, diferencia 0",
      [Number(tb.montoInicial), Number(tb.montoEsperadoEfectivo), Number(tb.diferenciaEfectivo)], [23000, 2000, 0]);
    const reg = await prisma.correccionCaja.findUnique({ where: { codigo: CADENA.codigo } });
    ok("8: quedó el registro con la huella autorizada", reg?.manifiestoHash === hashCadena, reg?.manifiestoHash);
    igual("8: quién autorizó y quién ejecutó", [reg?.autorizadoPorUsuarioId, reg?.ejecutadoPorUsuarioId], [u, u]);
    const desgloseAntes = reg?.snapshotAntes?.CierrePreparacion?.[corteA.id]?.desgloseCambio;
    igual("8: el desglose ORIGINAL queda en el snapshot de antes", desgloseAntes, { 1000: 23000 });
    ok("8: y en los cambios", (reg?.cambios ?? []).some((c) => c.campo === "desgloseCambio" && JSON.stringify(c.antes) === JSON.stringify({ 1000: 23000 })));
    igual("8: el snapshot de después tiene el corregido", reg?.snapshotDespues?.CierrePreparacion?.[corteA.id]?.desgloseCambio, { 1000: 23 });
    const bit = await prisma.auditoriaBitacora.findFirst({ where: { accion: ACCION_CORRECCION_HISTORICA, entidadId: CADENA.codigo } });
    ok("8: la bitácora quedó, en la misma transacción", Boolean(bit) && bit.usuarioId === u, JSON.stringify(bit)?.slice(0, 160));
    fotoAplicada = await fotoDelLocal(f.local.id);
    const d = await prisma.turno.findUnique({ where: { id: tD.id } });
    igual("8: el turno de control D no se tocó", Number(d.montoInicial), 12345);
    igual("8: el turno C no se tocó", Number((await prisma.cajaMovimiento.findUnique({ where: { id: movC.id } })).monto), 8000000);
  }

  seccion("9. Idempotencia: mismo código y huella = ya aplicada; otra huella = error");
  {
    const r = await aplicar(autorizado(CADENA, hashCadena));
    igual("9: YA_APLICADA", r.resultado, RESULTADO.YA_APLICADA);
    igual("9: no volvió a escribir nada", await fotoDelLocal(f.local.id), fotoAplicada);
    const r2 = await aplicar(autorizado(CADENA, "f".repeat(64)));
    ok("9: mismo código con otra huella es error", r2.resultado === RESULTADO.RECHAZADA && /ya se corrigió con otro plan/.test(r2.errores.join(" ")),
      r2.errores.join(" "));
    igual("9: sin cambios", await fotoDelLocal(f.local.id), fotoAplicada);
  }

  seccion("10. CajaMovimiento: el retiro de cierre inflado se corrige, auditado");
  {
    const e = await ensayar(CONTEO);
    igual("10: ensayo sin errores", e.errores, []);
    const r = await aplicar(autorizado(CONTEO, e.hash));
    igual("10: APLICADA", r.resultado, RESULTADO.APLICADA);
    const m = await prisma.cajaMovimiento.findUnique({ where: { id: movC.id } });
    igual("10: el retiro de cierre de C pasa a $8.000", Number(m.monto), 8000);
    const reg = await prisma.correccionCaja.findUnique({ where: { codigo: CONTEO.codigo } });
    const cm = (reg?.cambios ?? []).find((c) => c.entidad === "CajaMovimiento" && c.id === movC.id);
    igual("10: antes y después del movimiento quedan en el registro", [cm?.antes, cm?.despues], [8000000, 8000]);
    const tc = await prisma.turno.findUnique({ where: { id: tC.id } });
    igual("10: turno C: retirado $8.000 y diferencia 0", [Number(tc.efectivoRetiradoCierre), Number(tc.diferenciaEfectivo)], [8000, 0]);
  }

  seccion("11. Lo que no entra: vencido, sin conteo, un tipo que no existe, fuera del alcance");
  {
    // Un corte vencido de verdad: tomado y con el plazo pasado.
    const tV = await turnoNuevo(f, 10000);
    const rv = await leer(await rutaIniciar.POST(pedido(`${BASE}/cierres/iniciar`, f.sesion, { turnoId: tV.id, desgloseCambio: { 1000: 1 } })));
    await prisma.cierrePreparacion.update({ where: { id: rv.cierre.id }, data: { venceEn: new Date(Date.now() - 60_000), estado: "VENCIDO" } });
    const mV = {
      codigo: codigo(`CI-VENCIDO-${Date.now()}`), estado: "PROPUESTO", motivo: "x", evidencia: "x",
      correcciones: [{ tipo: "CORTE", cierrePreparacionId: rv.cierre.id, antes: { desgloseCambio: { 1000: 1 } }, despues: { desgloseCambio: { 1000: 2 } } }],
    };
    const e1 = await ensayar(mV);
    ok("11: un corte VENCIDO no se corrige", /VENCIDO/.test(e1.errores.join(" ")), e1.errores.join(" "));

    // El mismo corte, cerrado sin conteo por su ruta.
    await prisma.cierrePreparacion.update({ where: { id: rv.cierre.id }, data: { estado: "PREPARANDO" } });
    const sc = await leer(
      await rutaSinConteo.POST(pedido(`${BASE}/cierres/${rv.cierre.token}/cerrar-sin-conteo`, f.sesionSinConteo, { motivo: "prueba" }), conToken(rv.cierre.token))
    );
    ok("11: (preparación) se cerró sin conteo", sc.ok === true, sc.error);
    const e2 = await ensayar({ ...mV, codigo: codigo(`CI-SINCONTEO-${Date.now()}`) });
    ok("11: un corte CERRADO_SIN_CONTEO no se corrige", /sin conteo/.test(e2.errores.join(" ")), e2.errores.join(" "));

    const e3 = await ensayar({ ...mV, codigo: codigo(`CI-VENTA-${Date.now()}`), correcciones: [{ tipo: "VENTA", ventaId: 9152, antes: {}, despues: {} }] });
    ok("11: una venta (KG o no) no se corrige con esta herramienta", /tipo que esta herramienta no maneja/.test(e3.errores.join(" ")), e3.errores.join(" "));

    const antes = await fotoDelLocal(f.local.id);
    const e4 = await aplicar(autorizado({ ...mV, codigo: codigo(`CI-NOAUT-${Date.now()}`) }, "a".repeat(64)));
    ok("11: nada de esto se aplica", e4.resultado === RESULTADO.RECHAZADA, e4.resultado);
    igual("11: y la base no cambió", await fotoDelLocal(f.local.id), antes);
  }
}

// ═══════════════════════════════════════════════════════════════════════════

let codigoSalida = 0;
try {
  if (!SECRETO) { console.error("ABORTADO: falta AUTH_SECRET."); process.exit(2); }
  console.log("Montando fixtures…");
  await correr(await montar());
} catch (err) {
  fallas.push(`EXCEPCIÓN: ${err?.stack || err?.message || err}`);
  console.error(err);
} finally {
  await desmontar().catch((e) => console.error("Limpieza incompleta:", e.message));
  await prisma.$disconnect();
}

console.log(`\n${"═".repeat(72)}`);
console.log(`Afirmaciones que pasaron: ${pasadas}`);
console.log(`Afirmaciones que fallaron: ${fallas.length}`);
if (fallas.length > 0) {
  console.log("");
  for (const x of fallas) console.log(`  ✗ ${x}`);
  codigoSalida = 1;
}
process.exit(codigoSalida);
