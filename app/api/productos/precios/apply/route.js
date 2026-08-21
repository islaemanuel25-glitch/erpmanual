import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveScope } from "@/lib/grupos";
import { getDepositoIdDeGrupo } from "@/lib/visibilidad";
import { alcanceEdicionProducto } from "@/lib/productos/propiedadCosto";
import { cambioElPrecioEfectivo } from "@/lib/productos/revisionDePrecio";

function toNumber(value) {
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    const perm = checkPerm(session, "productos.editar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const body = await req.json();
    
    // Alcance seguro. Se resuelve SIEMPRE la ubicación que opera (server-side) para
    // aplicar la regla de propiedad del costo: un local no puede cambiar el costo de
    // productos del depósito. No-admin → su local; admin → contexto/localId validado.
    const scope = await resolveScope(req, { explicitLocalId: body?.localId });
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }
    const grupoId = scope.grupoId;
    const operatingLocalId = Number(scope.localId);
    const depositoLocalId = await getDepositoIdDeGrupo(grupoId);
    const proveedorId = toNumber(body?.proveedorId);
    const metodo = body?.metodo;
    const pricingMode = body?.pricingMode;
    const items = Array.isArray(body?.items) ? body.items : null;
    const esMargenMasivo = metodo === "MARGEN_MASIVO";

    // proveedorId requerido salvo en MARGEN_MASIVO (donde es opcional via filtros)
    if (!esMargenMasivo && (proveedorId == null || proveedorId <= 0)) {
      return NextResponse.json({ ok: false, error: "proveedorId requerido" }, { status: 400 });
    }

    if (!["MANUAL", "AUMENTO", "XLSX", "SCAN", "REGLAS", "PEGADO", "MARGEN_MASIVO"].includes(metodo)) {
      return NextResponse.json({ ok: false, error: "metodo inválido" }, { status: 400 });
    }

    if (!["KEEP_VENTA", "RECALC_BY_MARGIN", "SET_VENTA"].includes(pricingMode)) {
      return NextResponse.json({ ok: false, error: "pricingMode inválido" }, { status: 400 });
    }

    if (!items || items.length === 0) {
      return NextResponse.json({ ok: false, error: "items inválido" }, { status: 400 });
    }

    if (items.length > 5000) {
      return NextResponse.json({ ok: false, error: "Demasiados items (máx 5000)" }, { status: 400 });
    }

    const proveedorIdParaUpdate = esMargenMasivo
      ? proveedorId && proveedorId > 0
        ? proveedorId
        : null
      : proveedorId;

    const result = await prisma.$transaction(async (tx) => {
      const update = await tx.precioUpdate.create({
        data: {
          grupoId,
          proveedorId: proveedorIdParaUpdate,
          metodo,
          pricingMode,
          usuarioId: session.id ? Number(session.id) : null,
        },
      });

      let applied = 0;
      let soloVenta = 0;
      const saltados = [];
      for (const item of items) {
        const productoBaseId = toNumber(item?.productoBaseId);
        const costoAnterior = toNumber(item?.costoAnterior);
        const costoNuevo = toNumber(item?.costoNuevo);
        const ventaAnterior = toNumber(item?.ventaAnterior);
        const ventaNueva = toNumber(item?.ventaNueva);

        if (
          !productoBaseId ||
          costoAnterior === null ||
          costoNuevo === null ||
          ventaAnterior === null ||
          ventaNueva === null
        ) {
          throw new Error("Item inválido");
        }

        // ── EL PRECIO ANTERIOR SE LEE DE LA BASE, NO DEL CUERPO DEL PEDIDO ──
        //
        // `precio_venta` entra en este `select` a propósito. La decisión de si
        // hay que marcar la revisión se tomaba con `ventaAnterior`, que viene del
        // navegador: es lo que la pantalla TENÍA cuando se armó la tanda.
        //
        // Con una pantalla vieja —o con dos personas aplicando a la vez— ese
        // número no es el que está en la base, así que la comparación se hacía
        // contra un precio que ya no existía y la fecha de revisión podía
        // registrar un cambio que no ocurrió, o saltearse uno que sí.
        //
        // Es el mismo principio que ya se aplicó en `editarBase`: leer el "antes"
        // ANTES de escribir, del lado del servidor. Se lee acá, antes del
        // `updateMany` de la ficha, así que es el valor previo de verdad.
        //
        // Lo que NO cambia es el histórico: `PrecioUpdateItem` sigue guardando el
        // `costoAnterior`/`ventaAnterior` que informó el cliente, que es otra
        // discusión y otra tanda.
        const baseInfo = await tx.productoBase.findUnique({
          where: { id: productoBaseId },
          select: {
            creadoEnLocalId: true,
            grupoId: true,
            proveedor_id: true,
            precio_venta: true,
          },
        });
        if (!baseInfo || baseInfo.grupoId !== grupoId) {
          throw new Error(`Producto ${productoBaseId} fuera de alcance`);
        }

        // El precio de venta EFECTIVO que tiene la ficha ahora mismo. De acá sale
        // el "antes" de cualquier ubicación sin override propio.
        const ventaEnLaFicha = baseInfo.precio_venta;

        // Propiedad: se autoriza POR CAMPO, no por fila. El costo maestro es del
        // dueño (el depósito para sus productos; el local creador para los
        // exclusivos), pero el PRECIO DE VENTA de un local es suyo y no depende de
        // esa propiedad. Antes acá se salteaba la fila entera cuando la ubicación no
        // era dueña del costo, y eso dejaba a un local sin poder actualizar el precio
        // de venta de los productos que toma del depósito.
        const alcance = alcanceEdicionProducto(
          operatingLocalId,
          baseInfo.creadoEnLocalId,
          depositoLocalId
        );

        if (alcance === "deny") {
          // Producto exclusivo de OTRO local: no se toca nada.
          saltados.push({ productoBaseId, motivo: "el producto pertenece a otro local" });
          continue;
        }

        if (alcance === "override") {
          // Producto del depósito operado desde un local: se aplica SOLO el precio de
          // venta y SOLO sobre el ProductoLocal de la ubicación que opera. Ni la ficha
          // maestra ni los otros locales se tocan, así que el costo maestro queda
          // intacto y el precio de un local no se propaga a nadie.
          if (!esMargenMasivo && Number(baseInfo.proveedor_id) !== proveedorId) {
            throw new Error(`Producto ${productoBaseId} fuera de alcance`);
          }
          // ── EL "ANTES" DE ESTA UBICACIÓN, PARA SABER SI CAMBIA ────────────
          //
          // Antes se marcaba revisado por estar en esta rama, sin comparar. En un
          // `KEEP_VENTA` —o en una tanda que solo mueve costos— la rama se
          // ejecuta igual con `ventaNueva` idéntica a la que ya había, y eso
          // renovaba la revisión de un precio que nadie cambió. El control de los
          // 30 días se vaciaba con una actualización de costos.
          const localAntes = await tx.productoLocal.findFirst({
            where: { baseId: productoBaseId, localId: operatingLocalId },
            select: { id: true, precio_venta: true },
          });
          const quedaRevisado = cambioElPrecioEfectivo({
            overrideAnterior: localAntes?.precio_venta ?? null,
            // De la BASE, no de `ventaAnterior` del cuerpo — ver arriba.
            baseAnterior: ventaEnLaFicha,
            nuevo: ventaNueva,
          });

          const localUpd = await tx.productoLocal.updateMany({
            where: { baseId: productoBaseId, localId: operatingLocalId },
            // Solo el de ESTA ubicación: el `where` ya acota a
            // `operatingLocalId`. Y la marca de revisión solo si el importe
            // efectivo de acá realmente cambió.
            data: {
              precio_venta: ventaNueva,
              ...(quedaRevisado ? { precioRevisadoAt: new Date() } : {}),
            },
          });
          if (localUpd.count === 0) {
            saltados.push({ productoBaseId, motivo: "el producto no está habilitado en tu local" });
            continue;
          }
          // El costo no cambió: se registra igual a sí mismo para que el historial no
          // declare una actualización de costo que nunca ocurrió.
          await tx.precioUpdateItem.create({
            data: {
              precioUpdateId: update.id,
              productoBaseId,
              costoAnterior,
              costoNuevo: costoAnterior,
              ventaAnterior,
              ventaNueva,
            },
          });
          soloVenta += 1;
          applied += 1;
          continue;
        }

        const productoWhere = {
          id: productoBaseId,
          grupoId,
        };
        if (!esMargenMasivo) productoWhere.proveedor_id = proveedorId;

        const updated = await tx.productoBase.updateMany({
          where: productoWhere,
          data: {
            precio_costo: costoNuevo,
            precio_venta: ventaNueva,
          },
        });

        if (updated.count === 0) {
          throw new Error(`Producto ${productoBaseId} fuera de alcance`);
        }

        // Sincronizar ProductoLocal solo si el precio local coincide con el anterior
        const locales = await tx.productoLocal.findMany({
          where: { baseId: productoBaseId },
          select: { id: true, precio_costo: true, precio_venta: true },
        });

        for (const local of locales) {
          const costoLocal = local.precio_costo ? Number(local.precio_costo) : null;
          const ventaLocal = local.precio_venta ? Number(local.precio_venta) : null;
          const data = {};

          // Actualizar solo si no tiene override o si el override coincide con el anterior
          if (costoLocal === null || Math.abs(costoLocal - costoAnterior) < 0.01) {
            data.precio_costo = costoNuevo;
          }
          if (ventaLocal === null || Math.abs(ventaLocal - ventaAnterior) < 0.01) {
            data.precio_venta = ventaNueva;
            // ── DOS CONDICIONES, Y HACEN FALTA LAS DOS ─────────────────────
            //
            // La primera es el `if` de arriba: decide si este local RECIBE el
            // precio nuevo. Un local con override propio distinto del anterior
            // no lo recibe —conserva el suyo— así que nadie revisó su precio.
            //
            // La segunda es ésta: aunque lo reciba, si el importe es el MISMO
            // que ya tenía no hay nada que revisar. Faltaba, y por eso un
            // `KEEP_VENTA` o una tanda de solo costos renovaba la revisión de
            // precios que no se movieron.
            //
            // Un local que recibe solo el COSTO tampoco queda revisado: el
            // control es sobre el precio de venta.
            //
            // ── Y EL "ANTES" SALE DE LA FICHA, NO DEL CUERPO DEL PEDIDO ────
            //
            // `ventaAnterior` es lo que la PANTALLA tenía cuando se armó la
            // tanda. Un local sin override toma su precio de la ficha, así que
            // con una pantalla vieja la comparación se hacía contra un número
            // que ya no estaba en la base. `ventaEnLaFicha` se leyó arriba,
            // antes del `updateMany` que acaba de pisarla.
            //
            // El `if` de arriba sigue usando `ventaAnterior` a propósito: ésa es
            // la condición de "este override coincide con lo que la tanda creía",
            // que es una decisión sobre la TANDA y no sobre el estado de la base.
            // Cambiarla movería a qué locales se les aplica el precio, que es
            // otra cosa y otra tanda.
            if (
              cambioElPrecioEfectivo({
                overrideAnterior: ventaLocal,
                baseAnterior: ventaEnLaFicha,
                nuevo: ventaNueva,
              })
            ) {
              data.precioRevisadoAt = new Date();
            }
          }

          if (Object.keys(data).length > 0) {
            await tx.productoLocal.update({
              where: { id: local.id },
              data,
            });
          }
        }

        await tx.precioUpdateItem.create({
          data: {
            precioUpdateId: update.id,
            productoBaseId,
            costoAnterior,
            costoNuevo,
            ventaAnterior,
            ventaNueva,
          },
        });

        applied += 1;
      }

      return { updateId: update.id, applied, soloVenta, saltados };
    }, {
      maxWait: 10000,
      timeout: 120000,
    });

    const soloVentaMsg =
      result.soloVenta > 0
        ? ` En ${result.soloVenta} se actualizó solo el precio de venta de tu local: el costo lo administra el depósito.`
        : "";
    const saltadosMsg =
      result.saltados.length > 0 ? ` ${result.saltados.length} salteado(s).` : "";
    return NextResponse.json({
      ok: true,
      message: `Actualización aplicada: ${result.applied} productos.${soloVentaMsg}${saltadosMsg}`,
      updateId: result.updateId,
      applied: result.applied,
      soloVenta: result.soloVenta,
      saltados: result.saltados,
    });
  } catch (e) {
    console.error("ERROR productos/precios/apply:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Error interno" }, { status: 500 });
  }
}
