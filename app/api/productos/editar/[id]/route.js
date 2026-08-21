import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { mergeBaseLocalToUi, splitUiToDb } from "@/lib/mappers/producto";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveScope } from "@/lib/grupos";
import { getDepositoIdDeGrupo } from "@/lib/visibilidad";
import { normalizarCodigosBarra, validarUnicidadCodigos } from "@/lib/productos/validarCodigosBarra";
import { esComboBase } from "@/lib/combos/guards";
import {
  puedeEditarCosto,
  mensajeCostoNoEditable,
  mismoCosto,
  resolverRutaEdicion,
  mensajeProductoAjeno,
  mensajeFichaMaestraNoEditable,
} from "@/lib/productos/propiedadCosto";
import {
  normalizarCodigoPropio,
  esRedundanteConGlobalPropio,
  buscarColisionCodigoPropio,
  mensajeColisionCodigoPropio,
} from "@/lib/productos/codigoBarraPropio";
import { validarRecargoServicioPct } from "@/lib/pos-ventas/servicios";
import { propagarCostoALocales } from "@/lib/precios/propagarCostoALocales";

// ── Detección de "guardado engañoso" ────────────────────────────────────────
// Cuando la ruta es 'override' (un local edita un producto de depósito), SOLO se
// persiste el override de ProductoLocal. Si el payload trae cambios en la FICHA
// MAESTRA (que ese alcance NO guarda), hay que RECHAZAR en vez de descartarlos en
// silencio. Se comparan con normalización por tipo para no dar falsos positivos
// por formato (el front reenvía los valores actuales de la base).
const _eqNum = (a, b) => {
  const na = a === null || a === undefined || a === "" ? null : Number(a);
  const nb = b === null || b === undefined || b === "" ? null : Number(b);
  if (na === null && nb === null) return true;
  if (na === null || nb === null) return false;
  if (Number.isNaN(na) || Number.isNaN(nb)) return false;
  return Math.abs(na - nb) < 1e-6;
};
const _eqStr = (a, b) => {
  const sa = a === null || a === undefined ? "" : String(a).trim();
  const sb = b === null || b === undefined ? "" : String(b).trim();
  return sa === sb;
};
const _eqBool = (a, b) => Boolean(a) === Boolean(b);
const _dayOf = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
const _eqDate = (a, b) => _dayOf(a) === _dayOf(b);

// Campos MAESTROS que edita `editarBase` y NO edita `editarOverride`. Se comparan
// SOLO campos que el formulario reenvía fielmente (sin inyección de defaults que
// falsee un cambio): quedan fuera los recompuestos por el front (modo_pedido,
// modo_envio, recargoServicioDefaultPct) y los que no viajan (modo_stock,
// pesoPromedioKg). `factor_pack` se trata aparte (el form lo fuerza a 1 en "unidad").
// Los overrides locales (precio_venta/margen/activo/recargoServicioPct) NO son maestros.
const CAMPOS_FICHA_MAESTRA = [
  ["nombre", _eqStr], ["descripcion", _eqStr], ["sku", _eqStr],
  ["codigo_barra", _eqStr], ["codigo_barra_secundario", _eqStr],
  ["categoria_id", _eqNum], ["proveedor_id", _eqNum], ["proveedor2_id", _eqNum],
  ["proveedor3_id", _eqNum], ["area_fisica_id", _eqNum],
  ["unidad_medida", _eqStr],
  ["peso_kg", _eqNum], ["volumen_ml", _eqNum],
  ["modoCompraProveedor", _eqStr], ["pesoReferenciaKg", _eqNum],
  ["pesoEsFijo", _eqBool], ["modoVentaDeposito", _eqStr],
  ["actualizaPromedioPorRecepcion", _eqBool],
  ["precio_sugerido", _eqNum], ["iva_porcentaje", _eqNum],
  ["fecha_vencimiento", _eqDate],
  ["redondeo_100", _eqBool], ["imagen_url", _eqStr],
  ["modalidad", _eqStr],
];

// factor_pack: el formulario lo fuerza a 1 cuando la unidad es "unidad" (donde el
// factor es irrelevante). Normalizamos ambos lados con la unidad ALMACENADA para no
// marcar un cambio inexistente.
function _factorNorm(v, unidadAlmacenada) {
  if (unidadAlmacenada === "unidad") return 1;
  return v === null || v === undefined || v === "" ? null : Number(v);
}

