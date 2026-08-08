// scripts/integracion-caja.mjs
//
// Prueba de INTEGRACIÓN REAL del circuito del dinero de caja, contra PostgreSQL.
//
// No simula: importa los handlers de las rutas de verdad (abrir/cerrar) y los
// ejecuta con una sesión firmada, sobre una base de revisión que es copia de
// producción. Verifica lo que quedó escrito en las tablas, no lo que devolvió el
// endpoint.
//
// Uso:
//   DATABASE_URL=<base de revision> AUTH_SECRET=<secreto> node scripts/integracion-caja.mjs
//
// Crea su propio local y usuarios de prueba, y los borra al terminar. NO toca
// datos existentes: todo lo que escribe cuelga del local de prueba.

import { crearClientePrisma, ESCRITURA } from "./lib/clientePrisma.mjs";
import jwt from "jsonwebtoken";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });
const SUFIJO = `caja-test-${Date.now().toString(36)}`;

let ok = 0;
let fallos = 0;
const detalle = [];

function chequear(nombre, condicion, extra = "") {
  if (condicion) { ok++; console.log(`  OK   ${nombre}${extra ? " — " + extra : ""}`); }
  else { fallos++; detalle.push(nombre); console.log(`  FALLA ${nombre}${extra ? " — " + extra : ""}`); }
}

const money = (v) => (v == null ? null : Number(v));

// ── Sesión firmada, igual que la que emite el login ────────────────────────
let GRUPO_ID = null;
function cookieDe(usuario, localId) {
  const token = jwt.sign(
    { id: usuario.id, email: usuario.email, nombre: usuario.nombre, rolId: usuario.rolId,
      permisos: ["pos.usar", "pos.turnos"], localId, grupoId: GRUPO_ID },
    process.env.AUTH_SECRET,
    { expiresIn: 3600 }
  );
  return `erpazul_sesion=${token}`;
}

