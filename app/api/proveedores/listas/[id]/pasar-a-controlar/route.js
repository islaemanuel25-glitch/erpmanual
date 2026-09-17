// POST /api/proveedores/listas/[id]/pasar-a-controlar
//
// RESCATA UNA LISTA QUE SE SUBIÓ CON EL RANGO EN CERO.
//
// ── PARA QUÉ, Y ES UN CASO CONCRETO QUE YA ESTÁ EN PRODUCCIÓN ───────────────
//
// Emanuel subió una lista de Arcor con el rango en 0 % a 0 % a propósito: quería
// ver si coincidía con sus costos. El sistema de entonces la tomó como una lista
// de actualizar, no supo elegir la columna de precio, y quedaron 213 filas para
// revisar diciendo todas "entre 0,0 % y 0,0 %".
//
// Desde esta tanda un 0 a 0 se convierte en control AL SUBIR. Pero la que ya
// está leída sigue ahí, inservible, y no se arregla sola: su `modo` quedó en
// null —o sea, actualizar— y sus doscientas filas tienen el veredicto que salió
// de puntuar con el rango en cero.
//
// Esto la convierte sin volver a subir el archivo. La alternativa era decirle
// que la cancele y suba el PDF de nuevo, que es pedirle que rehaga algo que el
// sistema puede rehacer solo.
//
// ── POR QUÉ ES OTRA RUTA Y NO UN PARÁMETRO ─────────────────────────────────
//
// Porque son dos acciones distintas con dos condiciones distintas: pasar a
// actualizar EXIGE un rango y solo vale sobre un control; pasar a controlar no
// pide nada y solo vale sobre una lista de actualizar. Un parámetro `modo` en un
// endpoint llamado "pasar a actualizar" haría que la mitad de sus validaciones
// no correspondan según el valor.
//
// Lo que SÍ se comparte es la relectura, que vive en `reconciliarImportacion`:
// escribirla otra vez acá sería la copia que este proyecto prohíbe.
//
// ── NO ESCRIBE NINGÚN COSTO ────────────────────────────────────────────────
//
// Al revés: la deja en un modo donde escribir está prohibido.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";
import { getDepositoIdDeGrupo } from "@/lib/visibilidad";
import { resolverParserPorId } from "@/lib/proveedores/listas/registro";
import { esImportacionAbierta } from "@/lib/proveedores/listas/persistencia";
import { reconciliarImportacion } from "@/lib/proveedores/listas/reconciliarImportacion";
import { MODO_LISTA, modoDeImportacion } from "@/lib/proveedores/listas/modoDeLaLista";

/** Una corrida grande vuelve a escribir cientos de filas. */
const TX = { maxWait: 20000, timeout: 300000 };

const numeroONull = (v) => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function POST(req, context) {
  try {
    const admin = requireAdmin(req);
    if (!admin.ok) {
      return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });
    }

    const scope = await resolveScope(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }
    const { grupoId, localId } = scope;

    const params = await context.params;
    const importacionId = Number(params?.id);
    if (!Number.isInteger(importacionId) || importacionId <= 0) {
      return NextResponse.json({ ok: false, error: "Importación inválida." }, { status: 400 });
    }

    const cab = await prisma.importacionListaProveedor.findFirst({
      where: { id: importacionId, grupoId },
      select: {
        id: true,
        estado: true,
        modo: true,
        proveedorId: true,
        recargoPct: true,
        impuestoAdicionalPct: true,
        aumentoEsperadoMinPct: true,
        aumentoEsperadoMaxPct: true,
        parser: true,
      },
    });
    if (!cab) {
      return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
    }

    if (modoDeImportacion(cab) === MODO_LISTA.CONTROLAR) {
      return NextResponse.json(
        { ok: false, error: "Esta lista ya es un control.", codigo: "YA_ES_CONTROL" },
        { status: 409 }
      );
    }
    if (!esImportacionAbierta(cab.estado)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Esta lista está cerrada: no se puede pasar a control.",
          codigo: "CERRADA",
        },
        { status: 409 }
      );
    }

    // ── UNA LISTA CON COSTOS YA ESCRITOS NO SE PASA A CONTROL ────────────
    //
    // La relectura borra y reescribe las filas, así que se llevaría puesto qué
    // se aplicó y con qué costo — y esos costos QUEDARÍAN ESCRITOS en los
    // productos, sin nada que los explique. Lo que se hace con una lista
    // aplicada es deshacerla, que es otra acción y tiene su pantalla.
    const yaAplicadas = await prisma.importacionListaFila.count({
      where: { importacionId, aplicada: true },
    });
    if (yaAplicadas > 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            `Esta lista ya aplicó ${yaAplicadas} ${yaAplicadas === 1 ? "costo" : "costos"}. ` +
            "Deshacé la aplicación antes de pasarla a control.",
          codigo: "YA_APLICADA",
        },
        { status: 409 }
      );
    }

    const reg = resolverParserPorId(cab.parser);
    if (!reg.ok) {
      return NextResponse.json({ ok: false, error: reg.error }, { status: 409 });
    }

    // ── EL RANGO SE CONSERVA, NO SE BORRA ────────────────────────────────
    //
    // Controlando no se usa para nada, pero es lo que distingue este control
    // —salido de un 0 a 0 escrito a mano— de uno elegido a propósito, que nace
    // con el rango en null. `fueUnCeroACeroConvertido` lee esos dos hechos, y el
    // aviso que explica por qué esta lista terminó siendo un control depende de
    // que el 0 a 0 siga estando.
    const cabecera = {
      aumentoEsperadoMinPct: numeroONull(cab.aumentoEsperadoMinPct),
      aumentoEsperadoMaxPct: numeroONull(cab.aumentoEsperadoMaxPct),
      impuestoAdicionalPct: numeroONull(cab.impuestoAdicionalPct),
      modo: MODO_LISTA.CONTROLAR,
    };

    const r = await reconciliarImportacion(prisma, {
      cab,
      cabecera,
      config: {
        ...reg.config,
        recargoPct: Number(cab.recargoPct ?? 0),
        umbralVariacionPct: numeroONull(cab.aumentoEsperadoMaxPct),
        impuestoAdicionalPct: numeroONull(cab.impuestoAdicionalPct),
      },
      alcance: { grupoId, localId, depositoLocalId: await getDepositoIdDeGrupo(grupoId) },
      opcionesTx: TX,
    });

    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: "Esta lista no tiene filas para volver a leer.", codigo: r.codigo },
        { status: 409 }
      );
    }

    return NextResponse.json({
      ok: true,
      importacionId,
      modo: MODO_LISTA.CONTROLAR,
      resumen: r.resumen,
    });
  } catch (error) {
    // EL MENSAJE DICE QUÉ PASÓ Y QUÉ HACER.
    console.error("[listas/pasar-a-controlar]", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          "No se pudo pasar esta lista a control. No se cambió ningún costo: probá de nuevo, " +
          "y si sigue avisá con el número de la lista.",
      },
      { status: 500 }
    );
  }
}