/** Devuelve el nombre del primer campo maestro cambiado respecto de la base, o null. */
function detectarCambioFichaMaestra(baseData, base) {
  for (const [k, eq] of CAMPOS_FICHA_MAESTRA) {
    if (!eq(baseData[k], base[k])) return k;
  }
  if (!_eqNum(_factorNorm(baseData.factor_pack, base?.unidad_medida), _factorNorm(base?.factor_pack, base?.unidad_medida))) {
    return "factor_pack";
  }
  return null;
}

// Sincronizar precioCosto/activo a overrides, recalculando precio_venta por margen
async function syncFromBaseToLocales(baseId, { precioCosto, activo }) {
  if (precioCosto === undefined && activo === undefined) return;

  const base = await prisma.productoBase.findUnique({
    where: { id: baseId },
    // unidad y factor los necesita la regla de recargo fijo por unidad.
    select: { margen: true, redondeo_100: true, unidad_medida: true, factor_pack: true },
  });

  if (!base) return;

  // El recálculo por costo vive en un único lugar (lib/precios/propagarCostoALocales),
  // compartido con el flujo de compras. Tenerlo duplicado era lo que permitía que los
  // dos caminos se comportaran distinto: por edición se propagaba a todos los locales
  // y por compra solo al que compraba.
  let propagacion = null;
  if (precioCosto !== undefined && precioCosto !== null) {
    propagacion = await propagarCostoALocales(prisma, {
      baseId,
      costo: precioCosto,
      margenBase: base.margen,
      redondeo100: base.redondeo_100 === true,
      unidadMedida: base.unidad_medida,
      factorPack: base.factor_pack,
    });

    const enRiesgo = propagacion.sinMargen.filter((x) => x.bajoCosto);
    if (enRiesgo.length > 0) {
      console.warn(
        `[productos/editar] producto ${baseId}: costo nuevo ${precioCosto} y ${enRiesgo.length} ubicación(es) ` +
          `sin margen configurado quedaron por debajo del costo: ` +
          enRiesgo.map((x) => `local ${x.localId} ($${x.precioVenta})`).join(", ")
      );
    }
  }

  if (activo !== undefined) {
    await prisma.productoLocal.updateMany({ where: { baseId }, data: { activo: Boolean(activo) } });
  }

  return propagacion;
}

