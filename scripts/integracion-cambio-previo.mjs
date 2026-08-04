// scripts/integracion-cambio-previo.mjs
//
// Prueba de INTEGRACIÓN REAL del ORDEN FÍSICO DE CAJA, contra PostgreSQL:
// separar el cambio ANTES del corte y contar después sólo el dinero retirado.
//
// No simula: importa los handlers de las rutas de verdad y los ejecuta con
// sesiones firmadas, sobre una base DESCARTABLE. Verifica lo que quedó escrito
// en las tablas, no lo que devolvió el endpoint.
//
// EL BUG QUE ESTO PERSIGUE
//
// El retiro recalculaba el efectivo esperado al confirmar. Como contar lleva
// veinte minutos y el POS sigue vendiendo, el esperado crecía mientras el cajero
// contaba y le aparecía un FALTANTE por plata que entró después de que cerrara
// la pila. Acá se reproduce ese escenario exacto —venta de $20.000 en medio del
// conteo— y se verifica que la diferencia sea CERO.
//
// Uso:
//   DATABASE_URL=<base descartable> AUTH_SECRET=<secreto> \
//   node --import ./scripts/alias-loader.mjs scripts/integracion-cambio-previo.mjs
//
// Crea su propio grupo, local y usuarios de prueba. NO toca datos existentes.

import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";

const prisma = new PrismaClient();
const SUFIJO = `cambio-previo-${Date.now().toString(36)}`;

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
const f = (n) => "$" + Number(n ?? 0).toLocaleString("es-AR");

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

/** Una venta en efectivo del turno. Lo mínimo para que el esperado la cuente. */
let numeroVenta = 0;
async function venderEfectivo(turno, monto) {
  numeroVenta++;
  return prisma.venta.create({
    data: {
      localId: turno.localId,
      vendedorId: turno.vendedorId,
      turnoId: turno.id,
      numero: numeroVenta,
      subtotal: monto,
      total: monto,
      formaPago: "EFECTIVO",
    },
  });
}

