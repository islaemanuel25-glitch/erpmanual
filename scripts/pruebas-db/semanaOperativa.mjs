// PRUEBA DE BASE DE LA SEMANA OPERATIVA.
//
// Ejerce contra PostgreSQL lo que ni el build ni los candados puros pueden ver:
//
//   1. el BACKFILL de la migración, ejecutando EL MISMO SQL del archivo —el
//      bloque entre BACKFILL:INICIO y BACKFILL:FIN— sobre los casos que decide:
//      un acuerdo, varios iguales, varios distintos, el depósito, sin acuerdo, un
//      acuerdo de otro grupo y un día inválido;
//   2. las RESTRICCIONES de la base: el CHECK del día, el único por fecha y el
//      único parcial de "desde siempre", que Prisma no ve;
//   3. las DOS RUTAS que escriben, con sus handlers reales: permiso, alcance,
//      primera vez, cambio programado, rechazos, reemplazo, que lo empezado no se
//      toca y que dos pedidos simultáneos no dejan dos pendientes;
//   4. que Transferencias da los MISMOS números con la semana migrada que con el
//      acuerdo.
//
// Siembra sus propios datos con una marca única y los borra al terminar.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/semanaOperativa.mjs

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

import { readFileSync } from "node:fs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });
const jwt = (await import("jsonwebtoken")).default;

const rutaAcuerdos = await import("../../app/api/transferencias/acuerdos/route.js");
const rutaTablero = await import("../../app/api/transferencias/tablero/route.js");
const rutaConfig = await import("../../app/api/config/semana-operativa/route.js");
const { semanaQueContiene, previsualizarCambio, PERMISO_SEMANA_OPERATIVA } = await import(
  "../../lib/semanaOperativa/semanaOperativa.js"
);
const { programarSemanaOperativa } = await import("../../lib/semanaOperativa/semanaOperativaServer.js");
const { diaDeLaSemana, rangoDelPeriodo, rangoDesplazado, sumarDias, UNIDADES } = await import(
  "../../lib/transferencias/periodoDePago.js"
);
const { hoyArgentinaISO } = await import("../../lib/fechas/rangoArgentina.js");
const { diagnosticar } = await import("../diagnostico-semana-operativa.mjs");

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

const SECRETO = process.env.AUTH_SECRET;
const token = (usuarioId, localId, permisos) =>
  jwt.sign(
    { id: usuarioId, nombre: "CI Semana", email: `semana-${usuarioId}@ci.local`, localId, permisos },
    SECRETO,
    { expiresIn: "1h" }
  );

