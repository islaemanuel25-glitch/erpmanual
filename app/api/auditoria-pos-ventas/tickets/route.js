import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuditoriaScope, parseRangoFechas } from "@/lib/auditoria-pos-ventas/scope";
import { estadoTicket } from "@/lib/auditoria-pos-ventas/agregaciones";
import { comisionEsExacta } from "@/lib/pos-ventas/comisionPendiente";

export async function GET(req) {
  try {
    const scope = await getAuditoriaScope(req);
    if (!scope.ok) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }

    const rango = parseRangoFechas(req.nextUrl.searchParams);
    if (rango.error) {
      return NextResponse.json({ ok: false, error: rango.error }, { status: 400 });
    }

    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, Number(sp.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(sp.get("pageSize")) || 25));
    const skip = (page - 1) * pageSize;

    const { localId } = scope;
    const { fechaInicio, fechaFin } = rango;

    const countRows = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS c
      FROM "Venta" v
      WHERE v."localId" = ${localId}
        AND v.fecha >= ${fechaInicio}
        AND v.fecha <= ${fechaFin}
        AND (
          v."gananciaNeta" < 0
          OR (
            v."gananciaNeta" >= 0
            AND v."netoRecibido" > 0
            AND (v."gananciaNeta"::numeric / NULLIF(v."netoRecibido"::numeric, 0)) < 0.05
          )
        )
    `;
    const total = Number(countRows[0]?.c ?? 0);

    const rows = await prisma.$queryRaw`
      SELECT
        v.id,
        v.numero,
        v.fecha,
        v."createdAt",
        v."formaPago",
        v."esFiado",
        v.total,
        v."comisionBancaria",
        v."netoRecibido",
        v."costoTotal",
        v."gananciaNeta",
        -- Sin esto, el estado del ticket se calcularía sobre una ganancia que
        -- puede ser un placeholder. Ver `lib/pos-ventas/comisionPendiente.js`.
        v."comisionPendiente",
        v."turnoId",
        u.nombre AS "vendedorNombre",
        u.email AS "vendedorEmail",
        t.apertura AS "turnoApertura",
        t.cierre AS "turnoCierre"
      FROM "Venta" v
      LEFT JOIN "Usuario" u ON u.id = v."vendedorId"
      LEFT JOIN "Turno" t ON t.id = v."turnoId"
      WHERE v."localId" = ${localId}
        AND v.fecha >= ${fechaInicio}
        AND v.fecha <= ${fechaFin}
        AND (
          v."gananciaNeta" < 0
          OR (
            v."gananciaNeta" >= 0
            AND v."netoRecibido" > 0
            AND (v."gananciaNeta"::numeric / NULLIF(v."netoRecibido"::numeric, 0)) < 0.05
          )
        )
      ORDER BY v.fecha DESC
      LIMIT ${pageSize} OFFSET ${skip}
    `;

    const items = rows.map((r) => {
      const gn = Number(r.gananciaNeta);
      const nr = Number(r.netoRecibido);
      const estado = estadoTicket(gn, nr, r);
      const nrSafe = Number(r.netoRecibido);
      // El margen de un ticket con comisión pendiente sale inflado, porque su
      // ganancia neta no descontó nada. No se muestra un número: se dice que
      // está pendiente.
      const margenPct =
        !comisionEsExacta(r) ? null : nrSafe > 0 ? (Number(r.gananciaNeta) / nrSafe) * 100 : null;
      const tid = r.turnoId != null ? Number(r.turnoId) : null;
      return {
        id: r.id,
        numero: r.numero,
        fecha: r.fecha,
        createdAt: r.createdAt,
        formaPago: r.esFiado ? "fiado" : String(r.formaPago || ""),
        esFiado: r.esFiado === true,
        total: Number(r.total),
        comision: Number(r.comisionBancaria),
        netoRecibido: Number(r.netoRecibido),
        costo: Number(r.costoTotal),
        gananciaNeta: Number(r.gananciaNeta),
        margenPct: margenPct === null ? null : Number(margenPct.toFixed(4)),
        estado,
        // La comisión, el neto y la ganancia de arriba son placeholders cuando
        // esto es `true`. La tabla los tiene que rotular, no imprimirlos.
        comisionPendiente: r.comisionPendiente === true,
        turno:
          tid != null
            ? {
                id: tid,
                apertura: r.turnoApertura,
                cierre: r.turnoCierre,
              }
            : null,
        cajero: {
          nombre: r.vendedorNombre || r.vendedorEmail || "—",
        },
      };
    });

    return NextResponse.json({
      ok: true,
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 1 : Math.ceil(total / pageSize),
      },
      criterio:
        "Conflictivos: ganancia neta < 0, o margen sobre neto recibido < 5% (y neto > 0).",
    });
  } catch (e) {
    console.error("auditoria-pos-ventas/tickets:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
