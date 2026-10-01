// PRUEBA DE BASE: EL "PAGO A DEPÓSITO" DE FINANZAS ES LA CUENTA DE TRANSFERENCIAS.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/pagoADeposito.mjs
//
// Llama a los DOS handlers reales —`/api/finanzas/tablero` y
// `/api/transferencias/tablero?criterio=RECEPCION`— contra PostgreSQL, con
// sesiones firmadas como las firma el login, y afirma:
//
//   1. Finanzas reconoce solo lo `Recibida`, por `fechaRecepcion`, valuado con
//      la puerta de Transferencias: una enviada la semana pasada y recibida en
//      ésta cae en ésta; las `Enviada`, `Recibiendo` y `Cancelada` no suman.
//   2. Las pendientes viajan aparte, con su importe, y no están en el total.
//   3. Un local no ve lo que recibió otro.
//   4. El "Ver" existe solo con `transferencias.ver`, y lleva al módulo real con
//      el período y el criterio.
//   5. La pantalla que abre el "Ver" muestra el MISMO total y las mismas
//      transferencias que Finanzas, en los dos períodos.
//   6. La cuenta de siempre de Transferencias —por envío— no cambió.
//
// Los importes salen de `Decimal` de verdad —`precioCosto`, cantidades,
// recibido—, que es lo que un candado de funciones puras no puede ejercer. Es la
// regla 2 de CLAUDE.md: una consulta de Prisma se prueba contra Postgres.
//
// Siembra sus propios datos con una marca única y los borra al terminar.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });
const jwt = (await import("jsonwebtoken")).default;
const rutaFinanzas = await import("../../app/api/finanzas/tablero/route.js");
const rutaTransferencias = await import("../../app/api/transferencias/tablero/route.js");
const rutaPagoDeposito = await import("../../app/api/finanzas/pago-a-deposito/route.js");
const { rangoFinanciero } = await import("../../lib/finanzas/periodoFinanciero.js");
const { UNIDADES } = await import("../../lib/transferencias/periodoDePago.js");

let pasadas = 0;
const fallas = [];
function ok(titulo, condicion, detalle = "") {
  if (condicion) {
    pasadas += 1;
    console.log(`  ✓ ${titulo}`);
    return;
  }
  const mensaje = `${titulo}${detalle ? ` — ${detalle}` : ""}`;
  fallas.push(mensaje);
  console.log(`  ✗ ${mensaje}`);
}
const json = (x) => JSON.stringify(x);

const sesion = ({ id, localId, permisos, esDeposito = false }) =>
  `erpazul_sesion=${jwt.sign(
    { id, nombre: `CI ${id}`, email: `pago-deposito-${id}@ci.local`, rolId: null, rolNombre: null, permisos, esDuenoLocal: false, localId, esDeposito },
    process.env.AUTH_SECRET,
    { expiresIn: "1h" }
  )}`;

const leer = async (respuesta) => {
  const r = await respuesta;
  return { status: r.status, ...(await r.json().catch(() => ({}))) };
};
const finanzas = (params, cookie) =>
  leer(
    rutaFinanzas.GET(
      new Request(`http://ci.local/api/finanzas/tablero?${new URLSearchParams({ unidad: "SEMANA", ...params })}`, {
        headers: { cookie },
      })
    )
  );
const transferencias = (params, cookie) =>
  leer(
    rutaTransferencias.GET(
      new Request(`http://ci.local/api/transferencias/tablero?${new URLSearchParams({ unidad: "SEMANA", ...params })}`, {
        headers: { cookie },
      })
    )
  );
const pagoDeposito = (params, cookie) =>
  leer(
    rutaPagoDeposito.GET(
      new Request(`http://ci.local/api/finanzas/pago-a-deposito?${new URLSearchParams({ unidad: "SEMANA", ...params })}`, {
        headers: { cookie },
      })
    )
  );
const idsDe = (r) => (r.periodo?.transferencias || []).map((t) => t.id).sort((a, b) => a - b);

const marca = `ci-pago-deposito-${Date.now()}`;
const creado = { grupoIds: [], localIds: [], clienteIds: [], baseIds: [], plIds: [], transferenciaIds: [] };

// Las dos semanas, como las calcula Finanzas para un local sin semana
// configurada. Las fechas se ponen al mediodía argentino del primer día de cada
// una, así ningún huso las corre de semana.
const ESTA = rangoFinanciero({ unidad: UNIDADES.SEMANA, desplazamiento: 0, vigencias: [] });
const ANTERIOR = rangoFinanciero({ unidad: UNIDADES.SEMANA, desplazamiento: -1, vigencias: [] });
const enEsta = new Date(`${ESTA.desde}T12:00:00-03:00`);
const enLaAnterior = new Date(`${ANTERIOR.desde}T12:00:00-03:00`);

