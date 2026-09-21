// CORREGIR A MANO UN COMPROBANTE QUE NO CERRÓ.
//
//   GET  /api/compras-proveedor/comprobantes/corregir/[id]
//        devuelve la lectura guardada rearmada, para dibujar "así lo entendió"
//   POST { correcciones: { "<orden>": 1234.56 } }
//        guarda esos subtotales en las líneas, vuelve a verificar y deja el
//        estado que corresponda
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
import { pasarPorLaPuerta, ESTADO } from "@/lib/compras-proveedor/comprobante/lector/puerta";
import {
  lecturaDesdeLoGuardado,
  conLosSubtotalesCorregidos,
  ordenesQueNoExisten,
} from "@/lib/compras-proveedor/comprobante/lecturaGuardada";
import { errorInesperado } from "@/lib/compras-proveedor/comprobante/errorDeRuta";

const aNumero = (v) => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const SELECT_COMPROBANTE = {
  id: true,
  estado: true,
  pedidoId: true,
  proveedorId: true,
  modeloLectura: true,
  recetaUsada: true,
  lineasEnElPapel: true,
  netoLeido: true,
  ivaLeido: true,
  internoLeido: true,
  totalLeido: true,
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
      internoUnitario: true,
      pesoKg: true,
      bonificacionPct: true,
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
      receta: c.recetaUsada ?? null,
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
    const crudas = body?.correcciones && typeof body.correcciones === "object" ? body.correcciones : {};
    const correcciones = Object.entries(crudas)
      .map(([orden, valor]) => ({ orden: Number(orden), valor: aNumero(valor) }))
      .filter((c) => Number.isFinite(c.orden) && c.valor !== null);
    if (!correcciones.length) {
      return NextResponse.json(
        { ok: false, error: "No llegó ninguna corrección." },
        { status: 400 }
      );
    }

    const c = await traerComprobante({ grupoId, id: comprobanteId });
    if (!c) return NextResponse.json({ ok: false, error: "No existe ese comprobante." }, { status: 404 });

    // SOLO SE CORRIGE LO QUE NO CERRÓ. Un comprobante CARGADO ya pasó la
    // verificación y sus costos pueden estar propuestos: cambiarle un subtotal
    // por atrás movería números que alguien ya miró.
    if (c.estado !== ESTADO.MAL_LEIDO) {
      return NextResponse.json(
        {
          ok: false,
          error: "Este comprobante no está esperando una corrección.",
          queHacer: "Se corrigen los que no cerraron. Este está en " + c.estado + ".",
        },
        { status: 409 }
      );
    }

    const porOrden = Object.fromEntries(correcciones.map((x) => [x.orden, x.valor]));
    const original = lecturaDesdeLoGuardado(c);
    if (ordenesQueNoExisten(original, porOrden).length) {
      return NextResponse.json(
        { ok: false, error: "Una de las correcciones no corresponde a ningún producto del papel." },
        { status: 400 }
      );
    }

    // ── SE VUELVE A PASAR POR LA MISMA PUERTA ─────────────────────────────
    //
    // No hay un segundo criterio para "cierra": es `pasarPorLaPuerta`, igual
    // que al leer. Lo único distinto es de dónde viene la lectura.
    const lectura = conLosSubtotalesCorregidos(original, porOrden);
    const puerta = pasarPorLaPuerta({ lectura, receta: c.recetaUsada ?? null });

    const guardado = await prisma.$transaction(async (tx) => {
      for (const { orden, valor } of correcciones) {
        await tx.comprobanteLinea.updateMany({
          where: { comprobanteId: c.id, orden },
          data: { subtotalImpreso: valor },
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
