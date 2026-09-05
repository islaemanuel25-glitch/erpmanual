// PRUEBAS DE BASE DE LOS MEDIOS DE COBRO CONFIGURABLES.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/mediosCobro.mjs
//
// ── LO QUE MÁS IMPORTA ACÁ ─────────────────────────────────────────────────
//
// La NO REGRESIÓN. Todo lo demás de esta tanda es funcionalidad nueva que nadie
// está usando todavía; lo único que puede romper algo que ya funciona es que un
// local sin configurar deje de comportarse como hoy. Eso se prueba primero y con
// números, no con "parece que anda".
//
// Y el candado de la base: el índice parcial que impide dos medios activos del
// mismo tipo contable. Se ejerce INTENTANDO violarlo, porque una defensa que
// nunca se activa es una defensa que nadie sabe si corre.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });

const jwt = (await import("jsonwebtoken")).default;

const { mediosDelLocal, materializarDefaults } = await import("../../lib/pos-ventas/mediosCobroServidor.js");
const { MEDIOS_POR_DEFECTO, COMISION_PCT_DEFAULT, comisionesDeMedios, recargosDeMedios } =
  await import("../../lib/pos-ventas/mediosCobro.js");
const { aplicarComisiones } = await import("../../lib/pos-ventas/pagos.js");

const rutaMedios = await import("../../app/api/medios-cobro/route.js");
const rutaMedio = await import("../../app/api/medios-cobro/[id]/route.js");

// ═══════════════════════════════════════════════════════════════════════════

let pasadas = 0;
const fallas = [];
let seccionActual = "";
const seccion = (t) => { seccionActual = t; console.log(`\n── ${t} ${"─".repeat(Math.max(0, 64 - t.length))}`); };
function ok(t, c, d = "") {
  if (c) { pasadas += 1; console.log(`  ✓ ${t}`); }
  else { fallas.push(`[${seccionActual}] ${t}${d ? ` — ${d}` : ""}`); console.log(`  ✗ ${t}${d ? ` — ${d}` : ""}`); }
}
const igual = (t, o, e) =>
  ok(t, JSON.stringify(o) === JSON.stringify(e), `esperado ${JSON.stringify(e)}, obtenido ${JSON.stringify(o)}`);

const SECRETO = process.env.AUTH_SECRET;
const token = (usuarioId, localId, grupoId, permisos = ["*"]) =>
  jwt.sign({ id: usuarioId, nombre: "CI", email: `ci${usuarioId}@l`, localId, grupoId, permisos }, SECRETO, { expiresIn: "1h" });

const pedido = (url, { metodo = "GET", cuerpo, sesion } = {}) =>
  new Request(url, {
    method: metodo,
    headers: { cookie: `erpazul_sesion=${sesion}`, "content-type": "application/json" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
const leer = async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) });
const params = (id) => ({ params: Promise.resolve({ id: String(id) }) });

const marca = `ci-medios-${Date.now()}`;
const creado = { grupoId: null, localAId: null, localBId: null, localNuevoId: null, usuarioId: null, cajeroId: null, rolId: null, rolCajeroId: null };

async function montar() {
  const rol = await prisma.rol.create({ data: { nombre: `${marca}-rol`, permisos: ["*"] } });
  // Un usuario con `pos.usar` y NADA de configuración: el que prueba el permiso.
  const rolCajero = await prisma.rol.create({ data: { nombre: `${marca}-cajero`, permisos: ["pos.usar"] } });
  creado.rolId = rol.id; creado.rolCajeroId = rolCajero.id;

  const grupo = await prisma.grupo.create({ data: { nombre: `${marca}-grupo` } });
  creado.grupoId = grupo.id;
  // Las comisiones del grupo, distintas entre sí para que un error de mapeo se vea.
  await prisma.configuracionGrupo.create({
    data: { grupoId: grupo.id, comisionDebito: 7, comisionCredito: 10, comisionMercadopago: 5 },
  });

  const localA = await prisma.local.create({ data: { nombre: `${marca}-A` } });
  const localB = await prisma.local.create({ data: { nombre: `${marca}-B` } });
  creado.localAId = localA.id; creado.localBId = localB.id;
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: localA.id } });
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: localB.id } });

  const usuario = await prisma.usuario.create({
    data: { nombre: "CI", email: `${marca}@l`, passwordHash: "x", rolId: rol.id, localId: localA.id },
  });
  const cajero = await prisma.usuario.create({
    data: { nombre: "Cajero", email: `${marca}-c@l`, passwordHash: "x", rolId: rolCajero.id, localId: localA.id },
  });
  creado.usuarioId = usuario.id; creado.cajeroId = cajero.id;

  return {
    grupo, localA, localB,
    sesionA: token(usuario.id, localA.id, grupo.id),
    sesionB: token(usuario.id, localB.id, grupo.id),
    sesionCajero: token(cajero.id, localA.id, grupo.id, ["pos.usar"]),
  };
}