// 4 CAJÓN x8 a $23.333,33 el cajón. Cada cajón recibido vale 23.333,33.
// Lo esperado se suma en CENTAVOS, como la cuenta: sumar pesos en punto
// flotante da 116666.65000000001 y el candado fallaría por su propia aritmética.
const CAJON = 23333.33;
const vale = (...cajones) => cajones.reduce((acc, c) => acc + Math.round(c * CAJON * 100), 0) / 100;

async function montar() {
  const g = await prisma.grupo.create({ data: { nombre: `${marca}-g` } });
  creado.grupoIds.push(g.id);
  const local = async (n, es_deposito = false) => {
    const l = await prisma.local.create({ data: { nombre: `${marca}-${n}`, es_deposito } });
    creado.localIds.push(l.id);
    return l;
  };
  const L = { D: await local("deposito", true), A: await local("A"), B: await local("B") };
  await prisma.grupoDeposito.create({ data: { grupoId: g.id, localId: L.D.id } });
  for (const l of [L.A, L.B]) {
    await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: l.id } });
    const c = await prisma.cliente.create({ data: { grupoId: g.id, nombre: `${marca}-cliente-${l.id}`, localVinculadoId: l.id } });
    creado.clienteIds.push(c.id);
  }

  // El producto en cajones de 8, con el costo del cajón.
  const [b] = await prisma.$queryRawUnsafe(
    `INSERT INTO "ProductoBase" ("grupoId","nombre","codigo_barra","unidad_medida","factor_pack","precio_costo","precio_venta","updatedAt")
     VALUES ($1, $2, $3, 'cajon', 8, $4, 30000, now()) RETURNING "id"`,
    g.id,
    `${marca}-cajon`,
    `${marca}-cajon`,
    CAJON
  );
  creado.baseIds.push(b.id);
  const productoLocal = async (localId) => {
    const [pl] = await prisma.$queryRawUnsafe(
      `INSERT INTO "ProductoLocal" ("localId","baseId","updatedAt") VALUES ($1, $2, now()) RETURNING "id"`,
      localId,
      b.id
    );
    creado.plIds.push(pl.id);
    return pl.id;
  };
  const P = { A: await productoLocal(L.A.id), B: await productoLocal(L.B.id) };

  // La línea con la forma que deja el envío: snapshot de presentación incluido.
  const transferencia = async ({ destino, productoId, estado, envio, recepcion = null, recibido = null }) => {
    const t = await prisma.transferencia.create({
      data: {
        origenId: L.D.id,
        destinoId: destino,
        estado,
        fechaEnvio: envio,
        fechaRecepcion: recepcion,
        detalle: {
          create: [
            {
              productoId,
              cantidad: 32,
              recibido,
              precioCosto: CAJON,
              unidadEnviada: "UNIDAD",
              presentacionEnvio: "CAJON",
              cantidadPresentada: 4,
              factorPresentacion: 8,
              sueltasEnviadas: 0,
            },
          ],
        },
      },
    });
    creado.transferenciaIds.push(t.id);
    return t.id;
  };

  const T = {
    // Enviada la semana pasada, confirmada en ésta, con 2 de 4 cajones.
    cruzada: await transferencia({ destino: L.A.id, productoId: P.A, estado: "Recibida", envio: enLaAnterior, recepcion: enEsta, recibido: 2 }),
    // Enviada y confirmada en ésta, con 3 de 4: la diferencia baja el importe.
    conFaltante: await transferencia({ destino: L.A.id, productoId: P.A, estado: "Recibida", envio: enEsta, recepcion: enEsta, recibido: 3 }),
    // Enviada y confirmada la semana pasada, completa.
    anterior: await transferencia({ destino: L.A.id, productoId: P.A, estado: "Recibida", envio: enLaAnterior, recepcion: enLaAnterior, recibido: 4 }),
    // Sin confirmar: no suman.
    enviada: await transferencia({ destino: L.A.id, productoId: P.A, estado: "Enviada", envio: enEsta }),
    recibiendo: await transferencia({ destino: L.A.id, productoId: P.A, estado: "Recibiendo", envio: enLaAnterior, recibido: 2 }),
    cancelada: await transferencia({ destino: L.A.id, productoId: P.A, estado: "Cancelada", envio: enEsta }),
    // De otro local: A no la ve.
    deB: await transferencia({ destino: L.B.id, productoId: P.B, estado: "Recibida", envio: enEsta, recepcion: enEsta, recibido: 4 }),
  };
  return { L, T };
}

