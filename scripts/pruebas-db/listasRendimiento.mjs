// RENDIMIENTO DE LA PANTALLA DE UNA LISTA DE PROVEEDOR, CONTRA POSTGRESQL.
//
//   DATABASE_URL=<base local> AUTH_SECRET=<secreto> \
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/listasRendimiento.mjs \
//     [--guardar <huella.json>] [--comparar <huella.json>] [--limites] [--escala 2]
//
// El candado de esta tanda son dos corridas: `--comparar` contra una huella
// sacada con el código de antes (`git stash` de `app` y `lib`, `--guardar`,
// y de vuelta), y `--limites` con `--escala 1` y `--escala 2`.
//
// ── QUÉ MIDE ───────────────────────────────────────────────────────────────
//
// Emanuel, 2026-11-25, lista de Arcor de unos 970 renglones: "Tarda muchísimo.
// Desde que carga la lista, y después tarda en aplicar los cambios también."
// Este arnés arma una lista de ese tamaño y mide los tres momentos llamando a
// los handlers REALES de las rutas, con sesión firmada y el contexto de
// auditoría sembrado como en un pedido de verdad:
//
//   · ABRIR    — `GET resultado`, lo que pide la pantalla al montar.
//   · TOQUE    — «Dejar como está» en una tarjeta: `POST seleccion` y la
//                tarjeta sola, `GET resultado?productos=` —lo que pide la
//                pantalla desde el 2026-11-25; antes releía el resultado entero—.
//   · APLICAR  — `POST aplicar` de las seleccionadas, y la relectura.
//
// De cada uno: segundos, cantidad de sentencias que llegaron a la base
// (`pg_stat_statements`, que cuenta también las lecturas de la auditoría) y
// bytes del JSON que viaja.
//
// ── LA HUELLA: "MISMO RESULTADO" SE COMPRUEBA, NO SE SUPONE ────────────────
//
// `--guardar` escribe lo que quedó: el resultado que ve la pantalla, la
// respuesta de aplicar, los costos y ventas del maestro y de cada local, cada
// renglón aplicado u omitido, las versiones del Libro de Costos (las escriben
// los triggers) y lo que registró la auditoría. Sin ids ni fechas, que cambian
// en cada corrida. `--comparar` lo vuelve a sacar y exige que dé idéntico.
//
// `--limites` exige además los techos de sentencias: que no crezcan con el
// tamaño de la lista.
//
// ── LA LISTA ES DETERMINISTA ───────────────────────────────────────────────
//
// Mismos productos, mismos precios y el mismo archivo en cada corrida, con un
// sufijo nuevo: dos corridas se comparan entre sí. Necesita
// `pg_stat_statements` cargado en el Postgres local (`shared_preload_libraries`
// y `CREATE EXTENSION`); sin eso no hay cuenta de sentencias y el arnés lo dice.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

import fs from "node:fs";
import { performance } from "node:perf_hooks";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });
const jwt = (await import("jsonwebtoken")).default;
const XLSX = (await import("xlsx")).default;
const { seedAuditoria } = await import("../../lib/auditoria/contexto.js");
const { claveDeAlias } = await import("../../lib/proveedores/identidad/servicioIdentidad.js");
const { conLasTarjetasTocadas } = await import("../../lib/proveedores/listas/tarjetasTocadas.js");

const args = process.argv.slice(2);
const valorDe = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
};
const GUARDAR = valorDe("--guardar");
const COMPARAR = valorDe("--comparar");
const LIMITES = args.includes("--limites");

const SUFIJO = `zzrl-${Date.now().toString(36)}`;
const BASE = "http://localhost/api/proveedores/listas";

