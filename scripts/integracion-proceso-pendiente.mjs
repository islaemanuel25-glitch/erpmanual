// scripts/integracion-proceso-pendiente.mjs
//
// Prueba de INTEGRACIÓN REAL del AVISO DE PROCESO DE CAJA PENDIENTE, contra
// PostgreSQL. No simula: importa los handlers de verdad, los ejecuta con
// sesiones firmadas sobre una base descartable, y verifica lo que quedó escrito
// en las tablas.
//
// EL DEFECTO QUE ESTO PERSIGUE
//
// El 2026-08-04, en mini el 7, un cajero con un retiro a medio contar apretó
// "Separar cambio, iniciar cierre y liberar POS" y no pasó nada visible. El
// servidor rechazaba bien —409, sin crear nada— pero el rechazo viajaba con un
// texto y nada más: la pantalla no podía nombrar el proceso abierto, ni llevar
// hasta él, ni ofrecer deshacerlo.
//
// Lo que se verifica acá es que TODO rechazo por exclusión mutua lleve el
// proceso pendiente con su token, y que cancelarlo no mueva un peso.
//
// Uso:
//   DATABASE_URL=<base descartable> AUTH_SECRET=<secreto> \
//   node --import ./scripts/alias-loader.mjs scripts/integracion-proceso-pendiente.mjs
//
// Crea su propio grupo, local y usuarios. NO toca datos existentes.

import { crearClientePrisma, ESCRITURA } from "./lib/clientePrisma.mjs";
import jwt from "jsonwebtoken";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });
const SUFIJO = `proc-pend-${Date.now().toString(36)}`;

let ok = 0;
let fallos = 0;
const pendientes = [];

function chequear(nombre, condicion, extra = "") {
  if (condicion) {
    ok++;
    console.log(`  OK    ${nombre}${extra ? " — " + extra : ""}`);
  } else {
    fallos++;
    pendientes.push(nombre);
    console.log(`  FALLA ${nombre}${extra ? " — " + extra : ""}`);
  }
}

let GRUPO_ID = null;

function cookieDe(usuario, localId) {
  const token = jwt.sign(
    {
      id: usuario.id, email: usuario.email, nombre: usuario.nombre, rolId: usuario.rolId,
      permisos: ["pos.usar", "pos.turnos"], localId, grupoId: GRUPO_ID,
    },
    process.env.AUTH_SECRET,
    { expiresIn: 3600 }
  );
  return `erpazul_sesion=${token}`;
}