async function main() {
  console.log(`\n=== INTEGRACIÓN: CAMBIO SEPARADO ANTES DEL CORTE (${SUFIJO}) ===\n`);

  const { POST: iniciarRetiro } = await import("../app/api/pos-ventas/retiros/iniciar/route.js");
  const { GET: leerRetiro } = await import("../app/api/pos-ventas/retiros/[token]/route.js");
  const { POST: confirmarRetiro } = await import("../app/api/pos-ventas/retiros/[token]/confirmar/route.js");
  const { POST: cancelarRetiro } = await import("../app/api/pos-ventas/retiros/[token]/cancelar/route.js");
  const { POST: iniciarCierre } = await import("../app/api/pos-ventas/cierres/iniciar/route.js");
  const { POST: confirmarCierre } = await import("../app/api/pos-ventas/cierres/[token]/confirmar/route.js");
  const { POST: cancelarCierre } = await import("../app/api/pos-ventas/cierres/[token]/cancelar/route.js");
  const { POST: registrarViejo } = await import("../app/api/pos-ventas/retiros/registrar/route.js");
  const { GET: resumenTurno } = await import("../app/api/pos-ventas/turnos/resumen/route.js");
  const { GET: turnoActual } = await import("../app/api/pos-ventas/turnos/actual/route.js");
  const { POST: crearMovimiento } = await import("../app/api/pos-ventas/caja-movimientos/crear/route.js");
  const { POST: reservarCambio } = await import("../app/api/pos-ventas/cambios-pendientes/reservar/route.js");
  const { POST: abrirConCambio } = await import("../app/api/pos-ventas/turnos/abrir-con-cambio/route.js");

  // ── Escenario ────────────────────────────────────────────────────────────
  const grupo = await prisma.grupo.create({ data: { nombre: `Grupo ${SUFIJO}` } });
  GRUPO_ID = grupo.id;
  const rol = await prisma.rol.create({
    data: { nombre: `Rol ${SUFIJO}`, permisos: ["pos.usar", "pos.turnos"] },
  });
  const local = await prisma.local.create({ data: { nombre: `Local ${SUFIJO}`, tipo: "local" } });
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: local.id } });
  await prisma.configuracionLocal.create({ data: { localId: local.id, exigirOperador: false } });

  const cajero = await prisma.usuario.create({
    data: { nombre: `Cajero ${SUFIJO}`, email: `c-${SUFIJO}@test.local`, passwordHash: "x", rolId: rol.id, localId: local.id },
  });
  const relevo = await prisma.usuario.create({
    data: { nombre: `Relevo ${SUFIJO}`, email: `r-${SUFIJO}@test.local`, passwordHash: "x", rolId: rol.id, localId: local.id },
  });
  // Un tercero, para el traspaso final: el cajero A conserva su turno abierto
  // durante toda la prueba —el retiro no lo cierra— y el índice parcial impide
  // que la misma persona tenga dos cajas operativas en el mismo local.
  const tercero = await prisma.usuario.create({
    data: { nombre: `Tercero ${SUFIJO}`, email: `t-${SUFIJO}@test.local`, passwordHash: "x", rolId: rol.id, localId: local.id },
  });

  const A = cookieDe(cajero, local.id);
  const B = cookieDe(relevo, local.id);
  const C = cookieDe(tercero, local.id);
  const BASE = "http://localhost/api";

  // ═══════════════════════════════════════════════════════════════════════
  // EL EJEMPLO OBLIGATORIO
  //
  //   esperado $150.000 · cambio $30.000 · retiro esperado $120.000
  //   venta posterior $20.000 → NO lo mueve
  //   retiro contado $120.000 → diferencia 0
  //   caja posterior $50.000 = $30.000 de cambio + $20.000 vendidos después
  // ═══════════════════════════════════════════════════════════════════════
  console.log("── EL EJEMPLO: 150.000 / 30.000 / 120.000 ──");

  const turno = await prisma.turno.create({
    data: { localId: local.id, vendedorId: cajero.id, montoInicial: 30000 },
  });
  await venderEfectivo(turno, 120000);
  // Esperado: 30.000 de apertura + 120.000 vendidos = 150.000.

  const ini = await json(await iniciarRetiro(pedido(`${BASE}/pos-ventas/retiros/iniciar`, A, {
    turnoId: turno.id,
    desgloseCambio: { 10000: 3 }, // $30.000
    // Un total mentiroso del cliente: tiene que ser IGNORADO.
    totalCambio: 999999,
  })));

  chequear("1. el corte congela el esperado en 150.000", ini.ok && ini.retiro.efectivoEsperadoCorte === 150000, f(ini.retiro?.efectivoEsperadoCorte));
  chequear("2. el cambio separado lo calcula el SERVIDOR", ini.retiro?.totalCambio === 30000, f(ini.retiro?.totalCambio));
  chequear("3. el retiro esperado queda congelado en 120.000", ini.retiro?.efectivoRetiradoEsperado === 120000, f(ini.retiro?.efectivoRetiradoEsperado));

  const TOKEN = ini.retiro.token;
  const ultimaVentaDelCorte = ini.retiro.ultimaVentaId;
  chequear("4. la frontera se guarda por ID de venta", Number.isInteger(ultimaVentaDelCorte), `ultimaVentaId=${ultimaVentaDelCorte}`);

  // ── EL TURNO SIGUE VIVO: la caja no se congela ───────────────────────────
  const turnoTrasCorte = await prisma.turno.findUnique({ where: { id: turno.id } });
  chequear(
    "5. el turno NO se congela: el POS puede seguir vendiendo",
    turnoTrasCorte.cierreEnPreparacionEn === null && turnoTrasCorte.cierre === null
  );

  const actual = await json(await turnoActual(pedido(`${BASE}/pos-ventas/turnos/actual`, A)));
  chequear("6. turnos/actual sigue devolviendo el turno operativo", actual.ok && actual.turno?.id === turno.id);
  chequear("6b. e informa el retiro en curso, con su token", actual.retiroEnPreparacion?.token === TOKEN);

  // ── MIENTRAS SE CUENTA, EL POS VENDE ─────────────────────────────────────
  console.log("\n── ACTIVIDAD POSTERIOR AL CORTE ──");

  await venderEfectivo(turno, 20000);
  const movPosterior = await json(await crearMovimiento(pedido(`${BASE}/pos-ventas/caja-movimientos/crear`, A, {
    turnoId: turno.id, tipo: "INGRESO", monto: 3000, motivo: "Aporte posterior al corte",
  })));
  chequear("7. la caja acepta ventas y movimientos DESPUÉS del corte", movPosterior.ok === true);

  const trasRuido = await prisma.retiroPreparacion.findUnique({ where: { id: ini.retiro.id } });
  chequear(
    "8. una venta posterior NO cambia el retiro esperado congelado",
    money(trasRuido.efectivoRetiradoEsperado) === 120000,
    `sigue en ${f(trasRuido.efectivoRetiradoEsperado)}`
  );
  chequear(
    "9. un ingreso manual posterior tampoco lo cambia",
    money(trasRuido.efectivoEsperadoCorte) === 150000 && money(trasRuido.totalCambio) === 30000
  );

  const lectura = await json(await leerRetiro(pedido(`${BASE}/pos-ventas/retiros/${TOKEN}`, A), ctx(TOKEN)));
  chequear(
    "10. recargar la pantalla devuelve EXACTAMENTE el mismo corte",
    lectura.ok && lectura.retiro.efectivoRetiradoEsperado === 120000 && lectura.retiro.totalCambio === 30000
  );
  chequear("11. y avisa que hubo actividad posterior, sin cambiar los números", lectura.actividadPosterior?.hay === true);
  chequear(
    "11b. los movimientos listados llegan hasta la frontera, no más allá",
    lectura.movimientos.detalle.every((m) => m.id <= trasRuido.ultimoMovimientoId)
  );

  // ── CONFIRMACIÓN ─────────────────────────────────────────────────────────
  console.log("\n── CONFIRMACIÓN ──");

  const conf = await json(await confirmarRetiro(
    pedido(`${BASE}/pos-ventas/retiros/${TOKEN}/confirmar`, A, {
      desgloseRetiroContado: { 20000: 6 }, // $120.000
      observacion: "Se lleva Marcela",
    }),
    ctx(TOKEN)
  ));

  chequear("12. la confirmación usa el retiro esperado PERSISTIDO", conf.ok && conf.cuentas.efectivoRetiradoEsperado === 120000);
  chequear("13. retiro contado = 120.000", conf.cuentas?.totalRetiroContado === 120000, f(conf.cuentas?.totalRetiroContado));
  chequear(
    "14. NO APARECE FALTANTE FALSO: la diferencia es CERO",
    conf.cuentas?.diferencia === 0,
    `diferencia ${f(conf.cuentas?.diferencia)} — con el flujo viejo daba −$23.000`
  );
  chequear("15. el total del cajón se DERIVA: 120.000 + 30.000", conf.cuentas?.totalCajonDerivado === 150000, f(conf.cuentas?.totalCajonDerivado));

  const arqueo = await prisma.arqueoCaja.findUnique({ where: { id: conf.arqueoId } });
  chequear(
    "16. ArqueoCaja.efectivoContado conserva su semántica: TODO el cajón",
    money(arqueo.efectivoContado) === 150000,
    f(arqueo.efectivoContado)
  );
  chequear("16b. y el esperado del arqueo es el congelado", money(arqueo.efectivoEsperado) === 150000);
  chequear("16c. el retirado y el fondo dejado quedan como siempre", money(arqueo.efectivoRetirado) === 120000 && money(arqueo.fondoDejado) === 30000);
  chequear("16d. es un arqueo PARCIAL, no FINAL: el retiro no cierra la caja", arqueo.tipo === "PARCIAL");
  chequear(
    "16e. el período termina en el CORTE, no en la confirmación",
    new Date(arqueo.periodoHasta).getTime() === new Date(ini.retiro.corteEn).getTime()
  );

  const movs = await prisma.cajaMovimiento.findMany({ where: { turnoId: turno.id, tipo: "RETIRO" } });
  chequear("17. UN movimiento de retiro, por lo RETIRADO", movs.length === 1 && money(movs[0].monto) === 120000, f(movs[0]?.monto));
  chequear("18. el cambio NO generó movimiento: no salió del cajón", movs.every((m) => money(m.monto) !== 30000));
  chequear("18b. el arqueo quedó vinculado 1:1 con su movimiento", arqueo.cajaMovimientoRetiroId === movs[0].id);

  const prepConfirmada = await prisma.retiroPreparacion.findUnique({ where: { id: ini.retiro.id } });
  chequear(
    "19. el retiro contado se guarda en su campo PROPIO",
    money(prepConfirmada.totalRetiroContado) === 120000 && money(prepConfirmada.totalCajonDerivado) === 150000
  );
  chequear("19b. y la preparación queda CONFIRMADA", prepConfirmada.estado === "CONFIRMADO" && prepConfirmada.arqueoCajaId === arqueo.id);

  // ── LA CAJA POSTERIOR ────────────────────────────────────────────────────
  const res = await json(await resumenTurno(pedido(`${BASE}/pos-ventas/turnos/resumen?turnoId=${turno.id}`, A)));
  // 30.000 apertura + 140.000 vendidos + 3.000 ingreso − 120.000 retirado = 53.000
  chequear(
    "20. la caja queda con el cambio + lo vendido después (+ el ingreso)",
    res.efectivoEsperado === 53000,
    `${f(res.efectivoEsperado)} = 30.000 cambio + 20.000 ventas + 3.000 ingreso`
  );
  chequear(
    "21. no se perdió ni se duplicó plata: entradas − salidas cuadra",
    30000 + 140000 + 3000 - 120000 === res.efectivoEsperado
  );

  // ── IDEMPOTENCIA ─────────────────────────────────────────────────────────
  console.log("\n── IDEMPOTENCIA Y CONCURRENCIA ──");

  const conf2 = await json(await confirmarRetiro(
    pedido(`${BASE}/pos-ventas/retiros/${TOKEN}/confirmar`, A, { desgloseRetiroContado: { 20000: 9 } }),
    ctx(TOKEN)
  ));
  chequear("22. doble confirmación idempotente", conf2.ok === true && conf2.repetido === true);
  chequear(
    "22b. y no duplicó arqueo ni movimiento",
    (await prisma.arqueoCaja.count({ where: { turnoId: turno.id } })) === 1 &&
      (await prisma.cajaMovimiento.count({ where: { turnoId: turno.id, tipo: "RETIRO" } })) === 1
  );

  // Dos inicios EN PARALELO sobre el mismo turno.
  const turno2 = await prisma.turno.create({
    data: { localId: local.id, vendedorId: relevo.id, montoInicial: 10000 },
  });
  const [p1, p2] = await Promise.all([
    iniciarRetiro(pedido(`${BASE}/pos-ventas/retiros/iniciar`, B, { turnoId: turno2.id, desgloseCambio: { 1000: 1 } })),
    iniciarRetiro(pedido(`${BASE}/pos-ventas/retiros/iniciar`, B, { turnoId: turno2.id, desgloseCambio: { 1000: 1 } })),
  ]);
  const preps = await prisma.retiroPreparacion.count({ where: { turnoId: turno2.id } });
  chequear(
    "23. dos inicios simultáneos crean UN solo corte",
    preps === 1,
    `preparaciones=${preps} estados ${p1.status}/${p2.status}`
  );

  const tokenP = (await prisma.retiroPreparacion.findFirst({ where: { turnoId: turno2.id } })).token;
  const otro = await iniciarRetiro(pedido(`${BASE}/pos-ventas/retiros/iniciar`, B, {
    turnoId: turno2.id, desgloseCambio: { 20000: 5 },
  }));
  const jOtro = await json(otro);
  chequear("24. un segundo retiro devuelve el que ya existe, sin pisar el cambio", jOtro.repetido === true && jOtro.retiro.totalCambio === 1000);

  // ── EXCLUSIÓN MUTUA ──────────────────────────────────────────────────────
  console.log("\n── EXCLUSIÓN MUTUA ──");

  const cierreBloqueado = await iniciarCierre(pedido(`${BASE}/pos-ventas/cierres/iniciar`, B, {
    turnoId: turno2.id, desgloseCambio: { 1000: 1 },
  }));
  const jCierre = await json(cierreBloqueado);
  chequear("25. no se puede cerrar con un retiro en preparación", cierreBloqueado.status === 409, jCierre.error);
  chequear("25b. y el error ofrece el token del retiro para terminarlo", jCierre.retiroToken === tokenP);

  // Se cancela el retiro y ahora sí se puede cerrar.
  const canc = await json(await cancelarRetiro(
    pedido(`${BASE}/pos-ventas/retiros/${tokenP}/cancelar`, B, { motivo: "Lo tomé por error" }),
    ctx(tokenP)
  ));
  chequear("26. cancelar un retiro en preparación es posible", canc.ok === true && canc.retiro.estado === "CANCELADO");
  chequear(
    "26b. y no creó arqueo ni movimiento",
    (await prisma.arqueoCaja.count({ where: { turnoId: turno2.id } })) === 0 &&
      (await prisma.cajaMovimiento.count({ where: { turnoId: turno2.id, tipo: "RETIRO" } })) === 0
  );

  const cierreOk = await json(await iniciarCierre(pedido(`${BASE}/pos-ventas/cierres/iniciar`, B, {
    turnoId: turno2.id, desgloseCambio: { 1000: 2 },
  })));
  chequear("27. cancelado el retiro, el cierre ya puede tomar su corte", cierreOk.ok === true);

  // Y el recíproco: con el cierre en curso, no se puede iniciar un retiro.
  const retiroBloqueado = await iniciarRetiro(pedido(`${BASE}/pos-ventas/retiros/iniciar`, B, {
    turnoId: turno2.id, desgloseCambio: { 1000: 1 },
  }));
  chequear(
    "28. no se puede retirar con un cierre en preparación",
    retiroBloqueado.status === 409,
    (await json(retiroBloqueado)).error
  );

  // ── EL RELEVO TOMA EL CAMBIO MIENTRAS EL SALIENTE CUENTA ─────────────────
  console.log("\n── EL RELEVO NO ESPERA ──");

  const sobre = await prisma.cambioPendiente.findFirst({
    where: { cierrePreparacionId: cierreOk.cierre.id },
  });
  chequear("29. el sobre existe desde el CORTE, antes de confirmar el cierre", sobre?.estado === "DISPONIBLE" && money(sobre.total) === 2000);

  const cierreSinConfirmar = await prisma.cierrePreparacion.findUnique({ where: { id: cierreOk.cierre.id } });
  chequear("29b. y el cierre todavía está PREPARANDO", cierreSinConfirmar.estado === "PREPARANDO");

  const rReserva = await reservarCambio(pedido(`${BASE}/pos-ventas/cambios-pendientes/reservar`, C, { cambioPendienteId: sobre.id }));
  chequear("30. el relevo puede RESERVARLO mientras el saliente cuenta", rReserva.status === 200, (await json(rReserva)).error ?? "");

  const apertura = await json(await abrirConCambio(pedido(`${BASE}/pos-ventas/turnos/abrir-con-cambio`, C, {
    cambioPendienteId: sobre.id, desgloseRecibido: { 1000: 2 },
  })));
  chequear(
    "31. y ABRIR SU TURNO, con el cierre anterior todavía sin confirmar",
    apertura.ok === true && money(apertura.turno?.montoInicial) === 2000,
    apertura.error ?? f(apertura.turno?.montoInicial)
  );

  // Y vender: es el punto de todo el flujo — el relevo no espera a que el
  // saliente termine de contar.
  if (apertura.ok) await venderEfectivo(apertura.turno, 7500);
  const ventasRelevo = await prisma.venta.count({ where: { turnoId: apertura.turno?.id ?? -1 } });
  chequear("31b. y VENDER mientras el saliente sigue contando", ventasRelevo === 1);

  // Con el sobre ya recibido, el cierre YA NO se puede cancelar.
  const cancelarTarde = await cancelarCierre(
    pedido(`${BASE}/pos-ventas/cierres/${cierreOk.cierre.token}/cancelar`, B, { motivo: "quiero deshacer" }),
    ctx(cierreOk.cierre.token)
  );
  const jTarde = await json(cancelarTarde);
  chequear("32. un cierre cuyo cambio YA se recibió no se puede cancelar", cancelarTarde.status === 409, jTarde.error);

  // Y el saliente termina de contar su retiro, sin tocar el sobre.
  const confCierre = await json(await confirmarCierre(
    pedido(`${BASE}/pos-ventas/cierres/${cierreOk.cierre.token}/confirmar`, B, {
      desgloseRetiroContado: { 1000: 8 },
    }),
    ctx(cierreOk.cierre.token)
  ));
  chequear("33. el saliente confirma su cierre después, sin problemas", confCierre.ok === true);
  chequear(
    "34. la confirmación NO creó un segundo sobre",
    (await prisma.cambioPendiente.count({ where: { cierrePreparacionId: cierreOk.cierre.id } })) === 1
  );
  const sobreTras = await prisma.cambioPendiente.findUnique({ where: { id: sobre.id } });
  chequear(
    "35. y NO le tocó las denominaciones al sobre que el relevo ya recibió",
    sobreTras.estado === "RECIBIDO" && money(sobreTras.total) === 2000 && sobreTras.desglose["1000"] === 2
  );
  chequear(
    "36. el turno cerrado guarda el cajón COMPLETO en montoRealEfectivo",
    money((await prisma.turno.findUnique({ where: { id: turno2.id } })).montoRealEfectivo) === 10000,
    "8.000 retirados + 2.000 de cambio"
  );

  // ── EL ENDPOINT VIEJO ────────────────────────────────────────────────────
  console.log("\n── COMPATIBILIDAD ──");

  const viejo = await registrarViejo(pedido(`${BASE}/pos-ventas/retiros/registrar`, A, {
    turnoId: turno.id, efectivoContado: 50000, efectivoRetirado: 20000, idempotencyKey: "x",
  }));
  const jViejo = await json(viejo);
  chequear("37. el endpoint viejo rechaza con un mensaje entendible", viejo.status === 409 && jViejo.flujoObsoleto === true, jViejo.error);
  chequear(
    "37b. y no escribió nada",
    (await prisma.arqueoCaja.count({ where: { turnoId: turno.id } })) === 1
  );

  // Un arqueo histórico —sin preparación asociada— se sigue leyendo igual.
  const turnoViejo = await prisma.turno.create({
    data: { localId: local.id, vendedorId: cajero.id, montoInicial: 5000, cierre: new Date() },
  });
  const arqueoHistorico = await prisma.arqueoCaja.create({
    data: {
      turnoId: turnoViejo.id, localId: local.id, usuarioId: cajero.id, realizadoPorId: cajero.id,
      periodoDesde: new Date(), periodoHasta: new Date(),
      efectivoEsperado: 5000, efectivoContado: 4800, diferencia: -200, tipo: "PARCIAL",
    },
  });
  chequear(
    "38. un retiro histórico sigue leyéndose exactamente igual",
    money(arqueoHistorico.efectivoContado) === 4800 &&
      arqueoHistorico.efectivoRetirado === null &&
      (await prisma.retiroPreparacion.count({ where: { turnoId: turnoViejo.id } })) === 0
  );

  // ── Limpieza ─────────────────────────────────────────────────────────────
  console.log("\n── LIMPIEZA ──");
  const turnos = await prisma.turno.findMany({ where: { localId: local.id }, select: { id: true } });
  const ids = turnos.map((t) => t.id);
  await prisma.retiroPreparacion.deleteMany({ where: { turnoId: { in: ids } } });
  await prisma.cambioPendiente.deleteMany({ where: { localId: local.id } });
  await prisma.cierrePreparacion.deleteMany({ where: { localId: local.id } });
  await prisma.arqueoCaja.deleteMany({ where: { localId: local.id } });
  await prisma.cajaMovimiento.deleteMany({ where: { turnoId: { in: ids } } });
  await prisma.venta.deleteMany({ where: { localId: local.id } });
  await prisma.turno.deleteMany({ where: { localId: local.id } });
  await prisma.configuracionLocal.deleteMany({ where: { localId: local.id } });
  await prisma.usuario.deleteMany({ where: { localId: local.id } });
  await prisma.grupoLocal.deleteMany({ where: { grupoId: grupo.id } });
  await prisma.local.delete({ where: { id: local.id } });
  await prisma.grupo.delete({ where: { id: grupo.id } });
  await prisma.rol.delete({ where: { id: rol.id } });
  console.log("  datos de prueba eliminados");

  console.log(`\n=== RESULTADO: ${ok} OK, ${fallos} FALLAS ===`);
  if (pendientes.length) console.log("Fallaron:\n  - " + pendientes.join("\n  - "));
  await prisma.$disconnect();
  process.exit(fallos ? 1 : 0);
}

main().catch(async (e) => {
  console.error("\nERROR NO CONTROLADO:", e);
  await prisma.$disconnect();
  process.exit(1);
});
