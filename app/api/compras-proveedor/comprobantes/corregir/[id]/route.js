// CORREGIR A MANO LO QUE SE LEYÓ DE UN PAPEL.
//
//   GET  /api/compras-proveedor/comprobantes/corregir/[id]
//        devuelve la lectura guardada rearmada, para dibujar "así lo entendió"
//   POST { renglones: { "<orden>": { cantidad, importe } | { noVino } } }
//        guarda lo que puso la persona en el producto, desde la hoja de
//        Corregir, vuelve a verificar y deja el estado que corresponda. Cada
//        corrección queda en `CorreccionManualRenglon`: quién, cuándo, qué
//        había leído el lector y qué se puso. Desde el 2026-10-26 vale para
//        cualquier papel que no se haya recibido, y no solo para el que no cerró.
//
// ── POR QUÉ SE PUEDE CORREGIR, SI EL PAPEL MANDA ──────────────────────────
//
// Porque acá no se corrige el papel: se corrige lo que el lector CREYÓ LEER del
// papel. Cuando un renglón no da su cuenta —(kilos o cantidad) × precio ×
// (1 − bonificación) no da el subtotal impreso— hay un dígito mal leído, y el
// único que puede decir cuál es el número verdadero es alguien mirando la foto.
// El sistema ofrece el que daría la cuenta y el que leyó; elige la persona.
//
// ── Y POR QUÉ NO SE RELEE EN VEZ DE CORREGIR ──────────────────────────────
//
// Releer cuesta una consulta de IA, tarda, y sobre el mismo papel suele volver
// a equivocarse en el mismo dígito. Con la explicación del proveedor guardada
// vale la pena releer —y para eso está «Leer de nuevo»—; para un número suelto,
// no.
//
// ── LO QUE ESTA RUTA NO HACE ──────────────────────────────────────────────
//
// No toca la identidad del comprobante, ni la conciliación, ni ningún costo.
// Escribe el subtotal de las líneas que se corrigieron y el veredicto que sale
// de volver a pasar por LA MISMA PUERTA que usa la lectura. Si después de
// corregir sigue sin cerrar, queda MAL_LEIDO, que es lo que es.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { pasarPorLaPuerta } from "@/lib/compras-proveedor/comprobante/lector/puerta";
import {
  lecturaDesdeLoGuardado,
  papelGuardadoSinImpuestos,
  productoPuestoAMano,
} from "@/lib/compras-proveedor/comprobante/lecturaGuardada";
import { errorInesperado } from "@/lib/compras-proveedor/comprobante/errorDeRuta";

const SELECT_COMPROBANTE = {
  id: true,
  estado: true,
  // Lo que ya se aplicó no se corrige: un papel confirmado o un pedido recibido.
  confirmadoEn: true,
  pedidoId: true,
  proveedorId: true,
  modeloLectura: true,
  recetaUsada: true,
  // Cómo leyó el modelo el papel: viaja con la lectura rearmada.
  explicacionLeida: true,
  lineasEnElPapel: true,
  netoLeido: true,
  ivaLeido: true,
  internoLeido: true,
  totalLeido: true,
  // Lo que el papel imprime al pie. Faltaba: `lecturaDesdeLoGuardado` lo
  // espera, y sin él volver a verificar una corrección hacía la cuenta con las
  // percepciones de la receta en vez de con las impresas.
  conceptosDelPieLeidos: true,
  lineas: {
    orderBy: { orden: "asc" },
    select: {
      id: true,
      orden: true,
      textoCrudo: true,
      codigoProveedor: true,
      cantidad: true,
      netoUnitario: true,
      subtotalImpreso: true,
      subtotalCorregido: true,
      internoUnitario: true,
      pesoKg: true,
      bonificacionPct: true,
      // Lo que interpretó el modelo: la cuenta se rehace con el costo final.
      costoFinalRenglon: true,
      enQueViene: true,
      tipoRenglon: true,
      // La alícuota del renglón: sin ella, volver a verificar le pone a todos
      // la de la receta.
      ivaPct: true,
      // "No vino" queda afuera de la cuenta, y lo tocado a mano se marca.
      noVino: true,
      corregidoAManoEn: true,
    },
  },
};

async function traerComprobante({ grupoId, id }) {
  return prisma.comprobanteProveedor.findFirst({
    where: { id, grupoId },
    select: SELECT_COMPROBANTE,
  });
}

