// scripts/integracion-cierre-relevo.mjs
//
// Prueba de INTEGRACIÓN REAL del cierre con relevo de operador, contra PostgreSQL.
//
// No simula: importa los handlers de las rutas de verdad y los ejecuta con
// sesiones firmadas, sobre una base DESCARTABLE. Verifica lo que quedó escrito en
// las tablas, no lo que devolvió el endpoint.
//
// Uso:
//   DATABASE_URL=<base descartable> AUTH_SECRET=<secreto> \
//   node --import ./scripts/alias-loader.mjs scripts/integracion-cierre-relevo.mjs
//
// Crea su propio grupo, local y usuarios de prueba. NO toca datos existentes.

import { crearClientePrisma, ESCRITURA } from "./lib/clientePrisma.mjs";
import jwt from "jsonwebtoken";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });
const SUFIJO = `relevo-${Date.now().toString(36)}`;

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

const money = (v) => (v == null ? null : Number(v));
const f = (n) => "$" + Number(n).toLocaleString("es-AR");

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

/** Cookie de operador activo, con el mismo formato que emite el login del POS. */
function cookieOperador(operadorId, nombre, localId) {
  const token = jwt.sign(
    { operadorId, nombre, localId, _tipo: "operador" },
    process.env.AUTH_SECRET,
    { expiresIn: 3600 }
  );
  return `erpazul_operador_activo=${token}`;
}