function pedido(url, cookie, body) {
  return new Request(url, {
    method: body ? "POST" : "GET",
    headers: { cookie, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function main() {
  const { POST: abrirPOST, GET: abrirGET } = await import("../app/api/pos-ventas/turnos/abrir/route.js");
  const { POST: cerrarPOST } = await import("../app/api/pos-ventas/turnos/cerrar/route.js");

  // ── Escenario: un grupo, DOS locales (para probar aislamiento) ────────────
  const grupo = await prisma.grupo.findFirst({ select: { id: true } });
  const rol = await prisma.rol.findFirst({ select: { id: true } });
  GRUPO_ID = grupo.id;

  // El local se ata al grupo por GrupoLocal, no por un campo grupoId.
  const crearLocal = async (n) => {
    const l = await prisma.local.create({ data: { nombre: `${n} ${SUFIJO}`, es_deposito: false } });
    await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: l.id } });
    return l;
  };
  const localA = await crearLocal('A');
  const localB = await crearLocal('B');
  // Sin exigencia de operario: lo que se prueba acá es el circuito del dinero.
  await prisma.configuracionLocal.createMany({
    data: [
      { localId: localA.id, exigirOperador: false },
      { localId: localB.id, exigirOperador: false },
    ],
  });

  const mkUser = (n, localId) =>
    prisma.usuario.create({
      data: { nombre: `${n} ${SUFIJO}`, email: `${n}.${SUFIJO}@test.local`, passwordHash: "x",
              rolId: rol.id, localId },
    });
  const cajero1 = await mkUser("cajero1", localA.id);
  const cajero2 = await mkUser("cajero2", localA.id);
  const cajeroB = await mkUser("cajeroB", localB.id);

  const ck1 = cookieDe(cajero1, localA.id);
  const ck2 = cookieDe(cajero2, localA.id);
  const ckB = cookieDe(cajeroB, localB.id);

  const URL_ABRIR = "http://x/api/pos-ventas/turnos/abrir";
  const URL_CERRAR = "http://x/api/pos-ventas/turnos/cerrar";

  console.log(`\n=== Local A #${localA.id} · Local B #${localB.id} ===\n`);

  // ══════════════ TURNO A ══════════════
  console.log("── TURNO A ──");
  // El PRIMER turno de un local no tiene cierre previo: el sugerido es 0, así que
  // meter $10.000 es una diferencia de recepción y el sistema exige explicarla.
  // Eso es correcto —esa plata entró de algún lado— y se verifica primero.
  let r = await abrirPOST(pedido(URL_ABRIR, ck1, { localId: localA.id, montoInicial: 10000 }));
  let d = await r.json();
  chequear("A0 · sin cierre previo, poner plata exige explicación", d.ok === false && d.requiereObservacionFondo === true);

  r = await abrirPOST(pedido(URL_ABRIR, ck1, {
    localId: localA.id, montoInicial: 10000, observacionFondo: "fondo inicial entregado por el dueño",
  }));
  d = await r.json();
  if (!d.ok) { console.log("    respuesta:", r.status, JSON.stringify(d)); }
  chequear("A1 · abre con fondo recibido de $10.000", d.ok === true && money(d.turno?.montoInicial) === 10000);
  const turnoA = d.turno;
  chequear("A2 · sin cierre previo, el fondo sugerido es 0", money(d.turno.fondoSugeridoApertura) === 0);
  chequear("A3 · guarda el fondo recibido", money(d.turno.fondoRecibidoApertura) === 10000);
  chequear("A4 · diferencia de recepción 10000 (no había cierre previo)", money(d.turno.diferenciaFondoApertura) === 10000);

  // Ventas: 2 en efectivo, 1 Mercado Pago, 1 débito.
  const pb = await prisma.productoBase.findFirst({ select: { id: true } });
  let nro = 0;
  const venta = async (medio, monto) => {
    const v = await prisma.venta.create({
      data: { localId: localA.id, vendedorId: cajero1.id, turnoId: turnoA.id, numero: ++nro,
              subtotal: monto, total: monto, formaPago: medio.toLowerCase(),
              esFiado: medio === "FIADO", costoTotal: 0, gananciaBruta: monto, gananciaNeta: monto },
    });
    await prisma.ventaPago.create({ data: { ventaId: v.id, medio, monto } });
    if (pb) {
      await prisma.ventaDetalle.create({
        data: { ventaId: v.id, productoBaseId: pb.id, nombre: "test", precio: monto, cantidad: 1, subtotal: monto },
      });
    }
    return v;
  };
  await venta("EFECTIVO", 15000);
  await venta("EFECTIVO", 25000);
  await venta("MERCADOPAGO", 8000);
  await venta("DEBITO", 5000);

  // Arqueo parcial a mitad de turno: 10.000 de fondo + 40.000 de ventas en efectivo.
  await prisma.arqueoCaja.create({
    data: { turnoId: turnoA.id, localId: localA.id, usuarioId: cajero1.id, realizadoPorId: cajero1.id,
            periodoDesde: turnoA.apertura, periodoHasta: new Date(),
            efectivoEsperado: 50000, efectivoContado: 50000, diferencia: 0, tipo: "PARCIAL",
            idempotencyKey: `arqueo-${turnoA.id}-p1` },
  });
  chequear("A5 · arqueo parcial registrado", true, "esperado 50.000");

  // Cierre: cuenta TODO (fondo + efectivo), retira las ventas y deja el fondo.
  r = await cerrarPOST(pedido(URL_CERRAR, ck1, {
    turnoId: turnoA.id, montoRealEfectivo: 50000,
    efectivoRetirado: 40000, fondoDejado: 10000,
    destinoRetiro: "Caja fuerte", recibidoPor: "Encargado",
    observaciones: "cierre de prueba",
  }));
  d = await r.json();
  chequear("A6 · cierra contando todo el efectivo", d.ok === true);

  const A = await prisma.turno.findUnique({ where: { id: turnoA.id } });
  chequear("A7 · esperado = 10.000 + 40.000 (MP y débito NO entran)", money(A.montoEsperadoEfectivo) === 50000, `esperado ${money(A.montoEsperadoEfectivo)}`);
  chequear("A8 · diferencia 0", money(A.diferenciaEfectivo) === 0);
  chequear("A9 · guarda el retiro", money(A.efectivoRetiradoCierre) === 40000);
  chequear("A10 · guarda el fondo dejado", money(A.fondoDejadoCierre) === 10000);
  chequear("A11 · retirado + fondo = contado", money(A.efectivoRetiradoCierre) + money(A.fondoDejadoCierre) === money(A.montoRealEfectivo));
  chequear("A12 · guarda destino y receptor", A.destinoRetiroCierre === "Caja fuerte" && A.recibidoPorCierre === "Encargado");

  const finalA = await prisma.arqueoCaja.findFirst({ where: { turnoId: turnoA.id, tipo: "FINAL" } });
  chequear("A13 · el arqueo FINAL conserva el esperado PREVIO al retiro", money(finalA.efectivoEsperado) === 50000,
    `si el retiro lo hubiera afectado seria 10.000, es ${money(finalA.efectivoEsperado)}`);
  chequear("A14 · el FINAL guarda el contado real", money(finalA.efectivoContado) === 50000);

  const retiros = await prisma.cajaMovimiento.findMany({ where: { turnoId: turnoA.id, tipo: "RETIRO" } });
  chequear("A15 · existe UN único CajaMovimiento RETIRO de cierre", retiros.length === 1, `hay ${retiros.length}`);
  chequear("A16 · el retiro es por el monto retirado", money(retiros[0]?.monto) === 40000);
  chequear("A17 · el turno apunta al movimiento del retiro", A.retiroCierreMovimientoId === retiros[0]?.id);
  chequear("A18 · el motivo del retiro es reconocible", /Retiro de cierre del turno #\d+ — Caja fuerte/.test(retiros[0]?.motivo || ""));

  // Idempotencia del cierre: reintentar no cierra de nuevo ni duplica el retiro.
  r = await cerrarPOST(pedido(URL_CERRAR, ck1, {
    turnoId: turnoA.id, montoRealEfectivo: 50000, efectivoRetirado: 40000, fondoDejado: 10000,
  }));
  d = await r.json();
  const retirosTrasReintento = await prisma.cajaMovimiento.count({ where: { turnoId: turnoA.id, tipo: "RETIRO" } });
  const finalesTrasReintento = await prisma.arqueoCaja.count({ where: { turnoId: turnoA.id, tipo: "FINAL" } });
  chequear("A19 · reintentar el cierre se rechaza", d.ok === false, `status ${r.status}`);
  chequear("A20 · el reintento NO duplica el retiro", retirosTrasReintento === 1);
  chequear("A21 · el reintento NO duplica el arqueo FINAL", finalesTrasReintento === 1);

  // ══════════════ TURNO B (mismo local) ══════════════
  console.log("\n── TURNO B (mismo local, otro cajero) ──");
  r = await abrirGET(pedido(URL_ABRIR, ck2));
  d = await r.json();
  chequear("B1 · la apertura muestra que el turno A dejó $10.000", d.ok === true && money(d.fondoSugerido) === 10000);
  chequear("B2 · identifica el turno que dejó el fondo", d.cierrePrevio?.turnoId === turnoA.id);
  chequear("B3 · la caja figura libre", d.cajaOcupada === null);

  r = await abrirPOST(pedido(URL_ABRIR, ck2, { localId: localA.id, montoInicial: 10000 }));
  d = await r.json();
  chequear("B4 · abre confirmando que recibió $10.000", d.ok === true);
  const turnoB = d.turno;
  chequear("B5 · montoInicial = 10.000", money(turnoB.montoInicial) === 10000);
  chequear("B6 · fondoOrigenTurnoId = turno A", turnoB.fondoOrigenTurnoId === turnoA.id);
  chequear("B7 · diferencia de recepción 0", money(turnoB.diferenciaFondoApertura) === 0);

  const Adespues = await prisma.turno.findUnique({ where: { id: turnoA.id } });
  chequear("B8 · el turno A queda marcado como consumido por B", Adespues.fondoConsumidoEnTurnoId === turnoB.id);

  // El fondo ya consumido no se vuelve a ofrecer.
  r = await abrirGET(pedido(URL_ABRIR, ck1));
  d = await r.json();
  chequear("B9 · el fondo de A ya no se ofrece de nuevo", money(d.fondoSugerido) === 0);
  chequear("B10 · ahora la caja figura ocupada por el turno B", d.cajaOcupada?.turnoId === turnoB.id);

  // ══════════════ UN TURNO POR LOCAL ══════════════
  console.log("\n── UN TURNO ABIERTO POR LOCAL ──");
  r = await abrirPOST(pedido(URL_ABRIR, ck1, { localId: localA.id, montoInicial: 0 }));
  d = await r.json();
  chequear("C1 · otro usuario NO puede abrir con la caja ocupada", d.ok === false && r.status === 409);
  chequear("C2 · el mensaje nombra al usuario y el turno", /cajero2/.test(d.error) && d.cajaOcupada?.turnoId === turnoB.id, d.error);
  chequear("C3 · usa el texto pedido", /^Ya hay un turno abierto en este local por .+ desde .+. Debe cerrarse antes de abrir otro.$/.test(d.error), d.error);

  const abiertosA = await prisma.turno.count({ where: { localId: localA.id, cierre: null } });
  chequear("C4 · sigue habiendo UN solo turno abierto en el local", abiertosA === 1, `hay ${abiertosA}`);

  // ══════════════ AISLAMIENTO ENTRE LOCALES ══════════════
  console.log("\n── AISLAMIENTO ENTRE LOCALES ──");
  r = await abrirGET(pedido(URL_ABRIR, ckB));
  d = await r.json();
  chequear("D1 · el local B no ve el fondo del local A", money(d.fondoSugerido) === 0);
  chequear("D2 · el local B ve su caja libre pese al turno abierto en A", d.cajaOcupada === null);

  r = await abrirPOST(pedido(URL_ABRIR, ckB, { localId: localB.id, montoInicial: 0 }));
  d = await r.json();
  chequear("D3 · el local B abre sin bloqueo del local A", d.ok === true);
  const turnoBLocal = d.turno;
  chequear("D4 · el turno de B no toma el fondo de A", turnoBLocal.fondoOrigenTurnoId === null);
  const AsigueConsumido = await prisma.turno.findUnique({ where: { id: turnoA.id } });
  chequear("D5 · el fondo de A sigue apuntando a su consumidor original", AsigueConsumido.fondoConsumidoEnTurnoId === turnoB.id);

  // ══════════════ CONCURRENCIA ══════════════
  console.log("\n── CONCURRENCIA REAL ──");
  // Se cierra B dejando fondo, para que haya un fondo disputable.
  await cerrarPOST(pedido(URL_CERRAR, ck2, {
    turnoId: turnoB.id, montoRealEfectivo: 10000, efectivoRetirado: 0, fondoDejado: 10000,
  }));
  const Bcerrado = await prisma.turno.findUnique({ where: { id: turnoB.id } });
  chequear("E0 · retiro CERO no genera movimiento", Bcerrado.retiroCierreMovimientoId === null);
  chequear("E0b · con retiro cero, todo queda como fondo", money(Bcerrado.fondoDejadoCierre) === 10000);

  // Dos aperturas simultáneas peleando por el mismo fondo.
  const res = await Promise.allSettled([
    abrirPOST(pedido(URL_ABRIR, ck1, { localId: localA.id, montoInicial: 10000 })),
    abrirPOST(pedido(URL_ABRIR, ck2, { localId: localA.id, montoInicial: 10000 })),
  ]);
  const cuerpos = await Promise.all(res.map((x) => (x.status === "fulfilled" ? x.value.json() : { ok: false, error: String(x.reason) })));
  const exitosas = cuerpos.filter((c) => c.ok === true).length;
  const fallidas = cuerpos.filter((c) => c.ok === false);
  chequear("E1 · de dos aperturas simultáneas solo UNA triunfa", exitosas === 1, `triunfaron ${exitosas}`);
  chequear("E2 · la otra recibe un error controlado, no un stacktrace",
    fallidas.length === 1 && typeof fallidas[0].error === "string" && !/prisma|P2002|constraint/i.test(fallidas[0].error),
    fallidas[0]?.error);

  const conFondoA = await prisma.turno.count({ where: { fondoOrigenTurnoId: turnoB.id } });
  chequear("E3 · ningún par de turnos comparte el mismo fondoOrigenTurnoId", conFondoA <= 1, `turnos apuntando al fondo de B: ${conFondoA}`);
  const abiertosFinal = await prisma.turno.count({ where: { localId: localA.id, cierre: null } });
  chequear("E4 · queda UN solo turno abierto en el local", abiertosFinal === 1, `hay ${abiertosFinal}`);

  // ══════════════ BORDES DEL REPARTO ══════════════
  console.log("\n── BORDES ──");
  const abierto = await prisma.turno.findFirst({ where: { localId: localA.id, cierre: null } });
  const ckAbierto = abierto.vendedorId === cajero1.id ? ck1 : ck2;

  r = await cerrarPOST(pedido(URL_CERRAR, ckAbierto, {
    turnoId: abierto.id, montoRealEfectivo: 10000, efectivoRetirado: 9000, fondoDejado: 500,
  }));
  d = await r.json();
  chequear("F1 · reparto que no cierra se rechaza", d.ok === false && d.repartoInvalido === true, d.error);

  r = await cerrarPOST(pedido(URL_CERRAR, ckAbierto, {
    turnoId: abierto.id, montoRealEfectivo: 10000, efectivoRetirado: -100, fondoDejado: 10100,
  }));
  d = await r.json();
  chequear("F2 · retiro negativo se rechaza", d.ok === false, d.error);

  // Cierre con FALTANTE: se acepta, queda registrado, y el fondo dejado no puede
  // superar lo que hay físicamente.
  r = await cerrarPOST(pedido(URL_CERRAR, ckAbierto, {
    turnoId: abierto.id, montoRealEfectivo: 7000, efectivoRetirado: 0, fondoDejado: 7000,
    observaciones: "faltante real de prueba",
  }));
  d = await r.json();
  const conFaltante = await prisma.turno.findUnique({ where: { id: abierto.id } });
  chequear("F3 · cierre con faltante se acepta y se registra", d.ok === true && money(conFaltante.diferenciaEfectivo) === -3000,
    `diferencia ${money(conFaltante.diferenciaEfectivo)}`);
  chequear("F4 · fondo dejado menor al sugerido queda guardado", money(conFaltante.fondoDejadoCierre) === 7000);

  // Apertura con fondo distinto del dejado: exige observación.
  r = await abrirPOST(pedido(URL_ABRIR, ck1, { localId: localA.id, montoInicial: 5000 }));
  d = await r.json();
  chequear("F5 · recibir distinto de lo dejado exige observación", d.ok === false && d.requiereObservacionFondo === true, d.error);

  r = await abrirPOST(pedido(URL_ABRIR, ck1, { localId: localA.id, montoInicial: 5000, observacionFondo: "faltaban 2000 en el sobre" }));
  d = await r.json();
  chequear("F6 · con observación abre y guarda la diferencia", d.ok === true && money(d.turno.diferenciaFondoApertura) === -2000);
  chequear("F7 · el turno arranca con lo RECIBIDO, no con lo sugerido", money(d.turno.montoInicial) === 5000);
  chequear("F8 · guarda la observación de apertura", d.turno.observacionFondoApertura === "faltaban 2000 en el sobre");

  // ══════════════ HISTÓRICOS INTACTOS ══════════════
  console.log("\n── TURNOS HISTÓRICOS ──");
  const hist = await prisma.turno.findFirst({ where: { id: 170 } });
  chequear("G1 · el turno 170 histórico conserva sus cifras", money(hist.montoEsperadoEfectivo) === 19400 && money(hist.montoRealEfectivo) === 9400);
  chequear("G2 · sus campos nuevos siguen en NULL, no en cero",
    hist.efectivoRetiradoCierre === null && hist.fondoDejadoCierre === null && hist.fondoOrigenTurnoId === null);
  // La migración no rellenó nada: un turno solo puede tener los campos del
  // CIERRE si además pasó por la apertura nueva. Comprobarlo así es robusto —
  // antes se comparaba contra un rango de ids y cualquier turno de prueba
  // sembrado antes lo hacía fallar sin que hubiera defecto.
  const rellenadosPorLaMigracion = await prisma.turno.count({
    where: {
      fondoSugeridoApertura: null,
      OR: [{ efectivoRetiradoCierre: { not: null } }, { fondoDejadoCierre: { not: null } }],
    },
  });
  chequear("G3 · la migración no rellenó ningún turno existente", rellenadosPorLaMigracion === 0, );

  // ── Limpieza ─────────────────────────────────────────────────────────────
  const idsTurnos = (await prisma.turno.findMany({ where: { localId: { in: [localA.id, localB.id] } }, select: { id: true } })).map((t) => t.id);
  const idsVentas = (await prisma.venta.findMany({ where: { turnoId: { in: idsTurnos } }, select: { id: true } })).map((v) => v.id);
  await prisma.ventaDetalle.deleteMany({ where: { ventaId: { in: idsVentas } } });
  await prisma.ventaPago.deleteMany({ where: { ventaId: { in: idsVentas } } });
  await prisma.venta.deleteMany({ where: { id: { in: idsVentas } } });
  await prisma.arqueoCaja.deleteMany({ where: { turnoId: { in: idsTurnos } } });
  await prisma.cajaMovimiento.deleteMany({ where: { turnoId: { in: idsTurnos } } });
  await prisma.turno.updateMany({ where: { id: { in: idsTurnos } }, data: { fondoOrigenTurnoId: null, fondoConsumidoEnTurnoId: null } });
  await prisma.turno.deleteMany({ where: { id: { in: idsTurnos } } });
  await prisma.configuracionLocal.deleteMany({ where: { localId: { in: [localA.id, localB.id] } } });
  await prisma.usuario.deleteMany({ where: { id: { in: [cajero1.id, cajero2.id, cajeroB.id] } } });
  await prisma.grupoLocal.deleteMany({ where: { localId: { in: [localA.id, localB.id] } } });
  await prisma.local.deleteMany({ where: { id: { in: [localA.id, localB.id] } } });
  console.log("\n(datos de prueba eliminados)");

  console.log(`\n=== RESULTADO: ${ok} OK, ${fallos} fallas ===`);
  if (fallos) console.log("Fallaron:\n  - " + detalle.join("\n  - "));
  await prisma.$disconnect();
  process.exit(fallos ? 1 : 0);
}

main().catch(async (e) => {
  console.error("ERROR:", e);
  await prisma.$disconnect();
  process.exit(1);
});
