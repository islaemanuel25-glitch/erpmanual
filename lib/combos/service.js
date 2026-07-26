// lib/combos/service.js
//
// Lógica de negocio de COMBOS exclusivos por local (E2 — solo backend).
// `prisma` se inyecta siempre (cliente real en runtime; mock en tests).
//
// Invariantes garantizadas acá + por el schema (FK compuestas + CHECK):
//   · El combo es un ProductoBase(es_combo=true, creadoEnLocalId=local propietario).
//   · Tiene UN solo ProductoLocal (el del local propietario) y NUNCA StockLocal.
//   · No se replica a otros locales. No se promueve. No se convierte en normal.
//   · Componentes: ProductoLocal existentes, activos, NO combo, del MISMO local.
//   · Precio MANUAL; costo = Σ(costoUnitario × cantidad) (informativo).

// Rutas relativas CON extensión .js (no alias "@/") para que los tests corran
// bajo `node --test` (Node ESM exige extensión; Turbopack/webpack la resuelven).
import {
  normalizarCodigosBarra,
  validarUnicidadCodigos,
} from "../productos/validarCodigosBarra.js";
import { errCombo } from "./errores.js";
import { esComboBase } from "./guards.js";
import {
  costoUnitarioComponente,
  costoCombo,
  gananciaYMargen,
  round2,
} from "./costo.js";
import { disponibilidadCombo } from "./disponibilidad.js";
import { redondear100 } from "../precios/redondeo.js";

// Formación de precio del combo (misma lógica que el form de Productos):
//  - modo MARGEN: precio = costo·(1 + margen/100), con redondeo a 100 (ceil) opcional.
//  - modo MANUAL: precio ingresado por el usuario.
// El COSTO es el del combo (Σ componentes, autoritativo). El backend recomputa el
// precio en modo margen para no confiar en el cálculo del cliente.
function precioDesdeMargen(costoTotal, margen, redondeo100) {
  const c = Number(costoTotal) || 0;
  const m = Number(margen);
  if (!Number.isFinite(m)) return null;
  const bruto = c * (1 + m / 100);
  return redondeo100 ? redondear100(bruto) : round2(bruto);
}

// Lee la formación desde el payload y valida el modo manual por adelantado.
function parseFormacionPrecio(data) {
  const margenRaw = data?.margen;
  const modoMargen =
    margenRaw !== null && margenRaw !== undefined && margenRaw !== "" && Number.isFinite(Number(margenRaw));
  const redondeo100 = Boolean(data?.redondeo_100);
  let precioManual = null;
  if (!modoMargen) {
    const p = Number(data?.precio_venta ?? data?.precioVenta);
    if (!Number.isFinite(p)) throw errCombo("El precio de venta es inválido.", 400);
    if (p <= 0) throw errCombo("El precio de venta debe ser mayor a 0.", 400);
    precioManual = round2(p);
  }
  return { modoMargen, margen: modoMargen ? Number(margenRaw) : null, redondeo100, precioManual };
}

// Resuelve el precio final una vez conocido el costo total (dentro de la tx).
function resolverPrecioVenta({ modoMargen, margen, redondeo100, precioManual, costoTotal }) {
  const precio = modoMargen ? precioDesdeMargen(costoTotal, margen, redondeo100) : precioManual;
  if (!(Number(precio) > 0)) throw errCombo("El precio de venta resultante debe ser mayor a 0.", 400);
  return round2(precio);
}

// ── Utils ───────────────────────────────────────────────────────────────────
async function getAllowNegativeStock(db, grupoId) {
  const cfg = await db.configuracionGrupo.findUnique({
    where: { grupoId: Number(grupoId) },
    select: { allowNegativeStock: true },
  });
  return cfg?.allowNegativeStock === true;
}

async function getEsDeposito(db, localId) {
  const local = await db.local.findUnique({
    where: { id: Number(localId) },
    select: { es_deposito: true },
  });
  if (!local) throw errCombo("El local activo no existe.", 404);
  return local.es_deposito === true;
}

