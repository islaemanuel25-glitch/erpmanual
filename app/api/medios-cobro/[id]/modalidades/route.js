import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { MEDIO_LABEL } from "@/lib/pos-ventas/pagos";
import { TIPOS_COBRABLES, parsearClaveEdicion } from "@/lib/pos-ventas/mediosCobro";
import {
  componerModalidades,
  normalizarEntradaModalidad,
  requiereModalidad,
} from "@/lib/pos-ventas/modalidadesDeMedio";
import { resolverMedioDeModalidad } from "@/lib/pos-ventas/mediosCobroServidor";

// LAS MODALIDADES DE UN MEDIO DE COBRO.
//
// ── POR QUÉ CUELGAN DEL MEDIO EN LA URL ───────────────────────────────────
//
// Una modalidad no existe sin su padre: su identidad es "la Crédito DE Mercado
// Pago", y el aislamiento entre locales se resuelve UNA vez —al resolver el
// padre— en vez de repetirse en cada verbo. Una ruta plana `/api/modalidades/:id`
// habría necesitado volver a preguntar de qué local es cada modalidad, y ese es
// el tipo de comprobación que un día falta en uno de los cuatro verbos.
//
// ── EL SEGMENTO `[id]` ES LA CLAVE DE EDICIÓN, NO SIEMPRE UN ID ───────────
//
// La misma que usa la pantalla de Cobros: un id, o `defecto:MERCADOPAGO` mientras
// el local no configuró nada. Agregarle una modalidad a un medio que todavía es
// un default MATERIALIZA LOS CUATRO primero —no solo Mercado Pago—, porque a
// partir de la primera fila manda la configuración y el POS se quedaría sin los
// otros tres botones. Eso lo hace `resolverMedioParaEditar`, que ya existía: acá
// no se reescribe, se llama.
//
// ── DOS PERMISOS, LOS MISMOS QUE EL MEDIO ─────────────────────────────────
//
// Leer alcanza con `pos.usar`: el cajero necesita saber qué modalidades tiene un
// botón y cuánto suma cada una ANTES de cobrar. Escribir pide
// `config_local.medios_cobro`, igual que editar el medio: son la misma decisión.

/** La forma en que las modalidades salen al mundo, para que los dos verbos coincidan. */
async function leerModalidades(db, medioId) {
  const filas = await db.medioCobroModalidadLocal.findMany({
    where: { medioCobroLocalId: Number(medioId) },
    orderBy: [{ orden: "asc" }, { nombre: "asc" }],
  });
  const modalidades = componerModalidades(filas);
  return {
    modalidades,
    // Con DOS o más activas el POS tiene que preguntar; con una sola el servidor
    // la resuelve solo y no hay nada que elegir. Ver `resolverCondicionDeCobro`.
    requiereModalidad: requiereModalidad({ modalidades }),
  };
}

export async function GET(req, { params }) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    const { localId, session } = scope;

    const perm = checkPerm(session, ["config_local.medios_cobro", "pos.usar"]);
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { id } = await params;

    // LEER NO MATERIALIZA. Un GET que escribe cuatro filas como efecto de una
    // consulta convierte abrir una pantalla en configurar un local. Se busca el
    // medio tal como está y, si todavía es un default, no tiene modalidades —que
    // es la verdad—.
    //
    // La clave se PARSEA con la misma función que el resto: un `defecto:EFECTIVO`
    // no direcciona ninguna fila, y pasarlo por `Number()` daba `NaN`, que Prisma
    // rechaza con un 500. Un medio que todavía no existe no tiene modalidades, y
    // eso se contesta como lo que es: no encontrado.
    const ref = parsearClaveEdicion(id);
    const medio =
      ref?.clase === "id"
        ? await prisma.medioCobroLocal.findFirst({
            where: { id: ref.id, localId },
            select: { id: true, nombre: true, tipoContable: true },
          })
        : null;
    if (!medio) {
      return NextResponse.json(
        { ok: false, error: "Ese medio de cobro no existe en este local." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      medioId: medio.id,
      medioNombre: medio.nombre,
      ...(await leerModalidades(prisma, medio.id)),
      // Igual que en la ruta del medio: las opciones salen del servidor para que
      // la pantalla no pueda ofrecer un tipo que la base no acepta.
      tiposContables: TIPOS_COBRABLES.map((t) => ({ valor: t, label: MEDIO_LABEL[t] || t })),
    });
  } catch (err) {
    console.error("Error leyendo modalidades del medio de cobro:", err);
    return NextResponse.json(
      { ok: false, error: `No se pudieron leer las modalidades: ${err.message}` },
      { status: 500 }
    );
  }
}

/**
 * Crear una modalidad.
 *
 * ── NO HAY REGLA DE "AL MENOS UNA ACTIVA", Y NO ES UN OLVIDO ─────────────
 *
 * Un medio con TODAS sus modalidades apagadas vuelve a comportarse como un medio
 * sin modalidades: su tipo contable sale del padre, su recargo de
 * `RecargoPagoLocal` y su comisión de la resolución de siempre. O sea que
 * apagarlas no deja el POS sin con qué cobrar —que es lo que aquella regla
 * protege en los medios—, sino que devuelve el botón a como estaba antes.
 */
export async function POST(req, { params }) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    const { localId, session } = scope;

    const perm = checkPerm(session, "config_local.medios_cobro");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { id } = await params;
    const body = await req.json();
    const datos = normalizarEntradaModalidad(body);
    if (!datos.valido) return NextResponse.json({ ok: false, error: datos.error }, { status: 400 });

    const creada = await prisma.$transaction(async (tx) => {
      const medio = await resolverMedioDeModalidad(tx, { localId, clave: id });
      if (!medio) {
        const e = new Error("Ese medio de cobro no existe en este local.");
        e.noEncontrado = true;
        throw e;
      }
      return tx.medioCobroModalidadLocal.create({
        data: {
          medioCobroLocalId: medio.id,
          nombre: datos.nombre,
          activo: datos.activo,
          orden: datos.orden,
          tipoContable: datos.tipoContable,
          recargoPct: datos.recargoPct,
          comisionPct: datos.comisionPct,
        },
      });
    });

    return NextResponse.json({ ok: true, modalidadId: creada.id, medioId: creada.medioCobroLocalId });
  } catch (err) {
    if (err.noEncontrado) return NextResponse.json({ ok: false, error: err.message }, { status: 404 });
    console.error("Error creando modalidad de cobro:", err);
    return NextResponse.json(
      { ok: false, error: `No se pudo crear la modalidad: ${err.message}` },
      { status: 500 }
    );
  }
}