async function desmontar() {
  if (creado.transferenciaIds.length) {
    await prisma.transferenciaDetalle.deleteMany({ where: { transferenciaId: { in: creado.transferenciaIds } } });
    await prisma.transferencia.deleteMany({ where: { id: { in: creado.transferenciaIds } } });
  }
  if (creado.plIds.length) await prisma.$executeRawUnsafe(`DELETE FROM "ProductoLocal" WHERE "id" = ANY($1::int[])`, creado.plIds);
  if (creado.baseIds.length) await prisma.$executeRawUnsafe(`DELETE FROM "ProductoBase" WHERE "id" = ANY($1::int[])`, creado.baseIds);
  if (creado.clienteIds.length) await prisma.cliente.deleteMany({ where: { id: { in: creado.clienteIds } } });
  if (creado.grupoIds.length) {
    await prisma.grupoLocal.deleteMany({ where: { grupoId: { in: creado.grupoIds } } });
    await prisma.grupoDeposito.deleteMany({ where: { grupoId: { in: creado.grupoIds } } });
  }
  if (creado.localIds.length) {
    await prisma.auditoriaBitacora.deleteMany({ where: { localId: { in: creado.localIds } } });
    await prisma.local.deleteMany({ where: { id: { in: creado.localIds } } });
  }
  if (creado.grupoIds.length) await prisma.grupo.deleteMany({ where: { id: { in: creado.grupoIds } } });
}