// ── Validación de componentes (una sola consulta) ────────────────────────────
// Devuelve [{ productoLocal, base, cantidad }] o lanza errCombo.
async function cargarYValidarComponentes(db, { localId, componentesInput }) {
  if (!Array.isArray(componentesInput) || componentesInput.length === 0) {
    throw errCombo("El combo debe tener al menos un componente.", 400);
  }

  const vistos = new Set();
  const pedidos = [];
  for (const c of componentesInput) {
    const plId = Number(c?.componenteProductoLocalId);
    if (!Number.isInteger(plId) || plId <= 0) {
      throw errCombo("componenteProductoLocalId inválido.", 400);
    }
    const cantidad = Number(c?.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw errCombo(`La cantidad del componente ${plId} debe ser mayor a 0.`, 400);
    }
    if (vistos.has(plId)) {
      throw errCombo(`El componente ${plId} está duplicado en el combo.`, 400);
    }
    vistos.add(plId);
    pedidos.push({ componenteProductoLocalId: plId, cantidad });
  }

  const ids = pedidos.map((p) => p.componenteProductoLocalId);
  const pls = await db.productoLocal.findMany({
    where: { id: { in: ids } },
    include: { base: true },
  });
  const porId = new Map(pls.map((pl) => [pl.id, pl]));

  const out = [];
  for (const p of pedidos) {
    const pl = porId.get(p.componenteProductoLocalId);
    if (!pl) throw errCombo(`El componente ${p.componenteProductoLocalId} no existe.`, 404);
    if (pl.localId !== Number(localId)) {
      throw errCombo(
        `El componente ${p.componenteProductoLocalId} no pertenece a este local.`,
        400
      );
    }
    if (esComboBase(pl.base)) {
      throw errCombo(`Un combo no puede contener otro combo ("${pl.base?.nombre ?? p.componenteProductoLocalId}").`, 400);
    }
    if (pl.activo !== true) {
      throw errCombo(`El componente "${pl.base?.nombre ?? p.componenteProductoLocalId}" está inactivo.`, 400);
    }
    if (pl.base?.activo !== true) {
      throw errCombo(`El producto base del componente "${pl.base?.nombre ?? p.componenteProductoLocalId}" está inactivo.`, 400);
    }
    out.push({ productoLocal: pl, base: pl.base, cantidad: p.cantidad });
  }
  return out;
}

// ── Resolver un combo por su ProductoLocal.id (identidad exacta por ubicación) ─
async function resolverComboPL(db, { grupoId, localId, productoLocalId }) {
  const id = Number(productoLocalId);
  if (!Number.isInteger(id) || id <= 0) throw errCombo("productoLocalId inválido.", 400);

  const pl = await db.productoLocal.findUnique({
    where: { id },
    include: { base: true, stock: { where: { localId: Number(localId) }, select: { id: true } } },
  });

  if (!pl) throw errCombo("El combo no existe.", 404);
  if (pl.localId !== Number(localId)) throw errCombo("El combo no pertenece a este local.", 403);
  if (!esComboBase(pl.base)) throw errCombo("El producto no es un combo.", 400);
  if (pl.base.grupoId !== Number(grupoId)) throw errCombo("El combo no pertenece a este grupo.", 403);
  if (pl.base.creadoEnLocalId !== Number(localId)) {
    throw errCombo("El combo no fue creado en este local.", 403);
  }

  const tieneStockPropio = Array.isArray(pl.stock) && pl.stock.length > 0;
  return { productoLocal: pl, base: pl.base, tieneStockPropio };
}

