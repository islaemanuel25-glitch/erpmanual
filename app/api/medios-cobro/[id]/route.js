import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import {
  aplicarCambioDeMedio,
  resolverMedioParaEditar,
  validarCambioDeMedio,
} from "@/lib/pos-ventas/mediosCobroServidor";
import { claveEdicionDe, normalizarEntrada } from "@/lib/pos-ventas/mediosCobro";

// EDITAR O BORRAR UN MEDIO DE COBRO.
//
// ── EL SEGMENTO DE LA URL ES LA CLAVE DE EDICIÓN, NO SIEMPRE UN ID ─────────
//
// Un local sin configurar recibe defaults, que no tienen fila. El GET le da a
// cada medio una `claveEdicion` y la pantalla la devuelve tal cual: para un medio
// materializado es su id, para un default es de qué tipo salió. La pantalla no la
// arma ni la interpreta, así que no tiene ninguna regla escondida del tipo "si el
// id es null mandá otra cosa". Ver `claveEdicionDe` en el kit.
//
// ── EL `localId` DEL WHERE NO ES DECORATIVO ────────────────────────────────
//
// Cada consulta filtra por el local del alcance además del id. Es la misma
// defensa barata que usa el resto del sistema contra un id de otra ubicación
// colado en la URL: sin eso, un encargado podría apagarle un medio de cobro a
// otra boca escribiendo el número a mano.
//
// ── UN SOLO "GUARDAR", UNA SOLA TRANSACCIÓN ────────────────────────────────
//
// La pantalla edita el medio y su recargo en la misma superficie con un botón.
// Si mandara dos requests, uno podría entrar y el otro fallar. Entonces esta ruta
// es la fachada de los dos: `aplicarCambioDeMedio` escribe el medio y hace el
// upsert de `RecargoPagoLocal` dentro de la MISMA transacción. Todo o nada.
//
// El recargo NO se copia a `MedioCobroLocal`: se escribe donde vive.

export async function PATCH(req, { params }) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    const { localId, session } = scope;

    const perm = checkPerm(session, "config_local.medios_cobro");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { id } = await params;

    const body = await req.json();
    const datos = normalizarEntrada(body, { parcial: true });
    if (!datos.valido) return NextResponse.json({ ok: false, error: datos.error }, { status: 400 });
    // `recargoPct` sale acá a propósito: no es una columna del medio y no puede
    // viajar de contrabando dentro del `data` del update.
    const { valido, recargoPct, ...cambios } = datos;

    const actualizado = await prisma.$transaction(async (tx) => {
      // Si el local venía con los defaults, esto materializa LOS CUATRO antes de
      // resolver: sin eso, apagar "Crédito" dejaría al local con una sola fila y
      // el POS se quedaría sin los otros tres botones.
      const objetivo = await resolverMedioParaEditar(tx, { localId, clave: id });
      if (!objetivo) {
        const e = new Error("Ese medio de cobro no existe en este local.");
        e.noEncontrado = true;
        throw e;
      }

      const control = await validarCambioDeMedio(tx, { localId, medioId: objetivo.id, cambios });
      if (!control.valido) {
        const e = new Error(control.error);
        e.conflicto = true;
        throw e;
      }

      return aplicarCambioDeMedio(tx, {
        localId,
        medioId: objetivo.id,
        cambios,
        recargoPct,
        usuarioId: session.id,
      });
    });

    // La clave se devuelve resuelta: si la pantalla acaba de editar un default,
    // la próxima vez ya lo pide por id sin tener que recargar.
    return NextResponse.json({
      ok: true,
      medioId: actualizado.id,
      claveEdicion: claveEdicionDe(actualizado),
    });
  } catch (err) {
    if (err.noEncontrado) return NextResponse.json({ ok: false, error: err.message }, { status: 404 });
    if (err.conflicto) return NextResponse.json({ ok: false, error: err.message }, { status: 409 });
    console.error("Error editando medio de cobro:", err);
    return NextResponse.json(
      { ok: false, error: `No se pudo guardar el medio de cobro: ${err.message}` },
      { status: 500 }
    );
  }
}

/**
 * Borrar un medio.
 *
 * NO se comprueba si se usó en ventas, y no hace falta: `VentaPago` congela el
 * TIPO CONTABLE, no el id del medio configurado. Una venta vieja de DEBITO sigue
 * diciendo DEBITO aunque el botón que la produjo ya no exista. Es la misma razón
 * por la que el nombre visible no es la identidad.
 *
 * Lo que sí se impide es dejar al local sin ningún medio activo, y se impide con
 * la MISMA regla que usa el PATCH. Antes esto tenía su propio `count` y el PATCH
 * no tenía nada, así que apagar el único medio activo dejaba el POS sin botones
 * por un camino y no por el otro.
 *
 * Tampoco se borra la fila de `RecargoPagoLocal` del tipo: el recargo es del tipo
 * contable y no de este botón, así que puede tener otro medio detrás —o el que se
 * cree mañana—. Borrar un medio no es decidir que ese tipo deja de tener recargo.
 */
export async function DELETE(req, { params }) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    const { localId, session } = scope;

    const perm = checkPerm(session, "config_local.medios_cobro");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { id } = await params;

    await prisma.$transaction(async (tx) => {
      const medio = await resolverMedioParaEditar(tx, { localId, clave: id });
      if (!medio) {
        const e = new Error("Ese medio de cobro no existe en este local.");
        e.noEncontrado = true;
        throw e;
      }

      const control = await validarCambioDeMedio(tx, { localId, medioId: medio.id, borrar: true });
      if (!control.valido) {
        const e = new Error(control.error);
        e.conflicto = true;
        throw e;
      }

      await tx.medioCobroLocal.delete({ where: { id: medio.id } });
    });

    return NextResponse.json({ ok: true, eliminado: true });
  } catch (err) {
    if (err.noEncontrado) return NextResponse.json({ ok: false, error: err.message }, { status: 404 });
    if (err.conflicto) return NextResponse.json({ ok: false, error: err.message }, { status: 409 });
    console.error("Error borrando medio de cobro:", err);
    return NextResponse.json(
      { ok: false, error: `No se pudo borrar el medio de cobro: ${err.message}` },
      { status: 500 }
    );
  }
}
