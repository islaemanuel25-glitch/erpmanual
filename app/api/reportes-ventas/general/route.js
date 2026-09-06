import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { whereVentaComercial } from "@/lib/ventas/filtroVentaComercial";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { getRangoArgentina } from "@/lib/fechas/rangoArgentina";
import { resolveVistaOperativa, getGrupoIdDeLocal } from "@/lib/grupos";
import { getContextoActivo } from "@/lib/contexto";
import { tendersParaAgregar, normalizarMedio } from "@/lib/pos-ventas/pagos";
import { resumirExactitud } from "@/lib/pos-ventas/comisionPendiente";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "reportes.ver");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const { searchParams } = req.nextUrl;
    const fechaDesde = searchParams.get("fechaDesde");
    const fechaHasta = searchParams.get("fechaHasta");
    const localIdParam = searchParams.get("localId");
    const formaPagoParam = searchParams.get("formaPago");

    if (!fechaDesde || !fechaHasta) {
      return NextResponse.json(
        { ok: false, error: "Fechas requeridas" },
        { status: 400 }
      );
    }

    // Rango en hora Argentina (UTC-3) para que las ventas de la noche
    // no se corran un día cuando el contenedor corre en UTC.
    const { fechaInicio, fechaFin } = getRangoArgentina(fechaDesde, fechaHasta);

    const where = {
      fecha: {
        gte: fechaInicio,
        lte: fechaFin,
      },
    };

    // Scope estricto por UBICACIÓN. Nunca queda sin filtro (antes: admin sin
    // localId veía TODOS los grupos).
    //  - No-admin: SIEMPRE su local; localId ajeno por query → 403.
    //  - Admin con qLocal: debe ser un local de SU grupo activo → filtra por él.
    //  - Admin sin qLocal: contexto (vista global explícita = todo el grupo;
    //    contexto de un local = ese local; sin contexto → 409).
    const qLocal = Number(localIdParam) || 0;
    if (!session.esAdmin) {
      const propio = Number(session.localId) || 0;
      if (!propio) {
        return NextResponse.json({ ok: false, error: "Sin alcance autorizado." }, { status: 403 });
      }
      if (qLocal && qLocal !== propio) {
        return NextResponse.json({ ok: false, error: "Local fuera de tu alcance." }, { status: 403 });
      }
      where.localId = propio;
    } else if (qLocal) {
      // Grupo EFECTIVO del admin: su grupo activo (cookie erpazul_grupo_activo) o,
      // si no está seteado, el grupo del LOCAL DEL CONTEXTO ACTIVO (misma fuente de
      // verdad que resolveVistaOperativa, ver lib/grupos.js). Se deriva del CONTEXTO
      // del admin, NO del local solicitado, para que no pueda consultar otro grupo
      // pasando otro localId. El local pedido debe pertenecer a ese grupo efectivo.
      const gLocal = await getGrupoIdDeLocal(qLocal);
      let grupoEfectivo = Number(session.grupoId) || 0;
      if (!grupoEfectivo) {
        const ctx = getContextoActivo(req, session);
        if (ctx?.localId) grupoEfectivo = (await getGrupoIdDeLocal(ctx.localId)) || 0;
      }
      if (!grupoEfectivo || !gLocal || gLocal !== grupoEfectivo) {
        return NextResponse.json({ ok: false, error: "Local fuera de tu grupo activo." }, { status: 403 });
      }
      where.localId = qLocal;
    } else {
      const vista = await resolveVistaOperativa(req);
      if (vista.error) {
        return NextResponse.json(
          { ok: false, error: vista.error, needsContexto: vista.needsContexto },
          { status: vista.status }
        );
      }
      where.localId = vista.modo === "GLOBAL" ? { in: vista.localIds } : vista.localId;
    }

    if (formaPagoParam) {
      // Filtro por medio: una venta coincide si TIENE al menos un tender de ese medio.
      const medioNorm = normalizarMedio(formaPagoParam);
      if (medioNorm) where.pagos = { some: { medio: medioNorm } };
      else where.formaPago = formaPagoParam; // compat con valores legacy no mapeables
    }

    // Obtener ventas con detalles
    const ventas = await prisma.venta.findMany({
      where: whereVentaComercial(where),
      select: {
        id: true,
        total: true,
        subtotal: true,
        descuento: true,
        comisionBancaria: true,
        netoRecibido: true,
        // Obligatorio: `comisionEsExacta` falla cerrado, así que sin este campo
        // el reporte contaría todas sus ventas como pendientes.
        comisionPendiente: true,
        costoTotal: true,
        gananciaBruta: true,
        gananciaNeta: true,
        formaPago: true,
        esFiado: true,
        pagos: { select: { medio: true, monto: true, comision: true, neto: true } },
        detalles: {
          select: {
            nombre: true,
            cantidad: true,
            precio: true,
            subtotal: true,
            precioCosto: true,
            ganancia: true,
          },
        },
      },
    });

    // Resumen general
    const cantidadVentas = ventas.length;
    let totalBruto = 0;
    let totalDescuentos = 0;
    let totalComisiones = 0;
    let totalNeto = 0;
    let totalCostos = 0;
    let gananciaNeta = 0;

    ventas.forEach((v) => {
      totalBruto += Number(v.total);
      totalDescuentos += Number(v.descuento);
      totalComisiones += Number(v.comisionBancaria);
      totalNeto += Number(v.netoRecibido);
      totalCostos += Number(v.costoTotal);
      gananciaNeta += Number(v.gananciaNeta);
    });

    // Desglose por medio de pago — POR TENDER: cada pago aporta SU monto al bucket
    // de su medio (una venta mixta suma parcialmente en varios). La suma de buckets
    // coincide con el total de ventas. `cantidad` cuenta tenders de ese medio.
    const desglosePagoMap = {};
    ventas.forEach((v) => {
      for (const t of tendersParaAgregar(v)) {
        const key = t.medio.toLowerCase();
        if (!desglosePagoMap[key]) {
          desglosePagoMap[key] = { formaPago: key, cantidad: 0, total: 0, comision: 0, neto: 0 };
        }
        desglosePagoMap[key].cantidad++;
        desglosePagoMap[key].total += t.monto;
        desglosePagoMap[key].comision += t.comision;
        desglosePagoMap[key].neto += t.neto;
      }
    });

    // Top productos
    const productosMap = {};
    ventas.forEach((v) => {
      v.detalles.forEach((d) => {
        if (!productosMap[d.nombre]) {
          productosMap[d.nombre] = {
            nombre: d.nombre,
            cantidad: 0,
            totalVenta: 0,
            totalCosto: 0,
            ganancia: 0,
          };
        }
        // Prisma serializa Decimal como string: convertir antes de operar
        // para evitar concatenación tipo "0" + "1.510" → "01.510".
        const cantidad = Number(d.cantidad);
        productosMap[d.nombre].cantidad += cantidad;
        productosMap[d.nombre].totalVenta += Number(d.subtotal);
        productosMap[d.nombre].totalCosto += Number(d.precioCosto) * cantidad;
        productosMap[d.nombre].ganancia += Number(d.ganancia);
      });
    });

    const topProductos = Object.values(productosMap)
      .sort((a, b) => b.totalVenta - a.totalVenta)
      .slice(0, 20);

    return NextResponse.json({
      ok: true,
      resumen: {
        cantidadVentas,
        totalBruto: totalBruto.toFixed(2),
        totalDescuentos: totalDescuentos.toFixed(2),
        totalComisiones: totalComisiones.toFixed(2),
        totalNeto: totalNeto.toFixed(2),
        totalCostos: totalCostos.toFixed(2),
        gananciaNeta: gananciaNeta.toFixed(2),
        // `totalComisiones` son las CONOCIDAS —el total real es mayor— y el neto
        // y la ganancia están sobreestimados. El desglose por medio arrastra lo
        // mismo, porque sus tenders traen el cero estructural.
        estadoFinanciero: resumirExactitud(ventas),
      },
      desglosePago: Object.values(desglosePagoMap),
      topProductos,
    });
  } catch (error) {
    console.error("Error generando reporte:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
