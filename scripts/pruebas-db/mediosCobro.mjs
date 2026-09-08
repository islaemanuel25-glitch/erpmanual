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

const { mediosDelLocal, materializarDefaults, aplicarCambioDeMedio } =
  await import("../../lib/pos-ventas/mediosCobroServidor.js");
const { MEDIOS_POR_DEFECTO, comisionesDeMedios, recargosDeMedios, resolverComision } =
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
const creado = { grupoId: null, localAId: null, localBId: null, localNuevoId: null, localMPId: null, usuarioId: null, cajeroId: null, rolId: null, rolCajeroId: null, grupoSinComisionId: null, ventaHistoricaId: null, medioMPId: null, medioBancoId: null };

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
  const locales = [creado.localAId, creado.localBId, creado.localNuevoId, creado.localMPId].filter(Boolean);
  // PRIMERO las ventas: apuntan al usuario y al local, así que borrarlas después
  // hacía fallar el `deleteMany` de usuarios por clave foránea y dejaba la
  // limpieza a medias. Sus tenders se van por el `onDelete: Cascade` de
  // `VentaPago`.
  //
  // Se borran POR LOCAL y no por una lista de ids anotados uno por uno: las
  // secciones de modalidades crean cinco ventas y esa lista se desactualiza sola
  // la próxima vez que alguien agregue una. Los locales son de esta corrida
  // —nacen en `montar`— así que no hay nada ajeno que se pueda llevar puesto.
  if (locales.length > 0) {
    await prisma.venta.deleteMany({ where: { localId: { in: locales } } });
  }
  await prisma.medioCobroLocal.deleteMany({ where: { localId: { in: locales } } });
  await prisma.recargoPagoLocal.deleteMany({ where: { localId: { in: locales } } });
  await prisma.usuario.deleteMany({ where: { id: { in: [creado.usuarioId, creado.cajeroId].filter(Boolean) } } });
  await prisma.grupoLocal.deleteMany({ where: { grupoId: creado.grupoId } });
  await prisma.configuracionGrupo.deleteMany({
    where: { grupoId: { in: [creado.grupoId, creado.grupoSinComisionId].filter(Boolean) } },
  });
  await prisma.local.deleteMany({ where: { id: { in: locales } } });
  await prisma.grupo.deleteMany({
    where: { id: { in: [creado.grupoId, creado.grupoSinComisionId].filter(Boolean) } },
  });
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
  const sesionNuevo = token(creado.usuarioId, nuevo.id, grupo.id);

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

  // ── EL CONTRATO QUE VA A USAR LA PANTALLA, TAL CUAL ─────────────────────
  //
  // Se toma la `claveEdicion` que vino en el GET y se manda de vuelta. No se
  // construye ningún id, no se manda `tipoContable` para ayudar a resolver, y no
  // hay ninguna regla del tipo "si el id es null mandá un 0". Si esto pasa, la
  // pantalla puede hacer exactamente lo mismo.
  const debitoA = listado.medios.find((m) => m.tipoContable === "DEBITO");
  igual("un default se direcciona por su tipo, no por un id inventado",
    debitoA.claveEdicion, "defecto:DEBITO");
  igual("y su id sigue siendo null: no existe todavía", debitoA.id, null);

  const apagado = await leer(
    await rutaMedio.PATCH(
      pedido(`http://ci/api/medios-cobro/${debitoA.claveEdicion}`, {
        metodo: "PATCH", sesion: sesionA, cuerpo: { activo: false },
      }),
      params(debitoA.claveEdicion)
    )
  );
  ok("apagar débito responde ok", apagado.ok === true, apagado.error);
  ok("y devuelve la clave ya resuelta a un id", /^\d+$/.test(String(apagado.claveEdicion)), apagado.claveEdicion);

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
  seccion("Guardar el medio y su recargo con un solo botón");

  // La pantalla tiene un solo "Guardar cambios" y edita las dos cosas. Si hiciera
  // dos requests, uno podría entrar y el otro fallar.
  const resetNuevo = async () => {
    await prisma.medioCobroLocal.deleteMany({ where: { localId: creado.localNuevoId } });
    await prisma.recargoPagoLocal.deleteMany({ where: { localId: creado.localNuevoId } });
    await materializarDefaults(prisma, { localId: creado.localNuevoId });
    return prisma.medioCobroLocal.findMany({ where: { localId: creado.localNuevoId } });
  };
  const porTipo = (filas, tipo) => filas.find((f) => f.tipoContable === tipo);
  const recargoDe = async (localId, medio) =>
    prisma.recargoPagoLocal
      .findUnique({ where: { localId_medio: { localId, medio } } })
      .then((f) => (f ? Number(f.porcentaje) : null));

  let filasNuevo = await resetNuevo();
  const debNuevo = porTipo(filasNuevo, "DEBITO");

  const unSoloGuardar = await leer(
    await rutaMedio.PATCH(
      pedido(`http://ci/api/medios-cobro/${debNuevo.id}`, {
        metodo: "PATCH", sesion: sesionNuevo, cuerpo: { nombre: "Débito Posnet", recargoPct: 3 },
      }),
      params(debNuevo.id)
    )
  );
  ok("un solo pedido guarda el medio y el recargo", unSoloGuardar.ok === true, unSoloGuardar.error);
  igual("el nombre quedó en MedioCobroLocal",
    await prisma.medioCobroLocal.findUnique({ where: { id: debNuevo.id } }).then((f) => f.nombre),
    "Débito Posnet");
  igual("y el recargo quedó en RecargoPagoLocal, que sigue siendo la única fuente",
    await recargoDe(creado.localNuevoId, "DEBITO"), 3);
  igual("con la autoría de quien lo guardó, igual que por la ruta de recargos",
    await prisma.recargoPagoLocal
      .findUnique({ where: { localId_medio: { localId: creado.localNuevoId, medio: "DEBITO" } } })
      .then((f) => f.actualizadoPorId),
    creado.usuarioId);

  // No mencionar el recargo no es lo mismo que ponerlo en 0.
  await rutaMedio.PATCH(
    pedido(`http://ci/api/medios-cobro/${debNuevo.id}`, {
      metodo: "PATCH", sesion: sesionNuevo, cuerpo: { nombre: "Débito" },
    }),
    params(debNuevo.id)
  );
  igual("un pedido que no habla del recargo no lo toca",
    await recargoDe(creado.localNuevoId, "DEBITO"), 3);

  await rutaMedio.PATCH(
    pedido(`http://ci/api/medios-cobro/${debNuevo.id}`, {
      metodo: "PATCH", sesion: sesionNuevo, cuerpo: { recargoPct: 0 },
    }),
    params(debNuevo.id)
  );
  igual("ponerlo en 0 sí se guarda: es una decisión, no una ausencia",
    await recargoDe(creado.localNuevoId, "DEBITO"), 0);

  // ─── EL RECARGO ES DEL TIPO, NO DEL BOTÓN ───
  //
  // `RecargoPagoLocal` está indexado por (local, medio). Si un medio cambia de
  // tipo, el recargo no viaja con él. Se resuelve explícitamente: lo que llega se
  // escribe sobre el tipo con el que el medio QUEDA, y el del tipo anterior no se
  // toca porque no es de este medio.
  await rutaMedio.PATCH(
    pedido(`http://ci/api/medios-cobro/${debNuevo.id}`, {
      metodo: "PATCH", sesion: sesionNuevo, cuerpo: { recargoPct: 3, activo: false },
    }),
    params(debNuevo.id)
  );
  const cambioDeTipo = await leer(
    await rutaMedio.PATCH(
      pedido(`http://ci/api/medios-cobro/${debNuevo.id}`, {
        metodo: "PATCH", sesion: sesionNuevo,
        cuerpo: { tipoContable: "CREDITO", recargoPct: 12 },
      }),
      params(debNuevo.id)
    )
  );
  ok("cambiar el tipo y el recargo a la vez responde ok", cambioDeTipo.ok === true, cambioDeTipo.error);
  igual("el recargo se escribió sobre el tipo NUEVO",
    await recargoDe(creado.localNuevoId, "CREDITO"), 12);
  igual("y el del tipo anterior quedó intacto: no era de este medio",
    await recargoDe(creado.localNuevoId, "DEBITO"), 3);

  // ─── CONTRAPRUEBA DE ROLLBACK ───
  //
  // Un candado que dice "es transaccional" sin ejercer la falla no afirma nada.
  // Acá se rompe a propósito la SEGUNDA mitad y se comprueba que la primera
  // tampoco quedó. La falla se inyecta en el upsert del recargo, ya adentro de la
  // transacción, que es donde el problema realmente ocurriría.
  filasNuevo = await resetNuevo();
  const paraRomper = porTipo(filasNuevo, "MERCADOPAGO");
  const nombreAntes = paraRomper.nombre;

  let exploto = false;
  try {
    await prisma.$transaction(async (tx) => {
      const txRoto = new Proxy(tx, {
        get(objetivo, prop) {
          if (prop !== "recargoPagoLocal") return objetivo[prop];
          return new Proxy(objetivo.recargoPagoLocal, {
            get(delegado, metodo) {
              if (metodo === "upsert") {
                return async () => { throw new Error("falla inyectada en el recargo"); };
              }
              const v = delegado[metodo];
              return typeof v === "function" ? v.bind(delegado) : v;
            },
          });
        },
      });

      await aplicarCambioDeMedio(txRoto, {
        localId: creado.localNuevoId,
        medioId: paraRomper.id,
        cambios: { nombre: "NO DEBERÍA QUEDAR" },
        recargoPct: 9,
        usuarioId: creado.usuarioId,
      });
    });
  } catch {
    exploto = true;
  }

  ok("la falla inyectada efectivamente rompió el guardado", exploto);
  igual("el nombre del medio NO quedó aplicado: la transacción volvió atrás",
    await prisma.medioCobroLocal.findUnique({ where: { id: paraRomper.id } }).then((f) => f.nombre),
    nombreAntes);
  igual("y tampoco quedó el recargo", await recargoDe(creado.localNuevoId, "MERCADOPAGO"), null);

  // ─────────────────────────────────────────────────────────────────────────
  seccion("A, B, C, D. Nunca cero medios activos");

  filasNuevo = await resetNuevo();
  const activosDe = (localId) => prisma.medioCobroLocal.count({ where: { localId, activo: true } });

  // Dejar uno solo activo, apagando los otros tres de a uno por la ruta.
  for (const tipo of ["DEBITO", "CREDITO", "MERCADOPAGO"]) {
    const f = porTipo(filasNuevo, tipo);
    const r = await leer(
      await rutaMedio.PATCH(
        pedido(`http://ci/api/medios-cobro/${f.id}`, { metodo: "PATCH", sesion: sesionNuevo, cuerpo: { activo: false } }),
        params(f.id)
      )
    );
    ok(`apagar ${tipo} se permite mientras quede otro activo`, r.ok === true, r.error);
  }
  igual("queda exactamente uno activo", await activosDe(creado.localNuevoId), 1);

  // ─── A: apagar el ÚNICO activo ───
  const ultimoActivo = porTipo(filasNuevo, "EFECTIVO");
  const apagarUltimo = await leer(
    await rutaMedio.PATCH(
      pedido(`http://ci/api/medios-cobro/${ultimoActivo.id}`, {
        metodo: "PATCH", sesion: sesionNuevo, cuerpo: { activo: false },
      }),
      params(ultimoActivo.id)
    )
  );
  igual("apagar el ÚNICO medio activo se rechaza", apagarUltimo.ok, false);
  igual("con 409: es un conflicto funcional, no un error del servidor", apagarUltimo.status, 409);
  ok("y explica que el POS quedaría sin con qué cobrar",
    /sin botones|no hay con qué cobrar/.test(apagarUltimo.error || ""), apagarUltimo.error);

  // ─── C: borrar el ÚNICO activo ───
  const borrarUltimo = await leer(
    await rutaMedio.DELETE(
      pedido(`http://ci/api/medios-cobro/${ultimoActivo.id}`, { metodo: "DELETE", sesion: sesionNuevo }),
      params(ultimoActivo.id)
    )
  );
  igual("borrar el ÚNICO medio activo se rechaza", borrarUltimo.ok, false);
  igual("también con 409", borrarUltimo.status, 409);
  ok("y con el MISMO mensaje que apagarlo: es la misma regla",
    borrarUltimo.error === apagarUltimo.error,
    `apagar: ${apagarUltimo.error} / borrar: ${borrarUltimo.error}`);

  // ─── D: después de los dos intentos, sigue habiendo uno ───
  igual("después de intentar apagarlo y borrarlo, sigue habiendo un medio activo",
    await activosDe(creado.localNuevoId), 1);

  // ─── B: con dos activos, apagar uno se permite ───
  const reactivado = await leer(
    await rutaMedio.PATCH(
      pedido(`http://ci/api/medios-cobro/${porTipo(filasNuevo, "DEBITO").id}`, {
        metodo: "PATCH", sesion: sesionNuevo, cuerpo: { activo: true },
      }),
      params(porTipo(filasNuevo, "DEBITO").id)
    )
  );
  ok("volver a prender un segundo medio se permite", reactivado.ok === true, reactivado.error);
  igual("ahora hay dos activos", await activosDe(creado.localNuevoId), 2);

  const apagarConDos = await leer(
    await rutaMedio.PATCH(
      pedido(`http://ci/api/medios-cobro/${ultimoActivo.id}`, {
        metodo: "PATCH", sesion: sesionNuevo, cuerpo: { activo: false },
      }),
      params(ultimoActivo.id)
    )
  );
  ok("con dos activos, apagar uno YA se permite", apagarConDos.ok === true, apagarConDos.error);
  igual("y nunca se llegó a cero", await activosDe(creado.localNuevoId), 1);

  const borrarConDos = await leer(
    await rutaMedio.DELETE(
      pedido(`http://ci/api/medios-cobro/${ultimoActivo.id}`, { metodo: "DELETE", sesion: sesionNuevo }),
      params(ultimoActivo.id)
    )
  );
  ok("y borrar uno INACTIVO se permite", borrarConDos.ok === true, borrarConDos.error);
  igual("sigue habiendo un activo", await activosDe(creado.localNuevoId), 1);

  // ─────────────────────────────────────────────────────────────────────────
  seccion("Claves de edición que no direccionan nada");

  for (const [caso, clave] of [
    ["un id que no existe", "999999"],
    ["un cero, que era el número mágico de antes", "0"],
    ["un tipo que no se puede cobrar", "defecto:FIADO"],
    ["un tipo inventado", "defecto:CRIPTO"],
    ["cualquier cosa", "abc"],
  ]) {
    const r = await leer(
      await rutaMedio.PATCH(
        pedido(`http://ci/api/medios-cobro/${clave}`, { metodo: "PATCH", sesion: sesionNuevo, cuerpo: { nombre: "X" } }),
        params(clave)
      )
    );
    ok(`se rechaza ${caso}`, r.ok === false && r.status === 404, `status ${r.status}: ${r.error}`);
  }

  // Una clave de default sobre un local que YA tiene configuración viene de una
  // pantalla vieja: se contesta que no existe en vez de adivinar cuál era.
  const claveVieja = await leer(
    await rutaMedio.PATCH(
      pedido("http://ci/api/medios-cobro/defecto:EFECTIVO", {
        metodo: "PATCH", sesion: sesionNuevo, cuerpo: { nombre: "X" },
      }),
      params("defecto:EFECTIVO")
    )
  );
  igual("una clave de default sobre un local ya configurado no resuelve", claveVieja.status, 404);

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
  seccion("Compatibilidad de la migración que sacó el DEFAULT 7");

  // 1. LAS TRES COLUMNAS ADMITEN NULL.
  //
  // Es lo que hace posible el estado "sin configurar". Se ejerce escribiendo,
  // no leyendo el esquema: una columna que dice ser nulable y rechaza el NULL
  // no sirve de nada.
  const grupoSinComision = await prisma.grupo.create({
    data: { nombre: `${marca}-grupo-sin-comision` },
    select: { id: true },
  });
  creado.grupoSinComisionId = grupoSinComision.id;

  // 2. INSERTAR OMITIENDO LAS TRES COMISIONES FUNCIONA.
  //
  // Es exactamente lo que hace el código VIEJO durante la ventana del
  // despliegue: no las nombra porque contaba con el DEFAULT. Sin el `DROP NOT
  // NULL` de la misma migración, este INSERT fallaría y el despliegue sería
  // incompatible hacia atrás.
  const cfgNueva = await prisma.configuracionGrupo.create({
    data: { grupoId: grupoSinComision.id, allowNegativeStock: false },
    select: { comisionDebito: true, comisionCredito: true, comisionMercadopago: true },
  });
  igual("un grupo nuevo puede quedar con las tres comisiones sin configurar",
    [cfgNueva.comisionDebito, cfgNueva.comisionCredito, cfgNueva.comisionMercadopago],
    [null, null, null]);

  // 3. LOS 7 EXISTENTES NO CAMBIAN.
  const cfgVieja = await prisma.configuracionGrupo.findUnique({
    where: { grupoId: grupo.id },
    select: { comisionDebito: true, comisionCredito: true, comisionMercadopago: true },
  });
  igual("el grupo que ya tenía sus comisiones las conserva",
    [Number(cfgVieja.comisionDebito), Number(cfgVieja.comisionCredito), Number(cfgVieja.comisionMercadopago)],
    [7, 10, 5]);

  // 4. UNA VENTA HISTÓRICA QUEDA `comisionPendiente: false`.
  //
  // La columna es aditiva y con default, así que todo lo que ya estaba nace
  // marcado como exacto: es lo que era, se cobró con una comisión conocida.
  const ventaHistorica = await prisma.venta.create({
    data: {
      // `numero` es Int y único por local: un número alto no choca con los
      // fixtures de esta corrida, que arrancan de abajo.
      localId: localA.id, vendedorId: creado.usuarioId, numero: 999001,
      subtotal: 1000, total: 1000, formaPago: "efectivo",
    },
    select: { id: true, comisionPendiente: true },
  });
  creado.ventaHistoricaId = ventaHistorica.id;
  igual("una venta creada sin nombrar el campo queda marcada como exacta",
    ventaHistorica.comisionPendiente, false);

  // 5. EL CÓDIGO VIEJO NO DEPENDE DEL DEFAULT PARA RESOLVER.
  //
  // Durante la ventana, la versión anterior lee estas columnas y aplica su
  // `?? 7`. Con la fila en NULL obtiene 7, que es EXACTAMENTE lo que obtenía
  // antes cuando el DEFAULT se lo escribía la base. Por eso la migración es
  // compatible hacia atrás aunque el clasificador la marque por el DROP DEFAULT.
  const comoLoLeeElCodigoViejo = Number(cfgNueva.comisionDebito ?? 7);
  igual("el fallback histórico del código viejo sigue dando 7 sobre un NULL",
    comoLoLeeElCodigoViejo, 7);

  // Y el código NUEVO, sobre esa misma fila, dice la verdad: no está configurada.
  const resuelto = resolverComision({ tipoContable: "DEBITO", comisionPct: null }, cfgNueva);
  igual("y el código nuevo lo llama por su nombre", [resuelto.pct, resuelto.origen],
    [null, "sin-configurar"]);

  // ═════════════════════════════════════════════════════════════════════════
  // MODALIDADES POR MEDIO: UN SOLO BOTÓN, VARIAS CONDICIONES
  // ═════════════════════════════════════════════════════════════════════════
  //
  // El diseño aprobado —Figma `fYqIEZxHRb6yx6pIUrUG2h`, página 19:2— reemplaza
  // los tres botones de Mercado Pago por UNO con modalidades:
  //
  //     Mercado Pago
  //     ├── Débito
  //     ├── Crédito
  //     └── QR / saldo
  //
  // Estas cuatro secciones nacieron como los TRES CONFLICTOS que el modelo viejo
  // no podía expresar, y quedaron dadas vuelta: ahora afirman que el modelo nuevo
  // sí puede, y cada una conserva al lado por qué antes daba rojo. Los rojos de
  // entonces están en la historia de la rama, en `93dfb2ae` y `3a07bd1c`.
  //
  // ── LA TENTACIÓN QUE ESTOS ESCENARIOS NO TOMAN ─────────────────────────
  //
  // Sería fácil darle a cada modalidad un `MedioPago` distinto —DEBITO para una,
  // CREDITO para otra— y que todo pasara sin haber probado nada. Eso reproduce
  // EXACTAMENTE la arquitectura que el diseño viene a reemplazar: si las
  // modalidades fueran tipos contables distintos, volveríamos a tener tres
  // botones en el POS.
  //
  // Por eso la sección 12 usa DOS modalidades que comparten `CREDITO`. Ese es el
  // caso que el índice viejo rechazaba, y el único que prueba de verdad que el
  // tender ya no se identifica por su tipo contable.
  //
  // ── SE EJERCE LA BASE, DESPUÉS DE `migrate deploy` ──────────────────────
  //
  // Nada de esto se lee de `schema.prisma`: los índices parciales están escritos
  // a mano en la migración, y lo único que prueba que hacen su trabajo es
  // intentar violarlos y mirar QUÉ FILAS QUEDARON. Que Prisma tire un error no
  // alcanza — un error puede venir de otra cosa.
  //
  // ── LOCAL PROPIO, A PROPÓSITO ───────────────────────────────────────────
  //
  // Estas secciones trabajan sobre un local nuevo y no sobre `localA`. Hay un
  // índice único parcial que permite UN SOLO medio activo por tipo contable y
  // por local, y `localA` llega hasta acá con medios de las secciones
  // anteriores: reusarlo haría que estas afirmaciones dependieran del orden en
  // que corren las otras.

  seccion("11. Dos modalidades del mismo padre, con condiciones propias");

  const localMP = await prisma.local.create({ data: { nombre: `${marca}-MP` } });
  creado.localMPId = localMP.id;
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: localMP.id } });

  // UN medio visible, con DOS modalidades adentro. Antes esto no se podía
  // expresar: los dos recargos colapsaban en la única clave (localId, MedioPago)
  // de `RecargoPagoLocal`, así que el segundo pisaba al primero.
  const padreMP = await prisma.medioCobroLocal.create({
    data: {
      localId: localMP.id, nombre: "Mercado Pago", activo: true, orden: 10,
      tipoContable: "MERCADOPAGO", procesador: "MERCADOPAGO",
    },
  });
  creado.medioMPId = padreMP.id;

  const modDebito = await prisma.medioCobroModalidadLocal.create({
    data: { medioCobroLocalId: padreMP.id, nombre: "Débito", tipoContable: "DEBITO", recargoPct: 2, orden: 1 },
  });
  const modCredito = await prisma.medioCobroModalidadLocal.create({
    data: { medioCobroLocalId: padreMP.id, nombre: "Crédito", tipoContable: "CREDITO", recargoPct: 6, orden: 2 },
  });

  const delPadre = await prisma.medioCobroModalidadLocal.findMany({
    where: { medioCobroLocalId: padreMP.id },
    orderBy: { orden: "asc" },
  });
  console.log(`    modalidades guardadas: ${JSON.stringify(
    delPadre.map((m) => [m.nombre, m.tipoContable, Number(m.recargoPct)]))}`);

  igual("el POS ve UN solo medio para las dos modalidades",
    await prisma.medioCobroLocal.count({ where: { localId: localMP.id } }), 1);
  igual("con dos modalidades adentro", delPadre.length, 2);
  ok("las dos cuelgan del mismo padre",
    delPadre.every((m) => m.medioCobroLocalId === padreMP.id));
  igual("Débito lleva su 2 % y Crédito su 6 %, a la vez",
    delPadre.map((m) => Number(m.recargoPct)), [2, 6]);
  igual("y cada una su tipo contable",
    delPadre.map((m) => m.tipoContable), ["DEBITO", "CREDITO"]);

  // AISLAMIENTO. No alcanza con que los dos números entren: hay que comprobar
  // que editar uno no toca al otro, que es exactamente lo que el modelo viejo no
  // podía garantizar.
  await prisma.medioCobroModalidadLocal.update({
    where: { id: modCredito.id },
    data: { recargoPct: 9, comisionPct: 3.5 },
  });
  const debitoDespues = await prisma.medioCobroModalidadLocal.findUnique({ where: { id: modDebito.id } });
  const creditoDespues = await prisma.medioCobroModalidadLocal.findUnique({ where: { id: modCredito.id } });

  igual("cambiar el recargo de Crédito NO mueve el de Débito", Number(debitoDespues.recargoPct), 2);
  igual("y Crédito queda con el suyo", Number(creditoDespues.recargoPct), 9);
  igual("configurarle comisión a Crédito NO se la inventa a Débito", debitoDespues.comisionPct, null);
  igual("y Crédito queda con la suya", Number(creditoDespues.comisionPct), 3.5);

  // La fuente del recargo se mudó: con modalidades manda la modalidad, y NO se
  // escribe nada en `RecargoPagoLocal` —que además no podría expresar los dos
  // valores a la vez—. Esa tabla queda para los medios sin modalidades.
  await prisma.medioCobroModalidadLocal.update({ where: { id: modCredito.id }, data: { recargoPct: 6 } });
  igual("no se escribió ningún recargo legacy para este local",
    await prisma.recargoPagoLocal.count({ where: { localId: localMP.id } }), 0);

  seccion("12. Un pago mixto entre dos modalidades del MISMO tipo contable");

  // El caso que de verdad prueba el modelo nuevo. Las dos modalidades comparten
  // `CREDITO`: con el `@@unique([ventaId, medio])` viejo eran indistinguibles y
  // el segundo tender se rechazaba, así que un pago mixto se caía EN LA CAJA.
  const mod1Pago = await prisma.medioCobroModalidadLocal.create({
    data: { medioCobroLocalId: padreMP.id, nombre: "Crédito 1 pago", tipoContable: "CREDITO", recargoPct: 6, orden: 3 },
  });
  const modCuotas = await prisma.medioCobroModalidadLocal.create({
    data: { medioCobroLocalId: padreMP.id, nombre: "Crédito cuotas", tipoContable: "CREDITO", recargoPct: 12, orden: 4 },
  });

  const ventaDos = await prisma.venta.create({
    data: {
      localId: localMP.id, vendedorId: creado.usuarioId, numero: 990101,
      subtotal: 300, total: 300, formaPago: "mercadopago",
    },
    select: { id: true },
  });

  await prisma.ventaPago.create({
    data: { ventaId: ventaDos.id, medio: "CREDITO", monto: 100, comision: 0, neto: 100, modalidadId: mod1Pago.id },
  });
  let choqueDosMod = null;
  try {
    await prisma.ventaPago.create({
      data: { ventaId: ventaDos.id, medio: "CREDITO", monto: 200, comision: 0, neto: 200, modalidadId: modCuotas.id },
    });
  } catch (e) {
    choqueDosMod = e?.message?.split("\n").find((l) => l.trim()) || String(e);
  }

  // NO alcanza con que no haya tirado error: se mira qué quedó en PostgreSQL.
  const tendersDos = await prisma.ventaPago.findMany({
    where: { ventaId: ventaDos.id },
    orderBy: { monto: "asc" },
    select: { medio: true, monto: true, modalidadId: true },
  });
  console.log(`    filas que quedaron: ${JSON.stringify(
    tendersDos.map((t) => [t.medio, Number(t.monto), t.modalidadId === mod1Pago.id ? "1 pago" : "cuotas"]))}`);

  ok("el segundo tender entra", choqueDosMod === null, choqueDosMod || "");
  igual("quedaron los DOS en la base", tendersDos.length, 2);
  igual("los dos con el mismo tipo contable", tendersDos.map((t) => t.medio), ["CREDITO", "CREDITO"]);
  igual("y los montos son los que se cobraron", tendersDos.map((t) => Number(t.monto)), [100, 200]);
  igual("lo que los distingue es la modalidad",
    tendersDos.map((t) => t.modalidadId), [mod1Pago.id, modCuotas.id]);

  // CONTRAPRUEBA 1 · la MISMA modalidad no se puede repetir en una venta.
  let choqueMisma = null;
  try {
    await prisma.ventaPago.create({
      data: { ventaId: ventaDos.id, medio: "CREDITO", monto: 50, comision: 0, neto: 50, modalidadId: mod1Pago.id },
    });
  } catch (e) {
    choqueMisma = e?.message?.split("\n").find((l) => l.trim()) || String(e);
  }
  const deEsaModalidad = await prisma.ventaPago.findMany({
    where: { ventaId: ventaDos.id, modalidadId: mod1Pago.id },
    select: { monto: true },
  });
  console.log(`    repetir "Crédito 1 pago": ${choqueMisma ? "RECHAZADO — " + choqueMisma : "ACEPTADO"}`);

  ok("repetir la misma modalidad se rechaza", choqueMisma !== null, "lo aceptó");
  igual("y quedó UNA sola fila de esa modalidad, la original de $100",
    deEsaModalidad.map((t) => Number(t.monto)), [100]);

  // CONTRAPRUEBA 2 · el contrato legacy no se aflojó. Dos tenders del mismo medio
  // SIN modalidad se siguen rechazando exactamente como antes de esta tanda, que
  // es lo que `UNIQUE (ventaId, medio, modalidadId)` habría roto en silencio.
  const ventaLegacy = await prisma.venta.create({
    data: {
      localId: localMP.id, vendedorId: creado.usuarioId, numero: 990102,
      subtotal: 100, total: 100, formaPago: "credito",
    },
    select: { id: true },
  });
  await prisma.ventaPago.create({
    data: { ventaId: ventaLegacy.id, medio: "CREDITO", monto: 100, comision: 0, neto: 100 },
  });
  let choqueLegacy = null;
  try {
    await prisma.ventaPago.create({
      data: { ventaId: ventaLegacy.id, medio: "CREDITO", monto: 40, comision: 0, neto: 40 },
    });
  } catch (e) {
    choqueLegacy = e?.message?.split("\n").find((l) => l.trim()) || String(e);
  }
  const tendersLegacy = await prisma.ventaPago.findMany({
    where: { ventaId: ventaLegacy.id },
    select: { medio: true, monto: true, modalidadId: true },
  });
  console.log(`    legacy, segundo tender: ${choqueLegacy ? "RECHAZADO — " + choqueLegacy : "ACEPTADO"}`);
  console.log(`    legacy, filas que quedaron: ${JSON.stringify(
    tendersLegacy.map((t) => [t.medio, Number(t.monto), t.modalidadId]))}`);

  ok("dos tenders del mismo medio sin modalidad se siguen rechazando",
    choqueLegacy !== null, "el índice parcial legacy dejó pasar un duplicado");
  igual("y quedó UNA sola fila, igual que antes de esta tanda",
    tendersLegacy.map((t) => [t.medio, Number(t.monto), t.modalidadId]), [["CREDITO", 100, null]]);

  seccion("13. La venta vieja se explica sola, aunque la configuración cambie");

  // Una venta cobrada con Mercado Pago / Crédito al 6 %, con su comisión.
  const ventaSnap = await prisma.venta.create({
    data: {
      localId: localMP.id, vendedorId: creado.usuarioId, numero: 990103,
      subtotal: 300, total: 318, formaPago: "credito",
      totalAntesRecargo: 300,
      recargoPagoPct: 6, recargoPagoImporte: 18, recargoPagoMedio: "CREDITO",
      recargoPagoMedioCobroLocalId: padreMP.id,
      recargoPagoMedioNombre: "Mercado Pago",
      recargoPagoModalidadId: modCredito.id,
      recargoPagoModalidadNombre: "Crédito",
    },
    select: { id: true },
  });
  await prisma.ventaPago.create({
    data: {
      ventaId: ventaSnap.id, medio: "CREDITO", monto: 318,
      comisionPct: 3.5, comision: 11.13, neto: 306.87,
      medioCobroLocalId: padreMP.id, medioNombre: "Mercado Pago", procesador: "MERCADOPAGO",
      modalidadId: modCredito.id, modalidadNombre: "Crédito",
    },
  });

  // Y AHORA LA CONFIGURACIÓN CAMBIA, que es lo que hace que el snapshot importe:
  // el medio se renombra, y la modalidad se renombra, cambia de porcentaje, gana
  // otra comisión y se desactiva. Si la auditoría dependiera de leer la
  // configuración actual, acá empezaría a mentir.
  await prisma.medioCobroLocal.update({ where: { id: padreMP.id }, data: { nombre: "MP Cobros" } });
  await prisma.medioCobroModalidadLocal.update({
    where: { id: modCredito.id },
    data: { nombre: "Crédito 3 cuotas", recargoPct: 15, comisionPct: 9, activo: false },
  });

  // Se lee SOLO la venta y su pago. Ni un join a la configuración.
  const snapVenta = await prisma.venta.findUnique({
    where: { id: ventaSnap.id },
    select: {
      recargoPagoMedio: true, recargoPagoPct: true, recargoPagoImporte: true,
      recargoPagoMedioCobroLocalId: true, recargoPagoMedioNombre: true,
      recargoPagoModalidadId: true, recargoPagoModalidadNombre: true,
    },
  });
  const snapPago = await prisma.ventaPago.findFirst({
    where: { ventaId: ventaSnap.id },
    select: {
      medio: true, medioCobroLocalId: true, medioNombre: true, procesador: true,
      modalidadId: true, modalidadNombre: true, comisionPct: true, comision: true, neto: true,
    },
  });
  console.log(`    la configuración hoy se llama "MP Cobros" / "Crédito 3 cuotas", al 15 % y desactivada`);
  console.log(`    la venta sigue diciendo: ${JSON.stringify([
    snapVenta.recargoPagoMedioNombre, snapVenta.recargoPagoModalidadNombre, Number(snapVenta.recargoPagoPct)])}`);

  igual("el tender congela el tipo contable DE LA MODALIDAD", snapPago.medio, "CREDITO");
  igual("y el nombre del medio con el que se cobró", snapPago.medioNombre, "Mercado Pago");
  igual("y por dónde pasó", snapPago.procesador, "MERCADOPAGO");
  igual("y el nombre de la modalidad", snapPago.modalidadNombre, "Crédito");
  igual("y la comisión que se le aplicó",
    [Number(snapPago.comisionPct), Number(snapPago.comision), Number(snapPago.neto)], [3.5, 11.13, 306.87]);
  igual("las referencias operativas siguen apuntando a la configuración",
    [snapPago.medioCobroLocalId, snapPago.modalidadId], [padreMP.id, modCredito.id]);

  igual("la venta dice QUÉ modalidad impuso el recargo", snapVenta.recargoPagoModalidadNombre, "Crédito");
  igual("y con qué medio visible se cobró", snapVenta.recargoPagoMedioNombre, "Mercado Pago");
  igual("con el porcentaje congelado, no el que la modalidad tiene hoy",
    [Number(snapVenta.recargoPagoPct), Number(snapVenta.recargoPagoImporte)], [6, 18]);
  igual("y el tipo contable congelado", snapVenta.recargoPagoMedio, "CREDITO");

  // ── CONTRAPRUEBA · borrar la configuración no puede borrar la historia ────
  //
  // Las cuatro FK nuevas son SET NULL. Si fueran CASCADE, borrar una modalidad
  // se llevaría puestos pagos y ventas; si fueran RESTRICT, no se podría borrar
  // nunca una modalidad que alguien usó una vez. El par referencia + texto existe
  // para esto: se pierde la referencia y el relato queda.
  await prisma.medioCobroModalidadLocal.delete({ where: { id: modCredito.id } });

  const pagoTrasBorrar = await prisma.ventaPago.findFirst({
    where: { ventaId: ventaSnap.id },
    select: { medio: true, modalidadId: true, modalidadNombre: true, comisionPct: true, medioNombre: true },
  });
  const ventaTrasBorrar = await prisma.venta.findUnique({
    where: { id: ventaSnap.id },
    select: { recargoPagoModalidadId: true, recargoPagoModalidadNombre: true, recargoPagoPct: true },
  });

  ok("borrar la modalidad NO borra el pago", pagoTrasBorrar !== null);
  igual("su referencia queda en null", pagoTrasBorrar.modalidadId, null);
  igual("pero el nombre congelado sigue ahí", pagoTrasBorrar.modalidadNombre, "Crédito");
  igual("y el tipo contable, el medio y la comisión también",
    [pagoTrasBorrar.medio, pagoTrasBorrar.medioNombre, Number(pagoTrasBorrar.comisionPct)],
    ["CREDITO", "Mercado Pago", 3.5]);
  ok("la venta tampoco se borra", ventaTrasBorrar !== null);
  igual("su referencia queda en null", ventaTrasBorrar.recargoPagoModalidadId, null);
  igual("y sigue explicando qué modalidad impuso el recargo, y de cuánto",
    [ventaTrasBorrar.recargoPagoModalidadNombre, Number(ventaTrasBorrar.recargoPagoPct)], ["Crédito", 6]);

  seccion("14. Una venta NUEVA con un medio SIN modalidades congela el padre igual");

  // Esto NO es una venta histórica, y la diferencia es la que se aclaró en el
  // schema: un medio configurable sin modalidades igual tiene nombre y
  // procesador que congelar. Si se guardara solo `CREDITO`, "Banco X" y "Mercado
  // Pago" quedarían indistinguibles para siempre, que es justo lo que la tanda
  // viene a arreglar.
  const bancoX = await prisma.medioCobroLocal.create({
    data: {
      localId: localMP.id, nombre: "Banco X", activo: true, orden: 11,
      tipoContable: "CREDITO", procesador: "BANCO",
    },
  });
  creado.medioBancoId = bancoX.id;
  igual("el medio no tiene ninguna modalidad",
    await prisma.medioCobroModalidadLocal.count({ where: { medioCobroLocalId: bancoX.id } }), 0);

  const ventaSinMod = await prisma.venta.create({
    data: {
      localId: localMP.id, vendedorId: creado.usuarioId, numero: 990104,
      subtotal: 100, total: 100, formaPago: "credito",
    },
    select: { id: true },
  });
  await prisma.ventaPago.create({
    data: {
      ventaId: ventaSinMod.id, medio: "CREDITO", monto: 100, comision: 0, neto: 100,
      medioCobroLocalId: bancoX.id, medioNombre: "Banco X", procesador: "BANCO",
    },
  });
  const pagoSinMod = await prisma.ventaPago.findFirst({
    where: { ventaId: ventaSinMod.id },
    select: { medio: true, medioCobroLocalId: true, medioNombre: true, procesador: true,
      modalidadId: true, modalidadNombre: true },
  });

  igual("congela el medio visible con el que se cobró", pagoSinMod.medioCobroLocalId, bancoX.id);
  igual("su nombre y su procesador", [pagoSinMod.medioNombre, pagoSinMod.procesador], ["Banco X", "BANCO"]);
  igual("y SOLO la modalidad queda en null",
    [pagoSinMod.modalidadId, pagoSinMod.modalidadNombre], [null, null]);
  ok("así 'Banco X · CREDITO' se distingue de 'Mercado Pago · CREDITO'",
    pagoSinMod.medio === snapPago.medio && pagoSinMod.medioNombre !== snapPago.medioNombre);

  // Y la venta HISTÓRICA —la de la contraprueba legacy— sigue con los cinco en
  // null, y eso sigue siendo válido: nadie reinterpreta el pasado.
  const pagoHistorico = await prisma.ventaPago.findFirst({
    where: { ventaId: ventaLegacy.id },
    select: { medioCobroLocalId: true, medioNombre: true, procesador: true,
      modalidadId: true, modalidadNombre: true },
  });
  ok("una fila anterior a esta tanda puede tener los cinco en null",
    Object.values(pagoHistorico).every((v) => v === null),
    JSON.stringify(pagoHistorico));
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