// ── El tamaño de la lista de Arcor del 25/11 ───────────────────────────────
//
// `--escala 2` la duplica entera —la misma lista, el doble de renglones—: es
// como `--limites` comprueba que las sentencias no crecen con el tamaño. Solo
// enteros desde 1: los casos fijos de abajo (las dos variantes, el producto 450)
// necesitan el tamaño real como mínimo.
const ESCALA = Math.max(1, Math.trunc(Number(valorDe("--escala") ?? 1)) || 1);
const VINCULADOS = 400 * ESCALA; // productos de Arcor que la lista trae
const NO_VIENEN = 91 * ESCALA; // productos de Arcor que la lista no trae
const SIN_PRODUCTO = 575 * ESCALA; // renglones sin producto en el catálogo
const LOCALES = 4; // además del depósito, cada uno con su precio
const EN_RANGO = 180 * ESCALA; // cambian dentro del 0 a 15 %
const FUERA = 100 * ESCALA; // fuera de rango: para revisar
// El resto de los vinculados viene con el mismo precio.

// ── Techos de sentencias (`--limites`) ─────────────────────────────────────
//
// Los mismos para cualquier escala: una lista del doble no puede pedir más
// idas y vueltas. Medidos el 2026-11-25 con la escala 1 y la 2 —abrir 52,
// tocar 39, aplicar 58 y 59— más un margen chico: lo que suba de acá es una
// consulta nueva por renglón o por producto, y eso es lo que hay que ver.
// Antes de esta tanda eran 51, 39 y 2.057 —aplicar crecía con cada precio—.
const TECHO = Object.freeze({ abrir: 60, toque: 45, aplicar: 66 });