async function desmontar() {
  if (!creado.grupoId) return;
  const locales = [creado.localAId, creado.localBId, creado.localNuevoId].filter(Boolean);
  await prisma.medioCobroLocal.deleteMany({ where: { localId: { in: locales } } });
  await prisma.recargoPagoLocal.deleteMany({ where: { localId: { in: locales } } });
  await prisma.usuario.deleteMany({ where: { id: { in: [creado.usuarioId, creado.cajeroId].filter(Boolean) } } });
  await prisma.grupoLocal.deleteMany({ where: { grupoId: creado.grupoId } });
  await prisma.configuracionGrupo.deleteMany({ where: { grupoId: creado.grupoId } });
  await prisma.local.deleteMany({ where: { id: { in: locales } } });
  await prisma.grupo.deleteMany({ where: { id: creado.grupoId } });
  await prisma.rol.deleteMany({ where: { id: { in: [creado.rolId, creado.rolCajeroId].filter(Boolean) } } });
}

// ═══════════════════════════════════════════════════════════════════════════

async function correr(f) {
  const { grupo, localA, localB, sesionA, sesionB, sesionCajero } = f;

  // ─────────────────────────────────────────────────────────────────────────
  seccion("1. Sin configurar nada: el POS de hoy");

  const sinConfig = await mediosDelLocal(prisma, { localId: localA.id, grupoId: grupo.id });
  igual("los cuatro medios de hoy, en el orden de hoy",
    sinConfig.map((m) => m.tipoContable), ["EFECTIVO", "DEBITO", "CREDITO", "MERCADOPAGO"]);
  igual("con los nombres de hoy",
    sinConfig.map((m) => m.nombre), ["Efectivo", "Débito", "Crédito", "Mercado Pago"]);
  ok("los cuatro activos", sinConfig.every((m) => m.activo));
  ok("marcados como default, no como decisión de nadie", sinConfig.every((m) => m.esDefault));
  igual("cero filas en la tabla: la migración no sembró nada",
    await prisma.medioCobroLocal.count({ where: { localId: localA.id } }), 0);

  // ─────────────────────────────────────────────────────────────────────────
  seccion("E. Comisión heredada: los mismos números que ConfiguracionGrupo");

  const comisiones = comisionesDeMedios(sinConfig);
  igual("débito hereda el 7 del grupo", comisiones.DEBITO, 7);
  igual("crédito hereda el 10", comisiones.CREDITO, 10);
  igual("Mercado Pago hereda el 5", comisiones.MERCADOPAGO, 5);
  ok("y las tres figuran como heredadas",
    sinConfig.filter((m) => m.tipoContable !== "EFECTIVO").every((m) => m.comisionHeredada));

  // El resultado FINAL, que es lo que se le cobra al comercio.
  const conComision = aplicarComisiones([{ medio: "DEBITO", monto: 10000 }], comisiones);
  igual("una venta de $10.000 con débito deja $700 de comisión", Number(conComision[0].comision), 700);
  igual("y $9.300 de neto", Number(conComision[0].neto), 9300);

  // ─────────────────────────────────────────────────────────────────────────
  seccion("I. Un local creado DESPUÉS de la migración");

  const nuevo = await prisma.local.create({ data: { nombre: `${marca}-nuevo` } });
  creado.localNuevoId = nuevo.id;
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: nuevo.id } });

  const delNuevo = await mediosDelLocal(prisma, { localId: nuevo.id, grupoId: grupo.id });
  igual("arranca con los mismos cuatro medios, sin que nadie haya hecho nada",
    delNuevo.map((m) => m.tipoContable), ["EFECTIVO", "DEBITO", "CREDITO", "MERCADOPAGO"]);
  igual("y con las comisiones del grupo", comisionesDeMedios(delNuevo), { DEBITO: 7, CREDITO: 10, MERCADOPAGO: 5 });
  // Esto es lo que un backfill no habría cubierto: el local no existía el día del
  // despliegue y aun así funciona.

  // ─────────────────────────────────────────────────────────────────────────
  seccion("2. Desactivar un medio en A no toca a B");

  const listado = await leer(await rutaMedios.GET(pedido(`http://ci/api/medios-cobro?localId=${localA.id}`, { sesion: sesionA })));
  ok("la ruta responde ok", listado.ok === true, listado.error);
  ok("y avisa que está usando defaults", listado.usandoDefaults === true);

  const debitoA = listado.medios.find((m) => m.tipoContable === "DEBITO");
  const apagado = await leer(
    await rutaMedio.PATCH(
      pedido(`http://ci/api/medios-cobro/${debitoA.id ?? 0}`, {
        metodo: "PATCH", sesion: sesionA, cuerpo: { activo: false, tipoContable: "DEBITO" },
      }),
      params(debitoA.id ?? 0)
    )
  );
  ok("apagar débito responde ok", apagado.ok === true, apagado.error);

  igual("la primera edición materializó los CUATRO defaults",
    await prisma.medioCobroLocal.count({ where: { localId: localA.id } }), MEDIOS_POR_DEFECTO.length);

  const traApagar = await mediosDelLocal(prisma, { localId: localA.id, grupoId: grupo.id });
  igual("en A quedan tres visibles",
    traApagar.filter((m) => m.activo).map((m) => m.tipoContable), ["EFECTIVO", "CREDITO", "MERCADOPAGO"]);
  ok("y débito sigue existiendo, apagado", traApagar.some((m) => m.tipoContable === "DEBITO" && !m.activo));

  const enB = await mediosDelLocal(prisma, { localId: localB.id, grupoId: grupo.id });
  igual("en B siguen los cuatro", enB.filter((m) => m.activo).length, 4);
  igual("y B no tiene ni una fila propia", await prisma.medioCobroLocal.count({ where: { localId: localB.id } }), 0);

  // ─────────────────────────────────────────────────────────────────────────
  seccion("3 y 4. Orden y nombre configurables");

  const mpA = (await prisma.medioCobroLocal.findFirst({ where: { localId: localA.id, tipoContable: "MERCADOPAGO" } }));
  const renombrado = await leer(
    await rutaMedio.PATCH(
      pedido(`http://ci/api/medios-cobro/${mpA.id}`, {
        metodo: "PATCH", sesion: sesionA, cuerpo: { nombre: "MP QR", orden: 0 },
      }),
      params(mpA.id)
    )
  );
  ok("renombrar y reordenar responde ok", renombrado.ok === true, renombrado.error);

  const traRenombrar = await mediosDelLocal(prisma, { localId: localA.id, grupoId: grupo.id });
  igual("el orden nuevo manda", traRenombrar[0].nombre, "MP QR");
  // ─── 5 ───
  igual("y el TIPO CONTABLE no se movió con el nombre", traRenombrar[0].tipoContable, "MERCADOPAGO");

  // ─────────────────────────────────────────────────────────────────────────
  seccion("A, B, C. Dos medios activos del mismo tipo contable");

  const choque = await leer(
    await rutaMedios.POST(
      pedido("http://ci/api/medios-cobro", {
        metodo: "POST", sesion: sesionA,
        cuerpo: { nombre: "MP Crédito", tipoContable: "CREDITO", procesador: "MERCADOPAGO", activo: true, orden: 9 },
      })
    )
  );
  igual("crear un segundo CREDITO activo se rechaza", choque.ok, false);
  igual("con 409, que es un conflicto y no un error del servidor", choque.status, 409);
  ok("y el mensaje explica la consecuencia, no nombra una restricción",
    /pago dividido|se rechazaría en la caja/.test(choque.error || ""), choque.error);

  // ─── B: uno activo y otro inactivo del mismo tipo ───
  const inactivo = await leer(
    await rutaMedios.POST(
      pedido("http://ci/api/medios-cobro", {
        metodo: "POST", sesion: sesionA,
        cuerpo: { nombre: "MP Crédito", tipoContable: "CREDITO", procesador: "MERCADOPAGO", activo: false, orden: 9 },
      })
    )
  );
  ok("el mismo tipo INACTIVO sí se puede crear", inactivo.ok === true, inactivo.error);

  // ─── C: activarlo después ───
  const activarDespues = await leer(
    await rutaMedio.PATCH(
      pedido(`http://ci/api/medios-cobro/${inactivo.medioId}`, { metodo: "PATCH", sesion: sesionA, cuerpo: { activo: true } }),
      params(inactivo.medioId)
    )
  );
  igual("activarlo después se rechaza", activarDespues.ok, false);
  igual("también con 409", activarDespues.status, 409);

  // ─── el candado de la BASE, ejercido a propósito ───
  try {
    await prisma.medioCobroLocal.create({
      data: { localId: localA.id, nombre: "Colado", activo: true, orden: 99, tipoContable: "CREDITO" },
    });
    ok("el índice parcial RECHAZA dos activos del mismo tipo", false, "la fila entró: el índice no está haciendo nada");
  } catch (err) {
    ok("el índice parcial RECHAZA dos activos del mismo tipo",
      /MedioCobroLocal_tipo_activo_key|unique/i.test(String(err?.message)),
      `rechazó por otro motivo: ${String(err?.message).split("\n")[0]}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  seccion("D. MP Débito + MP Crédito + MP QR conviven");

  await prisma.medioCobroLocal.deleteMany({ where: { localId: localB.id } });
  await prisma.medioCobroLocal.createMany({
    data: [
      { localId: localB.id, nombre: "Efectivo", activo: true, orden: 1, tipoContable: "EFECTIVO" },
      { localId: localB.id, nombre: "MP Débito", activo: true, orden: 2, tipoContable: "DEBITO", procesador: "MERCADOPAGO" },
      { localId: localB.id, nombre: "MP Crédito", activo: true, orden: 3, tipoContable: "CREDITO", procesador: "MERCADOPAGO" },
      { localId: localB.id, nombre: "MP QR", activo: true, orden: 4, tipoContable: "MERCADOPAGO", procesador: "MERCADOPAGO" },
    ],
  });
  const mpTodos = await mediosDelLocal(prisma, { localId: localB.id, grupoId: grupo.id });
  igual("los cuatro conviven", mpTodos.filter((m) => m.activo).length, 4);
  igual("tres pasan por Mercado Pago",
    mpTodos.filter((m) => m.procesador === "MERCADOPAGO").length, 3);
  igual("y sus tipos contables son distintos",
    [...new Set(mpTodos.map((m) => m.tipoContable))].length, 4);
  // ─── 6 ───
  const mpDeb = mpTodos.find((m) => m.nombre === "MP Débito");
  igual("MP Débito es tipo DEBITO", mpDeb.tipoContable, "DEBITO");
  igual("con procesador MERCADOPAGO", mpDeb.procesador, "MERCADOPAGO");
  igual("y hereda la comisión de DEBITO del grupo, no la de MP", mpDeb.comisionPct, 7);

  // ─────────────────────────────────────────────────────────────────────────
  seccion("F, G, H. Override de comisión");

  const debB = await prisma.medioCobroLocal.findFirst({ where: { localId: localB.id, tipoContable: "DEBITO" } });
  await leer(
    await rutaMedio.PATCH(
      pedido(`http://ci/api/medios-cobro/${debB.id}`, { metodo: "PATCH", sesion: sesionB, cuerpo: { comisionPct: 3.5 } }),
      params(debB.id)
    )
  );

  const conOverride = await mediosDelLocal(prisma, { localId: localB.id, grupoId: grupo.id });
  const debConOv = conOverride.find((m) => m.tipoContable === "DEBITO");
  igual("B usa su override de 3,5 %", Number(debConOv.comisionPct), 3.5);
  ok("y NO figura como heredada", debConOv.comisionHeredada === false);

  const enAsinOverride = await mediosDelLocal(prisma, { localId: localA.id, grupoId: grupo.id });
  igual("A sigue heredando el 7 del grupo",
    Number(enAsinOverride.find((m) => m.tipoContable === "DEBITO").comisionPct), 7);

  // ─── H: mover la comisión del GRUPO ───
  await prisma.configuracionGrupo.update({ where: { grupoId: grupo.id }, data: { comisionDebito: 9 } });
  const traCambiarGrupo = await mediosDelLocal(prisma, { localId: localA.id, grupoId: grupo.id });
  igual("el que hereda sigue al grupo: pasa a 9",
    Number(traCambiarGrupo.find((m) => m.tipoContable === "DEBITO").comisionPct), 9);
  const bTraCambio = await mediosDelLocal(prisma, { localId: localB.id, grupoId: grupo.id });
  igual("el que tiene override NO se mueve: sigue en 3,5",
    Number(bTraCambio.find((m) => m.tipoContable === "DEBITO").comisionPct), 3.5);
  await prisma.configuracionGrupo.update({ where: { grupoId: grupo.id }, data: { comisionDebito: 7 } });

  // ─────────────────────────────────────────────────────────────────────────
  seccion("J. El recargo sigue saliendo de RecargoPagoLocal");

  await prisma.recargoPagoLocal.create({ data: { localId: localB.id, medio: "DEBITO", porcentaje: 5 } });
  const conRecargo = await mediosDelLocal(prisma, { localId: localB.id, grupoId: grupo.id });
  const debConRec = conRecargo.find((m) => m.tipoContable === "DEBITO");
  igual("el medio muestra el 5 % de RecargoPagoLocal", Number(debConRec.recargoPct), 5);
  igual("y su comisión sigue siendo otra cosa", Number(debConRec.comisionPct), 3.5);
  ok("recargo y comisión no se pisan", Number(debConRec.recargoPct) !== Number(debConRec.comisionPct));
  igual("el puente al motor lleva el recargo por TIPO", recargosDeMedios(conRecargo).DEBITO, 5);
  igual("y MedioCobroLocal no tiene ninguna columna de recargo",
    await prisma.$queryRaw`SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_name='MedioCobroLocal' AND column_name ILIKE '%recargo%'`.then((r) => r[0].n), 0);

  // ─────────────────────────────────────────────────────────────────────────
  seccion("17 y 18. Permisos y entradas inválidas");

  const cajeroLee = await leer(await rutaMedios.GET(pedido(`http://ci/api/medios-cobro?localId=${localA.id}`, { sesion: sesionCajero })));
  ok("el cajero PUEDE leer sus medios: los necesita para cobrar", cajeroLee.ok === true, cajeroLee.error);

  const cajeroEdita = await leer(
    await rutaMedios.POST(
      pedido("http://ci/api/medios-cobro", {
        metodo: "POST", sesion: sesionCajero, cuerpo: { nombre: "X", tipoContable: "EFECTIVO" },
      })
    )
  );
  igual("pero NO puede crear medios", cajeroEdita.ok, false);
  igual("y recibe 403", cajeroEdita.status, 403);

  for (const [caso, cuerpo] of [
    ["un tipo contable inventado", { nombre: "X", tipoContable: "CRIPTO" }],
    ["FIADO, que no es un medio de cobro", { nombre: "X", tipoContable: "FIADO" }],
    ["un procesador inventado", { nombre: "X", tipoContable: "EFECTIVO", procesador: "PAYPAL" }],
    ["una comisión fuera de rango", { nombre: "X", tipoContable: "EFECTIVO", comisionPct: 250 }],
    ["un nombre vacío", { nombre: "   ", tipoContable: "EFECTIVO" }],
  ]) {
    const r = await leer(await rutaMedios.POST(pedido("http://ci/api/medios-cobro", { metodo: "POST", sesion: sesionA, cuerpo })));
    ok(`se rechaza ${caso}`, r.ok === false && r.status === 400, `status ${r.status}: ${r.error}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  seccion("Aislamiento entre locales");

  const ajeno = await leer(
    await rutaMedio.PATCH(
      pedido(`http://ci/api/medios-cobro/${debB.id}`, { metodo: "PATCH", sesion: sesionA, cuerpo: { nombre: "Robado" } }),
      params(debB.id)
    )
  );
  igual("no se puede editar un medio de OTRO local", ajeno.ok, false);
  igual("y contesta 404, sin revelar que existe", ajeno.status, 404);
  const bIntacto = await prisma.medioCobroLocal.findUnique({ where: { id: debB.id }, select: { nombre: true } });
  igual("el medio ajeno quedó intacto", bIntacto.nombre, "MP Débito");

  // ─────────────────────────────────────────────────────────────────────────
  seccion("No quedarse sin medios");

  await prisma.medioCobroLocal.deleteMany({ where: { localId: creado.localNuevoId } });
  await materializarDefaults(prisma, { localId: creado.localNuevoId });
  const delNuevoFilas = await prisma.medioCobroLocal.findMany({ where: { localId: creado.localNuevoId } });
  await prisma.medioCobroLocal.updateMany({
    where: { localId: creado.localNuevoId, id: { not: delNuevoFilas[0].id } },
    data: { activo: false },
  });
  const ultimo = await leer(
    await rutaMedio.DELETE(
      pedido(`http://ci/api/medios-cobro/${delNuevoFilas[0].id}`, { metodo: "DELETE", sesion: token(creado.usuarioId, creado.localNuevoId, grupo.id) }),
      params(delNuevoFilas[0].id)
    )
  );
  igual("borrar el ÚNICO medio activo se rechaza", ultimo.ok, false);
  ok("y explica que el POS quedaría sin botones", /sin botones/.test(ultimo.error || ""), ultimo.error);
}

// ═══════════════════════════════════════════════════════════════════════════

let codigo = 0;
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
  for (const f of fallas) console.log(`  ✗ ${f}`);
  codigo = 1;
}
process.exit(codigo);