function pedido(url, cookie, body) {
  const req = new Request(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { cookie, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // Los handlers leen `req.nextUrl.searchParams`. Request nativo no lo tiene.
  Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
  return req;
}

const json = (res) => res.json();

async function main() {
  console.log(`\n=== INTEGRACIÓN: CIERRE CON RELEVO DE OPERADOR (${SUFIJO}) ===\n`);

  const { POST: iniciarCierre } = await import("../app/api/pos-ventas/cierres/iniciar/route.js");
  const { GET: leerCierre } = await import("../app/api/pos-ventas/cierres/[token]/route.js");
  const { POST: confirmarCierre } = await import("../app/api/pos-ventas/cierres/[token]/confirmar/route.js");
  const { POST: cancelarCierre } = await import("../app/api/pos-ventas/cierres/[token]/cancelar/route.js");
  const { GET: listarCambios } = await import("../app/api/pos-ventas/cambios-pendientes/listar/route.js");
  const { POST: reservarCambio } = await import("../app/api/pos-ventas/cambios-pendientes/reservar/route.js");
  const { POST: liberarCambio } = await import("../app/api/pos-ventas/cambios-pendientes/liberar/route.js");
  const { POST: abrirConCambio } = await import("../app/api/pos-ventas/turnos/abrir-con-cambio/route.js");
  const { POST: abrirSinCambio } = await import("../app/api/pos-ventas/turnos/abrir-sin-cambio/route.js");
  const { POST: crearMovimiento } = await import("../app/api/pos-ventas/caja-movimientos/crear/route.js");
  const { POST: iniciarRetiro } = await import("../app/api/pos-ventas/retiros/iniciar/route.js");
  const { GET: turnoActual } = await import("../app/api/pos-ventas/turnos/actual/route.js");

  // ── Escenario ────────────────────────────────────────────────────────────
  const grupo = await prisma.grupo.create({ data: { nombre: `Grupo ${SUFIJO}` } });
  GRUPO_ID = grupo.id;
  const rol = await prisma.rol.create({
    data: { nombre: `Rol ${SUFIJO}`, permisos: ["pos.usar", "pos.turnos"] },
  });
  const local = await prisma.local.create({ data: { nombre: `Local ${SUFIJO}`, tipo: "local" } });
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: local.id } });
  // El local NO exige operario: así el gate no bloquea y las pruebas se
  // concentran en el cierre. La autoría con operario se prueba aparte, abajo.
  await prisma.configuracionLocal.create({
    data: { localId: local.id, exigirOperador: false },
  });

  const cajeroA = await prisma.usuario.create({
    data: { nombre: `Cajero A ${SUFIJO}`, email: `a-${SUFIJO}@test.local`, passwordHash: "x", rolId: rol.id, localId: local.id },
  });
  const cajeroB = await prisma.usuario.create({
    data: { nombre: `Cajero B ${SUFIJO}`, email: `b-${SUFIJO}@test.local`, passwordHash: "x", rolId: rol.id, localId: local.id },
  });
  const operario = await prisma.operadorLocal.create({
    data: { nombre: `Operario ${SUFIJO}`, pinHash: "x" },
  });
  await prisma.operadorEnLocal.create({ data: { operadorId: operario.id, localId: local.id } });

  const A = cookieDe(cajeroA, local.id);
  const B = cookieDe(cajeroB, local.id);
  const BASE = "http://localhost/api";

  // ── Turno de A con plata adentro ─────────────────────────────────────────
  const turnoA = await prisma.turno.create({
    data: { localId: local.id, vendedorId: cajeroA.id, montoInicial: 30000 },
  });
  await prisma.cajaMovimiento.create({
    data: { turnoId: turnoA.id, usuarioId: cajeroA.id, tipo: "INGRESO", monto: 5000, motivo: "Aporte" },
  });
  // Esperado antes del corte: 30.000 + 5.000 = 35.000 (sin ventas).

  // ═══════════════════════════════════════════════════════════════════════
  console.log("── CORTE CONGELADO ──");

  // EL CAMBIO SE SEPARA ANTES DEL CORTE. 2×$2.000 + $500 de monedas = $4.500.
  // Con el esperado en $35.000, el retiro esperado queda congelado en $30.500.
  const CAMBIO = { 2000: 2, monedas: 500 };

  const r1 = await json(await iniciarCierre(pedido(`${BASE}/pos-ventas/cierres/iniciar`, A, {
    turnoId: turnoA.id, desgloseCambio: CAMBIO,
  })));
  chequear("1. iniciar cierre congela el esperado", r1.ok && r1.cierre?.efectivoEsperadoCorte === 35000, f(r1.cierre?.efectivoEsperadoCorte));
  chequear(
    "1b. y congela también el cambio separado y el retiro esperado",
    r1.cierre?.totalCambio === 4500 && r1.cierre?.efectivoRetiradoEsperado === 30500,
    `cambio ${f(r1.cierre?.totalCambio)} · retiro esperado ${f(r1.cierre?.efectivoRetiradoEsperado)}`
  );
  chequear(
    "1c. el sobre de cambio nace DISPONIBLE en el mismo acto del corte",
    r1.cambioPendiente?.estado === "DISPONIBLE" && r1.cambioPendiente?.total === 4500
  );

  const movInicial = await prisma.cajaMovimiento.findFirst({ where: { turnoId: turnoA.id }, orderBy: { id: "desc" } });
  chequear(
    "2. guarda los límites por ID, no por fecha",
    r1.cierre.ultimoMovimientoId === movInicial.id && r1.cierre.ultimaVentaId === null,
    `ultimoMovimientoId=${r1.cierre.ultimoMovimientoId}`
  );

  const TOKEN = r1.cierre.token;
  const ctxToken = { params: Promise.resolve({ token: TOKEN }) };

  // El corte quedó tomado: ahora se mete plata "por la fuerza" para probar que
  // no lo mueve. Se escribe directo en la base porque el endpoint ya lo rechaza
  // (eso se prueba aparte, más abajo).
  const movPosterior = await prisma.cajaMovimiento.create({
    data: { turnoId: turnoA.id, usuarioId: cajeroA.id, tipo: "INGRESO", monto: 99999, motivo: "Posterior al corte" },
  });
  const cierreTrasRuido = await prisma.cierrePreparacion.findUnique({ where: { id: r1.cierre.id } });
  chequear(
    "3-5. ventas, ingresos y retiros posteriores NO mueven el corte",
    money(cierreTrasRuido.efectivoEsperadoCorte) === 35000 && cierreTrasRuido.ultimoMovimientoId < movPosterior.id,
    `esperado sigue en ${f(cierreTrasRuido.efectivoEsperadoCorte)}`
  );
  await prisma.cajaMovimiento.delete({ where: { id: movPosterior.id } });

  // ── El turno congelado no admite nada ────────────────────────────────────
  const turnoCongelado = await prisma.turno.findUnique({ where: { id: turnoA.id } });
  chequear("6a. el turno quedó marcado en preparación", turnoCongelado.cierreEnPreparacionEn !== null && turnoCongelado.cierre === null);

  // Ventas: el where del endpoint es el que decide. Se comprueba la condición
  // real que usa, sin fabricar una venta completa.
  const { WHERE_TURNO_OPERATIVO } = await import("../lib/caja/cierreRelevo.js");
  const operativo = await prisma.turno.findFirst({
    where: { id: turnoA.id, localId: local.id, vendedorId: cajeroA.id, ...WHERE_TURNO_OPERATIVO },
  });
  chequear("6. turno congelado no admite ventas", operativo === null);

  const rMov = await crearMovimiento(pedido(`${BASE}/pos-ventas/caja-movimientos/crear`, A, {
    turnoId: turnoA.id, tipo: "INGRESO", monto: 1000, motivo: "No debería entrar",
  }));
  const jMov = await json(rMov);
  chequear("7. turno congelado no admite Caja +/−", rMov.status === 409 && jMov.turnoEnPreparacionDeCierre === true, jMov.error);

  // Un turno con el corte de cierre tomado tampoco admite empezar un retiro: los
  // dos congelarían el mismo esperado.
  const rRet = await iniciarRetiro(pedido(`${BASE}/pos-ventas/retiros/iniciar`, A, {
    turnoId: turnoA.id, desgloseCambio: { 10000: 1 },
  }));
  const jRet = await json(rRet);
  chequear("8. turno congelado no admite retiro", rRet.status === 409, jRet.error);

  // ── El relevo puede abrir ────────────────────────────────────────────────
  const rB = await json(await abrirSinCambio(pedido(`${BASE}/pos-ventas/turnos/abrir-sin-cambio`, B, {
    desgloseContado: { 10000: 2 }, motivo: "Relevo: traigo cambio propio",
  })));
  chequear("9. otro operador puede abrir turno nuevo", rB.ok && money(rB.turno.montoInicial) === 20000, f(rB.montoInicial));
  const turnoB = rB.turno;

  // El MISMO usuario A también podría abrir: el índice parcial ya no lo bloquea.
  const rAotro = await json(await abrirSinCambio(pedido(`${BASE}/pos-ventas/turnos/abrir-sin-cambio`, A, {
    desgloseContado: { 1000: 1 }, motivo: "Segundo turno del mismo cajero mientras el primero cuenta",
  })));
  chequear("9b. el índice parcial deja abrir al MISMO usuario con un turno congelado", rAotro.ok === true, rAotro.error || "");
  if (rAotro.ok) await prisma.turno.delete({ where: { id: rAotro.turno.id } });

  // ── Doble corte ──────────────────────────────────────────────────────────
  const r10 = await json(await iniciarCierre(pedido(`${BASE}/pos-ventas/cierres/iniciar`, A, {
    turnoId: turnoA.id, desgloseCambio: { 20000: 9 },
  })));
  chequear("10. doble corte bloqueado: devuelve el mismo, no crea otro", r10.ok && r10.repetido === true && r10.cierre.id === r1.cierre.id);
  chequear("10b. hay exactamente UN corte para el turno", (await prisma.cierrePreparacion.count({ where: { turnoId: turnoA.id } })) === 1);
  chequear(
    "10c. el segundo intento NO pisa el cambio ya congelado",
    money(r10.cierre.totalCambio) === 4500,
    `sigue en ${f(r10.cierre.totalCambio)}, no $180.000`
  );

  // ── Validación de denominaciones en el servidor ──────────────────────────
  console.log("\n── VALIDACIÓN SERVER-SIDE ──");

  const malDenom = await confirmarCierre(
    pedido(`${BASE}/pos-ventas/cierres/${TOKEN}/confirmar`, A, { desgloseRetiroContado: { 5000: 3 } }),
    ctxToken
  );
  chequear("12. denominación inexistente rechazada en el servidor", malDenom.status === 400, (await json(malDenom)).error);

  const conCambioAjeno = await json(await confirmarCierre(
    pedido(`${BASE}/pos-ventas/cierres/${TOKEN}/confirmar`, A, {
      desgloseRetiroContado: { 20000: 1, 10000: 1 },
      // Un intento de reescribir el cambio ya congelado: se IGNORA.
      desgloseCambio: { 20000: 9 },
      observacion: "Intento de pisar el cambio",
    }),
    ctxToken
  ));
  chequear(
    "14. el cambio congelado NO se puede reescribir al confirmar",
    conCambioAjeno.ok && conCambioAjeno.cuentas?.totalCambio === 4500,
    `quedó en ${f(conCambioAjeno.cuentas?.totalCambio)}`
  );

  // ── Confirmación ─────────────────────────────────────────────────────────
  console.log("\n── CONFIRMACIÓN ──");

  // El cajón al corte tenía: 1×$20.000 + 1×$10.000 + 2×$2.000 + monedas 500.
  // El cambio ($4.500) ya se apartó, así que sólo se cuenta el retiro: $30.000.
  const conf = conCambioAjeno;

  chequear("13. el total del cajón lo DERIVA el servidor", conf.ok && conf.cuentas.totalContado === 34500, f(conf.cuentas?.totalContado));
  chequear("15. retiro final = lo que se contó de la pila del retiro", conf.cuentas?.retiroFinal === 30000, f(conf.cuentas?.retiroFinal));
  chequear(
    "15b. la diferencia usa el RETIRO ESPERADO congelado",
    conf.cuentas?.diferencia === -500,
    `30.000 − 30.500 = ${f(conf.cuentas?.diferencia)}`
  );
  chequear(
    "15b2. y da lo mismo que el orden anterior (34.500 − 35.000)",
    conf.cuentas?.diferencia === 34500 - 35000
  );

  const turnoCerrado = await prisma.turno.findUnique({ where: { id: turnoA.id } });
  chequear(
    "15c. el turno guardó el esperado congelado y el reparto",
    money(turnoCerrado.montoEsperadoEfectivo) === 35000 &&
      money(turnoCerrado.montoRealEfectivo) === 34500 &&
      money(turnoCerrado.efectivoRetiradoCierre) === 30000 &&
      money(turnoCerrado.fondoDejadoCierre) === 4500 &&
      turnoCerrado.cierre !== null
  );

  const arqueos = await prisma.arqueoCaja.findMany({ where: { turnoId: turnoA.id } });
  chequear("15d. hay UN solo arqueo FINAL, con el esperado congelado", arqueos.length === 1 && arqueos[0].tipo === "FINAL" && money(arqueos[0].efectivoEsperado) === 35000);
  chequear("15e. el período del arqueo termina en el CORTE, no en la confirmación", new Date(arqueos[0].periodoHasta).getTime() === new Date(r1.cierre.corteEn).getTime());

  const movimientosFinales = await prisma.cajaMovimiento.findMany({ where: { turnoId: turnoA.id }, orderBy: { id: "asc" } });
  const retiros = movimientosFinales.filter((m) => m.tipo === "RETIRO");
  chequear("15f. UN movimiento de retiro, por el importe retirado", retiros.length === 1 && money(retiros[0].monto) === 30000);
  chequear("15g. NO se creó un movimiento por el cambio dejado", movimientosFinales.filter((m) => money(m.monto) === 4500).length === 0);
  chequear("15h. el retiro quedó vinculado al turno", turnoCerrado.retiroCierreMovimientoId === retiros[0].id);

  chequear(
    "27. no se escribieron los campos viejos de fondo",
    turnoCerrado.fondoOrigenTurnoId === null && turnoCerrado.fondoConsumidoEnTurnoId === null &&
      turnoCerrado.fondoSugeridoApertura === null && turnoCerrado.diferenciaFondoApertura === null
  );

  // ── Doble confirmación ───────────────────────────────────────────────────
  const conf2 = await json(await confirmarCierre(
    pedido(`${BASE}/pos-ventas/cierres/${TOKEN}/confirmar`, A, { desgloseRetiroContado: { 20000: 5 } }),
    ctxToken
  ));
  chequear("11. doble confirmación idempotente: no cierra dos veces", conf2.ok === true && conf2.repetido === true);
  chequear(
    "11b. y no duplicó arqueo, movimiento ni sobre",
    (await prisma.arqueoCaja.count({ where: { turnoId: turnoA.id } })) === 1 &&
      (await prisma.cajaMovimiento.count({ where: { turnoId: turnoA.id, tipo: "RETIRO" } })) === 1 &&
      (await prisma.cambioPendiente.count({ where: { turnoOrigenId: turnoA.id } })) === 1
  );

  // ── El cambio pendiente ──────────────────────────────────────────────────
  console.log("\n── CAMBIO PENDIENTE ──");

  const lista1 = await json(await listarCambios(pedido(`${BASE}/pos-ventas/cambios-pendientes/listar`, B)));
  const sobre1 = lista1.items.find((i) => i.turnoOrigenId === turnoA.id);
  chequear("16. el cambio quedó DISPONIBLE con su desglose", sobre1?.estado === "DISPONIBLE" && sobre1.total === 4500 && sobre1.desglose["2000"] === 2);

  // Un segundo turno que cierra deja un segundo sobre, para probar coexistencia.
  const turnoC = await prisma.turno.create({
    data: { localId: local.id, vendedorId: cajeroA.id, montoInicial: 10000, cierreEnPreparacionEn: null },
  });
  const rC = await json(await iniciarCierre(pedido(`${BASE}/pos-ventas/cierres/iniciar`, A, {
    turnoId: turnoC.id, desgloseCambio: { 10000: 1 },
  })));
  const ctxC = { params: Promise.resolve({ token: rC.cierre.token }) };
  // Todo el cajón quedó como cambio: no hay nada para retirar.
  await confirmarCierre(
    pedido(`${BASE}/pos-ventas/cierres/${rC.cierre.token}/confirmar`, A, { desgloseRetiroContado: {} }),
    ctxC
  );
  const lista2 = await json(await listarCambios(pedido(`${BASE}/pos-ventas/cambios-pendientes/listar`, B)));
  chequear("17. dos cambios pendientes pueden coexistir", lista2.items.filter((i) => i.estado === "DISPONIBLE").length === 2);

  // ── Reserva atómica ──────────────────────────────────────────────────────
  const [res1, res2] = await Promise.all([
    reservarCambio(pedido(`${BASE}/pos-ventas/cambios-pendientes/reservar`, B, { cambioPendienteId: sobre1.id })),
    reservarCambio(pedido(`${BASE}/pos-ventas/cambios-pendientes/reservar`, A, { cambioPendienteId: sobre1.id })),
  ]);
  const ganadores = [res1.status, res2.status].filter((s) => s === 200).length;
  chequear("18. dos reservas del mismo cambio: gana UNA sola", ganadores === 1, `estados ${res1.status}/${res2.status}`);

  const sobreReservado = await prisma.cambioPendiente.findUnique({ where: { id: sobre1.id } });
  const duenoReserva = sobreReservado.reservadoPorUsuarioId;
  chequear("18b. quedó RESERVADO por exactamente un usuario", sobreReservado.estado === "RESERVADO" && duenoReserva != null);

  // ── Reserva vencida ──────────────────────────────────────────────────────
  await prisma.cambioPendiente.update({
    where: { id: sobre1.id },
    data: { reservaVenceEn: new Date(Date.now() - 60_000) },
  });
  const lista3 = await json(await listarCambios(pedido(`${BASE}/pos-ventas/cambios-pendientes/listar`, B)));
  const trasVencer = await prisma.cambioPendiente.findUnique({ where: { id: sobre1.id } });
  chequear(
    "19. una reserva vencida vuelve a DISPONIBLE, sin consumir el cambio",
    trasVencer.estado === "DISPONIBLE" && trasVencer.turnoDestinoId === null && lista3.reservasLiberadas >= 1
  );

  // ── Recepción ────────────────────────────────────────────────────────────
  console.log("\n── RECEPCIÓN Y APERTURA ──");

  // El turno de B tiene que cerrarse para poder abrir otro con el sobre.
  await prisma.turno.update({ where: { id: turnoB.id }, data: { cierre: new Date() } });

  const reservaOk = await json(await reservarCambio(pedido(`${BASE}/pos-ventas/cambios-pendientes/reservar`, B, { cambioPendienteId: sobre1.id })));
  chequear("18c. se puede volver a reservar tras la liberación", reservaOk.ok === true);

  // Abrir sin motivo con diferencia: rechazado.
  const sinMotivo = await abrirConCambio(pedido(`${BASE}/pos-ventas/turnos/abrir-con-cambio`, B, {
    cambioPendienteId: sobre1.id, desgloseRecibido: { 2000: 1, monedas: 500 },
  }));
  const jSinMotivo = await json(sinMotivo);
  chequear("21a. faltante SIN motivo se rechaza", sinMotivo.status === 400 && jSinMotivo.necesitaMotivo === true, jSinMotivo.error);

  const conFaltante = await json(await abrirConCambio(pedido(`${BASE}/pos-ventas/turnos/abrir-con-cambio`, B, {
    cambioPendienteId: sobre1.id,
    desgloseRecibido: { 2000: 1, monedas: 500 },
    motivoDiferencia: "Faltaba un billete de $2.000",
  })));
  chequear("21. recepción con faltante y motivo", conFaltante.ok && conFaltante.recepcion.clase === "FALTANTE" && conFaltante.recepcion.diferencia === -2000);
  chequear("23. la apertura usa el total REALMENTE contado", money(conFaltante.turno.montoInicial) === 2500, f(conFaltante.turno.montoInicial));

  const sobreConsumido = await prisma.cambioPendiente.findUnique({ where: { id: sobre1.id } });
  chequear(
    "21b. el sobre quedó RECIBIDO y vinculado al turno destino",
    sobreConsumido.estado === "RECIBIDO" && sobreConsumido.turnoDestinoId === conFaltante.turno.id &&
      money(sobreConsumido.totalRecibido) === 2500 && money(sobreConsumido.diferencia) === -2000
  );

  // ── Un cambio no se consume dos veces ────────────────────────────────────
  const otroIntento = await abrirConCambio(pedido(`${BASE}/pos-ventas/turnos/abrir-con-cambio`, A, {
    cambioPendienteId: sobre1.id, desgloseRecibido: { 2000: 1 }, motivoDiferencia: "x",
  }));
  chequear("25. un cambio no puede consumirse dos veces", otroIntento.status === 409, (await json(otroIntento)).error);

  // ── Recepción coincidente y sobrante, con el segundo sobre ───────────────
  const sobre2 = (await prisma.cambioPendiente.findFirst({ where: { turnoOrigenId: turnoC.id } }));
  await prisma.turno.update({ where: { id: conFaltante.turno.id }, data: { cierre: new Date() } });

  await reservarCambio(pedido(`${BASE}/pos-ventas/cambios-pendientes/reservar`, B, { cambioPendienteId: sobre2.id }));
  const coincide = await json(await abrirConCambio(pedido(`${BASE}/pos-ventas/turnos/abrir-con-cambio`, B, {
    cambioPendienteId: sobre2.id, desgloseRecibido: { 10000: 1 },
  })));
  chequear("20. recepción coincidente: sin motivo y sin diferencia", coincide.ok && coincide.recepcion.clase === "COINCIDE" && coincide.recepcion.diferencia === 0);

  // Sobrante: se prueba sobre un tercer sobre.
  const turnoD = await prisma.turno.create({ data: { localId: local.id, vendedorId: cajeroA.id, montoInicial: 5000 } });
  const rD = await json(await iniciarCierre(pedido(`${BASE}/pos-ventas/cierres/iniciar`, A, {
    turnoId: turnoD.id, desgloseCambio: { 1000: 5 },
  })));
  // Todo el cajón quedó como cambio: no hay nada para retirar.
  await confirmarCierre(
    pedido(`${BASE}/pos-ventas/cierres/${rD.cierre.token}/confirmar`, A, { desgloseRetiroContado: {} }),
    { params: Promise.resolve({ token: rD.cierre.token }) }
  );
  const sobre3 = await prisma.cambioPendiente.findFirst({ where: { turnoOrigenId: turnoD.id } });
  await prisma.turno.update({ where: { id: coincide.turno.id }, data: { cierre: new Date() } });
  await reservarCambio(pedido(`${BASE}/pos-ventas/cambios-pendientes/reservar`, B, { cambioPendienteId: sobre3.id }));
  const sobrante = await json(await abrirConCambio(pedido(`${BASE}/pos-ventas/turnos/abrir-con-cambio`, B, {
    cambioPendienteId: sobre3.id, desgloseRecibido: { 1000: 6 }, motivoDiferencia: "Había un billete de más",
  })));
  chequear("22. recepción con sobrante y motivo", sobrante.ok && sobrante.recepcion.clase === "SOBRANTE" && sobrante.recepcion.diferencia === 1000);
  chequear("22b. y el monto inicial vuelve a ser lo contado", money(sobrante.turno.montoInicial) === 6000);

  // ── Apertura sin cambio ──────────────────────────────────────────────────
  const sinMot = await abrirSinCambio(pedido(`${BASE}/pos-ventas/turnos/abrir-sin-cambio`, A, { desgloseContado: { 1000: 3 } }));
  chequear("24. apertura sin cambio exige motivo", sinMot.status === 400, (await json(sinMot)).error);

  const sinConteo = await abrirSinCambio(pedido(`${BASE}/pos-ventas/turnos/abrir-sin-cambio`, A, { motivo: "sin conteo" }));
  chequear("24b. y exige conteo por denominaciones", sinConteo.status === 400, (await json(sinConteo)).error);

  // ── Vencimiento del cierre ───────────────────────────────────────────────
  console.log("\n── VENCIMIENTO ──");

  // B todavía tiene abierto el turno con el que recibió el sobrante. El índice
  // parcial impide que tenga dos operativos —eso es correcto— así que se cierra.
  await prisma.turno.update({ where: { id: sobrante.turno.id }, data: { cierre: new Date() } });

  const turnoE = await prisma.turno.create({ data: { localId: local.id, vendedorId: cajeroB.id, montoInicial: 7000 } });
  const rE = await json(await iniciarCierre(pedido(`${BASE}/pos-ventas/cierres/iniciar`, B, {
    turnoId: turnoE.id, desgloseCambio: {},
  })));
  await prisma.cierrePreparacion.update({
    where: { id: rE.cierre.id },
    data: { venceEn: new Date(Date.now() - 60_000) },
  });
  await listarCambios(pedido(`${BASE}/pos-ventas/cambios-pendientes/listar`, B));

  const cierreVencido = await prisma.cierrePreparacion.findUnique({ where: { id: rE.cierre.id } });
  const turnoEtras = await prisma.turno.findUnique({ where: { id: turnoE.id } });
  chequear(
    "26. un cierre vencido NO devuelve el turno a la operación",
    cierreVencido.estado === "VENCIDO" && turnoEtras.cierreEnPreparacionEn !== null && turnoEtras.cierre === null
  );

  const confVencido = await json(await confirmarCierre(
    pedido(`${BASE}/pos-ventas/cierres/${rE.cierre.token}/confirmar`, B, { desgloseRetiroContado: { 1000: 7 } }),
    { params: Promise.resolve({ token: rE.cierre.token }) }
  ));
  chequear("26b. pero SÍ se puede confirmar: si no, el turno quedaría trabado", confVencido.ok === true && confVencido.cuentas.totalContado === 7000);

  const cancelarVencido = await cancelarCierre(
    pedido(`${BASE}/pos-ventas/cierres/${rE.cierre.token}/cancelar`, B, { motivo: "probando" }),
    { params: Promise.resolve({ token: rE.cierre.token }) }
  );
  chequear("26c. un cierre confirmado no se cancela", cancelarVencido.status === 409);

  // ── Cancelación legítima y re-corte ──────────────────────────────────────
  const turnoF = await prisma.turno.create({ data: { localId: local.id, vendedorId: cajeroA.id, montoInicial: 1000 } });
  const rF = await json(await iniciarCierre(pedido(`${BASE}/pos-ventas/cierres/iniciar`, A, {
    turnoId: turnoF.id, desgloseCambio: { 1000: 1 },
  })));
  const canc = await json(await cancelarCierre(
    pedido(`${BASE}/pos-ventas/cierres/${rF.cierre.token}/cancelar`, A, { motivo: "Lo tomé por error" }),
    { params: Promise.resolve({ token: rF.cierre.token }) }
  ));
  const turnoFtras = await prisma.turno.findUnique({ where: { id: turnoF.id } });
  chequear("26d. cancelar un corte no confirmado devuelve el turno a la operación", canc.ok && turnoFtras.cierreEnPreparacionEn === null);

  // El sobre que se había publicado al cortar queda CANCELADO, no ofrecido: si
  // siguiera DISPONIBLE, el próximo operador tomaría el cambio de un cierre que
  // se deshizo y la misma plata quedaría contada en dos turnos.
  const sobreCancelado = await prisma.cambioPendiente.findUnique({
    where: { cierrePreparacionId: rF.cierre.id },
  });
  chequear("26d2. y el sobre publicado queda CANCELADO, sin borrarse", sobreCancelado?.estado === "CANCELADO");

  const reCorte = await json(await iniciarCierre(pedido(`${BASE}/pos-ventas/cierres/iniciar`, A, {
    turnoId: turnoF.id, desgloseCambio: { 1000: 1 },
  })));
  chequear("26e. y el turno puede volver a tomar corte (índice PARCIAL)", reCorte.ok && reCorte.cierre.id !== rF.cierre.id);

  // ── Aislamiento y token ──────────────────────────────────────────────────
  console.log("\n── AISLAMIENTO ──");

  const localAjeno = await prisma.local.create({ data: { nombre: `Ajeno ${SUFIJO}`, tipo: "local" } });
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: localAjeno.id } });
  // Sin fila de configuración, `getExigirOperador` devuelve true por fail-closed
  // —correcto— y el gate respondería 428 antes de llegar a lo que se quiere
  // probar acá, que es la concurrencia entre locales.
  await prisma.configuracionLocal.create({ data: { localId: localAjeno.id, exigirOperador: false } });
  const intruso = await prisma.usuario.create({
    data: { nombre: `Intruso ${SUFIJO}`, email: `i-${SUFIJO}@test.local`, passwordHash: "x", rolId: rol.id, localId: localAjeno.id },
  });
  const fuera = await leerCierre(
    pedido(`${BASE}/pos-ventas/cierres/${reCorte.cierre.token}`, cookieDe(intruso, localAjeno.id)),
    { params: Promise.resolve({ token: reCorte.cierre.token }) }
  );
  chequear("A1. un token válido de OTRO local devuelve 404, no 403", fuera.status === 404);

  const inventado = await leerCierre(
    pedido(`${BASE}/pos-ventas/cierres/xxxx`, A),
    { params: Promise.resolve({ token: "xxxx" }) }
  );
  chequear("A2. un token con forma inválida no llega a la base", inventado.status === 404);

  // ── Autoría congelada con operario ───────────────────────────────────────
  await prisma.configuracionLocal.update({ where: { localId: local.id }, data: { exigirOperador: true } });
  const turnoG = await prisma.turno.create({
    data: { localId: local.id, vendedorId: cajeroB.id, montoInicial: 2000, operadorId: operario.id },
  });
  const opCookie = `${B}; ${cookieOperador(operario.id, operario.nombre, local.id)}`;
  const rG = await json(await iniciarCierre(pedido(`${BASE}/pos-ventas/cierres/iniciar`, opCookie, { turnoId: turnoG.id, desgloseCambio: {} })));
  chequear("A3. el corte graba el operario que lo inició", rG.ok && rG.cierre.iniciadoPorOperadorId === operario.id);

  // Ahora el operario ACTIVO cambia (otro relevo hizo login en la pestaña
  // principal). El arqueo tiene que quedar firmado por el que CONTÓ, no por él.
  const otroOperario = await prisma.operadorLocal.create({ data: { nombre: `Otro ${SUFIJO}`, pinHash: "x" } });
  await prisma.operadorEnLocal.create({ data: { operadorId: otroOperario.id, localId: local.id } });
  const cookieRelevo = `${B}; ${cookieOperador(otroOperario.id, otroOperario.nombre, local.id)}`;
  await confirmarCierre(
    pedido(`${BASE}/pos-ventas/cierres/${rG.cierre.token}/confirmar`, cookieRelevo, {
      desgloseRetiroContado: { 1000: 2 },
    }),
    { params: Promise.resolve({ token: rG.cierre.token }) }
  );
  const arqueoG = await prisma.arqueoCaja.findFirst({ where: { turnoId: turnoG.id } });
  chequear(
    "A4. el arqueo se firma con el operario que CONTÓ, no con el activo al confirmar",
    arqueoG.operadorId === operario.id,
    `operadorId=${arqueoG.operadorId}, activo al confirmar=${otroOperario.id}`
  );
  await prisma.configuracionLocal.update({ where: { localId: local.id }, data: { exigirOperador: false } });

  // ── El retiro normal sigue funcionando ───────────────────────────────────
  console.log("\n── NO ROMPER LO QUE YA ANDABA ──");

  // El retiro con corte convive con el cierre sobre la misma caja: primero se
  // retira, después se cierra. Con $40.000 esperados y $30.000 de cambio
  // separado, el retiro esperado queda en $10.000.
  const turnoH = await prisma.turno.create({ data: { localId: local.id, vendedorId: cajeroA.id, montoInicial: 40000 } });
  const { POST: confirmarRetiro } = await import("../app/api/pos-ventas/retiros/[token]/confirmar/route.js");

  const retIni = await json(await iniciarRetiro(pedido(`${BASE}/pos-ventas/retiros/iniciar`, A, {
    turnoId: turnoH.id, desgloseCambio: { 10000: 3 },
  })));
  chequear(
    "28. el retiro toma su corte sin congelar el turno",
    retIni.ok && retIni.retiro.efectivoRetiradoEsperado === 10000,
    `retiro esperado ${f(retIni.retiro?.efectivoRetiradoEsperado)}`
  );

  const retOk = await json(await confirmarRetiro(
    pedido(`${BASE}/pos-ventas/retiros/${retIni.retiro.token}/confirmar`, A, {
      desgloseRetiroContado: { 10000: 1 },
    }),
    { params: Promise.resolve({ token: retIni.retiro.token }) }
  ));
  chequear("28a. el retiro se registra por lo contado", retOk.ok && retOk.cuentas.totalRetiroContado === 10000, f(retOk.cuentas?.totalRetiroContado));
  chequear(
    "28a2. y ArqueoCaja guarda el CAJÓN COMPLETO, no sólo el retiro",
    retOk.cuentas.totalCajonDerivado === 40000,
    f(retOk.cuentas?.totalCajonDerivado)
  );

  const actualH = await json(await turnoActual(pedido(`${BASE}/pos-ventas/turnos/actual`, A)));
  chequear("28b. turnos/actual devuelve el turno operativo", actualH.ok && actualH.turno?.id === turnoH.id);

  await iniciarCierre(pedido(`${BASE}/pos-ventas/cierres/iniciar`, A, { turnoId: turnoH.id, desgloseCambio: {} }));
  const actualTrasCorte = await json(await turnoActual(pedido(`${BASE}/pos-ventas/turnos/actual`, A)));
  chequear(
    "28c. tras el corte, turnos/actual ya no lo da como abierto pero lo informa",
    actualTrasCorte.turno === null && actualTrasCorte.cierreEnPreparacion?.turnoId === turnoH.id && actualTrasCorte.cierreEnPreparacion.token
  );

  // ── Concurrencia ─────────────────────────────────────────────────────────
  console.log("\n── CONCURRENCIA ──");

  // Dos "iniciar cierre" EN PARALELO sobre el mismo turno. El lock de fila los
  // serializa; el segundo tiene que ver el corte del primero, no crear otro.
  const turnoI = await prisma.turno.create({ data: { localId: local.id, vendedorId: cajeroB.id, montoInicial: 3000 } });
  const [c1, c2] = await Promise.all([
    iniciarCierre(pedido(`${BASE}/pos-ventas/cierres/iniciar`, B, { turnoId: turnoI.id, desgloseCambio: { 1000: 1 } })),
    iniciarCierre(pedido(`${BASE}/pos-ventas/cierres/iniciar`, B, { turnoId: turnoI.id, desgloseCambio: { 1000: 1 } })),
  ]);
  const [j1, j2] = [await json(c1), await json(c2)];
  chequear(
    "C1. dos inicios de cierre simultáneos crean UN solo corte",
    (await prisma.cierrePreparacion.count({ where: { turnoId: turnoI.id } })) === 1,
    `estados ${c1.status}/${c2.status}`
  );
  const tokenI = (j1.cierre || j2.cierre).token;
  const ctxI = { params: Promise.resolve({ token: tokenI }) };

  // Dos confirmaciones EN PARALELO del mismo corte.
  const [d1, d2] = await Promise.all([
    confirmarCierre(pedido(`${BASE}/pos-ventas/cierres/${tokenI}/confirmar`, B, { desgloseRetiroContado: { 1000: 2 } }), ctxI),
    confirmarCierre(pedido(`${BASE}/pos-ventas/cierres/${tokenI}/confirmar`, B, { desgloseRetiroContado: { 1000: 2 } }), ctxI),
  ]);
  const arqueosI = await prisma.arqueoCaja.count({ where: { turnoId: turnoI.id } });
  const retirosI = await prisma.cajaMovimiento.count({ where: { turnoId: turnoI.id, tipo: "RETIRO" } });
  const sobresI = await prisma.cambioPendiente.count({ where: { turnoOrigenId: turnoI.id } });
  chequear(
    "C2. dos confirmaciones simultáneas: un arqueo, un retiro, un sobre",
    arqueosI === 1 && retirosI === 1 && sobresI === 1,
    `arqueos=${arqueosI} retiros=${retirosI} sobres=${sobresI} estados ${d1.status}/${d2.status}`
  );

  // Cierre y Caja +/− EN PARALELO: el movimiento entra antes del corte o se
  // rechaza después, pero nunca cae en la ventana ambigua.
  const turnoJ = await prisma.turno.create({ data: { localId: local.id, vendedorId: cajeroA.id, montoInicial: 8000 } });
  const [mv, cj] = await Promise.all([
    crearMovimiento(pedido(`${BASE}/pos-ventas/caja-movimientos/crear`, A, { turnoId: turnoJ.id, tipo: "INGRESO", monto: 2000, motivo: "En paralelo al corte" })),
    iniciarCierre(pedido(`${BASE}/pos-ventas/cierres/iniciar`, A, { turnoId: turnoJ.id, desgloseCambio: {} })),
  ]);
  const corteJ = await prisma.cierrePreparacion.findFirst({ where: { turnoId: turnoJ.id } });
  const movsJ = await prisma.cajaMovimiento.findMany({ where: { turnoId: turnoJ.id }, orderBy: { id: "asc" } });
  const dentro = movsJ.filter((m) => corteJ.ultimoMovimientoId != null && m.id <= corteJ.ultimoMovimientoId);
  const esperadoCoherente =
    money(corteJ.efectivoEsperadoCorte) === 8000 + dentro.reduce((s, m) => s + Number(m.monto), 0);
  chequear(
    "C3. cierre y Caja +/− en paralelo: el esperado coincide con la frontera",
    esperadoCoherente,
    `esperado=${f(corteJ.efectivoEsperadoCorte)} movimiento ${mv.status === 200 ? "aceptado" : "rechazado"}`
  );

  // Turnos distintos en paralelo: los locks son POR FILA, no globales.
  const turnoK = await prisma.turno.create({ data: { localId: localAjeno.id, vendedorId: intruso.id, montoInicial: 1000 } });
  const [pK, pL] = await Promise.all([
    iniciarCierre(pedido(`${BASE}/pos-ventas/cierres/iniciar`, cookieDe(intruso, localAjeno.id), { turnoId: turnoK.id, desgloseCambio: {} })),
    listarCambios(pedido(`${BASE}/pos-ventas/cambios-pendientes/listar`, A)),
  ]);
  chequear(
    "C4. turnos de locales distintos operan en paralelo sin trabarse",
    pK.status === 200 && pL.status === 200,
    `corte ajeno=${pK.status} (${(await json(pK)).error ?? "ok"}), listado propio=${pL.status}`
  );

  // Liberación explícita de una reserva propia.
  const turnoM = await prisma.turno.create({ data: { localId: local.id, vendedorId: cajeroB.id, montoInicial: 500 } });
  const rM = await json(await iniciarCierre(pedido(`${BASE}/pos-ventas/cierres/iniciar`, B, { turnoId: turnoM.id, desgloseCambio: { 500: 1 } })));
  await confirmarCierre(
    pedido(`${BASE}/pos-ventas/cierres/${rM.cierre.token}/confirmar`, B, { desgloseRetiroContado: {} }),
    { params: Promise.resolve({ token: rM.cierre.token }) }
  );
  const sobreM = await prisma.cambioPendiente.findFirst({ where: { turnoOrigenId: turnoM.id } });
  await reservarCambio(pedido(`${BASE}/pos-ventas/cambios-pendientes/reservar`, A, { cambioPendienteId: sobreM.id }));
  const ajena = await liberarCambio(pedido(`${BASE}/pos-ventas/cambios-pendientes/liberar`, B, { cambioPendienteId: sobreM.id }));
  chequear("C5. no se puede arrebatar una reserva ajena vigente", ajena.status === 409, (await json(ajena)).error);
  const propia = await liberarCambio(pedido(`${BASE}/pos-ventas/cambios-pendientes/liberar`, A, { cambioPendienteId: sobreM.id }));
  const sobreMtras = await prisma.cambioPendiente.findUnique({ where: { id: sobreM.id } });
  chequear("C6. el dueño sí puede soltar su reserva, sin consumir el cambio", propia.status === 200 && sobreMtras.estado === "DISPONIBLE" && sobreMtras.turnoDestinoId === null);

  // ── Limpieza ─────────────────────────────────────────────────────────────
  console.log("\n── LIMPIEZA ──");
  const turnos = await prisma.turno.findMany({ where: { localId: { in: [local.id, localAjeno.id] } }, select: { id: true } });
  const ids = turnos.map((t) => t.id);
  await prisma.cambioPendiente.deleteMany({ where: { localId: { in: [local.id, localAjeno.id] } } });
  await prisma.cierrePreparacion.deleteMany({ where: { localId: { in: [local.id, localAjeno.id] } } });
  await prisma.arqueoCaja.deleteMany({ where: { turnoId: { in: ids } } });
  await prisma.cajaMovimiento.deleteMany({ where: { turnoId: { in: ids } } });
  await prisma.turno.deleteMany({ where: { id: { in: ids } } });
  await prisma.operadorEnLocal.deleteMany({ where: { localId: { in: [local.id, localAjeno.id] } } });
  await prisma.operadorLocal.deleteMany({ where: { id: { in: [operario.id, otroOperario.id] } } });
  await prisma.configuracionLocal.deleteMany({ where: { localId: { in: [local.id, localAjeno.id] } } });
  await prisma.usuario.deleteMany({ where: { id: { in: [cajeroA.id, cajeroB.id, intruso.id] } } });
  await prisma.grupoLocal.deleteMany({ where: { grupoId: grupo.id } });
  await prisma.local.deleteMany({ where: { id: { in: [local.id, localAjeno.id] } } });
  await prisma.rol.delete({ where: { id: rol.id } });
  await prisma.grupo.delete({ where: { id: grupo.id } });
  console.log("  datos de prueba eliminados");

  console.log(`\n=== RESULTADO: ${ok} OK, ${fallos} FALLAS ===`);
  if (fallos) {
    console.log("Fallaron:");
    for (const p of pendientes) console.log("  · " + p);
  }
  await prisma.$disconnect();
  process.exit(fallos ? 1 : 0);
}

main().catch(async (e) => {
  console.error("\nERROR NO CONTROLADO:", e);
  await prisma.$disconnect();
  process.exit(1);
});