// ── Armar el DTO completo del combo (identidad + componentes + costo + disp) ──
async function buildComboDTO(db, { grupoId, localId, comboPL, base, esDeposito, tieneStockPropio }) {
  const filas = await db.comboComponente.findMany({
    where: { comboProductoLocalId: comboPL.id },
    orderBy: { id: "asc" },
  });

  const compIds = filas.map((f) => f.componenteProductoLocalId);
  const pls = compIds.length
    ? await db.productoLocal.findMany({
        where: { id: { in: compIds } },
        include: {
          base: true,
          stock: { where: { localId: Number(localId) }, select: { cantidad: true } },
        },
      })
    : [];
  const porId = new Map(pls.map((pl) => [pl.id, pl]));

  const componentes = [];
  const paraDisp = [];
  const paraCosto = [];

  for (const f of filas) {
    const pl = porId.get(f.componenteProductoLocalId) || null;
    const b = pl?.base || null;
    const activo = pl?.activo === true && b?.activo === true;
    const tieneStockLocal = !!(pl && Array.isArray(pl.stock) && pl.stock.length > 0);
    const stock = tieneStockLocal ? Number(pl.stock[0].cantidad) : null;
    const cantidad = Number(f.cantidad);
    const costoUnitario = pl ? costoUnitarioComponente({ base: b, productoLocal: pl, esDeposito }) : 0;
    const costoLinea = round2(costoUnitario * cantidad);

    const advertencias = [];
    if (!pl) advertencias.push("COMPONENTE_INEXISTENTE");
    if (pl && pl.activo !== true) advertencias.push("PRODUCTOLOCAL_INACTIVO");
    if (b && b.activo !== true) advertencias.push("BASE_INACTIVO");
    if (pl && !tieneStockLocal) advertencias.push("SIN_STOCKLOCAL");
    if (!(cantidad > 0)) advertencias.push("CANTIDAD_INVALIDA");

    componentes.push({
      comboComponenteId: f.id,
      componenteProductoLocalId: f.componenteProductoLocalId,
      componenteBaseId: b?.id ?? null,
      nombre: b?.nombre ?? null,
      cantidad,
      activo,
      tieneStockLocal,
      stock,
      costoUnitario,
      costoLinea,
      advertencias,
    });
    paraDisp.push({ componenteProductoLocalId: f.componenteProductoLocalId, cantidad, activo, tieneStockLocal, stock });
    paraCosto.push({ costoUnitario, cantidad });
  }

  const costoTotal = costoCombo(paraCosto);
  const precioVenta = Number(comboPL.precio_venta ?? base.precio_venta ?? 0);
  const { ganancia, margen } = gananciaYMargen({ precioVenta, costoTotal });

  const allowNegativeStock = await getAllowNegativeStock(db, grupoId);
  const disp = disponibilidadCombo({ componentes: paraDisp, allowNegativeStock });

  const advertencias = [];
  if (tieneStockPropio) advertencias.push("COMBO_CON_STOCKLOCAL"); // no debería ocurrir
  if (disp.inconsistente) advertencias.push("COMPOSICION_INCONSISTENTE");

  return {
    productoLocalId: comboPL.id,
    baseId: base.id,
    localId: Number(localId),
    grupoId: Number(grupoId),
    nombre: base.nombre,
    codigo_barra: base.codigo_barra ?? null,
    codigo_barra_secundario: base.codigo_barra_secundario ?? null,
    precio_venta: precioVenta,
    // Formación de precio persistida (para reconstruir el modo al editar):
    //   margenConfigurado != null → modo "por margen"; null → modo "manual".
    margenConfigurado: base.margen != null ? Number(base.margen) : null,
    redondeo_100: base.redondeo_100 === true,
    activo: comboPL.activo === true && base.activo === true,
    esCombo: true,
    componentes,
    costoTotal,
    ganancia,
    margen,
    disponibilidad: disp.disponibilidad,
    inconsistente: disp.inconsistente,
    bloqueadoEstructural: disp.bloqueadoEstructural,
    allowNegativeStock: disp.allowNegativeStock,
    advertencias,
  };
}

// ── API pública del service ──────────────────────────────────────────────────

