// app/api/transferencias/detalle/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession, getCookieValue } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { esFiambreFijo } from "@/lib/conversiones/stock";

function toNumber(v) {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);

    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "transferencias.ver");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const url = new URL(req.url);
    const id = Number(url.searchParams.get("id") || 0);

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "id requerido" },
        { status: 400 }
      );
    }

    const transferencia = await prisma.transferencia.findUnique({
      where: { id },
      include: {
        origen: {
          select: { id: true, nombre: true, es_deposito: true },
        },
        destino: {
          select: { id: true, nombre: true },
        },
        detalle: {
          include: {
            producto: {
              include: { base: true },
            },
          },
        },
      },
    });

    if (!transferencia) {
      return NextResponse.json(
        { ok: false, error: "Transferencia no encontrada" },
        { status: 404 }
      );
    }

    // ======================================================
    // SCOPE: non-admin debe ser origen o destino
    // Resolver localId: cookie de contexto > JWT (consistente con listar)
    // ======================================================
    if (!session.esAdmin) {
      let localId = null;
      const raw = getCookieValue(req, "erpazul_contexto_activo");
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          const ctx = Number(parsed.localId);
          if (ctx > 0) localId = ctx;
        } catch {}
      }
      if (!localId && session.localId) localId = Number(session.localId);

      if (!localId || (transferencia.origenId !== localId && transferencia.destinoId !== localId)) {
        // Lectura ajena (no participa) → 404: no revela existencia del recurso.
        return NextResponse.json(
          { ok: false, error: "No encontrada" },
          { status: 404 }
        );
      }
    }

    // ======================================================
    // MAPEO DETALLES
    // ======================================================
    let itemsEnviados = 0;
    let itemsRecibidos = 0;
    let costoTotal = 0;

    const items = transferencia.detalle.map((d) => {
      const cantidadEnviada = toNumber(d.cantidad);
      // `null` (todavía no se cargó recepción) y `0` (no llegó ninguna unidad)
      // son estados operativos DISTINTOS. toNumber() los colapsaba a 0, así que
      // la pantalla no podía distinguirlos y tenía que adivinar con truthiness:
      // un 0 explícito se re-mostraba como la cantidad enviada y podía
      // sobrescribirse al volver a guardar. Se preserva el null.
      const cantidadRecibida = d.recibido == null ? null : toNumber(d.recibido);

      const precioCosto =
        d.precioCosto != null
          ? toNumber(d.precioCosto)
          : d.producto?.precio_costo != null
          ? toNumber(d.producto.precio_costo)
          : d.producto?.base?.precio_costo != null
          ? toNumber(d.producto.base.precio_costo)
          : 0;

      // Sin recepción cargada se valoriza lo enviado; con recepción cargada, lo
      // recibido — incluido 0, que ahora vale 0 y no el total enviado.
      const subtotal =
        precioCosto * (cantidadRecibida == null ? cantidadEnviada : cantidadRecibida);

      itemsEnviados += cantidadEnviada;
      itemsRecibidos += cantidadRecibida ?? 0;
      costoTotal += subtotal;

      return {
        id: d.id,
        nombre:
          d.producto?.nombre ||
          d.producto?.base?.nombre ||
          "Producto sin nombre",
        codigoBarra: d.producto?.base?.codigo_barra || null,
        cantidadEnviada,
        cantidadRecibida,
        precioCosto,
        subtotal,

        motivoPrincipal: d.motivoPrincipal || "",
        motivoDetalle: d.motivoDetalle || "",
        unidadEnviada: d.unidadEnviada || null,
        unidadMedida: d.producto?.base?.unidad_medida || null,
        esFiambreFijo: esFiambreFijo(d.producto?.base),
        pesoReferenciaKg: esFiambreFijo(d.producto?.base) ? toNumber(d.producto?.base?.pesoReferenciaKg) : null,
      };
    });

    const diferenciaTotal = itemsRecibidos - itemsEnviados;

    const item = {
      id: transferencia.id,
      estado: transferencia.estado,
      tieneDiferencias:
        transferencia.tieneDiferencias || diferenciaTotal !== 0,
      fechaCreada: transferencia.createdAt,
      fechaEnvio: transferencia.fechaEnvio,
      fechaRecepcion: transferencia.fechaRecepcion,
      origen: {
        id: transferencia.origen.id,
        nombre: transferencia.origen.nombre,
        esDeposito: transferencia.origen.es_deposito,
      },
      destino: {
        id: transferencia.destino.id,
        nombre: transferencia.destino.nombre,
      },
      resumen: {
        itemsEnviados,
        itemsRecibidos,
        diferenciaTotal,
        costoTotal,
      },
      items,
    };

    return NextResponse.json({ ok: true, item });
  } catch (err) {
    console.error("Error en /api/transferencias/detalle:", err);
    return NextResponse.json(
      { ok: false, error: "Error al obtener detalle de transferencia" },
      { status: 500 }
    );
  }
}