function cookieDe(usuario, localId, grupoId) {
  return `erpazul_sesion=${jwt.sign(
    { id: usuario.id, email: usuario.email, nombre: usuario.nombre, rolId: usuario.rolId, permisos: ["*"], localId, grupoId },
    process.env.AUTH_SECRET,
    { expiresIn: 3600 }
  )}`;
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
function pedidoUpload(url, cookie, { bytes, nombre, proveedorId }) {
  const fd = new FormData();
  fd.append("archivo", new File([bytes], nombre, { type: "application/octet-stream" }), nombre);
  fd.append("proveedorId", String(proveedorId));
  const req = new Request(url, { method: "POST", headers: { cookie }, body: fd });
  Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
  return req;
}
const ctxId = (id) => ({ params: Promise.resolve({ id: String(id) }) });

// ── La cuenta de sentencias ────────────────────────────────────────────────
async function reiniciarCuenta() {
  await prisma.$queryRawUnsafe("SELECT pg_stat_statements_reset()::text");
}
async function leerCuenta() {
  const r = await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM(calls), 0)::int AS n FROM pg_stat_statements
     WHERE query NOT ILIKE '%pg_stat_statements%'`
  );
  return Number(r[0]?.n ?? 0);
}

/** Corre un momento: segundos, sentencias, bytes, y el JSON. */
async function medir(nombre, fn) {
  await reiniciarCuenta();
  const t0 = performance.now();
  const salida = await fn();
  const segundos = (performance.now() - t0) / 1000;
  const sentencias = (await leerCuenta()) - 1; // la del reinicio
  const bytes = salida.reduce((a, s) => a + s.bytes, 0);
  return { nombre, segundos, sentencias, bytes, respuestas: salida.map((s) => s.json) };
}
async function llamar(handler, req, ctx) {
  const res = await handler(req, ctx);
  const texto = await res.text();
  return { json: JSON.parse(texto), bytes: Buffer.byteLength(texto) };
}

// ── La lista, determinista ─────────────────────────────────────────────────
const codigoVinculado = (i) => String(30000 + i);
const codigoSinProducto = (i) => String(70000 + i);
/** El costo de hoy del producto i: siempre el mismo. */
const costoDe = (i) => 800 + (i % 37) * 25;
/** Cuánto cambia el producto i en la lista. */
function variacionDe(i) {
  if (i < EN_RANGO) return 0.02 + (i % 13) / 100; // +2 % a +14 %
  if (i < EN_RANGO + FUERA) return i % 2 ? -0.132 : 0.31; // baja o sube de más
  return 0;
}

async function sembrar() {
  const grupo = await prisma.grupo.create({ data: { nombre: `Grupo ${SUFIJO}` } });
  const rol = await prisma.rol.create({ data: { nombre: `Rol ${SUFIJO}`, permisos: ["*"] } });
  const dep = await prisma.local.create({ data: { nombre: `Dep ${SUFIJO}`, tipo: "deposito", es_deposito: true } });
  const locales = [];
  for (let k = 0; k < LOCALES; k++) {
    locales.push(await prisma.local.create({ data: { nombre: `Local ${k} ${SUFIJO}`, tipo: "local", es_deposito: false } }));
  }
  await prisma.grupoLocal.createMany({ data: [dep, ...locales].map((l) => ({ grupoId: grupo.id, localId: l.id })) });
  await prisma.grupoDeposito.create({ data: { grupoId: grupo.id, localId: dep.id } });
  await prisma.configuracionLocal.createMany({ data: [dep, ...locales].map((l) => ({ localId: l.id, exigirOperador: false })) });
  const admin = await prisma.usuario.create({
    data: { nombre: `Admin ${SUFIJO}`, email: `admin-${SUFIJO}@test.local`, passwordHash: "x", rolId: rol.id, localId: dep.id },
  });
  const cat = await prisma.categoria.create({ data: { nombre: `Cat ${SUFIJO}` } });
  const arcor = await prisma.proveedor.create({
    data: {
      nombre: `Arcor ${SUFIJO}`, creadoEnLocalId: dep.id, parserListaId: "ARCOR_XLSX",
      listaAumentoEsperadoMinPct: 0, listaAumentoEsperadoMaxPct: 15, listaRecargoPct: 5,
      listaImpuestosDefinidos: true, listaImpuestoAdicionalPct: 0,
    },
  });

  // Los productos: los que la lista trae y los que no.
  const total = VINCULADOS + NO_VIENEN;
  await prisma.productoBase.createMany({
    data: Array.from({ length: total }, (_, i) => ({
      grupoId: grupo.id, creadoEnLocalId: dep.id, nombre: `ZZRL ${String(i).padStart(4, "0")} ${SUFIJO}`,
      categoria_id: cat.id, unidad_medida: "unidad", precio_costo: costoDe(i), precio_venta: Math.round(costoDe(i) * 1.3),
      margen: 30, redondeo_100: false, proveedor_id: arcor.id,
    })),
  });
  const productos = await prisma.productoBase.findMany({
    where: { grupoId: grupo.id },
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true },
  });
  await prisma.productoCodigoProveedor.createMany({
    data: productos.map((p, i) => ({
      grupoId: grupo.id, proveedorId: arcor.id, productoBaseId: p.id, codigoInterno: codigoVinculado(i),
      // Dos productos con la misma descripción del proveedor —dos variantes que
      // Arcor nombra igual—: un renglón con ese texto queda AMBIGUO, sin
      // producto, y sigue coincidiendo con un vínculo en cada apertura.
      descripcionProveedor: i === 398 || i === 399 ? "ARCOR VARIANTE COMPARTIDA" : `ARCOR PRODUCTO ${i}`,
      activo: true,
    })),
  });
  // Un precio por local para cada producto: lo que arrastra el maestro, salvo
  // uno de cada diez, cargado a mano (que aplicar no pisa).
  await prisma.productoLocal.createMany({
    data: productos.flatMap((p, i) =>
      locales.map((l, k) => ({
        localId: l.id, baseId: p.id,
        precio_costo: (i + k) % 10 === 0 ? costoDe(i) + 111 : costoDe(i),
        precio_venta: Math.round(costoDe(i) * 1.3),
      }))
    ),
  });
  // Historial de costos: dos cambios previos, que dejan versiones en el Libro.
  for (const vuelta of [1, 2]) {
    await prisma.$executeRawUnsafe(
      `UPDATE "ProductoBase" SET precio_costo = precio_costo + ${vuelta === 1 ? 1 : -1} WHERE "grupoId" = $1`,
      grupo.id
    );
  }

  // El archivo: los vinculados con su precio nuevo y los sin producto.
  const filas = [];
  for (let i = 0; i < VINCULADOS; i++) {
    const conIva = Math.round(((costoDe(i) * (1 + variacionDe(i))) / 1.05) * 100) / 100;
    filas.push([Number(codigoVinculado(i)), `ARCOR PRODUCTO ${i}`, "UN", 1, Math.round((conIva / 1.21) * 100) / 100, conIva]);
  }
  for (let i = 0; i < SIN_PRODUCTO; i++) {
    // Uno de cada veinticinco repite el texto de un vínculo existente: es lo que
    // hace que la apertura busque vínculos por nombre.
    // Y uno de cada cien trae el texto de las dos variantes: queda ambiguo, y es
    // lo que hace que cada apertura cargue el catálogo para buscarle producto.
    const texto =
      i % 100 === 50
        ? "ARCOR VARIANTE COMPARTIDA"
        : i % 25 === 0
          ? `ARCOR PRODUCTO ${i % VINCULADOS}`
          : `ARCOR SIN PRODUCTO ${i}`;
    if (i % 25 === 0 && i % 100 !== 50) {
      // El renglón con el texto de un producto queda atado a ese producto y con
      // un precio adentro del rango: aplicar escribe DOS veces el mismo
      // producto, y el Libro de Costos registra las dos.
      const j = i % VINCULADOS;
      const conIva = Math.round(((costoDe(j) * 1.03) / 1.05) * 100) / 100;
      filas.push([Number(codigoSinProducto(i)), texto, "UN", 1, Math.round((conIva / 1.21) * 100) / 100, conIva]);
      continue;
    }
    filas.push([Number(codigoSinProducto(i)), texto, "UN", 6, 100, 121 + (i % 50)]);
  }
  const aoa = [["Producto", "Descripción", "U.M.", "UxBU", "Precio S/IVA", "Precio C/IVA"], ...filas];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Hoja1");
  const bytes = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

  return { grupo, dep, admin, arcor, bytes };
}

// ── La huella ──────────────────────────────────────────────────────────────
const sinSufijo = (v) => (typeof v === "string" ? v.split(` ${SUFIJO}`).join("").split(SUFIJO).join("") : v);
/** Saca ids, fechas y el sufijo de la corrida: lo que cambia entre corridas sin cambiar el resultado. */
function normalizar(v, clave = "") {
  if (Array.isArray(v)) return v.map((x) => normalizar(x));
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) {
      // Sin bandera `i` a propósito: con ella `En$` se comía `origen`.
      if (/^id$|Id$|_id$|Ids$|^ids$|En$|At$|^fecha|^creado|^actualizado|^huella/.test(k)) continue;
      out[k] = normalizar(v[k], k);
    }
    return out;
  }
  return sinSufijo(v);
}
const num = (v) => (v === null || v === undefined ? null : Number(v));

async function estadoDeLaBase({ grupoId, importacionId, productoIds }) {
  const productos = await prisma.productoBase.findMany({
    where: { grupoId }, orderBy: { nombre: "asc" },
    select: { nombre: true, precio_costo: true, precio_venta: true },
  });
  const locales = await prisma.productoLocal.findMany({
    where: { baseId: { in: productoIds } },
    select: { base: { select: { nombre: true } }, local: { select: { nombre: true } }, precio_costo: true, precio_venta: true },
  });
  const filas = await prisma.importacionListaFila.findMany({
    where: { importacionId }, orderBy: { filaExcel: "asc" },
    select: {
      filaExcel: true, estado: true, aplicada: true, seleccionada: true, excluidaManual: true, costoAplicado: true,
      costoPrevioAplicacion: true, ventaAnterior: true, ventaNueva: true, resultadoAplicacion: true, motivoAplicacion: true,
    },
  });
  // Las versiones del Libro de Costos, sin `version`, `instante`, `dia` ni
  // `txid` —cambian en cada corrida—, y con el número de la lista sacado de
  // `origenRef`. Lo que sí se compara de `txid` es CUÁNTAS transacciones hubo.
  const camposVersion = `v.tipo::text AS tipo, v."precioCosto"::text AS costo, v."camposCambiados" AS campos,
     v.origen, replace(COALESCE(v."origenRef", ''), $2, '#') AS ref`;
  const versionesBase = await prisma.$queryRawUnsafe(
    `SELECT p.nombre, ${camposVersion}, v."unidadMedida", v."factorPack", v."modoCompraProveedor"
     FROM "CostoBaseVersion" v JOIN "ProductoBase" p ON p.id = v."productoBaseId"
     WHERE p."grupoId" = $1 ORDER BY p.nombre, v.version`,
    grupoId, String(importacionId)
  );
  const versionesLocal = await prisma.$queryRawUnsafe(
    `SELECT p.nombre, l.nombre AS local, ${camposVersion}, v."esDeposito"
     FROM "CostoUbicacionVersion" v
     JOIN "ProductoBase" p ON p.id = v."productoBaseId" JOIN "Local" l ON l.id = v."localId"
     WHERE p."grupoId" = $1 ORDER BY p.nombre, l.nombre, v.version`,
    grupoId, String(importacionId)
  );
  const transacciones = await prisma.$queryRawUnsafe(
    `SELECT v.origen, count(DISTINCT v.txid)::int AS n FROM (
       SELECT origen, txid, "productoBaseId" FROM "CostoBaseVersion"
       UNION ALL SELECT origen, txid, "productoBaseId" FROM "CostoUbicacionVersion") v
     JOIN "ProductoBase" p ON p.id = v."productoBaseId" WHERE p."grupoId" = $1 GROUP BY v.origen ORDER BY v.origen`,
    grupoId
  );
  const vinculos = await prisma.productoCodigoProveedor.findMany({
    where: { grupoId }, orderBy: { codigoInterno: "asc" },
    select: { codigoInterno: true, descripcionProveedor: true, productoBase: { select: { nombre: true } }, activo: true, origenAlta: true },
  });
  return normalizar({
    productos: productos.map((p) => ({ ...p, precio_costo: num(p.precio_costo), precio_venta: num(p.precio_venta) })),
    locales: locales
      .map((l) => ({ producto: l.base.nombre, local: l.local.nombre, costo: num(l.precio_costo), venta: num(l.precio_venta) }))
      .sort((a, b) => `${a.producto}|${a.local}`.localeCompare(`${b.producto}|${b.local}`)),
    filas: filas.map((f) => ({
      ...f,
      costoAplicado: num(f.costoAplicado), costoPrevioAplicacion: num(f.costoPrevioAplicacion),
      ventaAnterior: num(f.ventaAnterior), ventaNueva: num(f.ventaNueva),
    })),
    versionesBase,
    versionesLocal,
    transacciones,
    vinculos,
  });
}

/** Lo que registró la auditoría en el pedido: por modelo y entidad, el antes y el después. */
function auditoriaDe(store, nombres) {
  const buffer = store?.__auditBuffer ?? new Map();
  const entradas = [...buffer.values()].map((e) => ({
    modelo: e.modelo,
    tipo: e.tipo,
    // La entidad, por su nombre y no por su id.
    entidad: nombres.get(`${e.modelo}:${e.id}`) ?? `${e.modelo}:?`,
    antes: e.antes,
    despues: e.despues,
  }));
  // EN EL ORDEN DEL BUFFER, sin ordenar: el flush une los campos de un producto
  // quedándose con la primera aparición, así que el orden es parte del resultado.
  return normalizar(entradas);
}

// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const ext = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_extension WHERE extname = 'pg_stat_statements'`);
  if (!ext[0]?.n) {
    console.error("Falta pg_stat_statements en esta base: sin eso no se pueden contar las sentencias.");
    process.exit(2);
  }

  const { POST: importar } = await import("../../app/api/proveedores/listas/importar/route.js");
  const { GET: resultado } = await import("../../app/api/proveedores/listas/[id]/resultado/route.js");
  const { POST: seleccion } = await import("../../app/api/proveedores/listas/[id]/seleccion/route.js");
  const { POST: aplicar } = await import("../../app/api/proveedores/listas/[id]/aplicar/route.js");

  console.log(`\n=== RENDIMIENTO DE UNA LISTA DE PROVEEDOR (${SUFIJO}) ===\n`);
  const { grupo, dep, admin, arcor, bytes } = await sembrar();
  const A = cookieDe(admin, dep.id, grupo.id);
  const contextoDelPedido = () => {
    const store = seedAuditoria({ usuarioId: admin.id, grupoId: grupo.id, localId: dep.id });
    store.__auditBuffer = new Map();
    return store;
  };

  contextoDelPedido();
  const imp = await (await importar(pedidoUpload(`${BASE}/importar`, A, { bytes, nombre: "arcor.xlsx", proveedorId: arcor.id }))).json();
  if (!imp.ok) throw new Error(`La importación no entró: ${imp.error}`);
  const IMP = imp.importacionId;
  const renglones = await prisma.importacionListaFila.count({ where: { importacionId: IMP } });
  // Un nombre que se vinculó DESPUÉS de importar —en un comprobante, por
  // ejemplo—: la apertura tiene que atar ese renglón sola
  // (`alcanzarLoYaVinculadoPorNombre`). Sin esto la huella no cubriría el
  // camino que escribe.
  const productoDelAlias = await prisma.productoBase.findFirst({
    where: { grupoId: grupo.id, nombre: { startsWith: "ZZRL 0450" } },
    select: { id: true },
  });
  await prisma.productoCodigoProveedor.create({
    data: {
      grupoId: grupo.id, proveedorId: arcor.id, productoBaseId: productoDelAlias.id,
      codigoInterno: claveDeAlias("ARCOR SIN PRODUCTO 7"), descripcionProveedor: "ARCOR SIN PRODUCTO 7", activo: true,
    },
  });
  console.log(`Lista ${IMP}: ${renglones} renglones, ${VINCULADOS} vinculados, ${LOCALES} locales.\n`);

  // ── ABRIR ──
  contextoDelPedido();
  const abrir = await medir("abrir", async () => [await llamar(resultado, pedido(`${BASE}/${IMP}/resultado`, A), ctxId(IMP))]);
  const r0 = abrir.respuestas[0];
  if (!r0.ok) throw new Error(`resultado falló: ${r0.error}`);

  // ── TOQUE: «Dejar como está» en la primera tarjeta fuera de rango ──
  const tarjeta = (r0.tusProductos?.items ?? []).find((it) => it.dejar?.accion === "EXCLUIR");
  if (!tarjeta) throw new Error("No hay tarjeta fuera de rango para tocar.");
  // Lo que hace la pantalla: el pedido de la tarjeta y, después, esa tarjeta
  // sola (`resultado?productos=`), que se une con lo que ya tenía.
  contextoDelPedido();
  const toque = await medir("toque", async () => [
    await llamar(
      seleccion,
      pedido(`${BASE}/${IMP}/seleccion`, A, { accion: "EXCLUIR", ids: [tarjeta.filaId], soloEstaLista: true }),
      ctxId(IMP)
    ),
    await llamar(resultado, pedido(`${BASE}/${IMP}/resultado?productos=${tarjeta.productoBaseId}`, A), ctxId(IMP)),
  ]);
  // Lo que la pantalla tiene que mostrar después del toque: el resultado
  // entero, fuera de la medición. La unión tiene que dar exactamente eso.
  contextoDelPedido();
  const trasElToque = (await llamar(resultado, pedido(`${BASE}/${IMP}/resultado`, A), ctxId(IMP))).json;
  const unido = conLasTarjetasTocadas(r0, toque.respuestas[1]);

  // ── APLICAR ──
  const productoIds = (await prisma.productoBase.findMany({ where: { grupoId: grupo.id }, select: { id: true } })).map((p) => p.id);
  const nombres = new Map();
  for (const p of await prisma.productoBase.findMany({ where: { grupoId: grupo.id }, select: { id: true, nombre: true } })) {
    nombres.set(`ProductoBase:${p.id}`, sinSufijo(p.nombre));
  }
  for (const l of await prisma.productoLocal.findMany({
    where: { baseId: { in: productoIds } },
    select: { id: true, base: { select: { nombre: true } }, local: { select: { nombre: true } } },
  })) {
    nombres.set(`ProductoLocal:${l.id}`, sinSufijo(`${l.base.nombre} @ ${l.local.nombre}`));
  }
  const storeAplicar = contextoDelPedido();
  const releeTrasAplicar = process.env.APLICAR_SIN_RELEER !== "1";
  const apl = await medir("aplicar", async () => {
    const a = await llamar(aplicar, pedido(`${BASE}/${IMP}/aplicar`, A, { alcance: "SELECCIONADAS" }), ctxId(IMP));
    if (!releeTrasAplicar) return [a];
    return [a, await llamar(resultado, pedido(`${BASE}/${IMP}/resultado`, A), ctxId(IMP))];
  });
  const auditoria = auditoriaDe(storeAplicar, nombres);
  // Lo que la pantalla ve después de aplicar: el resultado entero, fuera de la
  // medición —la pantalla puede no pedirlo así, pero tiene que dar lo mismo—.
  contextoDelPedido();
  const trasAplicar = (await llamar(resultado, pedido(`${BASE}/${IMP}/resultado`, A), ctxId(IMP))).json;

  // ── Informe ──
  for (const m of [abrir, toque, apl]) {
    console.log(
      `${m.nombre.padEnd(8)} ${m.segundos.toFixed(2).padStart(6)} s   ${String(m.sentencias).padStart(5)} sentencias   ${(m.bytes / 1024).toFixed(0).padStart(5)} KB`
    );
  }
  console.log(`\naplicadas: ${apl.respuestas[0]?.resumen?.aplicadas}, omitidas: ${apl.respuestas[0]?.resumen?.omitidas}`);

  // ── Huella ──
  const huella = {
    abrir: normalizar(r0),
    trasElToque: normalizar(trasElToque),
    aplicar: normalizar(apl.respuestas[0]),
    trasAplicar: normalizar(trasAplicar),
    base: await estadoDeLaBase({ grupoId: grupo.id, importacionId: IMP, productoIds }),
    auditoria,
  };
  let fallas = 0;
  // EL TOQUE SIN RELEER DA LO MISMO QUE RELEER. Con el código de antes la ruta
  // no conoce `productos` y no hay respuesta parcial que unir.
  if (toque.respuestas[1]?.tusProductos?.orden) {
    const igual = JSON.stringify(normalizar(unido)) === JSON.stringify(normalizar(trasElToque));
    console.log(`\n${igual ? "IGUAL  " : "DISTINTO"} la tarjeta tocada unida con las demás, contra releer entera`);
    if (!igual) {
      fallas++;
      fs.writeFileSync(`${COMPARAR ?? GUARDAR ?? "huella"}.unido.json`, JSON.stringify(normalizar(unido), null, 1));
    }
  } else {
    console.log("\n(sin respuesta parcial: la ruta no conoce `productos`)");
  }
  if (GUARDAR) {
    fs.writeFileSync(GUARDAR, JSON.stringify(huella, null, 1));
    console.log(`\nHuella guardada en ${GUARDAR}.`);
  }
  if (COMPARAR) {
    const antes = JSON.parse(fs.readFileSync(COMPARAR, "utf8"));
    for (const parte of Object.keys(huella)) {
      const igual = JSON.stringify(antes[parte]) === JSON.stringify(huella[parte]);
      console.log(`${igual ? "IGUAL  " : "DISTINTO"} ${parte}`);
      if (!igual) {
        fallas++;
        fs.writeFileSync(`${COMPARAR}.${parte}.ahora.json`, JSON.stringify(huella[parte], null, 1));
      }
    }
  }
  if (LIMITES) {
    for (const m of [abrir, toque, apl]) {
      const ok = m.sentencias <= TECHO[m.nombre];
      console.log(`${ok ? "OK   " : "FALLA"} ${m.nombre}: ${m.sentencias} sentencias, techo ${TECHO[m.nombre]}`);
      if (!ok) fallas++;
    }
  }
  await prisma.$disconnect();
  process.exit(fallas ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
