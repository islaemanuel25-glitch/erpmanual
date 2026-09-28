// PRUEBA DE BASE: UN `destino` EN LA URL NO AMPLÍA EL ALCANCE DEL TABLERO.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/transferenciasAlcance.mjs
//
// `/api/transferencias/tablero` acepta `?destino=` para que el DEPÓSITO abra la
// cuenta de uno de sus locales. Un LOCAL no lo manda —su cuenta es la suya—, pero
// la URL se puede escribir a mano. Hasta esta prueba, para un local el destino
// pedido REEMPLAZABA su propio `destinoId` en el filtro, y con eso un local leía
// las transferencias que otra ubicación recibía, de su grupo o de otro. Y un
// DEPÓSITO que pedía un local de otro grupo no traía transferencias, pero sí el
// corte de la Semana Operativa de ese local.
//
// Llama al handler real con sesiones firmadas como las firma el login, contra
// PostgreSQL:
//
//   1. el local sin destino, y con su propio destino: su cuenta;
//   2. el local pidiendo otro local de su grupo, uno de otro grupo, uno que no
//      existe y uno que no es un número: 403, sin datos;
//   3. el depósito: su entrada, y la cuenta de cualquiera de sus locales;
//      3.bis, fuera de su grupo, inexistente o inválido: 403 con solo `ok` y
//      `error`, sin el corte de semana, el nombre ni el primer movimiento;
//   4. el admin en vista global: lo mismo que el depósito del grupo activo;
//   5. el admin en vista LOCAL sobre un local: como ese local.
//
// Siembra sus propios datos con una marca única y los borra al terminar.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });
const jwt = (await import("jsonwebtoken")).default;
const rutaTablero = await import("../../app/api/transferencias/tablero/route.js");
const { DEFAULT_PERMISOS_SISTEMA, ENCARGADO } = await import("../../lib/rbac/systemRoles.js");
// La semana de X se programa por la ÚNICA puerta que escribe vigencias; las filas
// se van con el local, por la cascada.
const { programarSemanaOperativa } = await import("../../lib/semanaOperativa/semanaOperativaServer.js");

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

// Las sesiones, con la forma del payload de `app/api/login/route.js`.
const sesion = ({ id, localId, permisos, esDeposito = false }) =>
  jwt.sign(
    { id, nombre: `CI ${id}`, email: `alcance-${id}@ci.local`, rolId: null, rolNombre: null, permisos, esDuenoLocal: false, localId, esDeposito },
    process.env.AUTH_SECRET,
    { expiresIn: "1h" }
  );
const pedir = async (params, cookie) => {
  const qs = new URLSearchParams({ unidad: "SEMANA", desplazamiento: "0", ...params }).toString();
  const r = await rutaTablero.GET(new Request(`http://ci.local/api/transferencias/tablero?${qs}`, { headers: { cookie } }));
  return { status: r.status, ...(await r.json().catch(() => ({}))) };
};
const idsDe = (r) => (r.periodo?.transferencias || []).map((t) => t.id).sort((a, b) => a - b);

const marca = `ci-alcance-${Date.now()}`;
const creado = { grupoIds: [], localIds: [], clienteIds: [], baseIds: [], plIds: [], transferenciaIds: [] };

