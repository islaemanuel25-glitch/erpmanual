import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { turnoOperativo, estadoDelTurno, responsableDeCaja } from "@/lib/caja/cierreRelevo";
import { getAuditoriaScope, parseRangoFechas } from "@/lib/auditoria-pos-ventas/scope";
import { estadoFinanciero } from "@/lib/pos-ventas/comisionPendiente";

/**
 * GET /api/auditoria-pos-ventas/operadores?fechaDesde=...&fechaHasta=...
 *
 * Trazabilidad POR RESPONSABLE DE CAJA: el operador del PIN cuando lo hay, la
 * cuenta ERP cuando no (locales sin operario, Admin/Dueño sin PIN, turnos
 * históricos). Es `responsableDeCaja` de lib/caja/cierreRelevo.js, la misma
 * regla que decide de quién es una caja.
 *
 * ── POR QUÉ NO POR CUENTA ────────────────────────────────────────────────
 *
 * Agrupaba por `vendedorId`. En el mostrador real varios operadores comparten
 * la cuenta del local, así que sus cajas caían en UNA fila y la diferencia de
 * esa fila era la suma: A −$5.000 y B +$5.000 salían como "$0", un cajón sin
 * diferencia que no existió nunca.
 *
 * ── LA DIFERENCIA NO SE NETEA ─────────────────────────────────────────────
 *
 * Un faltante y un sobrante son dos hechos, de dos cajas o de dos días, y
 * restarlos esconde a los dos. Por responsable se informan por separado:
 * `faltante` (lo que faltó, en positivo), `sobrante`, la cantidad de cierres
 * con diferencia y el detalle por turno. Ninguna fila trae una diferencia neta.
 *
 * `agregadoEstadistico` es el local entero, rotulado como tal: faltantes y
 * sobrantes por separado, y el neto solo como dato estadístico al lado —nunca
 * en lugar del detalle, y nunca como "sin diferencia"—.
 */
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

    const { localId } = scope;
    const { fechaInicio, fechaFin } = rango;
    const enRango = { localId, fecha: { gte: fechaInicio, lte: fechaFin } };

    // 1. Ventas por responsable. Se agrupa por los DOS campos y se resuelve el
    //    responsable después con la misma regla que los turnos: una venta con
    //    operador es de ese operador, sin operador es de la cuenta.
    const ventasAgg = await prisma.venta.groupBy({
      by: ["operadorId", "vendedorId"],
      where: enRango,
      _count: { id: true },
      _sum: {
        total: true,
        comisionBancaria: true,
        netoRecibido: true,
        costoTotal: true,
        gananciaNeta: true,
        descuento: true,
      },
    });

    // CUÁNTAS VENTAS DE CADA RESPONSABLE SE COBRARON SIN LA COMISIÓN CONFIGURADA.
    //
    // Va por `groupBy` y no trayendo las filas: un `count` filtrado cuesta
    // mucho menos que traer miles de ventas solo para mirar un booleano, y el
    // estado que arma el dominio tiene la misma forma en los dos casos.
    const pendientesAgg = await prisma.venta.groupBy({
      by: ["operadorId", "vendedorId"],
      where: { ...enRango, comisionPendiente: true },
      _count: { id: true },
    });

    // 2. Turnos en el rango para el local
    const turnos = await prisma.turno.findMany({
      where: {
        localId,
        apertura: { gte: fechaInicio, lte: fechaFin },
      },
      orderBy: { apertura: "asc" },
      select: {
        id: true,
        vendedorId: true,
        operadorId: true,
        apertura: true,
        cierre: true,
        // El tercer estado: sin este campo, una caja cortada se cuenta como abierta.
        cierreEnPreparacionEn: true,
        diferenciaEfectivo: true,
        anuladoEn: true,
        montoEsperadoEfectivo: true,
        montoRealEfectivo: true,
        operador: { select: { id: true, nombre: true } },
        vendedor: { select: { id: true, nombre: true, email: true } },
      },
    });

    // 3. Una fila por responsable con actividad (ventas o turnos).
    const filas = new Map();
    const filaDe = (r) => {
      if (!filas.has(r.clave)) {
        filas.set(r.clave, {
          responsable: r,
          ventas: { count: 0, total: 0, comisionBancaria: 0, netoRecibido: 0, costoTotal: 0, gananciaNeta: 0, descuento: 0 },
          pendientes: 0,
          turnos: [],
          cuentas: new Map(),
        });
      }
      return filas.get(r.clave);
    };

    for (const a of ventasAgg) {
      const r = responsableDeCaja(a);
      if (!r) continue;
      const f = filaDe(r);
      f.ventas.count += a._count?.id ?? 0;
      for (const campo of ["total", "comisionBancaria", "netoRecibido", "costoTotal", "gananciaNeta", "descuento"]) {
        f.ventas[campo] += Number(a._sum?.[campo] ?? 0);
      }
    }
    for (const p of pendientesAgg) {
      const r = responsableDeCaja(p);
      if (r) filaDe(r).pendientes += p._count?.id ?? 0;
    }
    for (const t of turnos) {
      const r = responsableDeCaja(t);
      if (!r) continue;
      const f = filaDe(r);
      f.turnos.push(t);
      if (t.vendedor) f.cuentas.set(t.vendedor.id, t.vendedor);
    }

    if (filas.size === 0) {
      return NextResponse.json({ ok: true, items: [], agregadoEstadistico: agregado([]) });
    }

    // 4. Nombres: operadores y cuentas que no vinieron con un turno.
    const idsOperador = [...filas.values()].filter((f) => f.responsable.tipo === "OPERADOR").map((f) => f.responsable.id);
    const idsCuenta = [...filas.values()].filter((f) => f.responsable.tipo === "CUENTA").map((f) => f.responsable.id);
    const [operadores, cuentas] = await Promise.all([
      idsOperador.length
        ? prisma.operadorLocal.findMany({ where: { id: { in: idsOperador } }, select: { id: true, nombre: true } })
        : [],
      idsCuenta.length
        ? prisma.usuario.findMany({ where: { id: { in: idsCuenta } }, select: { id: true, nombre: true, email: true } })
        : [],
    ]);
    const nombreOperador = new Map(operadores.map((o) => [o.id, o.nombre]));
    const cuentaPorId = new Map(cuentas.map((u) => [u.id, u]));

    const redondear = (n) => Number(n.toFixed(2));

    // 5. Armar respuesta por responsable
    const items = [...filas.values()].map((f) => {
      const { responsable: r, ventas: va } = f;
      const cuenta = r.tipo === "CUENTA" ? cuentaPorId.get(r.id) : null;
      const nombre =
        r.tipo === "OPERADOR" ? nombreOperador.get(r.id) || "—" : cuenta?.nombre || "—";

      // Un turno ANULADO no es un cierre: se abrió por error o para probar y nunca
      // hubo plata ni conteo. Contarlo acá le sumaría a esta persona un cierre que
      // no hizo, y su diferencia (NULL) ensuciaría la métrica.
      const turnosCerrados = f.turnos.filter((t) => t.cierre !== null && t.anuladoEn == null);
      const turnosAnulados = f.turnos.filter((t) => t.anuladoEn != null).length;
      const diferencias = turnosCerrados
        .filter((t) => t.diferenciaEfectivo != null)
        .map((t) => Number(t.diferenciaEfectivo));

      return {
        responsable: { tipo: r.tipo, id: r.id, nombre },
        // Compatibilidad: la cuenta cuando el responsable ES la cuenta. Para un
        // operador, las cuentas con las que abrió sus cajas van en `cuentas`.
        vendedorId: r.tipo === "CUENTA" ? r.id : null,
        nombre,
        email: cuenta?.email ?? null,
        operador: r.tipo === "OPERADOR" ? { id: r.id, nombre } : null,
        cuentas: [...f.cuentas.values()].map((u) => ({ id: u.id, nombre: u.nombre })),
        // Ventas
        tickets: va.count,
        ventaBruta: redondear(va.total),
        comision: redondear(va.comisionBancaria),
        neto: redondear(va.netoRecibido),
        costo: redondear(va.costoTotal),
        ganancia: redondear(va.gananciaNeta),
        descuento: redondear(va.descuento),
        // Comisión, neto y ganancia de esta fila son parciales si hay ventas
        // pendientes: la comisión suma solo las conocidas y las otras dos
        // descontaron de menos.
        estadoFinanciero: estadoFinanciero({ pendientes: f.pendientes, total: va.count }),
        // Turnos
        turnosTrabajados: f.turnos.length,
        turnosCerrados: turnosCerrados.length,
        // OPERATIVOS, no "sin cerrar". Un turno que tomó su corte de cierre
        // sigue con "cierre" en null pero ya no vende: contarlo como abierto le
        // decía al auditor que hay más cajas en la calle de las que hay.
        turnosAbiertos: f.turnos.filter((t) => turnoOperativo(t)).length,
        turnosEnCierre: f.turnos.filter((t) => estadoDelTurno(t) === "CIERRE_EN_PREPARACION").length,
        // Se informan aparte: son auditables, pero no son cierres de esta persona.
        turnosAnulados,
        // LA DIFERENCIA, SIN NETEAR: lo que faltó y lo que sobró, por separado.
        cierresConDiferencia: diferencias.filter((d) => d !== 0).length,
        faltante: redondear(-diferencias.filter((d) => d < 0).reduce((s, d) => s + d, 0)),
        sobrante: redondear(diferencias.filter((d) => d > 0).reduce((s, d) => s + d, 0)),
        // Detalle de turnos: cada caja con su diferencia, que es lo que se audita.
        turnos: f.turnos.map((t) => ({
          turnoId: t.id,
          apertura: t.apertura,
          cierre: t.cierre,
          diferencia: t.diferenciaEfectivo != null ? Number(t.diferenciaEfectivo) : null,
          operador: t.operador || null,
          cuenta: t.vendedor ? { id: t.vendedor.id, nombre: t.vendedor.nombre } : null,
        })),
      };
    }).sort((a, b) => b.ventaBruta - a.ventaBruta);

    return NextResponse.json({ ok: true, items, agregadoEstadistico: agregado(items) });
  } catch (e) {
    console.error("auditoria-pos-ventas/operadores:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

/**
 * El local entero, como ESTADÍSTICA. Faltantes y sobrantes por separado; el
 * neto viaja solo como dato al lado, con un nombre que dice lo que es, y no
 * reemplaza al detalle por responsable.
 */
function agregado(items) {
  const faltante = items.reduce((s, i) => s + i.faltante, 0);
  const sobrante = items.reduce((s, i) => s + i.sobrante, 0);
  return {
    esEstadistico: true,
    faltante: Number(faltante.toFixed(2)),
    sobrante: Number(sobrante.toFixed(2)),
    cierresConDiferencia: items.reduce((s, i) => s + i.cierresConDiferencia, 0),
    netoEstadistico: Number((sobrante - faltante).toFixed(2)),
  };
}
