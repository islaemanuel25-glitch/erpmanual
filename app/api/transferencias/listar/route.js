// app/api/transferencias/listar/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveVistaOperativa } from "@/lib/grupos";
import { valorizarDetalle } from "@/lib/transferencias/costoTransferencia";
import { inicioDiaArgentina, finDiaArgentina } from "@/lib/fechas/rangoArgentina";
// Misma escala entera que usa la recepción desplegada. Sumar cantidades con `+`
// sobre Decimal→Number arrastra residuo binario a la tercera decimal; acá se
// acumula en milésimas enteras y se convierte una sola vez al final.
import { aMilesimas, desdeMilesimas } from "@/lib/transferencias/recepcion";

const PAGE_SIZE = 25;

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, items: [], total: 0, totalPages: 1, error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "transferencias.ver");
    if (!perm.ok) {
      return NextResponse.json(
        { ok: false, items: [], total: 0, totalPages: 1, error: perm.error },
        { status: perm.status }
      );
    }

    // Vista operativa por UBICACIÓN (antes: sin localId no filtraba → veía TODOS
    // los grupos). No-admin → su local; admin → contexto (local o global explícito
    // del grupo activo); admin sin contexto → 409.
    const vista = await resolveVistaOperativa(req);
    if (vista.error) {
      return NextResponse.json(
        { ok: false, items: [], total: 0, totalPages: 1, error: vista.error, needsContexto: vista.needsContexto },
        { status: vista.status }
      );
    }

    const { searchParams } = new URL(req.url);

    const page = Math.max(Number(searchParams.get("page") || 1), 1);
    const estado = searchParams.get("estado") || "";
    const fechaDesde = searchParams.get("fechaDesde") || "";
    const fechaHasta = searchParams.get("fechaHasta") || "";

    const where = {};

    if (estado) where.estado = estado;

    // La UI manda días calendario (YYYY-MM-DD) tal como los ve el usuario. Hay
    // que convertirlos a límites de día ARGENTINO, no del proceso: el contenedor
    // corre en UTC, así que `new Date(fechaHasta + "T23:59:59")` cortaba a las
    // 20:59:59 hora argentina y escondía todo lo enviado entre las 21:00 y la
    // medianoche —una transferencia de las 22:19 del 30/07 caía en el 31/07 UTC
    // y no aparecía filtrando por el 30/07—.
    const desde = inicioDiaArgentina(fechaDesde);
    const hasta = finDiaArgentina(fechaHasta);
    if (desde || hasta) {
      where.fechaEnvio = {};
      if (desde) where.fechaEnvio.gte = desde;
      if (hasta) where.fechaEnvio.lte = hasta;
    }

    // Filtro por PARTICIPACIÓN (origen o destino), acotado a la vista.
    if (vista.modo === "GLOBAL") {
      where.OR = [
        { origenId: { in: vista.localIds } },
        { destinoId: { in: vista.localIds } },
      ];
    } else {
      where.OR = [{ origenId: vista.localId }, { destinoId: vista.localId }];
    }

    // ======================================
    // CONSULTA PRINCIPAL CORREGIDA
    // ======================================
    const [total, registros] = await Promise.all([
      prisma.transferencia.count({ where }),

      prisma.transferencia.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          origen: { select: { id: true, nombre: true, es_deposito: true } },
          destino: { select: { id: true, nombre: true } },

          detalle: {
            select: {
              id: true,
              cantidad: true,
              recibido: true,          // ← 🔥 AGREGADO
              precioCosto: true,
              unidadEnviada: true,     // escala en la que está `cantidad`
              producto: {
                select: {
                  precio_costo: true,  // productoLocal
                  base: {
                    select: {
                      precio_costo: true, // ← 🔥 AGREGADO productoBase
                      // Escala en la que está cargado el costo del producto.
                      unidad_medida: true,
                      factor_pack: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    // ======================================
    // CÁLCULO EXACTO DEL DETALLE (COPIADO)
    // ======================================
    const items = registros.map((t) => {
      let totalCosto = 0;

      // Cantidades AGREGADAS del remito, en milésimas enteras.
      //
      // `recibidaM` arranca en null y solo deja de serlo si ALGÚN detalle tiene
      // recepción cargada. Esa distinción es la que la pantalla necesita:
      //   null → todavía nadie registró recepción  → se muestra "—"
      //   0    → se registró que no llegó nada     → se muestra "0"
      // Colapsar el null a 0 haría que una transferencia recién enviada se vea
      // igual que una que llegó vacía.
      //
      // Nota deliberada: se suman las cantidades tal como están en el remito
      // (cada detalle en la unidad de su `unidadEnviada`), igual que hace
      // `resumen.itemsEnviados` en /api/transferencias/detalle. Es un total de
      // documento, no de unidades físicas: un remito con bultos y unidades suma
      // ambos. Convertir a unidades físicas cambiaría el número que el detalle
      // ya viene mostrando.
      let enviadaM = 0;
      let recibidaM = null;

      t.detalle.forEach((d) => {
        const precioCosto =
          d.precioCosto ??
          d.producto?.precio_costo ??
          d.producto?.base?.precio_costo ??
          0;

        // Misma semántica que el detalle, del mismo helper: el costo se baja a
        // la escala de unidadEnviada, y la cantidad que valoriza es la recibida
        // cuando hay recepción cargada (incluido 0) o la enviada si no la hay.
        // Antes se decidía con `cantidadRecibida > 0`, así que una recepción de
        // 0 se valorizaba como si hubiera llegado todo.
        const { subtotal } = valorizarDetalle(
          {
            cantidad: d.cantidad,
            recibido: d.recibido,
            unidadEnviada: d.unidadEnviada,
            precioCosto,
          },
          d.producto?.base
        );

        totalCosto += subtotal;

        const envM = aMilesimas(d.cantidad);
        if (envM !== null) enviadaM += envM;

        if (d.recibido != null) {
          const recM = aMilesimas(d.recibido);
          if (recM !== null) recibidaM = (recibidaM ?? 0) + recM;
        }
      });

      return {
        id: t.id,
        origenNombre: t.origen?.nombre,
        origenEsDeposito: t.origen?.es_deposito,
        destinoNombre: t.destino?.nombre,
        estado: t.estado,
        cantidadItems: t.detalle.length,
        createdAt: t.createdAt,
        fechaEnvio: t.fechaEnvio,
        fechaRecepcion: t.fechaRecepcion,
        // Faltaba en la serialización aunque la fila ya lo traía: la pantalla lo
        // leía como `undefined` y mostraba "Correcta" en TODA transferencia
        // recibida, incluidas las que tenían faltantes.
        tieneDiferencias: t.tieneDiferencias === true,
        cantidadEnviada: desdeMilesimas(enviadaM),
        cantidadRecibida: recibidaM === null ? null : desdeMilesimas(recibidaM),
        totalCosto,
      };
    });

    const totalCostoGlobal = items.reduce(
      (acc, t) => acc + Number(t.totalCosto || 0),
      0
    );

    return NextResponse.json({
      ok: true,
      items,
      total,
      totalPages,
      totalCostoGlobal,
      error: null,
    });

  } catch (err) {
    console.error("Error listando transferencias:", err);
    return NextResponse.json(
      {
        ok: false,
        items: [],
        total: 0,
        totalPages: 1,
        error: err.message,
      },
      { status: 500 }
    );
  }
}