export async function PUT(req, context) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "productos.editar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { id } = await context.params;
    const baseId = Number(id);

    if (!baseId || Number.isNaN(baseId)) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    const url = new URL(req.url);
    const qLocal = url.searchParams.get("localId");

    // Alcance seguro: no-admin no puede indicar un localId ajeno (→403); admin usa
    // contexto explícito. El grupo se deriva del alcance, NUNCA del cliente.
    const scope = await resolveScope(req, { explicitLocalId: qLocal });
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }
    const { grupoId } = scope;

    // Existencia + pertenencia al grupo del alcance.
    const baseScope = await prisma.productoBase.findUnique({
      where: { id: baseId },
      select: { id: true, grupoId: true, es_combo: true, creadoEnLocalId: true, precio_costo: true },
    });
    if (!baseScope) {
      return NextResponse.json({ ok: false, error: "Producto no encontrado" }, { status: 404 });
    }
    if (baseScope.grupoId !== grupoId) {
      // Recurso de otro grupo en una MODIFICACIÓN → 403.
      return NextResponse.json({ ok: false, error: "Producto fuera de tu alcance." }, { status: 403 });
    }

    const payload = await req.json();

    // ── PROPIEDAD DEL COSTO ──────────────────────────────────────────────
    // El costo (base y override) solo lo administra el DUEÑO del producto:
    // el depósito para productos de depósito; el local creador para exclusivos.
    // La ubicación que opera se toma del alcance autorizado (server-side), nunca
    // de un flag del cliente. Un intento de un no-dueño de CAMBIAR el costo → 403;
    // si el costo viene igual al actual (reenvío del form), se ignora sin error.
    const operandoEnLocalId = Number(scope.localId);
    const depositoLocalId = await getDepositoIdDeGrupo(grupoId);
    const puedeCosto = puedeEditarCosto(operandoEnLocalId, baseScope.creadoEnLocalId, depositoLocalId);
    if (!puedeCosto) {
      // Costo efectivo actual en la ubicación que opera (override ?? maestro).
      let overrideCost = null;
      if (operandoEnLocalId > 0) {
        const ov = await prisma.productoLocal.findFirst({
          where: { baseId, localId: operandoEnLocalId },
          select: { precio_costo: true },
        });
        overrideCost = ov?.precio_costo ?? null;
      }
      const currentCost = overrideCost ?? baseScope.precio_costo;
      const submitted = payload.precio_costo;
      const intentaCambiar =
        submitted !== undefined && submitted !== null && submitted !== "" && !mismoCosto(submitted, currentCost);
      if (intentaCambiar) {
        return NextResponse.json(
          { ok: false, error: mensajeCostoNoEditable(baseScope.creadoEnLocalId, depositoLocalId) },
          { status: 403 }
        );
      }
      // No es dueño y no cambia el costo → seguir editando el resto SIN tocar el costo.
      payload.precio_costo = undefined;
    }

    // Validar proveedores no repetidos
    const toNum = (v) =>
      v === "" || v === null || v === undefined || Number.isNaN(Number(v))
        ? null
        : Number(v);
    const provIds = [toNum(payload.proveedor_id), toNum(payload.proveedor2_id), toNum(payload.proveedor3_id)]
      .filter((v) => v !== null && v !== 0);
    const provSet = new Set(provIds);
    if (provSet.size !== provIds.length) {
      return NextResponse.json(
        { ok: false, error: "Los proveedores no pueden repetirse" },
        { status: 400 }
      );
    }

    // Normalizar y validar códigos de barra (principal + secundario)
    const norm = normalizarCodigosBarra({
      codigoBarra: payload.codigo_barra,
      codigoBarraSecundario: payload.codigo_barra_secundario,
    });
    if (!norm.ok) {
      return NextResponse.json({ ok: false, error: norm.error }, { status: 400 });
    }

    // baseScope ya resuelto arriba (existencia + pertenencia al grupo del alcance).
    if (baseScope) {
      // Impedir convertir un producto en combo (o viceversa) desde este editor.
      if (Boolean(payload.es_combo) !== esComboBase(baseScope)) {
        return NextResponse.json(
          { ok: false, error: "No se puede convertir un producto en combo ni un combo en producto normal." },
          { status: 400 }
        );
      }
      const vUnic = await validarUnicidadCodigos({
        prisma,
        grupoId: baseScope.grupoId,
        baseIdExcluir: baseId,
        principal: norm.principal,
        secundario: norm.secundario,
      });
      if (!vUnic.ok) {
        return NextResponse.json({ ok: false, error: vUnic.error }, { status: 400 });
      }
    }

    payload.codigo_barra = norm.principal;
    payload.codigo_barra_secundario = norm.secundario;

    // separar base vs local con snake_case
    const { baseData, localData } = splitUiToDb(payload);

    // ── CÓDIGO DE BARRAS PROPIO POR UBICACIÓN (opcional) ──────────────────
    // Tercer código, independiente de los dos globales de la base; vive en el
    // ProductoLocal de la ubicación que opera. Se procesa SOLO si el cliente lo envió
    // (undefined = no tocar → compat con clientes que no lo manejan). Se normaliza y
    // se colapsa a null si es redundante con un código global del propio producto.
    const propioEnviado = payload.codigo_barra_propio !== undefined;
    let codigoPropio = null;
    if (propioEnviado) {
      codigoPropio = normalizarCodigoPropio(payload.codigo_barra_propio);
      if (esRedundanteConGlobalPropio(codigoPropio, norm.principal, norm.secundario)) {
        codigoPropio = null;
      }
    }

    // ── RUTEO POR PROPIEDAD (no por es_deposito) ──────────────────────────
    // Dueño → edita la ficha maestra (base). Local NO dueño de un producto de
    // depósito → solo su override. Producto exclusivo de otro local → denegado.
    // El admin conserva su comportamiento vigente por ubicación.
    const esDepositoContext = depositoLocalId != null && operandoEnLocalId === depositoLocalId;
    const ruta = resolverRutaEdicion({
      esAdmin: !!scope.session?.esAdmin,
      operandoEnLocalId,
      esDepositoContext,
      creadoEnLocalId: baseScope.creadoEnLocalId,
      depositoLocalId,
    });

    if (ruta === "deny") {
      return NextResponse.json({ ok: false, error: mensajeProductoAjeno() }, { status: 403 });
    }

    // Validar COLISIÓN del código propio dentro de la ubicación operante, ANTES de
    // persistir (contra código propio de otro producto + globales de otros productos
    // visibles acá). El índice único (localId, codigo_barra_propio) es el respaldo
    // ante concurrencia (P2002, más abajo).
    if (propioEnviado && codigoPropio != null) {
      const colision = await buscarColisionCodigoPropio({
        db: prisma, localId: operandoEnLocalId, codigo: codigoPropio, baseIdExcluir: baseId,
      });
      if (colision) {
        return NextResponse.json(
          { ok: false, error: mensajeColisionCodigoPropio(colision, codigoPropio) },
          { status: 409 }
        );
      }
    }

    // Editar la base o el override (capturamos la respuesta para luego persistir el
    // código propio en la MISMA ubicación operante, cualquiera sea la ruta).
    let resp;
    if (ruta === "base") {
      resp = await editarBase(baseId, baseData, operandoEnLocalId, localData);
    } else {
      // ruta === "override": producto de depósito editado desde un local. Solo se
      // persiste el override. Si el payload intenta cambiar la ficha maestra (que este
      // alcance NO guarda), rechazar en vez de devolver un éxito engañoso.
      const baseFull = await prisma.productoBase.findUnique({ where: { id: baseId } });
      const campoMaestro = detectarCambioFichaMaestra(baseData, baseFull || {});
      if (campoMaestro) {
        return NextResponse.json(
          { ok: false, error: mensajeFichaMaestraNoEditable(), campo: campoMaestro },
          { status: 403 }
        );
      }
      resp = await editarOverride(baseId, operandoEnLocalId, localData);
    }

    // Persistir el código propio en el ProductoLocal de la ubicación operante (existe
    // siempre: el producto está materializado en el local que lo edita). P2002 = otro
    // producto tomó ese código propio concurrentemente → colisión.
    if (propioEnviado) {
      try {
        await prisma.productoLocal.update({
          where: { localId_baseId: { localId: operandoEnLocalId, baseId } },
          data: { codigo_barra_propio: codigoPropio },
        });
      } catch (e) {
        if (e?.code === "P2002") {
          return NextResponse.json(
            { ok: false, error: `El código ${codigoPropio} ya está asignado como código propio de otro producto en esta ubicación.` },
            { status: 409 }
          );
        }
        throw e;
      }
    }

    return resp;
  } catch (e) {
    console.error("ERROR productos/editar:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

/* ============================================================
   EDITAR PRODUCTO BASE — FIX FINAL
   ============================================================ */
// Validar modo_pedido según unidad_medida y factor_pack
function validarModoPedido(modoPedido, unidadMedida, factorPack) {
  // Si unidad_medida es unidad o factor_pack es null/1, forzar UNIDAD
  if (unidadMedida === "unidad" || !factorPack || factorPack <= 1) {
    return "UNIDAD";
  }
  // Si es pack/cajon y factor > 1, puede ser BULTO o UNIDAD
  if (modoPedido === "BULTO" || modoPedido === "UNIDAD") {
    return modoPedido;
  }
  // Default: BULTO si tiene factor > 1
  return "BULTO";
}

async function editarBase(baseId, baseData, operandoEnLocalId = null, localData = null) {
  const dataFinal = {
    nombre: baseData.nombre,
    descripcion: baseData.descripcion,
    sku: baseData.sku,
    codigo_barra: baseData.codigo_barra,
    codigo_barra_secundario: baseData.codigo_barra_secundario,

    unidad_medida: baseData.unidad_medida,
    factor_pack: baseData.factor_pack,
    modo_pedido: validarModoPedido(baseData.modo_pedido, baseData.unidad_medida, baseData.factor_pack),

    peso_kg: baseData.peso_kg,
    volumen_ml: baseData.volumen_ml,

    // `?? undefined`: el costo es NOT NULL en el schema, así que un null (costo
    // ausente o bloqueado por propiedad) significa "no cambiar", nunca "borrar".
    // Elimina el borrado accidental del costo al editar sin tocarlo.
    precio_costo: baseData.precio_costo ?? undefined,
    precio_venta: baseData.precio_venta,
    margen: baseData.margen,

    precio_sugerido: baseData.precio_sugerido,
    iva_porcentaje: baseData.iva_porcentaje,

    fecha_vencimiento: baseData.fecha_vencimiento,

    redondeo_100: baseData.redondeo_100,
    activo: baseData.activo,

    imagen_url: baseData.imagen_url,
    es_combo: baseData.es_combo,

    // Servicios de importe variable: modalidad + recargo default (validado server-side).
    modalidad: baseData.modalidad === "IMPORTE_VARIABLE" ? "IMPORTE_VARIABLE" : "NORMAL",
    recargoServicioDefaultPct:
      baseData.modalidad === "IMPORTE_VARIABLE"
        ? (validarRecargoServicioPct(baseData.recargoServicioDefaultPct).valido
            ? validarRecargoServicioPct(baseData.recargoServicioDefaultPct).pct
            : 0)
        : null,

    categoria_id: baseData.categoria_id ? Number(baseData.categoria_id) : null,
    proveedor_id: baseData.proveedor_id ? Number(baseData.proveedor_id) : null,
    proveedor2_id: baseData.proveedor2_id ? Number(baseData.proveedor2_id) : null,
    proveedor3_id: baseData.proveedor3_id ? Number(baseData.proveedor3_id) : null,
    area_fisica_id: baseData.area_fisica_id ? Number(baseData.area_fisica_id) : null,
  };

  // Fiambre fields
  if (baseData.modoCompraProveedor !== undefined) {
    dataFinal.modoCompraProveedor = baseData.modoCompraProveedor;
  }
  if (baseData.pesoReferenciaKg !== undefined) {
    dataFinal.pesoReferenciaKg = baseData.pesoReferenciaKg;
  }
  if (baseData.pesoEsFijo !== undefined) {
    dataFinal.pesoEsFijo = baseData.pesoEsFijo;
  }
  if (baseData.modoVentaDeposito !== undefined) {
    dataFinal.modoVentaDeposito = baseData.modoVentaDeposito;
  }
  if (baseData.pesoPromedioKg !== undefined) {
    dataFinal.pesoPromedioKg = baseData.pesoPromedioKg;
  }
  if (baseData.actualizaPromedioPorRecepcion !== undefined) {
    dataFinal.actualizaPromedioPorRecepcion = baseData.actualizaPromedioPorRecepcion;
  }

  // Agregar modo_envio y modo_stock solo si están disponibles (después de migración)
  if (baseData.modo_envio !== undefined) {
    dataFinal.modo_envio = baseData.modo_envio;
  } else if (baseData.unidad_medida === "cajon") {
    dataFinal.modo_envio = "SOLO_BULTO";
  } else {
    dataFinal.modo_envio = "MIXTO";
  }

  if (baseData.modo_stock !== undefined) {
    dataFinal.modo_stock = baseData.modo_stock;
  } else {
    dataFinal.modo_stock = "BULTO";
  }

  let updated;
  try {
    updated = await prisma.productoBase.update({
      where: { id: baseId },
      data: dataFinal,
      include: { locales: true },
    });
  } catch (e) {
    // Si falla porque los campos modo_envio/modo_stock no existen (migración no ejecutada),
    // intentar sin esos campos
    if (
      e.message?.includes("modo_envio") ||
      e.message?.includes("modo_stock") ||
      e.message?.includes("modoCompraProveedor") ||
      e.message?.includes("pesoReferenciaKg") ||
      e.message?.includes("pesoEsFijo") ||
      e.message?.includes("modoVentaDeposito") ||
      e.message?.includes("pesoPromedioKg") ||
      e.message?.includes("actualizaPromedioPorRecepcion") ||
      e.message?.includes("codigo_barra_secundario")
    ) {
      delete dataFinal.modo_envio;
      delete dataFinal.modo_stock;
      delete dataFinal.modoCompraProveedor;
      delete dataFinal.pesoReferenciaKg;
      delete dataFinal.pesoEsFijo;
      delete dataFinal.modoVentaDeposito;
      delete dataFinal.pesoPromedioKg;
      delete dataFinal.actualizaPromedioPorRecepcion;
      delete dataFinal.codigo_barra_secundario;
      updated = await prisma.productoBase.update({
        where: { id: baseId },
        data: dataFinal,
        include: { locales: true },
      });
    } else {
      throw e;
    }
  }

  // sincronizar precioCosto/activo en overrides (locales)
  await syncFromBaseToLocales(baseId, {
    precioCosto: baseData.precio_costo,
    activo: baseData.activo,
  });

  // Alinear el precio EFECTIVO de la ubicación que acaba de guardar la ficha.
  //
  // El precio efectivo de cualquier ubicación es su ProductoLocal.precio_venta y,
  // sólo si está en null, el de la ficha maestra. Es la misma regla en el editor,
  // en el listado y en el POS. Entonces, si el dueño guarda un precio en la ficha
  // pero su propio override conserva el anterior, el override sigue ganando y la
  // pantalla vuelve a mostrar el precio viejo apenas se recarga: el usuario guarda
  // 250 y ve 200.
  //
  // Esto ya se resolvía para el depósito, pero mirando `es_deposito` en vez de la
  // PROPIEDAD del producto. Por eso el local que creó un producto exclusivo suyo
  // quedaba afuera y sufría el guardado engañoso. Se agrega la ubicación que opera,
  // que en esta rama es siempre la dueña (o el admin en contexto depósito).
  //
  // Alcance deliberadamente acotado a esas filas: los demás locales conservan el
  // precio y el margen que hayan definido para sí sobre productos del depósito.
  const ubicacionesAAlinear = [{ local: { es_deposito: true } }];
  const opId = Number(operandoEnLocalId);
  if (Number.isInteger(opId) && opId > 0) ubicacionesAAlinear.push({ localId: opId });

  // ── LA REVISIÓN SE MARCA DONDE EL PRECIO REALMENTE SE ALINEÓ ──────────────
  //
  // Estas son exactamente las ubicaciones cuyo `precio_venta` efectivo queda
  // escrito por esta edición, así que son las que quedan revisadas. Las demás no
  // se tocan: conservan su override y su fecha, porque nadie miró su precio.
  //
  // Se marca aunque el importe no cambie, y es a propósito: el control es
  // "última revisión", no "último cambio". Alguien abrió la ficha, miró el precio
  // y guardó — eso es haberlo revisado.
  const revisadoAhora = new Date();

  await prisma.productoLocal.updateMany({
    where: { baseId, OR: ubicacionesAAlinear },
    data: {
      precio_costo: dataFinal.precio_costo,
      precio_venta: dataFinal.precio_venta,
      margen: dataFinal.margen,
      activo: dataFinal.activo,
      precioRevisadoAt: revisadoAhora,
    },
  });

  // La regla de precio es POR UBICACIÓN, así que se guarda solo en la del dueño que
  // está editando, nunca en las demás. Va aparte del updateMany de arriba —que
  // alcanza también al depósito— justamente para no imponerle una regla a nadie.
  if (Number.isInteger(opId) && opId > 0 && localData?.reglaPrecio !== undefined) {
    await prisma.productoLocal.updateMany({
      where: { baseId, localId: opId },
      data: {
        reglaPrecio: localData.reglaPrecio,
        recargoFijoUnidad:
          localData.reglaPrecio === "MARGEN_PORCENTUAL"
            ? null
            : localData.recargoFijoUnidad ?? undefined,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    item: mergeBaseLocalToUi(updated, null),
  });
}

/* ============================================================
   EDITAR OVERRIDE LOCAL
   ============================================================ */
async function editarOverride(baseId, localId, localData) {
  const existing = await prisma.productoLocal.findFirst({
    where: { baseId, localId },
  });

  let override;

  if (existing) {
    override = await prisma.productoLocal.update({
      where: { id: existing.id },
      data: {
        precio_costo: localData.precio_costo ?? undefined,
        precio_venta: localData.precio_venta ?? undefined,
        margen: localData.margen ?? undefined,
        activo: localData.activo ?? undefined,
        // Regla de precio de ESTA ubicación. Editable también cuando el producto es
        // del depósito: el costo sigue bloqueado, pero cómo el local arma su precio
        // es decisión del local.
        reglaPrecio: localData.reglaPrecio ?? undefined,
        recargoFijoUnidad:
          localData.reglaPrecio === "MARGEN_PORCENTUAL"
            ? null
            : localData.recargoFijoUnidad ?? undefined,
        // Override por local del recargo del servicio: null = heredar base.
        recargoServicioPct: validarRecargoServicioPct(localData.recargoServicioPct).valido
          ? validarRecargoServicioPct(localData.recargoServicioPct).pct
          : null,
        nombre: null,
        descripcion: null,
      },
    });
  } else {
    override = await prisma.productoLocal.create({
      data: {
        baseId,
        localId,
        precio_costo: localData.precio_costo ?? null,
        precio_venta: localData.precio_venta ?? null,
        margen: localData.margen ?? null,
        activo: localData.activo ?? true,
        nombre: null,
        descripcion: null,
      },
    });
  }

  const base = await prisma.productoBase.findUnique({
    where: { id: baseId },
  });

  return NextResponse.json({
    ok: true,
    item: mergeBaseLocalToUi(base, override),
  });
}