// Crear un combo en el contexto del local activo (incluye depósito). Exclusivo
// de esa ubicación: 1 ProductoBase(es_combo) + 1 ProductoLocal, sin StockLocal.
export async function crearCombo({ prisma, grupoId, localId, data }) {
  const nombre = (data?.nombre ?? "").toString().trim();
  if (!nombre) throw errCombo("El nombre del combo es obligatorio.", 400);
  const formacion = parseFormacionPrecio(data);

  const norm = normalizarCodigosBarra({
    codigoBarra: data?.codigo_barra,
    codigoBarraSecundario: data?.codigo_barra_secundario,
  });
  if (!norm.ok) throw errCombo(norm.error, 400);

  const esDeposito = await getEsDeposito(prisma, localId);

  const created = await prisma.$transaction(async (tx) => {
    const vUnic = await validarUnicidadCodigos({
      prisma: tx,
      grupoId: Number(grupoId),
      baseIdExcluir: null,
      principal: norm.principal,
      secundario: norm.secundario,
    });
    if (!vUnic.ok) throw errCombo(vUnic.error, 400);

    const comps = await cargarYValidarComponentes(tx, { localId, componentesInput: data?.componentes });
    const conCosto = comps.map((c) => ({
      ...c,
      costoUnitario: costoUnitarioComponente({ base: c.base, productoLocal: c.productoLocal, esDeposito }),
    }));
    const costoTotal = costoCombo(conCosto);
    // Precio final: server-authoritative (recomputa desde el costo real en modo margen).
    const precioVenta = resolverPrecioVenta({ ...formacion, costoTotal });

    // ProductoBase del combo — exclusivo del local propietario, sin replicar.
    const base = await tx.productoBase.create({
      data: {
        grupoId: Number(grupoId),
        creadoEnLocalId: Number(localId),
        nombre,
        codigo_barra: norm.principal,
        codigo_barra_secundario: norm.secundario,
        unidad_medida: "unidad",
        factor_pack: null,
        precio_costo: costoTotal, // Σ componentes (autoritativo)
        precio_venta: precioVenta,
        margen: formacion.margen, // configurado (null = precio manual)
        redondeo_100: formacion.redondeo100,
        activo: true,
        es_combo: true,
      },
    });

    // UN ProductoLocal (local propietario). SIN StockLocal.
    const comboPL = await tx.productoLocal.create({
      data: {
        localId: Number(localId),
        baseId: base.id,
        precio_costo: costoTotal,
        precio_venta: precioVenta,
        margen: formacion.margen,
        activo: true,
      },
    });

    await tx.comboComponente.createMany({
      data: conCosto.map((c) => ({
        comboProductoLocalId: comboPL.id,
        comboLocalId: Number(localId),
        componenteProductoLocalId: c.productoLocal.id,
        componenteLocalId: Number(localId),
        cantidad: c.cantidad,
      })),
    });

    return { comboPLId: comboPL.id };
  });

  return getCombo({ prisma, grupoId, localId, productoLocalId: created.comboPLId });
}

// Leer un combo por su ProductoLocal.id (validando propiedad del local activo).
export async function getCombo({ prisma, grupoId, localId, productoLocalId }) {
  const { productoLocal: comboPL, base, tieneStockPropio } = await resolverComboPL(prisma, {
    grupoId,
    localId,
    productoLocalId,
  });
  const esDeposito = await getEsDeposito(prisma, localId);
  return buildComboDTO(prisma, { grupoId, localId, comboPL, base, esDeposito, tieneStockPropio });
}