function pedido(url, cookie, body) {
  const req = new Request(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { cookie, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
  return req;
}

const json = (res) => res.json();
const ctx = (token) => ({ params: Promise.resolve({ token }) });

let numeroVenta = 0;
async function venderEfectivo(turno, monto) {
  numeroVenta++;
  return prisma.venta.create({
    data: {
      localId: turno.localId, vendedorId: turno.vendedorId, turnoId: turno.id,
      numero: numeroVenta, subtotal: monto, total: monto, formaPago: "EFECTIVO",
    },
  });
}

/** Los invariantes de "cancelar no mueve plata", medidos antes y después. */
async function fotoDeCaja(turnoId) {
  const [arqueos, movimientos] = await Promise.all([
    prisma.arqueoCaja.count({ where: { turnoId } }),
    prisma.cajaMovimiento.count({ where: { turnoId } }),
  ]);
  const turno = await prisma.turno.findUnique({ where: { id: turnoId } });
  return {
    arqueos,
    movimientos,
    cierre: turno.cierre,
    cierreEnPreparacionEn: turno.cierreEnPreparacionEn,
    montoRealEfectivo: turno.montoRealEfectivo,
  };
}

async function main() {
  console.log(`\n=== INTEGRACIÓN: AVISO DE PROCESO PENDIENTE (${SUFIJO}) ===\n`);

  const { POST: iniciarRetiro } = await import("../app/api/pos-ventas/retiros/iniciar/route.js");
  const { POST: cancelarRetiro } = await import("../app/api/pos-ventas/retiros/[token]/cancelar/route.js");
  const { POST: iniciarCierre } = await import("../app/api/pos-ventas/cierres/iniciar/route.js");
  const { POST: cancelarCierre } = await import("../app/api/pos-ventas/cierres/[token]/cancelar/route.js");
  const { GET: turnoActual } = await import("../app/api/pos-ventas/turnos/actual/route.js");
  const { POST: reservarCambio } = await import("../app/api/pos-ventas/cambios-pendientes/reservar/route.js");
  const { rutaProceso } = await import("../lib/caja/procesoPendiente.js");

  // ── Escenario ────────────────────────────────────────────────────────────
  const grupo = await prisma.grupo.create({ data: { nombre: `Grupo ${SUFIJO}` } });
  GRUPO_ID = grupo.id;
  const rol = await prisma.rol.create({
    data: { nombre: `Rol ${SUFIJO}`, permisos: ["pos.usar", "pos.turnos"] },
  });
  const local = await prisma.local.create({ data: { nombre: `Local ${SUFIJO}`, tipo: "local" } });
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: local.id } });
  await prisma.configuracionLocal.create({ data: { localId: local.id, exigirOperador: false } });

  const mk = (p) => prisma.usuario.create({
    data: { nombre: `${p} ${SUFIJO}`, email: `${p}-${SUFIJO}@test.local`, passwordHash: "x", rolId: rol.id, localId: local.id },
  });
  const cajero = await mk("cajero");
  const relevo = await mk("relevo");
  const tercero = await mk("tercero");

  const A = cookieDe(cajero, local.id);
  const B = cookieDe(relevo, local.id);
  const C = cookieDe(tercero, local.id);
  const BASE = "http://localhost/api";

  // ═══════════════════════════════════════════════════════════════════════
  // CASO 1 — RETIRO PENDIENTE
  // ═══════════════════════════════════════════════════════════════════════
  console.log("── CASO 1: retiro pendiente ──");

  const t1 = await prisma.turno.create({
    data: { localId: local.id, vendedorId: cajero.id, montoInicial: 6000 },
  });
  await venderEfectivo(t1, 48000);
  // Esperado 54.000 · cambio 6.000 · retiro esperado 48.000 — las cifras del
  // incidente real.

  const ret1 = await json(await iniciarRetiro(pedido(`${BASE}/pos-ventas/retiros/iniciar`, A, {
    turnoId: t1.id, desgloseCambio: { 1000: 6 },
  })));
  chequear("0. el retiro arranca: esperado 54.000, retiro esperado 48.000",
    ret1.ok && ret1.retiro.efectivoEsperadoCorte === 54000 && ret1.retiro.efectivoRetiradoEsperado === 48000);
  const TOKEN_RETIRO = ret1.retiro.token;

  const antesDeChocar = await fotoDeCaja(t1.id);

  // ── 1. retiro pendiente + intentar OTRO retiro ──────────────────────────
  const otroRetiro = await iniciarRetiro(pedido(`${BASE}/pos-ventas/retiros/iniciar`, A, {
    turnoId: t1.id, desgloseCambio: { 1000: 2 },
  }));
  const jOtroRetiro = await json(otroRetiro);
  chequear("1. retiro pendiente + otro retiro: la respuesta trae el proceso",
    jOtroRetiro.procesoPendiente?.token === TOKEN_RETIRO,
    `tipo=${jOtroRetiro.procesoPendiente?.tipo}`);
  chequear("1b. y lo identifica como RETIRO",
    jOtroRetiro.procesoPendiente?.tipo === "RETIRO");
  chequear("1c. con las cifras del cartel: cambio 6.000 y retiro 48.000",
    jOtroRetiro.procesoPendiente?.totalCambio === 6000 &&
    jOtroRetiro.procesoPendiente?.efectivoRetiradoEsperado === 48000);
  chequear("1d. y con la hora del corte", !!jOtroRetiro.procesoPendiente?.corteEn);

  // ── 2. retiro pendiente + intentar CIERRE ───────────────────────────────
  const cierreBloqueado = await iniciarCierre(pedido(`${BASE}/pos-ventas/cierres/iniciar`, A, {
    turnoId: t1.id, desgloseCambio: { 1000: 6 },
  }));
  const jCierreBloqueado = await json(cierreBloqueado);
  chequear("2. retiro pendiente + cierre: rechaza con 409", cierreBloqueado.status === 409,
    `status=${cierreBloqueado.status}`);
  chequear("2b. y el 409 trae el retiro pendiente, con su token",
    jCierreBloqueado.procesoPendiente?.tipo === "RETIRO" &&
    jCierreBloqueado.procesoPendiente?.token === TOKEN_RETIRO);
  chequear("2c. el retiro pendiente se informa cancelable",
    jCierreBloqueado.procesoPendiente?.puedeCancelar === true);
  chequear("2d. el texto sigue explicando qué hacer",
    /Confirmalo o cancelalo antes de cerrar/.test(jCierreBloqueado.error || ""));

  // ── 3. Continuar retiro abre el token existente ─────────────────────────
  chequear("3. 'Continuar retiro' lleva al token existente, no a /nuevo",
    rutaProceso("RETIRO", TOKEN_RETIRO) === `/modulos/pos-ventas/retiros/${encodeURIComponent(TOKEN_RETIRO)}`);

  // ── 4. no se creó otra preparación, ni un cierre ────────────────────────
  const retirosDelTurno = await prisma.retiroPreparacion.count({ where: { turnoId: t1.id } });
  const cierresDelTurno = await prisma.cierrePreparacion.count({ where: { turnoId: t1.id } });
  chequear("4. sigue habiendo UNA sola RetiroPreparacion", retirosDelTurno === 1, `n=${retirosDelTurno}`);
  chequear("4b. y NINGÚN CierrePreparacion", cierresDelTurno === 0, `n=${cierresDelTurno}`);

  const trasChocar = await fotoDeCaja(t1.id);
  chequear("4c. los choques no crearon arqueos ni movimientos",
    trasChocar.arqueos === antesDeChocar.arqueos && trasChocar.movimientos === antesDeChocar.movimientos);
  chequear("4d. ni congelaron el turno", trasChocar.cierreEnPreparacionEn === null);

  // ── turnos/actual también lo informa, para el aviso al ENTRAR ───────────
  const actual1 = await json(await turnoActual(pedido(`${BASE}/pos-ventas/turnos/actual`, A)));
  chequear("4e. turnos/actual informa el retiro pendiente con forma de aviso",
    actual1.retiroEnPreparacion?.proceso?.token === TOKEN_RETIRO &&
    actual1.retiroEnPreparacion?.proceso?.tipo === "RETIRO");
  chequear("4f. y con puedeCancelar", actual1.retiroEnPreparacion?.proceso?.puedeCancelar === true);

  // ── 5-7. Cancelar retiro ────────────────────────────────────────────────
  console.log("\n── CANCELAR EL RETIRO ──");
  const cancel1 = await json(await cancelarRetiro(
    pedido(`${BASE}/pos-ventas/retiros/${TOKEN_RETIRO}/cancelar`, A, { motivo: "Cancelado desde el aviso." }),
    ctx(TOKEN_RETIRO)
  ));
  chequear("5. cancelar responde ok", cancel1.ok === true, cancel1.error || "");

  const filaRetiro = await prisma.retiroPreparacion.findFirst({ where: { turnoId: t1.id } });
  chequear("5b. la RetiroPreparacion queda CANCELADO", filaRetiro.estado === "CANCELADO", filaRetiro.estado);
  chequear("5c. con motivo y autor grabados",
    !!filaRetiro.motivoCancelacion && filaRetiro.canceladoPorUsuarioId === cajero.id);
  chequear("5d. la fila NO se borra: queda la evidencia", filaRetiro != null);

  const trasCancelar = await fotoDeCaja(t1.id);
  chequear("6. cancelar NO creó ArqueoCaja",
    trasCancelar.arqueos === antesDeChocar.arqueos, `arqueos=${trasCancelar.arqueos}`);
  chequear("7. cancelar NO creó CajaMovimiento",
    trasCancelar.movimientos === antesDeChocar.movimientos, `movs=${trasCancelar.movimientos}`);
  chequear("7b. cancelar NO tocó el turno",
    trasCancelar.cierre === null && trasCancelar.cierreEnPreparacionEn === null &&
    trasCancelar.montoRealEfectivo === antesDeChocar.montoRealEfectivo);
  chequear("7c. y no publicó ningún cambio pendiente",
    (await prisma.cambioPendiente.count({ where: { turnoOrigenId: t1.id } })) === 0);

  const actualTrasCancelar = await json(await turnoActual(pedido(`${BASE}/pos-ventas/turnos/actual`, A)));
  chequear("7d. turnos/actual ya no informa ningún retiro pendiente",
    actualTrasCancelar.retiroEnPreparacion === null);

  // ── 8. después de cancelar, se puede cerrar ─────────────────────────────
  const cierreOk = await json(await iniciarCierre(pedido(`${BASE}/pos-ventas/cierres/iniciar`, A, {
    turnoId: t1.id, desgloseCambio: { 1000: 6 },
  })));
  chequear("8. después de cancelar el retiro, el cierre SÍ arranca",
    cierreOk.ok === true && !!cierreOk.cierre?.token, cierreOk.error || "");
  chequear("8b. y no viene marcado como proceso pendiente",
    cierreOk.procesoPendiente == null && cierreOk.repetido === false);
  const TOKEN_CIERRE = cierreOk.cierre.token;

  // ═══════════════════════════════════════════════════════════════════════
  // CASO 2 — CIERRE PENDIENTE
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n── CASO 2: cierre pendiente ──");

  // ── 9. cierre pendiente + intentar retiro ───────────────────────────────
  const retiroBloqueado = await iniciarRetiro(pedido(`${BASE}/pos-ventas/retiros/iniciar`, A, {
    turnoId: t1.id, desgloseCambio: { 1000: 1 },
  }));
  const jRetiroBloqueado = await json(retiroBloqueado);
  chequear("9. cierre pendiente + retiro: rechaza con 409", retiroBloqueado.status === 409,
    `status=${retiroBloqueado.status}`);
  chequear("9b. y el 409 trae el CIERRE pendiente con su token",
    jRetiroBloqueado.procesoPendiente?.tipo === "CIERRE" &&
    jRetiroBloqueado.procesoPendiente?.token === TOKEN_CIERRE);
  chequear("9c. sin crear ninguna RetiroPreparacion nueva",
    (await prisma.retiroPreparacion.count({ where: { turnoId: t1.id, estado: "PREPARANDO" } })) === 0);

  // ── 10. cierre pendiente + intentar otro cierre ─────────────────────────
  const otroCierre = await json(await iniciarCierre(pedido(`${BASE}/pos-ventas/cierres/iniciar`, A, {
    turnoId: t1.id, desgloseCambio: { 1000: 3 },
  })));
  chequear("10. cierre pendiente + otro cierre: devuelve el que ya existe",
    otroCierre.repetido === true && otroCierre.cierre?.token === TOKEN_CIERRE);
  chequear("10b. y lo informa como proceso pendiente, no como alta",
    otroCierre.procesoPendiente?.tipo === "CIERRE" &&
    otroCierre.procesoPendiente?.token === TOKEN_CIERRE);
  chequear("10c. sigue habiendo UN solo CierrePreparacion",
    (await prisma.cierrePreparacion.count({ where: { turnoId: t1.id } })) === 1);
  chequear("10d. y UN solo CambioPendiente",
    (await prisma.cambioPendiente.count({ where: { turnoOrigenId: t1.id, estado: { not: "CANCELADO" } } })) === 1);

  // ── 11. Continuar cierre usa el token existente ─────────────────────────
  chequear("11. 'Continuar cierre' lleva al token existente, no a /iniciar",
    rutaProceso("CIERRE", TOKEN_CIERRE) === `/modulos/pos-ventas/cierres/${encodeURIComponent(TOKEN_CIERRE)}`);

  // ── 12. cambio DISPONIBLE → se puede cancelar ───────────────────────────
  const sobre = await prisma.cambioPendiente.findFirst({ where: { turnoOrigenId: t1.id, estado: { not: "CANCELADO" } } });
  chequear("12. con el cambio DISPONIBLE, el aviso dice que se puede cancelar",
    sobre.estado === "DISPONIBLE" && otroCierre.procesoPendiente?.puedeCancelar === true);
  chequear("12b. y no muestra motivo de bloqueo",
    otroCierre.procesoPendiente?.motivoNoCancelable === null);

  // ── 13. cambio RESERVADO → NO se puede cancelar ─────────────────────────
  const reserva = await json(await reservarCambio(pedido(`${BASE}/pos-ventas/cambios-pendientes/reservar`, B, {
    cambioPendienteId: sobre.id,
  })));
  chequear("13. el relevo reserva el sobre", reserva.ok === true, reserva.error || "");

  const conReserva = await json(await turnoActual(pedido(`${BASE}/pos-ventas/turnos/actual`, A)));
  const avisoReservado = conReserva.cierreEnPreparacion?.proceso;
  chequear("13b. con el cambio RESERVADO, el aviso NO permite cancelar",
    avisoReservado?.puedeCancelar === false, `puedeCancelar=${avisoReservado?.puedeCancelar}`);
  chequear("13c. y explica por qué",
    /ya fue tomado por el siguiente operador/.test(avisoReservado?.motivoNoCancelable || ""));

  // Y el endpoint tampoco lo deja: el aviso dice lo mismo que hace el servidor.
  const cancelBloqueado = await cancelarCierre(
    pedido(`${BASE}/pos-ventas/cierres/${TOKEN_CIERRE}/cancelar`, A, { motivo: "no debería poder" }),
    ctx(TOKEN_CIERRE)
  );
  chequear("13d. y el endpoint de cancelación lo rechaza igual", cancelBloqueado.status === 409,
    `status=${cancelBloqueado.status}`);
  chequear("13e. el cierre sigue PREPARANDO",
    (await prisma.cierrePreparacion.findFirst({ where: { turnoId: t1.id } })).estado === "PREPARANDO");

  // ── 14. cambio RECIBIDO → NO se puede cancelar ──────────────────────────
  // Se marca recibido en la base directamente: abrir el turno del relevo con el
  // cambio es un flujo entero que ya tiene su propia prueba, y lo que importa
  // acá es el estado que ve el aviso.
  const turnoDestino = await prisma.turno.create({
    data: { localId: local.id, vendedorId: tercero.id, montoInicial: 6000 },
  });
  await prisma.cambioPendiente.update({
    where: { id: sobre.id },
    data: { estado: "RECIBIDO", turnoDestinoId: turnoDestino.id, recibidoEn: new Date(), totalRecibido: 6000 },
  });

  const conRecibido = await json(await turnoActual(pedido(`${BASE}/pos-ventas/turnos/actual`, A)));
  const avisoRecibido = conRecibido.cierreEnPreparacion?.proceso;
  chequear("14. con el cambio RECIBIDO, el aviso NO permite cancelar",
    avisoRecibido?.puedeCancelar === false, `puedeCancelar=${avisoRecibido?.puedeCancelar}`);
  chequear("14b. y explica por qué",
    /ya fue tomado por el siguiente operador/.test(avisoRecibido?.motivoNoCancelable || ""));

  const cancelRecibido = await cancelarCierre(
    pedido(`${BASE}/pos-ventas/cierres/${TOKEN_CIERRE}/cancelar`, A, { motivo: "no debería poder" }),
    ctx(TOKEN_CIERRE)
  );
  chequear("14c. y el endpoint tampoco lo permite", cancelRecibido.status === 409);

  // ── Lo que NO se filtra ─────────────────────────────────────────────────
  console.log("\n── ALCANCE ──");

  // Un cajero de OTRO local pidiendo su turno actual no ve nada de este.
  const otroLocal = await prisma.local.create({ data: { nombre: `Otro ${SUFIJO}`, tipo: "local" } });
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: otroLocal.id } });
  const ajeno = cookieDe(relevo, otroLocal.id);
  const vistaAjena = await json(await turnoActual(pedido(`${BASE}/pos-ventas/turnos/actual`, ajeno)));
  chequear("15. otro local no ve el cierre pendiente de este",
    vistaAjena.cierreEnPreparacion == null && vistaAjena.retiroEnPreparacion == null);

  chequear("16. el proceso no lleva ids internos ni datos de otro local",
    avisoRecibido && !("localId" in avisoRecibido) && !("turnoId" in avisoRecibido) && !("id" in avisoRecibido));

  // ── Limpieza ────────────────────────────────────────────────────────────
  console.log("\n── LIMPIEZA ──");
  await prisma.cambioPendiente.deleteMany({ where: { localId: local.id } });
  await prisma.retiroPreparacion.deleteMany({ where: { localId: local.id } });
  await prisma.cierrePreparacion.deleteMany({ where: { localId: local.id } });
  await prisma.arqueoCaja.deleteMany({ where: { localId: local.id } });
  // CajaMovimiento cuelga del turno, no del local: se borra por sus turnos.
  await prisma.cajaMovimiento.deleteMany({ where: { turno: { localId: local.id } } });
  await prisma.venta.deleteMany({ where: { localId: local.id } });
  await prisma.turno.deleteMany({ where: { localId: local.id } });
  await prisma.configuracionLocal.deleteMany({ where: { localId: local.id } });
  await prisma.grupoLocal.deleteMany({ where: { grupoId: grupo.id } });
  await prisma.usuario.deleteMany({ where: { id: { in: [cajero.id, relevo.id, tercero.id] } } });
  await prisma.local.deleteMany({ where: { id: { in: [local.id, otroLocal.id] } } });
  await prisma.rol.delete({ where: { id: rol.id } });
  await prisma.grupo.delete({ where: { id: grupo.id } });
  console.log("  escenario borrado");

  console.log(`\n=== ${ok} OK · ${fallos} FALLAS ===`);
  if (fallos) {
    console.log("\nPendientes:");
    for (const p of pendientes) console.log(`  · ${p}`);
  }
  process.exitCode = fallos ? 1 : 0;
}

main()
  .catch((e) => {
    console.error("\nERROR FATAL:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