const conCuerpo = (url, sesion, metodo, cuerpo) =>
  new Request(url, {
    method: metodo,
    headers: { cookie: `erpazul_sesion=${sesion}`, "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
const pedido = (url, sesion) => new Request(url, { headers: { cookie: `erpazul_sesion=${sesion}` } });

const leer = async (respuesta) => {
  const r = await respuesta;
  return { status: r.status, ...(await r.json().catch(() => ({}))) };
};

const iso = (v) => (v ? v.toISOString().slice(0, 10) : null);
const vigenciasDe = (localId) =>
  prisma.semanaOperativaVigencia.findMany({
    where: { localId },
    orderBy: [{ vigenteDesde: { sort: "asc", nulls: "first" } }],
  });

// ── EL SQL DEL BACKFILL, SACADO DEL ARCHIVO DE LA MIGRACIÓN ────────────────
const MIGRACION = "prisma/migrations/20260924230000_semana_operativa_ubicacion/migration.sql";
const textoMigracion = readFileSync(MIGRACION, "utf8");
const inicioBackfill = textoMigracion.indexOf("-- BACKFILL:INICIO");
const finBackfill = textoMigracion.indexOf("-- BACKFILL:FIN");
if (inicioBackfill < 0 || finBackfill < inicioBackfill) {
  console.error(`No se encontraron las marcas del backfill en ${MIGRACION}.`);
  process.exit(1);
}
const SQL_BACKFILL = textoMigracion
  .slice(inicioBackfill + "-- BACKFILL:INICIO".length, finBackfill)
  .trim()
  .replace(/;\s*$/, "");

const marca = `ci-semana-${Date.now()}`;
const creado = { grupoIds: [], localIds: [], clienteIds: [] };

async function crearLocal(nombre, extra = {}) {
  const l = await prisma.local.create({ data: { nombre: `${marca}-${nombre}`, ...extra } });
  creado.localIds.push(l.id);
  return l;
}

async function montar() {
  const g1 = await prisma.grupo.create({ data: { nombre: `${marca}-g1` } });
  const g2 = await prisma.grupo.create({ data: { nombre: `${marca}-g2` } });
  creado.grupoIds.push(g1.id, g2.id);

  const d1 = await crearLocal("deposito", { es_deposito: true });
  const d2 = await crearLocal("deposito-2", { es_deposito: true });
  const dAjeno = await crearLocal("deposito-ajeno", { es_deposito: true });
  // `d2` NO es depósito del grupo: el tablero toma el primero que encuentra, y
  // dos harían que la prueba dependa del orden de una consulta. Sirve igual para
  // tener dos acuerdos por local —el único es (depósito, local)— y el
  // diagnóstico los informa como obsoletos, que es lo que son.
  await prisma.grupoDeposito.create({ data: { grupoId: g1.id, localId: d1.id } });
  await prisma.grupoDeposito.create({ data: { grupoId: g2.id, localId: dAjeno.id } });

  const L = {};
  for (const n of ["uno", "iguales", "distintos", "sin", "obsoleto", "invalido", "concurrente", "permisos", "cancela", "vecino"]) {
    L[n] = await crearLocal(n);
    await prisma.grupoLocal.create({ data: { grupoId: g1.id, localId: L[n].id } });
  }
  L.ajeno = await crearLocal("ajeno");
  await prisma.grupoLocal.create({ data: { grupoId: g2.id, localId: L.ajeno.id } });

  // Operan por transferencia: sin cliente vinculado no aparecen en las listas.
  for (const n of ["uno", "iguales", "distintos", "sin", "permisos"]) {
    const c = await prisma.cliente.create({
      data: { grupoId: g1.id, nombre: `${marca}-cliente-${n}`, localVinculadoId: L[n].id },
    });
    creado.clienteIds.push(c.id);
  }

  const acuerdo = (grupoId, depositoLocalId, localId, diaDeCorte) =>
    prisma.acuerdoDepositoLocal.create({ data: { grupoId, depositoLocalId, localId, diaDeCorte } });
  await acuerdo(g1.id, d1.id, L.uno.id, 2);
  await acuerdo(g1.id, d1.id, L.iguales.id, 4);
  await acuerdo(g1.id, d2.id, L.iguales.id, 4);
  await acuerdo(g1.id, d1.id, L.distintos.id, 1);
  await acuerdo(g1.id, d2.id, L.distintos.id, 5);
  // El depósito como "local" de un acuerdo: su semana NO se deduce de ahí.
  await acuerdo(g1.id, d2.id, d1.id, 3);
  // Un acuerdo de un grupo al que el local ya no pertenece.
  await acuerdo(g2.id, dAjeno.id, L.obsoleto.id, 6);
  // Un día que ninguna función sabe interpretar (antes de esta tanda no había CHECK).
  await acuerdo(g1.id, d1.id, L.invalido.id, 9);
  await acuerdo(g1.id, d1.id, L.concurrente.id, 0);

  return { g1, g2, d1, d2, dAjeno, L };
}

async function desmontar() {
  const ids = creado.localIds;
  if (ids.length) {
    await prisma.transferencia.deleteMany({
      where: { OR: [{ origenId: { in: ids } }, { destinoId: { in: ids } }] },
    });
    await prisma.acuerdoDepositoLocal.deleteMany({
      where: { OR: [{ localId: { in: ids } }, { depositoLocalId: { in: ids } }] },
    });
    await prisma.semanaOperativaVigencia.deleteMany({ where: { localId: { in: ids } } });
  }
  if (creado.clienteIds.length) await prisma.cliente.deleteMany({ where: { id: { in: creado.clienteIds } } });
  if (creado.grupoIds.length) {
    await prisma.grupoLocal.deleteMany({ where: { grupoId: { in: creado.grupoIds } } });
    await prisma.grupoDeposito.deleteMany({ where: { grupoId: { in: creado.grupoIds } } });
  }
  if (ids.length) await prisma.local.deleteMany({ where: { id: { in: ids } } });
  if (creado.grupoIds.length) await prisma.grupo.deleteMany({ where: { id: { in: creado.grupoIds } } });
}

async function correrBackfill(f) {
  console.log("\n── Backfill: el SQL de la migración, tal cual");

  // El SQL no tiene filtro por marca —es el de producción—, así que antes de
  // correrlo se comprueba que las únicas ubicaciones que podría tocar sean las de
  // esta prueba. Si hubiera otras, se frena en vez de escribirles una semana.
  const ajenas = await prisma.$queryRawUnsafe(
    `SELECT DISTINCT a."localId" FROM "AcuerdoDepositoLocal" a
     WHERE NOT EXISTS (SELECT 1 FROM "SemanaOperativaVigencia" v WHERE v."localId" = a."localId")
       AND a."localId" <> ALL($1::int[])`,
    creado.localIds
  );
  if (ajenas.length) {
    throw new Error(
      `El backfill tocaría ${ajenas.length} ubicaciones que no son de esta prueba; no se corre sobre esta base.`
    );
  }

  const insertadas = await prisma.$executeRawUnsafe(SQL_BACKFILL);
  ok("inserta exactamente las tres ubicaciones que tienen un solo día", insertadas === 3, `insertó ${insertadas}`);

  const uno = await vigenciasDe(f.L.uno.id);
  ok(
    "UN acuerdo → ese día, desde siempre, de MIGRACION y sin autor",
    uno.length === 1 && uno[0].diaDeCorte === 2 && uno[0].vigenteDesde === null && uno[0].origen === "MIGRACION" && uno[0].creadoPorId === null,
    JSON.stringify(uno)
  );
  const iguales = await vigenciasDe(f.L.iguales.id);
  ok("VARIOS acuerdos IGUALES → ese día, una sola fila", iguales.length === 1 && iguales[0].diaDeCorte === 4, JSON.stringify(iguales));
  ok("VARIOS DISTINTOS → sin configurar", (await vigenciasDe(f.L.distintos.id)).length === 0);
  ok("el DEPÓSITO → sin configurar, aunque figure como local de un acuerdo", (await vigenciasDe(f.d1.id)).length === 0);
  ok("SIN acuerdo → sin configurar", (await vigenciasDe(f.L.sin.id)).length === 0);
  ok("acuerdo de OTRO grupo → sin configurar", (await vigenciasDe(f.L.obsoleto.id)).length === 0);
  ok("acuerdo con día INVÁLIDO → sin configurar, y la migración no falla", (await vigenciasDe(f.L.invalido.id)).length === 0);
  ok("el tercero con un solo día también entra", (await vigenciasDe(f.L.concurrente.id)).length === 1);

  const otraVez = await prisma.$executeRawUnsafe(SQL_BACKFILL);
  ok("correrlo dos veces no duplica nada", otraVez === 0, `insertó ${otraVez}`);
  ok("la tabla vieja no se tocó", (await prisma.acuerdoDepositoLocal.count({ where: { localId: { in: creado.localIds } } })) === 9);

  console.log("\n── Diagnóstico sobre los mismos casos");
  const d = await diagnosticar(prisma, { soloLocales: creado.localIds });
  ok("nombra el conflicto", d.conflictos.some((c) => c.localId === f.L.distintos.id));
  ok("nombra el acuerdo obsoleto", d.obsoletos.some((o) => o.localId === f.L.obsoleto.id));
  ok("nombra el depósito sin configurar", d.depositosSinConfigurar.some((x) => x.localId === f.d1.id));
  ok(
    "y los locales sin configurar con su motivo",
    d.localesSinConfigurar.find((x) => x.localId === f.L.distintos.id)?.motivo === "acuerdos en conflicto" &&
      d.localesSinConfigurar.find((x) => x.localId === f.L.sin.id)?.motivo === "sin acuerdo en su grupo" &&
      d.localesSinConfigurar.find((x) => x.localId === f.L.invalido.id)?.motivo === "acuerdo con día inválido",
    JSON.stringify(d.localesSinConfigurar)
  );
  ok("marca el día inválido como anomalía", d.anomalias.some((a) => a.localId === f.L.invalido.id));
  ok("y no inventa anomalías en lo que migró bien", !d.anomalias.some((a) => [f.L.uno.id, f.L.iguales.id].includes(a.localId)));
}

// Postgres nombra la restricción en un CHECK pero NO en una violación de único:
// ahí dice la CLAVE repetida. Por eso los únicos se reconocen por sus columnas
// —`("localId")` es el parcial de "desde siempre", `("localId", "vigenteDesde")`
// el de Prisma— y no por el nombre del índice.
async function rechaza(titulo, sql, restriccion) {
  try {
    await prisma.$executeRawUnsafe(sql);
    ok(titulo, false, "la base lo aceptó");
  } catch (e) {
    const texto = `${e.message} ${JSON.stringify(e.meta || {})}`;
    ok(titulo, texto.includes(restriccion), texto.slice(0, 200));
  }
}

async function correrRestricciones(f) {
  console.log("\n── Restricciones de la base");
  const id = f.L.sin.id;
  await rechaza(
    "un día fuera de 0..6 lo frena el CHECK",
    `INSERT INTO "SemanaOperativaVigencia" ("localId","diaDeCorte","vigenteDesde","origen") VALUES (${id}, 7, '2031-01-05', 'MANUAL')`,
    "SemanaOperativaVigencia_dia_valido"
  );
  await rechaza(
    "un día negativo también",
    `INSERT INTO "SemanaOperativaVigencia" ("localId","diaDeCorte","vigenteDesde","origen") VALUES (${id}, -1, '2031-01-05', 'MANUAL')`,
    "SemanaOperativaVigencia_dia_valido"
  );
  await rechaza(
    "dos 'desde siempre' para la misma ubicación los frena el único parcial",
    `INSERT INTO "SemanaOperativaVigencia" ("localId","diaDeCorte","vigenteDesde","origen") VALUES (${f.L.uno.id}, 5, NULL, 'MANUAL')`,
    'Key (\\"localId\\")='
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SemanaOperativaVigencia" ("localId","diaDeCorte","vigenteDesde","origen") VALUES (${id}, 1, '2031-01-05', 'MANUAL')`
  );
  await rechaza(
    "dos vigencias el mismo día las frena el único",
    `INSERT INTO "SemanaOperativaVigencia" ("localId","diaDeCorte","vigenteDesde","origen") VALUES (${id}, 3, '2031-01-05', 'MANUAL')`,
    'Key (\\"localId\\", \\"vigenteDesde\\")='
  );
  await prisma.semanaOperativaVigencia.deleteMany({ where: { localId: id } });
}

async function correrTablero(f) {
  console.log("\n── Transferencias: los mismos números con la semana migrada");
  const hoy = hoyArgentinaISO();
  const ahora = new Date();
  for (const n of ["uno", "iguales", "distintos", "sin"]) {
    await prisma.transferencia.create({
      data: { origenId: f.d1.id, destinoId: f.L[n].id, estado: "Enviada", fechaEnvio: ahora },
    });
  }
  const sesion = token(900001, f.d1.id, ["transferencias.ver"]);

  for (const unidad of [UNIDADES.SEMANA, UNIDADES.MES]) {
    const r = await leer(rutaTablero.GET(pedido(`http://ci/api/transferencias/tablero?unidad=${unidad}`, sesion)));
    ok(`tablero ${unidad} responde`, r.status === 200 && r.vista === "DEPOSITO", `${r.status} ${r.error}`);
    const bloque = (id) => (r.bloques || []).find((b) => b.localId === id);
    // Lo que calculaba el runtime viejo: el día del acuerdo, o domingo marcado.
    const esperado = [
      [f.L.uno.id, 2, false],
      [f.L.iguales.id, 4, false],
      [f.L.sin.id, 0, true],
    ];
    for (const [id, corte, sinConfigurar] of esperado) {
      const b = bloque(id);
      const rango = rangoDelPeriodo({ unidad, diaDeCorte: corte, hoy });
      ok(
        `${unidad} local #${id}: corte ${corte}, rango y cantidad como con el acuerdo`,
        b && b.diaDeCorte === corte && b.sinConfigurar === sinConfigurar &&
          b.rango.desde === rango.desde && b.rango.hasta === rango.hasta && b.cantidadTransferencias === 1,
        JSON.stringify(b && { d: b.diaDeCorte, s: b.sinConfigurar, r: b.rango, c: b.cantidadTransferencias })
      );
    }
    // EL CAMBIO DE COMPORTAMIENTO QUE SE ACEPTÓ: antes el primer acuerdo que
    // devolvía la consulta decidía; ahora un conflicto es "sin configurar".
    const conflicto = bloque(f.L.distintos.id);
    ok(
      `${unidad}: el local en conflicto queda SIN CONFIGURAR, con domingo`,
      conflicto && conflicto.sinConfigurar === true && conflicto.diaDeCorte === 0,
      JSON.stringify(conflicto)
    );
  }

  const un = await leer(
    rutaTablero.GET(pedido(`http://ci/api/transferencias/tablero?unidad=SEMANA&destino=${f.L.uno.id}`, sesion))
  );
  const cerrado = rangoDesplazado({ unidad: UNIDADES.SEMANA, diaDeCorte: 2, hoy, desplazamiento: -1 });
  ok(
    "vista de UN local: su corte y su semana cerrada, como con el acuerdo",
    un.status === 200 && un.local?.diaDeCorte === 2 && un.local?.sinConfigurar === false &&
      un.periodo?.rango?.desde === cerrado.desde && un.periodo?.rango?.hasta === cerrado.hasta,
    `${un.status} ${un.error ?? ""} ${JSON.stringify(un.local)} ${JSON.stringify(un.periodo?.rango)}`
  );

  const entrada = await leer(rutaTablero.GET(pedido("http://ci/api/transferencias/tablero?entrada=1", sesion)));
  const marcaDe = (id) => entrada.locales?.find((l) => l.localId === id)?.sinConfigurar;
  ok(
    "la entrada del depósito marca sin configurar a los que no tienen semana",
    marcaDe(f.L.uno.id) === false && marcaDe(f.L.sin.id) === true && marcaDe(f.L.distintos.id) === true,
    JSON.stringify(entrada.locales)
  );
}

async function correrPutViejo(f) {
  console.log("\n── El PUT de «Corte de semana»");
  const url = "http://ci/api/transferencias/acuerdos";
  // Cada pedido sale de una sesión EN el local que cambia: con el alcance de
  // `config_local.*`, esa es la única ubicación que se puede escribir.
  const permisos = ["transferencias.ver", PERMISO_SEMANA_OPERATIVA];
  const soloCrear = token(900002, f.L.sin.id, ["transferencias.ver", "transferencias.crear"]);
  const enSin = token(900003, f.L.sin.id, permisos);
  const enUno = token(900005, f.L.uno.id, permisos);
  const enDeposito = token(900006, f.d1.id, permisos);
  const acuerdosAntes = await prisma.acuerdoDepositoLocal.count({ where: { localId: { in: creado.localIds } } });

  const r1 = await leer(rutaAcuerdos.PUT(conCuerpo(url, soloCrear, "PUT", { localId: f.L.sin.id, diaDeCorte: 3 })));
  ok("con `transferencias.crear` solo → 403", r1.status === 403, `${r1.status} ${r1.error}`);
  ok("y no escribió nada", (await vigenciasDe(f.L.sin.id)).length === 0);

  const r2 = await leer(rutaAcuerdos.PUT(conCuerpo(url, enSin, "PUT", { localId: f.L.sin.id, diaDeCorte: 3 })));
  const sin = await vigenciasDe(f.L.sin.id);
  ok("con el permiso nuevo, un local sin semana la recibe DESDE SIEMPRE", r2.status === 200 && r2.cambio?.accion === "PRIMERA", `${r2.status} ${r2.error}`);
  ok(
    "fila MANUAL, con autor",
    sin.length === 1 && sin[0].vigenteDesde === null && sin[0].diaDeCorte === 3 && sin[0].origen === "MANUAL" && sin[0].creadoPorId === 900003,
    JSON.stringify(sin)
  );

  const hoy = hoyArgentinaISO();
  const frontera = sumarDias(semanaQueContiene({ vigencias: [{ diaDeCorte: 2, desde: null }], fecha: hoy }).hasta, 1);
  const r3 = await leer(rutaAcuerdos.PUT(conCuerpo(url, enUno, "PUT", { localId: f.L.uno.id, diaDeCorte: 5 })));
  const uno = await vigenciasDe(f.L.uno.id);
  ok(
    "un local CON semana: el cambio se PROGRAMA desde la próxima frontera",
    r3.status === 200 && r3.cambio?.accion === "PROGRAMAR" && r3.cambio?.desde === frontera && r3.cambio?.transicion,
    `${r3.status} ${r3.error} ${JSON.stringify(r3.cambio)} esperado ${frontera}`
  );
  ok("la vigencia migrada sigue intacta", uno[0].vigenteDesde === null && uno[0].diaDeCorte === 2 && uno[0].origen === "MIGRACION");
  const relUno = r3.relaciones?.find((x) => x.localId === f.L.uno.id);
  ok(
    "la lista sigue diciendo el corte de HOY y trae el programado",
    relUno?.diaDeCorte === 2 && relUno?.programado?.diaDeCorte === 5 && relUno?.programado?.desde === frontera,
    JSON.stringify(relUno)
  );
  ok(
    "y solo la fila de la ubicación en la que se opera es `configurable`",
    relUno?.configurable === true && (r3.relaciones || []).filter((x) => x.configurable).length === 1,
    JSON.stringify((r3.relaciones || []).map((x) => [x.localId, x.configurable]))
  );

  const r4 = await leer(rutaAcuerdos.PUT(conCuerpo(url, enUno, "PUT", { localId: f.L.uno.id, diaDeCorte: 6 })));
  const uno4 = await vigenciasDe(f.L.uno.id);
  ok(
    "un segundo pedido REEMPLAZA el pendiente: sigue habiendo uno solo",
    r4.status === 200 && uno4.length === 2 && uno4[1].diaDeCorte === 6 && iso(uno4[1].vigenteDesde) === frontera,
    `${r4.status} ${r4.error} ${JSON.stringify(uno4)}`
  );

  const r5 = await leer(rutaAcuerdos.PUT(conCuerpo(url, enUno, "PUT", { localId: f.L.uno.id, diaDeCorte: 2 })));
  ok("pedir el corte que ya rige → 409 MISMO_CORTE", r5.status === 409 && r5.codigo === "MISMO_CORTE", `${r5.status} ${r5.codigo}`);

  const r6 = await leer(rutaAcuerdos.PUT(conCuerpo(url, enUno, "PUT", { localId: f.L.ajeno.id, diaDeCorte: 1 })));
  ok("un local de OTRO grupo → 403", r6.status === 403, `${r6.status} ${r6.error}`);
  ok("y no escribió nada", (await vigenciasDe(f.L.ajeno.id)).length === 0);

  // LA REGLA DE ESTA CORRECCIÓN: el mismo grupo no alcanza.
  const sinAntes = await vigenciasDe(f.L.sin.id);
  const r6b = await leer(rutaAcuerdos.PUT(conCuerpo(url, enUno, "PUT", { localId: f.L.sin.id, diaDeCorte: 5 })));
  ok("desde Local «uno», cambiar otro local DEL MISMO GRUPO → 403", r6b.status === 403, `${r6b.status} ${r6b.error}`);
  ok("y no escribió nada", JSON.stringify(await vigenciasDe(f.L.sin.id)) === JSON.stringify(sinAntes));
  const r6c = await leer(rutaAcuerdos.PUT(conCuerpo(url, enDeposito, "PUT", { localId: f.L.sin.id, diaDeCorte: 5 })));
  ok("el depósito tampoco le cambia la semana a un local → 403", r6c.status === 403, `${r6c.status} ${r6c.error}`);

  const r7 = await leer(rutaAcuerdos.PUT(conCuerpo(url, enDeposito, "PUT", { localId: f.d1.id, diaDeCorte: 1 })));
  ok("el depósito no se configura desde acá → 400", r7.status === 400 && /depósito/.test(r7.error || ""), `${r7.status} ${r7.error}`);

  ok(
    "el PUT no escribió `AcuerdoDepositoLocal`",
    (await prisma.acuerdoDepositoLocal.count({ where: { localId: { in: creado.localIds } } })) === acuerdosAntes
  );

  const g = await leer(rutaAcuerdos.GET(pedido(url, token(900004, f.d1.id, ["transferencias.ver"]))));
  const rel = (id) => g.relaciones?.find((x) => x.localId === id);
  ok(
    "el GET lee la fuente nueva",
    g.status === 200 && rel(f.L.iguales.id)?.diaDeCorte === 4 && rel(f.L.distintos.id)?.sinConfigurar === true && rel(f.L.sin.id)?.diaDeCorte === 3,
    `${g.status} ${JSON.stringify(g.relaciones)}`
  );
}

// ── LA MATRIZ DE PERMISOS ──────────────────────────────────────────────────
//
// La semana es de la ubicación: configurarla no puede exigir `transferencias.ver`,
// y el permiso de la semana no puede abrir los datos comerciales de
// Transferencias. Los cuatro casos, contra los handlers reales.
async function correrPermisos(f) {
  console.log("\n── Permisos: la semana no depende de Transferencias");
  const urlAcuerdos = "http://ci/api/transferencias/acuerdos";
  const urlConfig = "http://ci/api/config/semana-operativa";
  const id = f.L.permisos.id;
  // Lo único que viaja por fila: la semana y si se la puede cambiar. Nada de
  // importes ni transferencias.
  const CAMPOS = ["configurable", "depositoNombre", "diaDeCorte", "localId", "localNombre", "programado", "rango", "sinConfigurar"];

  const casos = [
    { nombre: "semana sí / transferencias no", permisos: [PERMISO_SEMANA_OPERATIVA], lee: true, cambia: true, tablero: false },
    { nombre: "semana no / transferencias sí", permisos: ["transferencias.ver"], lee: true, cambia: false, tablero: true },
    { nombre: "los dos", permisos: [PERMISO_SEMANA_OPERATIVA, "transferencias.ver"], lee: true, cambia: true, tablero: true },
    { nombre: "ninguno", permisos: [], lee: false, cambia: false, tablero: false },
  ];
  // Cada caso que cambia pide un día distinto del que ya rige, así un rechazo por
  // "mismo corte" no se confunde con uno de permiso.
  const dias = [2, 4];
  let n = 900100;
  for (const c of casos) {
    // La sesión opera EN el local que se prueba; el tablero se mira desde el
    // depósito, que es donde tiene sentido.
    const sesion = token(n++, id, c.permisos);
    const sesionDeposito = token(n++, f.d1.id, c.permisos);
    const antes = (await vigenciasDe(id)).length;

    const g = await leer(rutaAcuerdos.GET(pedido(urlAcuerdos, sesion)));
    ok(`${c.nombre}: leer el corte → ${c.lee ? 200 : 403}`, g.status === (c.lee ? 200 : 403), `${g.status} ${g.error ?? ""}`);
    if (c.lee) {
      const rel = g.relaciones?.find((x) => x.localId === id);
      const campos = rel ? Object.keys(rel).sort() : [];
      ok(
        `${c.nombre}: lo leído es la semana y nada comercial`,
        JSON.stringify(campos) === JSON.stringify(CAMPOS),
        JSON.stringify(campos)
      );
      ok(
        `${c.nombre}: la fila propia es configurable ${c.cambia ? "sí" : "no"}, y ninguna ajena`,
        rel?.configurable === c.cambia && !(g.relaciones || []).some((x) => x.localId !== id && x.configurable),
        JSON.stringify((g.relaciones || []).map((x) => [x.localId, x.configurable]))
      );
    }

    const dia = c.cambia ? dias.shift() : 6;
    const p = await leer(rutaAcuerdos.PUT(conCuerpo(urlAcuerdos, sesion, "PUT", { localId: id, diaDeCorte: dia })));
    const despues = (await vigenciasDe(id)).length;
    ok(
      `${c.nombre}: cambiar la semana → ${c.cambia ? 200 : 403}`,
      p.status === (c.cambia ? 200 : 403) && despues === antes + (c.cambia ? 1 : 0),
      `${p.status} ${p.error ?? ""} filas ${antes}→${despues}`
    );

    // El permiso de la semana NO abre el tablero, que sí trae importes.
    const t = await leer(rutaTablero.GET(pedido("http://ci/api/transferencias/tablero?unidad=SEMANA", sesionDeposito)));
    ok(`${c.nombre}: el tablero de Transferencias → ${c.tablero ? 200 : 403}`, t.status === (c.tablero ? 200 : 403), `${t.status}`);

    // Y la ruta de la ubicación, con la sesión en ese local.
    const sesionLocal = token(n++, id, c.permisos);
    const gc = await leer(rutaConfig.GET(pedido(urlConfig, sesionLocal)));
    ok(
      `${c.nombre}: la configuración de la ubicación → ${c.cambia ? 200 : 403}`,
      gc.status === (c.cambia ? 200 : 403),
      `${gc.status}`
    );
  }

  console.log("\n── Permisos: el alcance se sigue respetando");
  const soloSemana = [PERMISO_SEMANA_OPERATIVA];
  const deOtroGrupo = token(n++, f.L.ajeno.id, soloSemana);
  const antes = (await vigenciasDe(id)).length;
  const pAjeno = await leer(rutaAcuerdos.PUT(conCuerpo(urlAcuerdos, deOtroGrupo, "PUT", { localId: id, diaDeCorte: 1 })));
  ok("otro grupo no le cambia la semana a este local → 403", pAjeno.status === 403 && (await vigenciasDe(id)).length === antes, `${pAjeno.status}`);
  const gAjeno = await leer(rutaAcuerdos.GET(pedido(urlAcuerdos, deOtroGrupo)));
  ok(
    "y su lista no trae locales de este grupo",
    !(gAjeno.relaciones || []).some((x) => creado.localIds.includes(x.localId) && x.localId !== f.L.ajeno.id),
    `${gAjeno.status} ${JSON.stringify(gAjeno.relaciones)}`
  );
  const conQuery = await leer(rutaAcuerdos.GET(pedido(`${urlAcuerdos}?localId=${f.L.ajeno.id}`, token(n++, f.d1.id, soloSemana))));
  ok("una ubicación ajena por la query → 403", conQuery.status === 403, `${conQuery.status}`);
  const sinLocal = await leer(rutaAcuerdos.GET(pedido(urlAcuerdos, token(n++, null, soloSemana))));
  ok("sin ubicación en la sesión → 403", sinLocal.status === 403, `${sinLocal.status}`);
  const cfgAjena = await leer(rutaConfig.PUT(conCuerpo(`${urlConfig}?localId=${id}`, token(n++, f.L.uno.id, soloSemana), "PUT", { diaDeCorte: 1 })));
  ok("la ruta de la ubicación, con otra ubicación por la query → 403", cfgAjena.status === 403, `${cfgAjena.status}`);

  console.log("\n── Permisos: el administrador, por el mecanismo general");
  // Sin rol por nombre: el comodín `*` y el contexto activo, que es como
  // `resolveLocalAndGrupo` decide la ubicación de un administrador sin local fijo.
  const admin = token(n++, null, ["*"]);
  const conContexto = (url, metodo, cuerpo, localId) =>
    new Request(url, {
      method: metodo,
      headers: {
        cookie: [
          `erpazul_sesion=${admin}`,
          `erpazul_grupo_activo=${f.g1.id}`,
          ...(localId ? [`erpazul_contexto_activo=${encodeURIComponent(JSON.stringify({ localId }))}`] : []),
        ].join("; "),
        "content-type": "application/json",
      },
      ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
    });

  const ga = await leer(rutaAcuerdos.GET(conContexto(urlAcuerdos, "GET", null, id)));
  ok(
    "con contexto en el local, solo esa fila es configurable",
    ga.status === 200 && ga.relaciones?.find((x) => x.localId === id)?.configurable === true &&
      !(ga.relaciones || []).some((x) => x.localId !== id && x.configurable),
    `${ga.status} ${ga.error ?? ""} ${JSON.stringify((ga.relaciones || []).map((x) => [x.localId, x.configurable]))}`
  );
  const actual = semanaQueContiene({ vigencias: await vigenciasDe(id) }).diaDeCorte;
  const otroDia = (actual + 3) % 7;
  const pa = await leer(
    rutaAcuerdos.PUT(conContexto(urlAcuerdos, "PUT", { localId: id, diaDeCorte: otroDia }, id))
  );
  ok("cambia la semana de la ubicación de su contexto", pa.status === 200, `${pa.status} ${pa.error ?? ""}`);
  const unoAntes = await vigenciasDe(f.L.uno.id);
  const pb = await leer(
    rutaAcuerdos.PUT(conContexto(urlAcuerdos, "PUT", { localId: f.L.uno.id, diaDeCorte: otroDia }, id))
  );
  ok(
    "pero no la de otro local mientras opera en éste → 403",
    pb.status === 403 && JSON.stringify(await vigenciasDe(f.L.uno.id)) === JSON.stringify(unoAntes),
    `${pb.status} ${pb.error ?? ""}`
  );
  const pc = await leer(
    rutaAcuerdos.PUT(conContexto(urlAcuerdos, "PUT", { localId: id, diaDeCorte: otroDia }, null))
  );
  ok("sin contexto elegido, no escribe nada → 409", pc.status === 409, `${pc.status} ${pc.error ?? ""}`);
}

async function correrConfig(f) {
  console.log("\n── La ruta de la ubicación: /api/config/semana-operativa");
  const url = "http://ci/api/config/semana-operativa";
  const hoy = hoyArgentinaISO();
  const sesion = token(900010, f.L.iguales.id, [PERMISO_SEMANA_OPERATIVA]);
  const sinPermiso = token(900011, f.L.iguales.id, ["transferencias.crear"]);

  const g0 = await leer(rutaConfig.GET(pedido(url, sinPermiso)));
  ok("sin el permiso, ni leer → 403", g0.status === 403, `${g0.status}`);
  const p0 = await leer(rutaConfig.PUT(conCuerpo(url, sinPermiso, "PUT", { diaDeCorte: 1 })));
  ok("ni escribir → 403", p0.status === 403, `${p0.status}`);

  const g1 = await leer(rutaConfig.GET(pedido(url, sesion)));
  ok(
    "lee la semana de SU ubicación",
    g1.status === 200 && g1.localId === f.L.iguales.id && g1.semana?.diaDeCorte === 4 && g1.semana?.configurada === true && g1.programado === null,
    `${g1.status} ${g1.error} ${JSON.stringify(g1.semana)}`
  );
  const ajeno = await leer(rutaConfig.GET(pedido(`${url}?localId=${f.L.uno.id}`, sesion)));
  ok("otra ubicación por la query, al leer → 404", ajeno.status === 404, `${ajeno.status}`);
  const ajenoPut = await leer(rutaConfig.PUT(conCuerpo(`${url}?localId=${f.L.uno.id}`, sesion, "PUT", { diaDeCorte: 1 })));
  ok("y al escribir → 403", ajenoPut.status === 403, `${ajenoPut.status}`);

  const semana = semanaQueContiene({ vigencias: [{ diaDeCorte: 4, desde: null }], fecha: hoy });
  const frontera = sumarDias(semana.hasta, 1);
  const partida = sumarDias(frontera, 3);
  const p1 = await leer(rutaConfig.PUT(conCuerpo(url, sesion, "PUT", { diaDeCorte: 1, desde: partida })));
  ok("una fecha que PARTE una semana → 400 PARTE_SEMANA", p1.status === 400 && p1.codigo === "PARTE_SEMANA" && p1.proximaFrontera === frontera, `${p1.status} ${p1.codigo}`);
  const p2 = await leer(rutaConfig.PUT(conCuerpo(url, sesion, "PUT", { diaDeCorte: 1, desde: semana.desde })));
  ok("la semana abierta → 400 NO_FUTURA", p2.status === 400 && p2.codigo === "NO_FUTURA", `${p2.status} ${p2.codigo}`);
  const p2b = await leer(rutaConfig.PUT(conCuerpo(url, sesion, "PUT", { diaDeCorte: 9 })));
  ok("un día imposible → 400 DIA_INVALIDO", p2b.status === 400 && p2b.codigo === "DIA_INVALIDO", `${p2b.status} ${p2b.codigo}`);

  const p3 = await leer(rutaConfig.PUT(conCuerpo(url, sesion, "PUT", { diaDeCorte: 1 })));
  ok(
    "un cambio válido se programa en la próxima frontera",
    p3.status === 200 && p3.cambio?.accion === "PROGRAMAR" && p3.cambio?.desde === frontera && p3.programado?.diaDeCorte === 1,
    `${p3.status} ${p3.error}`
  );
  const p4 = await leer(rutaConfig.PUT(conCuerpo(url, sesion, "PUT", { diaDeCorte: 0 })));
  ok("un segundo pendiente sin pedir el reemplazo → 409 PENDIENTE", p4.status === 409 && p4.codigo === "PENDIENTE", `${p4.status} ${p4.codigo}`);
  const p5 = await leer(rutaConfig.PUT(conCuerpo(url, sesion, "PUT", { diaDeCorte: 0, reemplazarPendiente: true })));
  const filas = await vigenciasDe(f.L.iguales.id);
  ok(
    "pidiéndolo, lo reemplaza, y sigue habiendo UN pendiente",
    p5.status === 200 && p5.cambio?.reemplazo === true && filas.length === 2 && filas[1].diaDeCorte === 0,
    `${p5.status} ${p5.error} ${JSON.stringify(filas)}`
  );
  ok("la vigencia que ya rige quedó igual", filas[0].vigenteDesde === null && filas[0].diaDeCorte === 4 && filas[0].origen === "MIGRACION");

  console.log("\n── Lo que ya empezó no se borra ni se modifica");
  // Una historia real: rigió miércoles desde siempre y cambió a viernes desde una
  // frontera que YA PASÓ. Se siembra así porque la regla no deja programar hacia
  // atrás, que es justamente lo que se prueba.
  const conc = f.L.concurrente.id;
  await prisma.semanaOperativaVigencia.deleteMany({ where: { localId: conc } });
  const inicioDeLaDeHoy = rangoDelPeriodo({ unidad: UNIDADES.SEMANA, diaDeCorte: 3, hoy }).desde;
  const pasada = sumarDias(inicioDeLaDeHoy, -21);
  const base = await prisma.semanaOperativaVigencia.create({
    data: { localId: conc, diaDeCorte: 3, vigenteDesde: null, origen: "MANUAL" },
  });
  const empezada = await prisma.semanaOperativaVigencia.create({
    data: { localId: conc, diaDeCorte: 5, vigenteDesde: new Date(`${pasada}T00:00:00.000Z`), origen: "MANUAL" },
  });
  const sesionConc = token(900012, conc, [PERMISO_SEMANA_OPERATIVA]);
  const p6 = await leer(rutaConfig.PUT(conCuerpo(url, sesionConc, "PUT", { diaDeCorte: 1, reemplazarPendiente: true })));
  const despues = await vigenciasDe(conc);
  const intacta = (a, b) => b && a.id === b.id && a.diaDeCorte === b.diaDeCorte && iso(a.vigenteDesde) === iso(b.vigenteDesde);
  ok(
    "reemplazar pendientes no se lleva las que ya rigen",
    p6.status === 200 && despues.length === 3 && intacta(base, despues[0]) && intacta(empezada, despues[1]),
    `${p6.status} ${p6.error} ${JSON.stringify(despues)}`
  );
  const p7 = await leer(rutaConfig.PUT(conCuerpo(url, sesionConc, "PUT", { diaDeCorte: 2, desde: pasada, reemplazarPendiente: true })));
  ok("y no se puede reescribir su fecha → 400 NO_FUTURA", p7.status === 400 && p7.codigo === "NO_FUTURA", `${p7.status} ${p7.codigo}`);

  console.log("\n── Dos pedidos simultáneos sobre la misma ubicación");
  // La primera versión de este candado mandaba dos PUT con `Promise.all` y
  // quedó VERDE con el `FOR UPDATE` sacado: los dos pedidos no llegaban a
  // superponerse, así que no probaba el bloqueo. Ahora la carrera se fuerza: A
  // toma el bloqueo y se queda quieta; B tiene que ESPERARLA —si no espera, no
  // hay bloqueo— y, cuando A escribe su pendiente y confirma, B tiene que ver ese
  // pendiente y rechazar, en vez de escribir un segundo.
  await prisma.semanaOperativaVigencia.deleteMany({ where: { localId: conc, vigenteDesde: { gt: new Date(`${hoy}T00:00:00.000Z`) } } });
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
  let soltarA;
  const esperaA = new Promise((r) => (soltarA = r));
  const a = prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Local" WHERE id = ${conc} FOR UPDATE`;
      await esperaA;
      await tx.semanaOperativaVigencia.create({
        data: { localId: conc, diaDeCorte: 1, vigenteDesde: new Date(`${sumarDias(hoy, 300)}T00:00:00.000Z`), origen: "MANUAL" },
      });
    },
    { timeout: 20000 }
  );
  await pausa(300);
  let terminoB = false;
  const b = prisma
    .$transaction((tx) => programarSemanaOperativa(tx, { localId: conc, diaDeCorte: 6 }), { timeout: 20000 })
    .then(
      () => ({ ok: true }),
      (e) => ({ ok: false, codigo: e.codigo, mensaje: e.message })
    )
    .finally(() => (terminoB = true));
  await pausa(800);
  const bEspero = !terminoB;
  soltarA();
  await a;
  const rb = await b;
  const pendientes = (await vigenciasDe(conc)).filter((v) => iso(v.vigenteDesde) > hoy);
  // Esto solo dice que la carrera OCURRIÓ: B igual espera sin el `FOR UPDATE`,
  // porque su INSERT verifica la clave foránea contra la fila bloqueada de
  // `Local`. Lo que prueba el bloqueo es lo de abajo: sin él, B lee ANTES de que
  // A confirme y escribe un segundo pendiente (medido: `pendientes=2`).
  ok("la carrera ocurrió: B quedó en espera mientras A tenía la ubicación", bEspero);
  ok(
    "y al entrar vio el pendiente de A: 409 PENDIENTE, nunca dos pendientes",
    rb.ok === false && rb.codigo === "PENDIENTE" && pendientes.length === 1,
    `${JSON.stringify(rb)} pendientes=${pendientes.length}`
  );

  console.log("\n── El depósito se configura como cualquier ubicación");
  const sesionDepo = token(900013, f.d1.id, [PERMISO_SEMANA_OPERATIVA]);
  const d1 = await leer(rutaConfig.PUT(conCuerpo(url, sesionDepo, "PUT", { diaDeCorte: 3 })));
  const filasDepo = await vigenciasDe(f.d1.id);
  ok(
    "por esta puerta, sí: rige desde siempre",
    d1.status === 200 && d1.cambio?.accion === "PRIMERA" && filasDepo.length === 1 && filasDepo[0].diaDeCorte === 3,
    `${d1.status} ${d1.error}`
  );
  // Una frontera lejana elegida a mano: el primer día de una semana del corte 3
  // dentro de unos 400 días.
  const lejana = semanaQueContiene({ vigencias: [{ diaDeCorte: 3, desde: null }], fecha: sumarDias(hoy, 400) }).desde;
  const d2 = await leer(rutaConfig.PUT(conCuerpo(url, sesionDepo, "PUT", { diaDeCorte: 1, desde: lejana })));
  ok(
    "y un cambio programado a una frontera lejana elegida a mano",
    d2.status === 200 && d2.cambio?.accion === "PROGRAMAR" && d2.cambio?.desde === lejana,
    `${d2.status} ${d2.codigo} ${d2.error ?? ""}`
  );
  const d3 = await leer(rutaAcuerdos.PUT(conCuerpo("http://ci/api/transferencias/acuerdos", sesionDepo, "PUT", { localId: f.d1.id, diaDeCorte: 5 })));
  ok("pero el PUT de Transferencias lo sigue rechazando", d3.status === 400, `${d3.status}`);
}

// ── PR-2: LA PANTALLA DE LA UBICACIÓN Y CANCELAR EL CAMBIO PROGRAMADO ────────
//
// Contra la ruta real `/api/config/semana-operativa`, que es la de la pantalla
// nueva. Lo que se afirma de la cancelación:
//
//   · cancela SOLO lo que no empezó, y deja la vigencia que rige tal cual;
//   · sin nada pendiente contesta 409 SIN_PENDIENTE, sin tocar nada;
//   · nunca alcanza una vigencia que ya empezó, ni siquiera la que empieza HOY;
//   · cada ubicación cancela lo suyo: la de al lado, del mismo grupo, no se toca;
//   · la ubicación sale del alcance, nunca del pedido.
async function correrCancelacion(f) {
  console.log("\n── PR-2: la ruta de la ubicación y cancelar el cambio programado");
  const url = "http://ci/api/config/semana-operativa";
  const hoy = hoyArgentinaISO();
  const permiso = [PERMISO_SEMANA_OPERATIVA];
  const id = f.L.cancela.id;
  const vecino = f.L.vecino.id;
  const enCancela = token(900200, id, permiso);
  const enVecino = token(900201, vecino, permiso);
  const pedidoConCuerpo = (sesion, metodo, cuerpo = null) =>
    new Request(url, {
      method: metodo,
      headers: { cookie: `erpazul_sesion=${sesion}`, "content-type": "application/json" },
      ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
    });

  // Primera configuración: domingo, desde siempre.
  const p0 = await leer(rutaConfig.PUT(pedidoConCuerpo(enCancela, "PUT", { diaDeCorte: 0 })));
  ok("primera configuración de la ubicación → PRIMERA", p0.status === 200 && p0.cambio?.accion === "PRIMERA", `${p0.status} ${p0.error ?? ""}`);
  ok(
    "el GET trae la ubicación, el día de hoy y ningún cambio programado",
    p0.ubicacion?.id === id && p0.ubicacion?.nombre?.endsWith("-cancela") && p0.hoy === hoy && p0.programado === null,
    JSON.stringify({ u: p0.ubicacion, hoy: p0.hoy, prog: p0.programado })
  );

  // Sin nada pendiente: 409 y nada tocado.
  const d0 = await leer(rutaConfig.DELETE(pedidoConCuerpo(enCancela, "DELETE")));
  ok("cancelar sin cambio programado → 409 SIN_PENDIENTE", d0.status === 409 && d0.codigo === "SIN_PENDIENTE", `${d0.status} ${d0.codigo}`);

  // Programar miércoles, y la transición llega contada en el GET.
  const p1 = await leer(rutaConfig.PUT(pedidoConCuerpo(enCancela, "PUT", { diaDeCorte: 3 })));
  const esperado = previsualizarCambio({ vigencias: [{ diaDeCorte: 0, desde: null }], diaDeCorte: 3, hoy });
  ok(
    "programar: el programado del GET es EL MISMO que prometió la vista previa",
    p1.status === 200 && p1.programado?.desde === esperado.desde &&
      JSON.stringify(p1.programado?.transicion) === JSON.stringify(esperado.transicion) &&
      JSON.stringify(p1.programado?.despues) === JSON.stringify(esperado.despues),
    `${p1.status} ${JSON.stringify(p1.programado)} vs ${JSON.stringify(esperado)}`
  );

  // Reemplazo explícito, como lo pide la pantalla.
  const p2 = await leer(rutaConfig.PUT(pedidoConCuerpo(enCancela, "PUT", { diaDeCorte: 5, reemplazarPendiente: true })));
  const filas2 = await vigenciasDe(id);
  ok(
    "reemplazar: sigue habiendo UN pendiente, el nuevo",
    p2.status === 200 && p2.programado?.diaDeCorte === 5 && filas2.length === 2,
    `${p2.status} ${JSON.stringify(filas2.map((v) => [v.diaDeCorte, iso(v.vigenteDesde)]))}`
  );

  // AISLAMIENTO: el vecino del mismo grupo tiene su semana y su propio pendiente.
  await leer(rutaConfig.PUT(pedidoConCuerpo(enVecino, "PUT", { diaDeCorte: 1 })));
  await leer(rutaConfig.PUT(pedidoConCuerpo(enVecino, "PUT", { diaDeCorte: 4 })));
  ok("el vecino tiene su propio cambio programado", (await vigenciasDe(vecino)).length === 2);

  // Un localId en el cuerpo NO cambia de quién es lo que se cancela.
  const dAjeno = await leer(
    rutaConfig.DELETE(new Request(url, {
      method: "DELETE",
      headers: { cookie: `erpazul_sesion=${enVecino}`, "content-type": "application/json" },
      body: JSON.stringify({ localId: id }),
    }))
  );
  ok(
    "un `localId` en el cuerpo no cuenta: el vecino cancela SU cambio, no el de al lado",
    dAjeno.status === 200 && dAjeno.localId === vecino && (await vigenciasDe(id)).length === 2,
    `${dAjeno.status} ${dAjeno.localId} ${dAjeno.error ?? ""}`
  );
  // Se deja al vecino como estaba para lo que sigue.
  await leer(rutaConfig.PUT(pedidoConCuerpo(enVecino, "PUT", { diaDeCorte: 4 })));
  const vecinoConPendiente = JSON.stringify((await vigenciasDe(vecino)).map((v) => [v.diaDeCorte, iso(v.vigenteDesde)]));

  const cfgAjena = await leer(rutaConfig.DELETE(new Request(`${url}?localId=${vecino}`, {
    method: "DELETE",
    headers: { cookie: `erpazul_sesion=${enCancela}` },
  })));
  ok("otra ubicación por la query al cancelar → 403", cfgAjena.status === 403, `${cfgAjena.status}`);

  // CANCELAR el propio.
  const antesDeCancelar = await vigenciasDe(id);
  const vigente = antesDeCancelar.find((v) => v.vigenteDesde === null);
  const d1 = await leer(rutaConfig.DELETE(pedidoConCuerpo(enCancela, "DELETE")));
  const despues = await vigenciasDe(id);
  ok(
    "cancelar el propio → 200, y el GET vuelve con `programado: null`",
    d1.status === 200 && d1.programado === null && d1.cancelado?.[0]?.diaDeCorte === 5,
    `${d1.status} ${d1.error ?? ""} ${JSON.stringify(d1.programado)}`
  );
  ok(
    "la vigencia que rige quedó IGUAL: misma fila, mismo día",
    despues.length === 1 && despues[0].id === vigente.id && despues[0].diaDeCorte === 0 && despues[0].vigenteDesde === null,
    JSON.stringify(despues)
  );
  ok("y la semana de hoy es la de siempre", d1.semana?.diaDeCorte === 0 && d1.semana?.configurada === true);
  ok(
    "el pendiente del vecino, del mismo grupo, sigue ahí",
    JSON.stringify((await vigenciasDe(vecino)).map((v) => [v.diaDeCorte, iso(v.vigenteDesde)])) === vecinoConPendiente
  );

  const d2 = await leer(rutaConfig.DELETE(pedidoConCuerpo(enCancela, "DELETE")));
  ok("cancelar dos veces → la segunda es 409 SIN_PENDIENTE", d2.status === 409 && d2.codigo === "SIN_PENDIENTE", `${d2.status}`);

  // HISTORIA: una vigencia que ya empezó —la de hoy, y una del pasado— no se
  // cancela nunca. Se siembra así porque la regla no deja programar hacia atrás.
  const deHoy = await prisma.semanaOperativaVigencia.create({
    data: { localId: id, diaDeCorte: diaDeLaSemana(hoy), vigenteDesde: new Date(`${hoy}T00:00:00.000Z`), origen: "MANUAL" },
  });
  const historiaAntes = JSON.stringify(await vigenciasDe(id));
  const d3 = await leer(rutaConfig.DELETE(pedidoConCuerpo(enCancela, "DELETE")));
  // Dos afirmaciones y no una: la regla pura contesta el 409, y el WHERE de la
  // base es la que garantiza que la fila quede. Separadas, una contraprueba que
  // rompe solo la regla muestra que la base igual la protege.
  ok(
    "una vigencia que empieza HOY ya es historia: cancelar → 409 SIN_PENDIENTE",
    d3.status === 409 && d3.codigo === "SIN_PENDIENTE",
    `${d3.status} ${d3.codigo}`
  );
  ok("…y la fila de hoy no se borra", JSON.stringify(await vigenciasDe(id)) === historiaAntes);

  // Las dos barreras —la regla pura y el WHERE de la base— se prueban por
  // contraprueba, rompiéndolas de a una: están en el cuerpo del commit.
  // Se saca la fila sembrada para que lo que sigue parta de la historia de antes.
  // `deleteMany` y no `delete`: si una contraprueba ya la borró, la limpieza no
  // tiene que tapar el rojo de arriba con una excepción.
  await prisma.semanaOperativaVigencia.deleteMany({ where: { id: deHoy.id } });

  console.log("\n── PR-2: depósito, administrador y permisos en la ruta de la ubicación");
  // `dAjeno` es depósito de su grupo (`g2`): la ruta resuelve su grupo por ahí.
  const enDeposito = token(900202, f.dAjeno.id, permiso);
  const dep0 = await leer(rutaConfig.PUT(pedidoConCuerpo(enDeposito, "PUT", { diaDeCorte: 2 })));
  const dep1 = await leer(rutaConfig.PUT(pedidoConCuerpo(enDeposito, "PUT", { diaDeCorte: 6 })));
  const dep2 = await leer(rutaConfig.DELETE(pedidoConCuerpo(enDeposito, "DELETE")));
  ok(
    "el depósito configura, programa y cancela SU semana",
    dep0.status === 200 && dep0.ubicacion?.esDeposito === true && dep1.status === 200 && dep2.status === 200 &&
      dep2.programado === null && dep2.semana?.diaDeCorte === 2,
    `${dep0.status}/${dep1.status}/${dep2.status} ${dep0.error ?? ""} ${dep2.error ?? ""}`
  );

  const admin = token(900203, null, ["*"]);
  const conContexto = (metodo, localId, cuerpo = null) =>
    new Request(url, {
      method: metodo,
      headers: {
        cookie: [
          `erpazul_sesion=${admin}`,
          `erpazul_grupo_activo=${f.g1.id}`,
          ...(localId ? [`erpazul_contexto_activo=${encodeURIComponent(JSON.stringify({ localId }))}`] : []),
        ].join("; "),
        "content-type": "application/json",
      },
      ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
    });
  const sinCtx = await leer(rutaConfig.GET(conContexto("GET", null)));
  ok("administrador sin contexto → 409 con `needsContexto`", sinCtx.status === 409 && sinCtx.needsContexto === true, `${sinCtx.status}`);
  const a1 = await leer(rutaConfig.PUT(conContexto("PUT", id, { diaDeCorte: 6 })));
  ok("administrador con contexto programa en ESA ubicación", a1.status === 200 && a1.localId === id && a1.programado?.diaDeCorte === 6, `${a1.status} ${a1.error ?? ""}`);
  const a2 = await leer(rutaConfig.DELETE(conContexto("DELETE", id)));
  ok(
    "y cancela en ESA ubicación, sin tocar al vecino",
    a2.status === 200 && a2.programado === null &&
      JSON.stringify((await vigenciasDe(vecino)).map((v) => [v.diaDeCorte, iso(v.vigenteDesde)])) === vecinoConPendiente,
    `${a2.status}`
  );

  const sinPermiso = token(900204, id, ["transferencias.ver", "transferencias.crear"]);
  const antesSinPermiso = JSON.stringify(await vigenciasDe(vecino));
  const s1 = await leer(rutaConfig.GET(pedido(url, sinPermiso)));
  const s2 = await leer(rutaConfig.DELETE(pedidoConCuerpo(token(900205, vecino, ["transferencias.ver"]), "DELETE")));
  ok(
    "sin el permiso: ni leer ni cancelar, y nada cambia",
    s1.status === 403 && s2.status === 403 && JSON.stringify(await vigenciasDe(vecino)) === antesSinPermiso,
    `${s1.status}/${s2.status}`
  );
}

let fixture;
try {
  fixture = await montar();
  await correrBackfill(fixture);
  await correrRestricciones(fixture);
  await correrTablero(fixture);
  await correrPutViejo(fixture);
  await correrPermisos(fixture);
  await correrConfig(fixture);
  await correrCancelacion(fixture);
} finally {
  await desmontar();
  await prisma.$disconnect();
}

console.log(`\n${pasadas} comprobaciones pasaron.`);
if (fallas.length) {
  console.error("\nFallaron:");
  for (const f of fallas) console.error(`- ${f}`);
  process.exit(1);
}
