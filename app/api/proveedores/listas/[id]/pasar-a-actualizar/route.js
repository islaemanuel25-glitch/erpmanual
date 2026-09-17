// POST /api/proveedores/listas/[id]/pasar-a-actualizar
//
// CONVIERTE UNA LISTA DE CONTROL EN UNA DE ACTUALIZAR, SIN VOLVER A SUBIRLA.
//
// ── POR QUÉ NO ALCANZA CON CAMBIAR LA COLUMNA `modo` ────────────────────────
//
// Porque el veredicto de cada fila YA ESTÁ ESCRITO. Al conciliar se guardó, fila
// por fila, qué lectura se tomó, qué costo propone y en qué estado quedó — y
// controlando eso se decidió con otro criterio: la lectura que más se acerca al
// costo de hoy, no la que cae en el rango del proveedor.
//
// Cambiar solo la cabecera dejaría una lista que dice "actualizar" con
// doscientas filas decididas por cercanía. Lo peor es que se vería bien: cada
// fila tiene su costo, su porcentaje y su estado, y nada indicaría que se
// calcularon con la pregunta equivocada. Por eso se vuelve a conciliar entero.
//
// ── POR QUÉ NO SE PIDE EL ARCHIVO DE NUEVO ──────────────────────────────────
//
// Porque no hace falta: las filas persistidas tienen todo lo que el motor
// necesita —código, descripción, unidad, unidades por bulto y el precio ya con
// la columna elegida aplicada—. Es el mismo round-trip que hace `vincular` para
// recalcular una fila sola, acá para todas.
//
// Y es lo que pidió Emanuel con esas palabras: mirar el control, decidir que sí,
// y seguir. Volver a buscar el PDF en el teléfono para subir el mismo archivo
// sería trabajo que el sistema ya tiene hecho.
//
// ── ESTA RUTA NO ESCRIBE NINGÚN COSTO ───────────────────────────────────────
//
// No toca `ProductoBase` ni `ProductoLocal`: deja la importación CONCILIADA con
// su resultado, y el que escribe sigue siendo `aplicar`, con su confirmación.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";
import { getDepositoIdDeGrupo } from "@/lib/visibilidad";
import { resolverParserPorId } from "@/lib/proveedores/listas/registro";
import { esImportacionAbierta } from "@/lib/proveedores/listas/persistencia";
// La relectura entera de una importación ya leída. La comparten esta ruta y la
// de pasar a controlar: son la misma operación con distinto destino.
import { reconciliarImportacion } from "@/lib/proveedores/listas/reconciliarImportacion";
import { rangoValido } from "@/lib/proveedores/listas/rangoAumento";
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

    const body = await req.json().catch(() => ({}));
    const minPct = numeroONull(body?.minPct);
    const maxPct = numeroONull(body?.maxPct);

    // ── EL RANGO SE VALIDA ACÁ Y NO DESPUÉS ──────────────────────────────
    //
    // Con un rango inválido, `decidirLista` contesta SIN_RANGO y TODA la lista
    // queda para revisar a mano. Eso no es un error visible: es una importación
    // convertida y arruinada, y el usuario tendría que deducir del resultado que
    // el problema fue el número que escribió.
    if (minPct === null || maxPct === null || !rangoValido({ minPct, maxPct })) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Falta decir entre qué porcentajes se espera que aumenten los precios, " +
            "y el primero no puede ser mayor que el segundo.",
          codigo: "RANGO_INVALIDO",
        },
        { status: 400 }
      );
    }
    // Y EL 0 A 0 NO CONVIERTE NADA. Es el caso que originó todo esto: una lista
    // de actualizar con el rango en cero se rinde eligiendo la columna y deja
    // todo para revisar. Además el propio `resolverModo` lo trataría como un
    // control, así que la importación quedaría donde estaba — desde la pantalla,
    // un botón que no hace nada.
    if (minPct === 0 && maxPct === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Con 0 % a 0 % esto sigue siendo un control. Para actualizar precios poné cuánto " +
            "suele aumentar este proveedor.",
          codigo: "RANGO_EN_CERO",
        },
        { status: 400 }
      );
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
        parser: true,
        proveedor: { select: { id: true, nombre: true } },
      },
    });
    if (!cab) {
      return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
    }

    // SOLO UN CONTROL SE PASA A ACTUALIZAR. Sobre una que ya es de actualizar
    // esto volvería a conciliar con otro rango, que es otra acción y no la que
    // este endpoint dice hacer.
    if (modoDeImportacion(cab) !== MODO_LISTA.CONTROLAR) {
      return NextResponse.json(
        {
          ok: false,
          error: "Esta lista ya está para actualizar precios.",
          codigo: "NO_ES_CONTROL",
        },
        { status: 409 }
      );
    }
    if (!esImportacionAbierta(cab.estado)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Esta lista está cerrada: no se puede pasar a actualizar precios.",
          codigo: "CERRADA",
        },
        { status: 409 }
      );
    }

    const reg = resolverParserPorId(cab.parser);
    if (!reg.ok) {
      return NextResponse.json({ ok: false, error: reg.error }, { status: 409 });
    }

    // ── Volver a conciliar, con el modo y el rango nuevos ────────────────
    //
    // La relectura entera vive en `reconciliarImportacion` y no acá, porque
    // "pasar a controlar" hace exactamente lo mismo con otro destino. Escribir
    // la segunda al lado de ésta sería la copia que este proyecto prohíbe: lo
    // que cambiaría el día que una se toque es qué campos se le pasan al motor,
    // o sea qué costos se calculan.
    const cabecera = {
      aumentoEsperadoMinPct: minPct,
      aumentoEsperadoMaxPct: maxPct,
      impuestoAdicionalPct: numeroONull(cab.impuestoAdicionalPct),
      modo: MODO_LISTA.ACTUALIZAR,
    };

    const r = await reconciliarImportacion(prisma, {
      cab,
      cabecera,
      config: {
        ...reg.config,
        recargoPct: Number(cab.recargoPct ?? 0),
        // El techo del rango ES el umbral de variación alta. Son el mismo hecho
        // y tener dos números para él garantiza que un día digan cosas distintas.
        umbralVariacionPct: maxPct,
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
      modo: MODO_LISTA.ACTUALIZAR,
      rango: { minPct, maxPct },
      resumen: r.resumen,
    });
  } catch (error) {
    // EL MENSAJE DICE QUÉ PASÓ Y QUÉ HACER. "Error interno" fue lo único que se
    // vio el día que producción se cayó, y no le sirvió a nadie.
    console.error("[listas/pasar-a-actualizar]", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          "No se pudo pasar esta lista a actualizar precios. No se cambió ningún costo: " +
          "probá de nuevo, y si sigue avisá con el número de la lista.",
      },
      { status: 500 }
    );
  }
}
