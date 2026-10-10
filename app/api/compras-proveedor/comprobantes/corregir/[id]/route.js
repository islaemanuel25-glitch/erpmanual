// CORREGIR A MANO UN COMPROBANTE QUE NO CERRÓ.
//
//   GET  /api/compras-proveedor/comprobantes/corregir/[id]
//        devuelve la lectura guardada rearmada, para dibujar "así lo entendió"
//   POST { correcciones: { "<orden>": 1234.56 } }
//        guarda esos subtotales en las líneas, vuelve a verificar y deja el
//        estado que corresponda
//   POST { renglones: { "<orden>": { cantidad, netoUnitario, subtotal } } }
//        lo mismo con el renglón entero, desde la hoja de Corregir. Cada
//        corrección queda en `CorreccionManualRenglon`: quién, cuándo, qué
//        había leído el lector y qué se puso.
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
  conLosRenglonesCorregidos,
  ordenesQueNoExisten,
} from "@/lib/compras-proveedor/comprobante/lecturaGuardada";
import { errorInesperado } from "@/lib/compras-proveedor/comprobante/errorDeRuta";
import { correccionAutomatica } from "@/lib/compras-proveedor/comprobante/correccionAutomatica";

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
      // La alícuota del renglón: sin ella, volver a verificar le pone a todos
      // la de la receta.
      ivaPct: true,
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

    const lecturaGuardada = lecturaDesdeLoGuardado(c);
    return NextResponse.json({
      ok: true,
      comprobante: { id: c.id, estado: c.estado, pedidoId: c.pedidoId, proveedorId: c.proveedorId },
      lectura: lecturaGuardada,
      receta: c.recetaUsada ?? null,
      // ── SI EL NÚMERO SE DEDUCE, NO HAY QUE PREGUNTAR NADA ─────────────
      //
      // Se calcula acá y no del otro lado de la pantalla: el número que se va a
      // escribir no puede venir del navegador. La pantalla lo aplica pidiendo
      // `automatica: true`, y el servidor lo vuelve a calcular antes de guardar.
      automatica: correccionAutomatica(lecturaGuardada),
      // Lo que YA quedó corregido, para poder decirlo en una línea aunque la
      // pantalla se haya refrescado.
      yaCorregidas: (c.lineas || [])
        .filter((l) => l.subtotalCorregido !== null && l.subtotalCorregido !== undefined)
        .map((l) => ({
          orden: l.orden,
          nombre: l.textoCrudo,
          leido: Number(l.subtotalImpreso),
          valor: Number(l.subtotalCorregido),
        })),
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
    const pideLaAutomatica = body?.automatica === true;

    const c = await traerComprobante({ grupoId, id: comprobanteId });
    if (!c) return NextResponse.json({ ok: false, error: "No existe ese comprobante." }, { status: 404 });

    // ── LA AUTOMÁTICA SE RECALCULA ACÁ, NO LLEGA HECHA ──────────────────
    //
    // La pantalla pide "aplicá la que corresponda"; el número sale del papel
    // guardado. Si viniera en el cuerpo, cualquiera podría escribir el subtotal
    // que quisiera diciendo que lo dedujo la cuenta.
    let auto = null;
    if (pideLaAutomatica) {
      auto = correccionAutomatica(lecturaDesdeLoGuardado(c));
      if (!auto.aplica) {
        return NextResponse.json(
          { ok: false, error: auto.porque, queHacer: auto.porque },
          { status: 409 }
        );
      }
    }

    const crudas = body?.correcciones && typeof body.correcciones === "object" ? body.correcciones : {};
    // ── O EL RENGLÓN ENTERO: CANTIDAD, PRECIO E IMPORTE ──────────────────
    //
    // Secco #256: "Corregir" en la hoja deja poner a mano lo que dice el papel
    // en ese renglón. `correcciones` sigue siendo el importe solo, que es lo
    // que manda el bloque de arriba; los dos llegan a la misma forma.
    const renglonesCrudos = body?.renglones && typeof body.renglones === "object" ? body.renglones : {};
    const correcciones = auto
      ? [{ orden: auto.orden, puesto: { subtotal: auto.valor }, automatica: true }]
      : [
          ...Object.entries(crudas).map(([orden, valor]) => ({
            orden: Number(orden),
            puesto: { subtotal: aNumero(valor) },
          })),
          ...Object.entries(renglonesCrudos).map(([orden, r]) => ({
            orden: Number(orden),
            puesto: {
              cantidad: aNumero(r?.cantidad),
              netoUnitario: aNumero(r?.netoUnitario),
              subtotal: aNumero(r?.subtotal),
            },
          })),
        ].filter((x) => Number.isFinite(x.orden) && Object.values(x.puesto).some((v) => v !== null));
    if (correcciones.some((x) => Object.values(x.puesto).some((v) => v !== null && v < 0) || x.puesto.cantidad === 0)) {
      const negativo = "La cantidad tiene que ser mayor que cero, y el precio y el importe no pueden ser negativos.";
      return NextResponse.json({ ok: false, error: negativo, queHacer: negativo }, { status: 400 });
    }
    if (!correcciones.length) {
      return NextResponse.json(
        { ok: false, error: "No llegó ninguna corrección." },
        { status: 400 }
      );
    }

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

    const porOrden = Object.fromEntries(correcciones.map((x) => [x.orden, x.puesto]));
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
    const lectura = conLosRenglonesCorregidos(original, porOrden);
    const puerta = pasarPorLaPuerta({ lectura, receta: c.recetaUsada ?? null });

    const guardado = await prisma.$transaction(async (tx) => {
      for (const { orden, puesto, automatica } of correcciones) {
        // ── EL IMPORTE, EN SU PROPIA COLUMNA, NO PISANDO LO LEÍDO ─────
        //
        // `subtotalImpreso` es lo que el lector creyó leer y es un hecho de la
        // lectura. Pisarlo perdía la explicación —"leyó X, corregido a Y"— y
        // hacía que la relectura siguiente borrara la corrección sin rastro.
        //
        // La cantidad y el precio no tienen columna aparte: se escriben en el
        // renglón, y lo que había leído el lector queda en la bitácora de abajo.
        const data = {};
        if (puesto.subtotal !== null && puesto.subtotal !== undefined) data.subtotalCorregido = puesto.subtotal;
        if (puesto.cantidad !== null && puesto.cantidad !== undefined) data.cantidad = puesto.cantidad;
        if (puesto.netoUnitario !== null && puesto.netoUnitario !== undefined) data.netoUnitario = puesto.netoUnitario;
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
            },
            puesto: { ...puesto, ...(automatica ? { automatica: true } : {}) },
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
      automatica: auto ? { orden: auto.orden, nombre: auto.nombre, leido: auto.leido, valor: auto.valor } : null,
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