async function montar() {
  const grupo = async (n) => {
    const g = await prisma.grupo.create({ data: { nombre: `${marca}-${n}` } });
    creado.grupoIds.push(g.id);
    return g;
  };
  const local = async (n, es_deposito = false) => {
    const l = await prisma.local.create({ data: { nombre: `${marca}-${n}`, es_deposito } });
    creado.localIds.push(l.id);
    return l;
  };
  const G = { uno: await grupo("g1"), dos: await grupo("g2") };
  const L = { D: await local("deposito", true), A: await local("A"), B: await local("B"), D2: await local("deposito-2", true), X: await local("X-otro-grupo") };
  await prisma.grupoDeposito.create({ data: { grupoId: G.uno.id, localId: L.D.id } });
  await prisma.grupoDeposito.create({ data: { grupoId: G.dos.id, localId: L.D2.id } });
  for (const [g, l] of [[G.uno, L.A], [G.uno, L.B], [G.dos, L.X]]) await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: l.id } });
  // Operan por transferencia: sin cliente vinculado no aparecen en las listas del depósito.
  for (const [g, l] of [[G.uno, L.A], [G.uno, L.B], [G.dos, L.X]]) {
    const c = await prisma.cliente.create({ data: { grupoId: g.id, nombre: `${marca}-cliente-${l.id}`, localVinculadoId: l.id } });
    creado.clienteIds.push(c.id);
  }

  const producto = async (grupoId, localId, nombre) => {
    const [b] = await prisma.$queryRawUnsafe(
      `INSERT INTO "ProductoBase" ("grupoId","nombre","codigo_barra","unidad_medida","precio_costo","precio_venta","updatedAt")
       VALUES ($1, $2, $3, 'unidad', 100, 150, now()) RETURNING "id"`,
      grupoId,
      `${marca}-${nombre}`,
      `${marca}-${nombre}`
    );
    creado.baseIds.push(b.id);
    const [pl] = await prisma.$queryRawUnsafe(`INSERT INTO "ProductoLocal" ("localId","baseId","updatedAt") VALUES ($1, $2, now()) RETURNING "id"`, localId, b.id);
    creado.plIds.push(pl.id);
    return pl.id;
  };
  const pD = await producto(G.uno.id, L.D.id, "del-deposito");
  const pD2 = await producto(G.dos.id, L.D2.id, "del-deposito-2");

  // Transferencias de HOY, así caen en el período en curso de cualquier corte.
  const transferencia = async (origenId, destinoId, productoId, cantidad, precioCosto) => {
    const t = await prisma.transferencia.create({
      // La línea con la forma que deja el envío: `unidadEnviada` siempre está
      // (como en `recepcionTransferencias.mjs`); sin ella el tablero no valoriza.
      data: {
        origenId,
        destinoId,
        estado: "Enviada",
        fechaEnvio: new Date(),
        detalle: { create: [{ productoId, cantidad, precioCosto, unidadEnviada: "UNIDAD" }] },
      },
    });
    creado.transferenciaIds.push(t.id);
    return t.id;
  };
  const T = {
    aA: await transferencia(L.D.id, L.A.id, pD, 2, 100),
    aB: await transferencia(L.D.id, L.B.id, pD, 7, 333),
    aB2: await transferencia(L.D.id, L.B.id, pD, 1, 333),
    aX: await transferencia(L.D2.id, L.X.id, pD2, 5, 777),
    // Una que el depósito D despachó a X, de OTRO grupo. Hoy crear una así se
    // rechaza —`pos-transferencias/crear` exige el mismo grupo—, pero queda en la
    // historia si X se cambia de grupo después. Si el filtro por origen fuera la
    // única barrera, D la vería con `?destino=X`.
    dX: await transferencia(L.D.id, L.X.id, pD, 4, 555),
  };
  // X tiene su semana configurada, con corte MIÉRCOLES (3): distinto del
  // domingo por defecto, así una fuga del corte se distingue de un default.
  await prisma.$transaction((tx) => programarSemanaOperativa(tx, { localId: L.X.id, diaDeCorte: 3 }));
  return { G, L, T };
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
  const { G, L, T } = await montar();
  const permisos = DEFAULT_PERMISOS_SISTEMA[ENCARGADO];
  const S = {
    localA: `erpazul_sesion=${sesion({ id: 201, localId: L.A.id, permisos })}`,
    deposito: `erpazul_sesion=${sesion({ id: 202, localId: L.D.id, permisos, esDeposito: true })}`,
  };
  const admin = sesion({ id: 203, localId: null, permisos: ["*"] });
  const adminGlobal = `erpazul_sesion=${admin}; erpazul_grupo_activo=${G.uno.id}; erpazul_contexto_activo=${encodeURIComponent(json({ global: true }))}`;
  const adminEnA = `erpazul_sesion=${admin}; erpazul_grupo_activo=${G.uno.id}; erpazul_contexto_activo=${encodeURIComponent(json({ localId: L.A.id, esDeposito: false }))}`;
  ok("el ENCARGADO tiene transferencias.ver: es el rol real que abre el tablero", permisos.includes("transferencias.ver"));

  console.log("\n── 1. El local, con su cuenta");
  {
    const sin = await pedir({}, S.localA);
    ok(
      "sin destino: su cuenta, con SU transferencia y ninguna otra",
      sin.status === 200 && sin.vista === "UN_LOCAL" && sin.local?.id === L.A.id && json(idsDe(sin)) === json([T.aA]),
      json({ s: sin.status, v: sin.vista, l: sin.local, ids: idsDe(sin), e: sin.error })
    );
    const propio = await pedir({ destino: String(L.A.id) }, S.localA);
    ok("con destino = su propio local: lo mismo", propio.status === 200 && propio.local?.id === L.A.id && json(idsDe(propio)) === json([T.aA]), json({ s: propio.status, ids: idsDe(propio) }));
    const entrada = await pedir({ entrada: "1" }, S.localA);
    ok("con entrada=1, como la manda la pantalla: su cuenta, no la lista del depósito", entrada.status === 200 && entrada.vista === "UN_LOCAL" && entrada.local?.id === L.A.id);
  }

  console.log("\n── 2. El local pidiendo otra ubicación: 403, sin datos");
  for (const [nombre, destino] of [
    ["otro local de su grupo (B)", String(L.B.id)],
    ["un local de OTRO grupo (X)", String(L.X.id)],
    ["su depósito", String(L.D.id)],
    ["un local que no existe", "999999999"],
    ["algo que no es un número", "-3"],
  ]) {
    const r = await pedir({ destino }, S.localA);
    ok(
      `destino = ${nombre}: 403, sin transferencias ni cuenta`,
      r.status === 403 && r.ok === false && r.periodo === undefined && r.local === undefined,
      json({ s: r.status, vista: r.vista, local: r.local, ids: idsDe(r), aPagar: r.periodo?.aPagar, corte: r.local?.diaDeCorte, primer: r.primerMovimiento })
    );
  }

  console.log("\n── 3. El depósito, que sí elige local");
  {
    const entrada = await pedir({ entrada: "1" }, S.deposito);
    ok(
      "su entrada: la lista de sus locales, sin el de otro grupo",
      entrada.status === 200 && entrada.vista === "ENTRADA" && entrada.locales.some((l) => l.localId === L.B.id) && !entrada.locales.some((l) => l.localId === L.X.id),
      json(entrada.locales)
    );
    const b = await pedir({ destino: String(L.B.id) }, S.deposito);
    ok("la cuenta de B: sus dos transferencias", b.status === 200 && b.local?.id === L.B.id && json(idsDe(b)) === json([T.aB, T.aB2].sort((x, y) => x - y)), json({ s: b.status, ids: idsDe(b) }));
    ok(
      "y trae el corte de B y su primer movimiento, que son de su grupo",
      b.local?.nombre?.endsWith("-B") && typeof b.local?.diaDeCorte === "number" && b.primerMovimiento !== undefined
    );
  }

  console.log("\n── 3.bis El depósito pidiendo fuera de su grupo: 403, sin NADA del local pedido");
  // La forma exacta de un rechazo: solo `ok` y `error`. Cualquier otra clave
  // —local, periodo, diaDeCorte, sinConfigurar, primerMovimiento— sería algo
  // derivado del local pedido.
  const soloElRechazo = (r, error) => r.status === 403 && r.ok === false && r.error === error && json(Object.keys(r).sort()) === json(["error", "ok", "status"]);
  for (const [nombre, destino, error] of [
    ["un local de OTRO grupo (X), con semana configurada y una transferencia de este depósito", String(L.X.id), "Local fuera de tu alcance."],
    ["un local que no existe", "999999999", "Local fuera de tu alcance."],
    ["el propio depósito, que no es uno de sus locales", String(L.D.id), "Local fuera de tu alcance."],
    ["un número negativo", "-3", "Local inválido."],
    ["algo que no es un número", "abc", "Local inválido."],
  ]) {
    const r = await pedir({ destino }, S.deposito);
    ok(
      `destino = ${nombre}: 403 "${error}" y nada más`,
      soloElRechazo(r, error),
      json({ s: r.status, claves: Object.keys(r), local: r.local, ids: idsDe(r), corte: r.local?.diaDeCorte, primer: r.primerMovimiento })
    );
  }
  {
    const x = await pedir({ destino: String(L.X.id) }, S.deposito);
    const texto = json(x);
    ok(
      "ni el corte miércoles de X, ni su transferencia, ni su nombre, ni la fecha del primer movimiento",
      !/diaDeCorte|sinConfigurar|primerMovimiento|aPagar|X-otro-grupo/.test(texto) && !texto.includes(String(T.dX)),
      texto
    );
  }

  console.log("\n── 4. El admin en vista global");
  {
    const b = await pedir({ destino: String(L.B.id) }, adminGlobal);
    ok("la cuenta de B, como el depósito del grupo", b.status === 200 && b.local?.id === L.B.id && json(idsDe(b)) === json([T.aB, T.aB2].sort((x, y) => x - y)), json({ s: b.status, ids: idsDe(b) }));
    const x = await pedir({ destino: String(L.X.id) }, adminGlobal);
    ok("X, de otro grupo que el activo: 403 y nada más, como el depósito del grupo", soloElRechazo(x, "Local fuera de tu alcance."), json({ s: x.status, claves: Object.keys(x), corte: x.local?.diaDeCorte }));
    const sin = await pedir({}, adminGlobal);
    // Sin destino no se pide ningún local: es la lista de lo que el depósito
    // despachó, y esa lista no cambia con este arreglo.
    ok("sin destino: la vista del depósito, con el bloque de B", sin.status === 200 && sin.vista === "DEPOSITO" && (sin.bloques || []).some((b) => b.localId === L.B.id), json({ s: sin.status, v: sin.vista }));
  }

  console.log("\n── 5. El admin en vista LOCAL sobre A");
  {
    const a = await pedir({}, adminEnA);
    ok("sin destino: la cuenta de A", a.status === 200 && a.local?.id === L.A.id && json(idsDe(a)) === json([T.aA]), json({ s: a.status, ids: idsDe(a) }));
    const b = await pedir({ destino: String(L.B.id) }, adminEnA);
    ok("con destino = B: 403, como el local; para mirar B se cambia de contexto", b.status === 403 && b.periodo === undefined, json({ s: b.status, ids: idsDe(b) }));
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
