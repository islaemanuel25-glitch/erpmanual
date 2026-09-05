import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { MEDIO_LABEL } from "@/lib/pos-ventas/pagos";
import { normalizarRecargos } from "@/lib/recargos-pago/recargoPago";
import { PROCESADORES, TIPOS_COBRABLES, claveEdicionDe, normalizarEntrada } from "@/lib/pos-ventas/mediosCobro";
import {
  guardarRecargoDeTipo,
  materializarDefaults,
  mediosDelLocal,
  validarCambioDeMedio,
} from "@/lib/pos-ventas/mediosCobroServidor";

// MEDIOS DE COBRO DEL POS — qué botones ve el cajero y con qué condición.
//
// ── LO QUE EL CLIENTE NO PUEDE DECIDIR ─────────────────────────────────────
//
// El navegador manda un id y unos campos. NO manda el tipo contable de una venta
// ni el porcentaje que se va a aplicar: eso se lee de la base al cobrar. Acá se
// CONFIGURA; en `pos-ventas/crear` se COBRA, y esa separación es la que impide
// que alguien se invente un medio con 0 % de recargo desde la consola.
//
// El `tipoContable` sí se acepta al crear o editar, pero se valida contra el enum
// `MedioPago`: los cinco valores canónicos y nada más. Un tipo inventado no entra
// ni a la tabla ni a una venta.
//
// ── DOS PERMISOS DISTINTOS PARA LEER Y PARA ESCRIBIR ───────────────────────
//
// Leer alcanza con `pos.usar`: el cajero necesita saber qué botones tiene y
// cuánto se le suma a cada uno ANTES de cobrar, igual que con los recargos.
// Escribir pide `config_local.medios_cobro`, que es otra cosa.

export async function GET(req) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    const { grupoId, localId, session } = scope;

    const perm = checkPerm(session, ["config_local.medios_cobro", "pos.usar"]);
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const [medios, filasRecargo] = await Promise.all([
      mediosDelLocal(prisma, { localId, grupoId }),
      prisma.recargoPagoLocal.findMany({ where: { localId }, select: { medio: true, porcentaje: true } }),
    ]);

    return NextResponse.json({
      ok: true,
      localId,
      medios,
      // EL RECARGO ES DEL TIPO CONTABLE, no del botón: `RecargoPagoLocal` está
      // indexado por (local, medio). La pantalla necesita el mapa completo, no
      // solo el del medio que edita, porque si alguien cambia el tipo en el
      // formulario tiene que mostrarle el recargo del tipo NUEVO. Sin esto, un
      // "Guardar" después de cambiar el tipo escribiría sobre el tipo nuevo el
      // porcentaje que se había cargado para el viejo.
      recargosPorTipo: normalizarRecargos(filasRecargo),
      // `true` mientras el local no configuró nada y está usando los defaults.
      // La pantalla lo necesita para poder decirlo en vez de mostrar cuatro filas
      // que parecen decisiones de alguien.
      usandoDefaults: medios.every((m) => m.esDefault),
      // Las opciones salen del servidor y no de una lista en el navegador, para
      // que la pantalla no pueda ofrecer un tipo que la base no acepta.
      tiposContables: TIPOS_COBRABLES.map((t) => ({ valor: t, label: MEDIO_LABEL[t] || t })),
      procesadores: PROCESADORES,
    });
  } catch (err) {
    console.error("Error leyendo medios de cobro:", err);
    return NextResponse.json(
      { ok: false, error: `No se pudieron leer los medios de cobro: ${err.message}` },
      { status: 500 }
    );
  }
}

/**
 * Crear un medio de cobro.
 *
 * Antes de escribir materializa los defaults si el local no tenía configuración:
 * sin eso, crear el primer medio dejaría al local con una sola fila y el POS se
 * quedaría sin los otros tres botones.
 */
export async function POST(req) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    const { grupoId, localId, session } = scope;

    const perm = checkPerm(session, "config_local.medios_cobro");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const body = await req.json();
    const datos = normalizarEntrada(body);
    if (!datos.valido) return NextResponse.json({ ok: false, error: datos.error }, { status: 400 });

    const creado = await prisma.$transaction(async (tx) => {
      await materializarDefaults(tx, { localId });

      const control = await validarCambioDeMedio(tx, {
        localId,
        medioId: null,
        cambios: { nombre: datos.nombre, activo: datos.activo, tipoContable: datos.tipoContable },
      });
      if (!control.valido) {
        const e = new Error(control.error);
        e.conflicto = true;
        throw e;
      }

      const medio = await tx.medioCobroLocal.create({
        data: {
          localId,
          nombre: datos.nombre,
          activo: datos.activo,
          orden: datos.orden,
          tipoContable: datos.tipoContable,
          procesador: datos.procesador,
          comisionPct: datos.comisionPct,
        },
      });

      // Un medio nuevo puede traer su recargo en el mismo formulario, y va en la
      // misma transacción por lo mismo que en el PATCH: si el recargo fallara
      // después, el medio quedaría creado con un recargo que nadie eligió.
      await guardarRecargoDeTipo(tx, {
        localId,
        tipoContable: medio.tipoContable,
        recargoPct: datos.recargoPct,
        usuarioId: session.id,
      });

      return medio;
    });

    return NextResponse.json({ ok: true, medioId: creado.id, claveEdicion: claveEdicionDe(creado) });
  } catch (err) {
    if (err.conflicto) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 409 });
    }
    console.error("Error creando medio de cobro:", err);
    return NextResponse.json(
      { ok: false, error: `No se pudo crear el medio de cobro: ${err.message}` },
      { status: 500 }
    );
  }
}