try {
  const { L, T } = await montar();
  const CON_VER = ["finanzas.ver", "transferencias.ver"];
  const S = {
    localA: sesion({ id: 301, localId: L.A.id, permisos: CON_VER }),
    localSinVer: sesion({ id: 302, localId: L.A.id, permisos: ["finanzas.ver"] }),
    deposito: sesion({ id: 303, localId: L.D.id, permisos: CON_VER, esDeposito: true }),
  };

  const esperado = {
    // Pendientes de ésta: las dos que ya salieron y hoy no se confirmaron
    // —`enviada` (salió en ésta) y `recibiendo` (salió antes y sigue abierta)—.
    esta: {
      total: vale(2, 3),
      cantidad: 2,
      ids: [T.cruzada, T.conFaltante],
      pendientes: { total: vale(4, 2), cantidad: 2, ids: [T.enviada, T.recibiendo] },
    },
    // La anterior: solo `anterior`. Pendiente, la que ya había salido entonces y
    // sigue sin confirmar (`recibiendo`); `enviada` salió en ésta.
    anterior: { total: vale(4), cantidad: 1, ids: [T.anterior], pendientes: { total: vale(2), cantidad: 1, ids: [T.recibiendo] } },
  };

  console.log("\n── 1–3. Finanzas, el local A, esta semana y la anterior");
  for (const [nombre, desplazamiento, e] of [["esta", "0", esperado.esta], ["anterior", "-1", esperado.anterior]]) {
    const r = await finanzas({ entrada: "1", desplazamiento }, S.localA);
    const p = r.resumen?.pagoADeposito;
    ok(`${nombre}: 200 y el bloque aplica`, r.status === 200 && p?.aplica === true, json({ s: r.status, e: r.error, p }));
    ok(`${nombre}: el total es lo RECIBIDO y confirmado en el período (${e.total})`, p?.total === e.total, json(p));
    ok(`${nombre}: ${e.cantidad} transferencias reconocidas`, p?.cantidadTransferencias === e.cantidad, json(p));
    ok(`${nombre}: el criterio es RECEPCION`, p?.criterio === "RECEPCION");
    ok(
      `${nombre}: las pendientes van aparte (${e.pendientes.total}, ${e.pendientes.cantidad}) y no están en el total`,
      p?.pendientes?.total === e.pendientes.total && p?.pendientes?.cantidadTransferencias === e.pendientes.cantidad,
      json(p?.pendientes)
    );
  }

  console.log("\n── 4. El Ver y el permiso");
  {
    const conVer = await finanzas({ entrada: "1", desplazamiento: "0" }, S.localA);
    ok(
      "con transferencias.ver: el Ver lleva a la cuenta propia, en el período en curso y por recepción",
      conVer.resumen?.pagoADeposito?.verDetalle === "/modulos/transferencias/cuenta?desp=0&criterio=RECEPCION",
      conVer.resumen?.pagoADeposito?.verDetalle
    );
    const sinVer = await finanzas({ entrada: "1", desplazamiento: "0" }, S.localSinVer);
    ok(
      "sin transferencias.ver: sin Ver, y el importe igual",
      sinVer.status === 200 && sinVer.resumen?.pagoADeposito?.verDetalle === null && sinVer.resumen?.pagoADeposito?.total === esperado.esta.total,
      json(sinVer.resumen?.pagoADeposito)
    );
    const desdeDeposito = await finanzas({ destino: String(L.A.id), desplazamiento: "-1" }, S.deposito);
    ok(
      "desde el depósito: la cuenta de A, el período cerrado y el mismo total",
      desdeDeposito.resumen?.pagoADeposito?.verDetalle === `/modulos/transferencias/local/${L.A.id}?criterio=RECEPCION` &&
        desdeDeposito.resumen?.pagoADeposito?.total === esperado.anterior.total,
      json(desdeDeposito.resumen?.pagoADeposito)
    );
    const delDeposito = await finanzas({ destino: String(L.D.id), desplazamiento: "0" }, S.deposito);
    if (delDeposito.status === 200) {
      ok(
        "el depósito mirando lo suyo: no aplica, y sin números",
        delDeposito.resumen?.pagoADeposito?.aplica === false && delDeposito.resumen?.pagoADeposito?.total === null,
        json(delDeposito.resumen?.pagoADeposito)
      );
    } else {
      ok("el depósito no se elige a sí mismo en Finanzas: se rechaza antes del resumen", delDeposito.status === 403, json({ s: delDeposito.status, e: delDeposito.error }));
    }
  }

  console.log("\n── 5. Lo que abre el Ver muestra lo mismo");
  for (const [nombre, desplazamiento, e] of [["esta", "0", esperado.esta], ["anterior", "-1", esperado.anterior]]) {
    const r = await transferencias({ entrada: "1", desplazamiento, criterio: "RECEPCION" }, S.localA);
    ok(`${nombre}: 200, vista de un local, criterio de recepción`, r.status === 200 && r.vista === "UN_LOCAL" && r.criterio === "RECEPCION", json({ s: r.status, e: r.error }));
    ok(`${nombre}: el mismo total que Finanzas (${e.total})`, r.periodo?.aPagar === e.total, json({ aPagar: r.periodo?.aPagar }));
    ok(`${nombre}: las mismas transferencias`, json(idsDe(r)) === json([...e.ids].sort((a, b) => a - b)), json(idsDe(r)));
    ok(
      `${nombre}: las mismas pendientes`,
      r.periodo?.pendientes?.importe === e.pendientes.total && r.periodo?.pendientes?.cantidad === e.pendientes.cantidad,
      json(r.periodo?.pendientes)
    );
    // El conjunto EXACTO de pendientes que abre "Ver pendientes": las filas que
    // manda el tablero son las mismas que Finanzas contó, de la misma cuenta.
    const idsPend = (r.periodo?.pendientes?.transferencias || []).map((t) => t.id).sort((a, b) => a - b);
    ok(
      `${nombre}: el tablero lista EXACTAMENTE las pendientes contadas`,
      json(idsPend) === json([...e.pendientes.ids].sort((a, b) => a - b)),
      json(idsPend)
    );
    const desdeDeposito = await transferencias({ destino: String(L.A.id), desplazamiento, criterio: "RECEPCION" }, S.deposito);
    ok(`${nombre}: el depósito abriendo A ve el mismo total`, desdeDeposito.periodo?.aPagar === e.total, json({ s: desdeDeposito.status, aPagar: desdeDeposito.periodo?.aPagar }));
  }
  {
    const r = await transferencias({ entrada: "1", desplazamiento: "0", criterio: "RECEPCION" }, S.localA);
    const cruzada = (r.periodo?.transferencias || []).find((t) => t.id === T.cruzada);
    ok("cada fila trae su fecha de recepción, con la que la pantalla agrupa los días", Boolean(cruzada?.fechaRecepcion), json(cruzada));
  }

  console.log("\n── 6. La cuenta de siempre, por envío, no cambió");
  {
    const r = await transferencias({ entrada: "1", desplazamiento: "0" }, S.localA);
    // Por envío esta semana: `conFaltante` y `enviada` (la cancelada no entra),
    // y TODO suma, también lo que falta recibir.
    ok("sin criterio: la cuenta por envío", r.status === 200 && r.criterio === undefined, json({ s: r.status, c: r.criterio }));
    ok("las de esta semana por fecha de envío", json(idsDe(r)) === json([T.conFaltante, T.enviada].sort((a, b) => a - b)), json(idsDe(r)));
    ok("el total incluye lo que falta recibir", r.periodo?.aPagar === vale(3, 4), json({ aPagar: r.periodo?.aPagar }));
    ok("y avisa que falta recibir", r.periodo?.sinRecibir === 1, json({ sinRecibir: r.periodo?.sinRecibir }));
  }
  console.log("\n── 7. La sección propia: /api/finanzas/pago-a-deposito");
  {
    const r = await pagoDeposito({ desplazamiento: "0" }, S.localA);
    ok("local A: 200, UN_LOCAL, aplica", r.status === 200 && r.vista === "UN_LOCAL" && r.pagoADeposito?.aplica === true, json({ s: r.status, e: r.error }));
    ok("el total es el MISMO pago reconocido que el Resumen", r.pagoADeposito?.total === esperado.esta.total, json(r.pagoADeposito));
    ok(
      "lista las reconocidas, con id, fecha e importe",
      json((r.recibidas || []).map((x) => x.id).sort((a, b) => a - b)) === json([...esperado.esta.ids].sort((a, b) => a - b)) &&
        (r.recibidas || []).every((x) => x.id && x.fechaRecepcion && typeof x.importe === "number"),
      json(r.recibidas)
    );
    ok(
      "las pendientes van agregadas y NO en el listado",
      r.pagoADeposito?.pendientes?.cantidadTransferencias === esperado.esta.pendientes.cantidad &&
        !(r.recibidas || []).some((x) => x.id === T.enviada || x.id === T.recibiendo),
      json({ p: r.pagoADeposito?.pendientes, ids: (r.recibidas || []).map((x) => x.id) })
    );
    ok(
      "con transferencias.ver: el Ver agregado lleva a la cuenta propia por recepción",
      r.pagoADeposito?.verDetalle === "/modulos/transferencias/cuenta?desp=0&criterio=RECEPCION",
      r.pagoADeposito?.verDetalle
    );
    ok(
      "con transferencias.ver y pendientes: el Ver pendientes lleva a la misma cuenta con vista=pendientes",
      r.pagoADeposito?.pendientes?.verPendientes === "/modulos/transferencias/cuenta?desp=0&criterio=RECEPCION&vista=pendientes",
      r.pagoADeposito?.pendientes?.verPendientes
    );

    const sinVer = await pagoDeposito({ desplazamiento: "0" }, S.localSinVer);
    ok(
      "sin transferencias.ver: importe sí, Ver no",
      sinVer.pagoADeposito?.total === esperado.esta.total && sinVer.pagoADeposito?.verDetalle === null && sinVer.puedeVerTransferencias === false,
      json(sinVer.pagoADeposito)
    );
    ok(
      "sin transferencias.ver: tampoco el enlace de pendientes",
      sinVer.pagoADeposito?.pendientes?.verPendientes === null,
      json(sinVer.pagoADeposito?.pendientes)
    );

    const lista = await pagoDeposito({ entrada: "1" }, S.deposito);
    ok("depósito: vista ENTRADA con la lista de pagadores", lista.status === 200 && lista.vista === "ENTRADA" && Array.isArray(lista.locales), json({ s: lista.status, v: lista.vista }));
    ok("la lista NO incluye al depósito", !(lista.locales || []).some((l) => l.esDeposito === true || l.localId === L.D.id), json(lista.locales));

    const desdeDep = await pagoDeposito({ destino: String(L.A.id), desplazamiento: "-1" }, S.deposito);
    ok(
      "depósito→A: el total de la semana cerrada y el Ver a /local/A",
      desdeDep.pagoADeposito?.total === esperado.anterior.total &&
        desdeDep.pagoADeposito?.verDetalle === `/modulos/transferencias/local/${L.A.id}?criterio=RECEPCION`,
      json(desdeDep.pagoADeposito)
    );

    const cruzado = await pagoDeposito({ destino: String(L.B.id), desplazamiento: "0" }, S.localA);
    ok("local A pidiendo B: 403", cruzado.status === 403, json({ s: cruzado.status, e: cruzado.error }));
  }
} catch (err) {
  fallas.push(`EXCEPCIÓN: ${err?.stack || err}`);
  console.error(err);
} finally {
  await desmontar().catch((e) => {
    fallas.push(`no se pudo desmontar: ${e.message}`);
  });
  await prisma.$disconnect();
  if (globalThis.prisma) await globalThis.prisma.$disconnect().catch(() => {});
}

console.log(`\n${"═".repeat(72)}`);
console.log(`Afirmaciones que pasaron: ${pasadas}`);
console.log(`Afirmaciones que fallaron: ${fallas.length}`);
if (fallas.length > 0) {
  for (const f of fallas) console.log(`  ✗ ${f.split("\n")[0]}`);
  process.exit(1);
}