export async function GET(req, { params }) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    const { grupoId, session } = ctx;

    const perm = checkPerm(session, ["compras.ver", "compras.recibir"]);
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { id } = await params;
    const comprobanteId = Number(id);
    if (!Number.isFinite(comprobanteId)) {
      return NextResponse.json({ ok: false, error: "id requerido" }, { status: 400 });
    }

    const c = await traerComprobante({ grupoId, id: comprobanteId });
    if (!c) return NextResponse.json({ ok: false, error: "No existe ese comprobante." }, { status: 404 });

    return NextResponse.json({
      ok: true,
      comprobante: { id: c.id, estado: c.estado, pedidoId: c.pedidoId, proveedorId: c.proveedorId },
      lectura: lecturaDesdeLoGuardado(c),
    });
  } catch (err) {
    console.error("Error comprobantes/corregir GET:", err);
    return NextResponse.json(
      {
        ok: false,
        error: errorInesperado({
          operacion: "abrir la corrección del comprobante",
          quedo: "No se tocó nada: esto solo muestra lo que ya estaba guardado.",
        }),
      },
      { status: 500 }
    );
  }
}

export async function POST(req, { params }) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    const { grupoId, session } = ctx;

    const perm = checkPerm(session, "compras.recibir");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { id } = await params;
    const comprobanteId = Number(id);
    if (!Number.isFinite(comprobanteId)) {
      return NextResponse.json({ ok: false, error: "id requerido" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));

    const c = await traerComprobante({ grupoId, id: comprobanteId });
    if (!c) return NextResponse.json({ ok: false, error: "No existe ese comprobante." }, { status: 404 });

    // ── LO QUE SE PUEDE CAMBIAR: CANTIDAD E IMPORTE, O "NO VINO" ─────────
    //
    // Emanuel, 2026-10-26: el lector puede fallar con cualquier papel —leyó
    // corrida una fila del de Mauro #298— y siempre tiene que haber una salida
    // desde la pantalla, sin arreglar código ni volver a subir el papel. Por
    // producto llega `{ cantidad, importe }` —el precio y el costo salen de
    // ellos (`productoPuestoAMano`)— o `{ noVino }`, que lo saca del papel.
    // El producto se cambia por la ruta de vincular, que ya existía.
    const renglonesCrudos = body?.renglones && typeof body.renglones === "object" ? body.renglones : {};
    const pedidos = Object.entries(renglonesCrudos)
      .map(([orden, r]) => ({ orden: Number(orden), r: r ?? {} }))
      .filter((x) => Number.isFinite(x.orden));
    if (!pedidos.length) {
      return NextResponse.json({ ok: false, error: "No llegó ninguna corrección." }, { status: 400 });
    }
    if (pedidos.some((x) => !(c.lineas || []).some((l) => Number(l.orden) === x.orden))) {
      return NextResponse.json(
        { ok: false, error: "Una de las correcciones no corresponde a ningún producto del papel." },
        { status: 400 }
      );
    }

    // ── SE CORRIGE CUALQUIER PAPEL, MIENTRAS NO SE HAYA RECIBIDO ──────────
    //
    // Antes, solo los que no cerraron: un CARGADO no se tocaba. Pero el papel
    // que cerró también puede estar mal leído —una fila corrida cierra igual si
    // los importes son los de otra fila—. Lo que no se toca es lo que ya se
    // aplicó: un comprobante confirmado o un pedido recibido.
    // El comprobante tiene solo el escalar pedidoId, sin relación: el estado
    // del pedido se lee aparte.
    const pedido =
      c.pedidoId == null
        ? null
        : await prisma.pedidoProveedor.findFirst({ where: { id: c.pedidoId, grupoId }, select: { estado: true } });
    if (c.confirmadoEn != null || pedido?.estado === "RECIBIDO") {
      const cerrado = "Este papel ya se recibió: lo que entró no se corrige desde acá.";
      return NextResponse.json({ ok: false, error: cerrado, queHacer: cerrado }, { status: 409 });
    }

    const sinImpuestos = papelGuardadoSinImpuestos(c);
    const original = lecturaDesdeLoGuardado({ ...c, lineas: (c.lineas || []).map((l) => ({ ...l, noVino: false })) });
    const correcciones = [];
    for (const { orden, r } of pedidos) {
      if (typeof r.noVino === "boolean") {
        correcciones.push({ orden, puesto: { noVino: r.noVino } });
        continue;
      }
      const leido = original.lineas.find((l) => Number(l.orden) === orden) ?? {};
      const puesto = productoPuestoAMano({ leido, cantidad: r.cantidad, importe: r.importe, sinImpuestos });
      if (puesto.error) return NextResponse.json({ ok: false, error: puesto.error, queHacer: puesto.error }, { status: 400 });
      correcciones.push({ orden, puesto });
    }

    // ── SE VUELVE A PASAR POR LA MISMA PUERTA ─────────────────────────────
    //
    // No hay un segundo criterio para "cierra": es `pasarPorLaPuerta`, igual
    // que al leer, sobre las filas como van a quedar. Lo que no vino queda
    // afuera de la cuenta (`lecturaDesdeLoGuardado`).
    const porOrden = new Map(correcciones.map((x) => [x.orden, x.puesto]));
    const comoQuedan = (c.lineas || []).map((l) => {
      const p = porOrden.get(Number(l.orden));
      if (!p) return l;
      if ("noVino" in p) return { ...l, noVino: p.noVino };
      return { ...l, cantidad: p.cantidad, netoUnitario: p.netoUnitario, subtotalCorregido: p.subtotal, costoFinalRenglon: p.costoFinal };
    });
    const puerta = pasarPorLaPuerta({ lectura: lecturaDesdeLoGuardado({ ...c, lineas: comoQuedan }), receta: c.recetaUsada ?? null });

    const guardado = await prisma.$transaction(async (tx) => {
      const ahora = new Date();
      for (const { orden, puesto } of correcciones) {
        // ── EL IMPORTE, EN SU PROPIA COLUMNA, NO PISANDO LO LEÍDO ─────
        //
        // `subtotalImpreso` es lo que el lector creyó leer y es un hecho de la
        // lectura. La cantidad, el precio y el costo no tienen columna aparte:
        // lo que había leído el lector queda en la bitácora de abajo. Y
        // `corregidoAManoEn` marca que lo tocó una persona: el recálculo al
        // abrir el pedido no lo vuelve a pisar.
        const data =
          "noVino" in puesto
            ? { noVino: puesto.noVino, corregidoAManoEn: ahora }
            : {
                cantidad: puesto.cantidad,
                netoUnitario: puesto.netoUnitario,
                subtotalCorregido: puesto.subtotal,
                costoFinalRenglon: puesto.costoFinal,
                corregidoAManoEn: ahora,
              };
        await tx.comprobanteLinea.updateMany({ where: { comprobanteId: c.id, orden }, data });

        // ── Y QUEDA REGISTRADA: QUIÉN, CUÁNDO, QUÉ HABÍA Y QUÉ SE PUSO ──
        //
        // Para la segunda revisión: lo que una persona escribió reemplaza a lo
        // leído, y eso se tiene que poder ver después.
        const leida = original.lineas.find((l) => Number(l.orden) === Number(orden)) ?? {};
        const renglon = (c.lineas || []).find((l) => Number(l.orden) === Number(orden)) ?? {};
        await tx.correccionManualRenglon.create({
          data: {
            grupoId,
            comprobanteId: c.id,
            comprobanteLineaId: renglon.id ?? null,
            orden,
            textoCrudo: renglon.textoCrudo ?? null,
            leido: {
              cantidad: leida.cantidad ?? null,
              netoUnitario: leida.netoUnitario ?? null,
              subtotal: leida.subtotalImpreso ?? null,
              ...(leida.costoFinal != null ? { costoFinal: leida.costoFinal } : {}),
              ...("noVino" in puesto ? { noVino: renglon.noVino === true } : {}),
            },
            puesto,
            cerroDespues: puerta.cierra === true,
            usuarioId: Number.isFinite(Number(session?.id)) ? Number(session.id) : null,
          },
        });
      }
      // SOLO EL VEREDICTO, NO TODO `aGuardar`. Los campos de la lectura —modelo,
      // consumo, receta usada, pie leído— son de la llamada de IA que ya pasó y
      // no cambian porque alguien corrija un número; reescribirlos con lo que
      // esta ruta tiene a mano los pondría en null.
      return tx.comprobanteProveedor.update({
        where: { id: c.id },
        data: {
          estado: puerta.estado,
          diferenciaCentavos: puerta.diferenciaCentavos ?? null,
        },
        select: { id: true, estado: true, diferenciaCentavos: true },
      });
    });

    return NextResponse.json({
      ok: true,
      estado: guardado.estado,
      cierra: puerta.cierra,
      proponeCostos: puerta.proponeCostos,
      porque: puerta.porque,
      diferenciaCentavos: puerta.diferenciaCentavos,
      corregidas: correcciones.length,
      queHacer: puerta.cierra
        ? "El papel cierra. Ya se puede conciliar contra el pedido."
        : "Sigue sin cerrar: mirá la foto contra la lista.",
    });
  } catch (err) {
    console.error("Error comprobantes/corregir POST:", err);
    return NextResponse.json(
      {
        ok: false,
        error: errorInesperado({
          operacion: "guardar la corrección del comprobante",
          quedo: "Si falló, no se guardó ninguna corrección: van todas juntas o ninguna.",
        }),
      },
      { status: 500 }
    );
  }
}
