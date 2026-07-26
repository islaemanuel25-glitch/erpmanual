import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { getGrupoIdDeLocal, getLocalesDeGrupo, inheritDepositoProductsToLocal } from "@/lib/grupos";
import { getDepositoIdDeGrupo } from "@/lib/visibilidad";
import { getContextoActivo } from "@/lib/contexto";
import { validarUnicidadCodigos } from "@/lib/productos/validarCodigosBarra";
import { esComboBase } from "@/lib/combos/guards";
import { puedeEditarCosto } from "@/lib/productos/propiedadCosto";

const CHUNK_SIZE = 50;

function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    const perm = checkPerm(session, "productos.importar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const body = await req.json();
    const { productos } = body;

    // Resolver localId: body → session.localId → cookie contexto
    let localId = Number(body.localId) || 0;
    if (!localId && session.localId) {
      localId = Number(session.localId);
    }
    if (!localId && session.esAdmin) {
      const ctx = getContextoActivo(req, session);
      if (ctx.localId) localId = Number(ctx.localId);
    }
    if (!localId) {
      return NextResponse.json({ ok: false, error: "Selecciona un local de trabajo" }, { status: 400 });
    }

    // Resolver grupoId: session (solo admin con cookie grupo) → derivar de localId
    let grupoId = Number(session.grupoId) || 0;
    if (!grupoId) {
      grupoId = await getGrupoIdDeLocal(localId);
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("[import/apply]", { localId, grupoId, sessionGrupoId: session.grupoId, esAdmin: session.esAdmin });
    }

    if (!grupoId) {
      return NextResponse.json({ ok: false, error: "No se pudo determinar el grupo del local seleccionado" }, { status: 400 });
    }

    // Depósito del grupo, para la regla de propiedad del costo (abajo).
    const depositoLocalId = await getDepositoIdDeGrupo(grupoId);
    // Filas cuyo costo se salteó por no ser dueño (producto del depósito desde un local).
    const costoSaltado = [];

    if (!Array.isArray(productos) || productos.length === 0) {
      return NextResponse.json({ ok: false, error: "No se recibieron productos" }, { status: 400 });
    }

    const MAX_PRODUCTOS = 2000;
    if (productos.length > MAX_PRODUCTOS) {
      return NextResponse.json(
        { ok: false, error: `Máximo ${MAX_PRODUCTOS} productos por importación.` },
        { status: 400 }
      );
    }

    // Filtrar SOLO filas con acción válida (crear o actualizar)
    const aCrear = productos.filter((p) => p.accion === "crear");
    const aActualizar = productos.filter((p) => p.accion === "actualizar");

    if (aCrear.length === 0 && aActualizar.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No hay productos para procesar.",
        creados: 0,
        actualizados: 0,
        errores: 0,
        detalles: [],
      });
    }

    let creados = 0;
    let actualizados = 0;
    const erroresDetalle = [];

    // ══════════════════════════════════════════════════════
    // CREAR — best-effort, transacción por item
    // Cada producto (Base+Local+Stock) es atómico.
    // Si un item falla, se registra el error y se continúa.
    // Se procesa en chunks secuenciales para no saturar el pool.
    // ══════════════════════════════════════════════════════
    for (const chunk of chunks(aCrear, CHUNK_SIZE)) {
      for (const p of chunk) {
        try {
          await prisma.$transaction(async (tx) => {
            const unidadMedida = p.unidad_medida || "unidad";
            const esPack = unidadMedida === "pack" || unidadMedida === "cajon";
            const fp = p.factor_pack && p.factor_pack > 1 ? p.factor_pack : null;

            // Defensa: el estado pudo cambiar entre preview y apply.
            const v = await validarUnicidadCodigos({
              prisma: tx,
              grupoId,
              baseIdExcluir: null,
              principal: p.codigo_barra || null,
              secundario: p.codigo_barra_secundario || null,
            });
            if (!v.ok) throw new Error(v.error);

            const baseData = {
              grupoId,
              creadoEnLocalId: localId,
              nombre: p.nombre,
              codigo_barra: p.codigo_barra || null,
              codigo_barra_secundario: p.codigo_barra_secundario || null,
              unidad_medida: unidadMedida,
              factor_pack: fp,
              precio_costo: p.precio_costo,
              precio_venta: p.precio_venta,
              margen: p.margen,
              categoria_id: p.categoriaId || null,
              proveedor_id: p.proveedorId || null,
              area_fisica_id: p.areaFisicaId || null,
              activo: p.activo !== false,
              modo_pedido: p.modo_pedido || (esPack && fp ? "BULTO" : "UNIDAD"),
              modo_envio: p.modo_envio || (unidadMedida === "cajon" ? "SOLO_BULTO" : "MIXTO"),
              modo_stock: "BULTO",
              modoCompraProveedor: p.modo_compra_proveedor || "BULTO",
            };

            const base = await tx.productoBase.create({ data: baseData });

            const pl = await tx.productoLocal.create({
              data: {
                localId,
                baseId: base.id,
                precio_costo: base.precio_costo,
                precio_venta: base.precio_venta,
                margen: base.margen,
                activo: base.activo,
              },
            });

            await tx.stockLocal.create({
              data: {
                localId,
                productoId: pl.id,
                cantidad: String(p.stock_inicial || 0),
                stockMin: null,
                stockMax: null,
              },
            });
          }, { timeout: 60000 });

          creados++;
        } catch (e) {
          erroresDetalle.push({
            fila: p.fila,
            nombre: p.nombre,
            codigo_barra: p.codigo_barra,
            error: e.message || "Error al crear",
          });
        }
      }
    }

    // ══════════════════════════════════════════════════════
    // ACTUALIZAR — best-effort, transacción por item
    // Cada update (Base+Local+Stock) es atómico.
    // Si un item falla, se registra el error y se continúa.
    // ══════════════════════════════════════════════════════
    for (const chunk of chunks(aActualizar, CHUNK_SIZE)) {
      for (const p of chunk) {
        try {
          if (!p.productoBaseId) {
            erroresDetalle.push({
              fila: p.fila,
              nombre: p.nombre,
              codigo_barra: p.codigo_barra,
              error: "No se encontró producto base para actualizar",
            });
            continue;
          }

          const costoSaltadoRow = await prisma.$transaction(async (tx) => {
            // Los combos no tienen stock físico: no se materializa ProductoLocal/StockLocal.
            const baseActual = await tx.productoBase.findUnique({
              where: { id: p.productoBaseId },
              select: { es_combo: true, creadoEnLocalId: true, grupoId: true },
            });
            // Pertenencia al grupo del importador (cierra el hueco cross-grupo del update de la base).
            if (!baseActual || baseActual.grupoId !== grupoId) {
              throw new Error("Producto fuera de tu alcance");
            }
            if (esComboBase(baseActual)) {
              throw new Error("Los combos no se materializan por stock: operá sus componentes.");
            }

            // Propiedad del costo: solo el dueño puede cambiar el costo. Si un local
            // importa un producto del DEPÓSITO, se saltea el costo (base y override) y
            // se reporta; el resto de la fila (venta, margen, stock, etc.) se aplica.
            const puedeCosto = puedeEditarCosto(localId, baseActual.creadoEnLocalId, depositoLocalId);

            // Defensa: el estado pudo cambiar entre preview y apply.
            const v = await validarUnicidadCodigos({
              prisma: tx,
              grupoId,
              baseIdExcluir: p.productoBaseId,
              principal: p.codigo_barra || null,
              secundario: p.codigo_barra_secundario || null,
            });
            if (!v.ok) throw new Error(v.error);

            const updateData = {
              nombre: p.nombre,
              unidad_medida: p.unidad_medida || "unidad",
              precio_venta: p.precio_venta,
              activo: p.activo !== false,
              codigo_barra_secundario: p.codigo_barra_secundario || null,
            };
            if (puedeCosto) updateData.precio_costo = p.precio_costo;

            if (p.factor_pack) updateData.factor_pack = p.factor_pack;
            if (p.margen !== null && p.margen !== undefined) updateData.margen = p.margen;
            if (p.categoriaId) updateData.categoria_id = p.categoriaId;
            if (p.proveedorId) updateData.proveedor_id = p.proveedorId;
            if (p.areaFisicaId) updateData.area_fisica_id = p.areaFisicaId;
            if (p.modo_pedido) updateData.modo_pedido = p.modo_pedido;
            if (p.modo_envio) updateData.modo_envio = p.modo_envio;
            if (p.modo_compra_proveedor) updateData.modoCompraProveedor = p.modo_compra_proveedor;

            await tx.productoBase.update({
              where: { id: p.productoBaseId },
              data: updateData,
            });

            const existingLocal = await tx.productoLocal.findFirst({
              where: { baseId: p.productoBaseId, localId },
            });

            if (existingLocal) {
              const localUpd = {
                precio_venta: p.precio_venta,
                margen: p.margen,
                activo: p.activo !== false,
              };
              if (puedeCosto) localUpd.precio_costo = p.precio_costo;
              await tx.productoLocal.update({
                where: { id: existingLocal.id },
                data: localUpd,
              });

              if (p.stock_inicial != null && p.stock_inicial !== "" && !isNaN(Number(p.stock_inicial))) {
                await tx.stockLocal.updateMany({
                  where: { localId, productoId: existingLocal.id },
                  data: { cantidad: String(p.stock_inicial) },
                });
              }
            } else {
              const pl = await tx.productoLocal.create({
                data: {
                  localId,
                  baseId: p.productoBaseId,
                  // Si no es dueño, el override de costo queda null → hereda el maestro.
                  precio_costo: puedeCosto ? p.precio_costo : null,
                  precio_venta: p.precio_venta,
                  margen: p.margen,
                  activo: p.activo !== false,
                },
              });

              await tx.stockLocal.create({
                data: {
                  localId,
                  productoId: pl.id,
                  cantidad: "0",
                  stockMin: null,
                  stockMax: null,
                },
              });
            }

            return !puedeCosto;
          }, { timeout: 60000 });

          actualizados++;
          if (costoSaltadoRow) {
            costoSaltado.push({ fila: p.fila, nombre: p.nombre, codigo_barra: p.codigo_barra });
          }
        } catch (e) {
          erroresDetalle.push({
            fila: p.fila,
            nombre: p.nombre,
            codigo_barra: p.codigo_barra,
            error: e.message || "Error al actualizar",
          });
        }
      }
    }

    // ══════════════════════════════════════════════════════
    // SYNC — Si se importó desde un depósito, heredar
    // ProductoLocal + StockLocal (en 0) a todos los locales
    // del grupo que aún no los tengan.
    // ══════════════════════════════════════════════════════
    let sincronizados = 0;
    try {
      const importingLocal = await prisma.local.findUnique({
        where: { id: localId },
        select: { es_deposito: true },
      });

      if (importingLocal?.es_deposito) {
        const localesGrupo = await getLocalesDeGrupo(grupoId);

        for (const loc of localesGrupo) {
          try {
            await prisma.$transaction(async (tx) => {
              await inheritDepositoProductsToLocal(tx, grupoId, loc.id);
            }, { timeout: 60000 });
            sincronizados++;
          } catch (syncErr) {
            console.error(`Error sincronizando local ${loc.id} (${loc.nombre}):`, syncErr);
          }
        }
      }
    } catch (syncErr) {
      console.error("Error en sync post-import:", syncErr);
    }

    const costoMsg =
      costoSaltado.length > 0
        ? ` ${costoSaltado.length} con costo NO modificado (lo administra el depósito).`
        : "";
    return NextResponse.json({
      ok: true,
      message: `Importación completada: ${creados} creados, ${actualizados} actualizados.${sincronizados > 0 ? ` Sincronizados a ${sincronizados} local(es).` : ""}${costoMsg}`,
      creados,
      actualizados,
      sincronizados,
      errores: erroresDetalle.length,
      detalles: erroresDetalle,
      costoSaltado,
    });
  } catch (e) {
    console.error("ERROR productos/import/apply:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Error interno" },
      { status: 500 }
    );
  }
}