// Editar un combo: identidad + precio + estado + reemplazo de composición.
// Nunca cambia el local propietario ni deja de ser combo; no crea StockLocal;
// no toca ventas históricas ni VentaDetalleComponente.
export async function editarCombo({ prisma, grupoId, localId, productoLocalId, data }) {
  const { productoLocal: comboPL, base } = await resolverComboPL(prisma, {
    grupoId,
    localId,
    productoLocalId,
  });

  const nombre = (data?.nombre ?? "").toString().trim();
  if (!nombre) throw errCombo("El nombre del combo es obligatorio.", 400);
  const formacion = parseFormacionPrecio(data);
  const activo = data?.activo === undefined ? base.activo === true : Boolean(data.activo);

  const norm = normalizarCodigosBarra({
    codigoBarra: data?.codigo_barra,
    codigoBarraSecundario: data?.codigo_barra_secundario,
  });
  if (!norm.ok) throw errCombo(norm.error, 400);

  const esDeposito = await getEsDeposito(prisma, localId);

  await prisma.$transaction(async (tx) => {
    const vUnic = await validarUnicidadCodigos({
      prisma: tx,
      grupoId: Number(grupoId),
      baseIdExcluir: base.id,
      principal: norm.principal,
      secundario: norm.secundario,
    });
    if (!vUnic.ok) throw errCombo(vUnic.error, 400);

    const comps = await cargarYValidarComponentes(tx, { localId, componentesInput: data?.componentes });
    const conCosto = comps.map((c) => ({
      ...c,
      costoUnitario: costoUnitarioComponente({ base: c.base, productoLocal: c.productoLocal, esDeposito }),
    }));
    const costoTotal = costoCombo(conCosto);
    const precioVenta = resolverPrecioVenta({ ...formacion, costoTotal });

    await tx.productoBase.update({
      where: { id: base.id },
      data: {
        nombre,
        codigo_barra: norm.principal,
        codigo_barra_secundario: norm.secundario,
        precio_costo: costoTotal,
        precio_venta: precioVenta,
        margen: formacion.margen,
        redondeo_100: formacion.redondeo100,
        activo,
        es_combo: true, // defensivo: nunca deja de ser combo
        creadoEnLocalId: Number(localId), // defensivo: nunca cambia el local propietario
      },
    });
    await tx.productoLocal.update({
      where: { id: comboPL.id },
      data: { precio_costo: costoTotal, precio_venta: precioVenta, margen: formacion.margen, activo },
    });

    // Reemplazar composición — NO toca VentaDetalleComponente histórico.
    await tx.comboComponente.deleteMany({ where: { comboProductoLocalId: comboPL.id } });
    await tx.comboComponente.createMany({
      data: conCosto.map((c) => ({
        comboProductoLocalId: comboPL.id,
        comboLocalId: Number(localId),
        componenteProductoLocalId: c.productoLocal.id,
        componenteLocalId: Number(localId),
        cantidad: c.cantidad,
      })),
    });
  });

  return getCombo({ prisma, grupoId, localId, productoLocalId: comboPL.id });
}

// Disponibilidad del combo (componente limitante) — reutiliza disponibilidadCombo.
export async function getDisponibilidad({ prisma, grupoId, localId, productoLocalId }) {
  const { productoLocal: comboPL } = await resolverComboPL(prisma, { grupoId, localId, productoLocalId });

  const filas = await prisma.comboComponente.findMany({
    where: { comboProductoLocalId: comboPL.id },
    orderBy: { id: "asc" },
  });
  const compIds = filas.map((f) => f.componenteProductoLocalId);
  const pls = compIds.length
    ? await prisma.productoLocal.findMany({
        where: { id: { in: compIds } },
        include: {
          base: { select: { activo: true } },
          stock: { where: { localId: Number(localId) }, select: { cantidad: true } },
        },
      })
    : [];
  const porId = new Map(pls.map((pl) => [pl.id, pl]));

  const componentes = filas.map((f) => {
    const pl = porId.get(f.componenteProductoLocalId) || null;
    const activo = pl?.activo === true && pl?.base?.activo === true;
    const tieneStockLocal = !!(pl && Array.isArray(pl.stock) && pl.stock.length > 0);
    const stock = tieneStockLocal ? Number(pl.stock[0].cantidad) : null;
    return { componenteProductoLocalId: f.componenteProductoLocalId, cantidad: Number(f.cantidad), activo, tieneStockLocal, stock };
  });

  const allowNegativeStock = await getAllowNegativeStock(prisma, grupoId);
  const disp = disponibilidadCombo({ componentes, allowNegativeStock });
  return { productoLocalId: comboPL.id, localId: Number(localId), ...disp };
}

// Exports internos para tests unitarios finos.
export const _internals = { cargarYValidarComponentes, resolverComboPL, buildComboDTO };
