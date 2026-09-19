// POST /api/proveedores/listas/[id]/releer-propuestas
//
// VOLVER A CALCULAR LA PROPUESTA DE LAS FILAS QUE QUEDARON VIEJAS.
//
// ── DE DÓNDE SALE ──────────────────────────────────────────────────────────
//
// De la importación #12 de M Y F, en producción. La pantalla decía "11 se
// actualizan", Emanuel aplicó, y se escribieron 3. Las otras 8 salieron OMITIDAS
// con PROPUESTA_DIFERENTE: al aplicar, el sistema recalcula el costo con el
// producto de HOY y lo compara contra el que quedó guardado al conciliar, y si no
// coinciden al centavo no escribe. No escribir es lo correcto —nadie miró ese
// número— pero la persona quedaba sin ninguna salida: la fila seguía tildada,
// seguía contándose, y aplicar la seguía salteando.
//
// Ésta es la salida. No escribe ningún costo: vuelve a leer esas filas con los
// datos de hoy y las deja donde el motor diga.
//
// ── LA CONFIRMACIÓN VENCE, NO SE BORRA ─────────────────────────────────────
//
// Si alguien había confirmado cómo se lee el precio de esa fila, esa respuesta se
// dio sobre un costo que ya no es el de hoy. Recalcular MANTENIÉNDOLA dejaría la
// fila lista con un número nuevo que nadie miró — que es exactamente lo que
// PROPUESTA_DIFERENTE existe para impedir, conseguido por otro camino.
//
// Así que la confirmación VENCE: se escribe `vinculadoEn` con el ahora, y
// `multiplicadorConfirmadoUsable` deja de contarla porque es anterior. La autoría
// no se toca —`confirmadoEn` y quién fue quedan en la fila— y es el MISMO
// mecanismo que ya usa `vincular`, con el mismo comentario. Un hecho, una
// columna: el veredicto del motor y la decisión de la persona no se pisan.
//
// ── QUIÉN DECIDE CUÁLES SON ────────────────────────────────────────────────
//
// `revisarAntesDeAplicar`, o sea `revalidarFila`: la misma función que decide qué
// escribe aplicar y la misma que cuenta el resultado. No se recibe una lista de
// ids del cliente: una pantalla vieja mandaría ids que hoy ya se pueden aplicar y
// les vencería la confirmación por gusto. Lo que se relee es lo que el recálculo
// de AHORA omitiría por este motivo, y nada más.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";
import { getDepositoIdDeGrupo } from "@/lib/visibilidad";
import { resolverParserPorId } from "@/lib/proveedores/listas/registro";
import { esImportacionAbierta, filaAPersistir, OPCIONES_TX } from "@/lib/proveedores/listas/persistencia";
import {
  revisarAntesDeAplicar,
  omitidasPorMotivo,
  CAMPOS_PRODUCTO_PARA_REVALIDAR,
  MOTIVO_OMISION,
} from "@/lib/proveedores/listas/aplicacion";
import {
  conciliarFila,
  indexarCodigosProveedor,
  indexarCodigosBarra,
} from "@/lib/proveedores/listas/conciliarLista";
// El kit de volver a conciliar UNA fila. Existe justamente para no escribir esto
// dos veces: lo usa `vincular` y ahora lo usa esta ruta.
import {
  productoParaElMotor,
  CAMPOS_PRODUCTO_PARA_EL_MOTOR,
  filaParaElMotor,
} from "@/lib/proveedores/listas/vincularConUnaFila";
import { recalcularContadores } from "@/lib/proveedores/listas/contadores";
import { modoDeImportacion, MODO_LISTA } from "@/lib/proveedores/listas/modoDeLaLista";

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

    const importacion = await prisma.importacionListaProveedor.findFirst({
      where: { id: importacionId, grupoId },
      select: {
        id: true,
        estado: true,
        modo: true,
        proveedorId: true,
        parser: true,
        recargoPct: true,
        impuestoAdicionalPct: true,
        aumentoEsperadoMinPct: true,
        aumentoEsperadoMaxPct: true,
      },
    });
    if (!importacion) {
      return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
    }

    // Una lista cerrada no se relee: si ya se aplicó, los costos están escritos y
    // lo que corresponde es deshacer primero. Es el mismo corte que hace cambiar
    // la columna de precio, por el mismo motivo.
    if (!esImportacionAbierta(importacion.estado)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Esta lista ya está cerrada. Si aplicaste los precios, primero deshacé la aplicación.",
        },
        { status: 409 }
      );
    }

    // Controlar no escribe costos, así que no hay ninguna propuesta que aplicar
    // ni, por lo tanto, ninguna que se haya quedado vieja.
    if (modoDeImportacion(importacion) === MODO_LISTA.CONTROLAR) {
      return NextResponse.json(
        { ok: false, error: "Esta lista se subió para controlar: no propone costos para aplicar." },
        { status: 409 }
      );
    }

    const reg = resolverParserPorId(importacion.parser);
    if (!reg.ok) {
      return NextResponse.json({ ok: false, error: reg.error }, { status: 409 });
    }

    // ── CUÁLES, CON LA MISMA FUNCIÓN QUE APLICA ────────────────────────────
    //
    // Las tres consultas son las de aplicar: el mismo `where`, la fila entera y
    // el mismo `select` del producto. Una fila traída con menos campos llega con
    // `undefined` donde las guardas miran, y esta ruta le vencería la
    // confirmación a filas que se podían aplicar perfectamente.
    const candidatas = await prisma.importacionListaFila.findMany({
      where: { importacionId, seleccionada: true, aplicada: false },
      orderBy: { filaExcel: "asc" },
    });
    const baseIds = [...new Set(candidatas.map((f) => f.productoBaseId).filter((x) => x !== null))];
    const productos = baseIds.length
      ? await prisma.productoBase.findMany({
          where: { id: { in: baseIds }, grupoId },
          select: CAMPOS_PRODUCTO_PARA_REVALIDAR,
        })
      : [];
    const porId = new Map(productos.map((p) => [p.id, p]));

    const depositoLocalId = await getDepositoIdDeGrupo(grupoId);
    const revision = revisarAntesDeAplicar({
      filas: candidatas,
      productoDe: (f) => (f.productoBaseId === null ? null : porId.get(f.productoBaseId) ?? null),
      contexto: { operandoEnLocalId: Number(localId), depositoLocalId, cabecera: importacion },
      config: { ...reg.config, impuestoAdicionalPct: numeroONull(importacion.impuestoAdicionalPct) },
      recargoPct: Number(importacion.recargoPct),
    });

    const aReleer = omitidasPorMotivo(revision, MOTIVO_OMISION.PROPUESTA_DIFERENTE);
    if (aReleer.length === 0) {
      // No es un error: puede que otra pestaña ya las haya releído. Se contesta
      // que no quedó ninguna, con el número, en vez de un 409 que obliga a
      // adivinar si falló algo.
      return NextResponse.json({ ok: true, releidas: 0, quedaronListas: 0, quedaronParaRevisar: 0 });
    }

    const idsAReleer = new Set(aReleer.map((o) => o.filaId));
    const filas = candidatas.filter((f) => idsAReleer.has(f.id));

    // El PRODUCTO con la forma que el motor consume. Se pide aparte de
    // `CAMPOS_PRODUCTO_PARA_REVALIDAR` porque `conciliarFila` mira otros campos
    // —los de `productoParaElMotor`— y pedirle a uno los del otro es cómo se
    // llega a un motor decidiendo sobre `undefined`.
    const paraElMotor = await prisma.productoBase.findMany({
      where: { id: { in: [...new Set(filas.map((f) => f.productoBaseId).filter(Boolean))] }, grupoId },
      select: CAMPOS_PRODUCTO_PARA_EL_MOTOR,
    });
    const motorPorId = new Map(paraElMotor.map((p) => [p.id, productoParaElMotor(p)]));

    // Los vínculos de código de estas filas, para que el motor vuelva a macheer
    // igual que la primera vez. Sin el índice, `conciliarFila` no encontraría el
    // producto y la fila caería en NO_MACHEADO: una fila vinculada volvería a
    // quedar sin producto por haber pedido que se recalculara su precio.
    const vinculos = await prisma.productoCodigoProveedor.findMany({
      where: {
        proveedorId: importacion.proveedorId,
        productoBaseId: { in: [...motorPorId.keys()] },
        activo: true,
      },
      select: { id: true, productoBaseId: true, codigoInterno: true, activo: true },
    });
    const indice = indexarCodigosProveedor(vinculos);
    const indiceBarra = indexarCodigosBarra([]);

    const ahora = new Date();
    let quedaronListas = 0;
    let quedaronParaRevisar = 0;

    await prisma.$transaction(async (tx) => {
      for (const fila of filas) {
        const producto = fila.productoBaseId === null ? null : motorPorId.get(fila.productoBaseId);
        if (!producto) continue;

        const recalculada = conciliarFila({
          // `vinculadoEn: ahora` es lo que hace VENCER la confirmación: el motor
          // la compara contra `confirmadoEn` y una anterior deja de contar. No se
          // borra nada.
          fila: filaParaElMotor(fila, { vinculadoEn: ahora }),
          indice,
          indiceBarra,
          productosPorId: new Map([[producto.productoBaseId, producto]]),
          contexto: {
            grupoId,
            proveedorId: importacion.proveedorId,
            operandoEnLocalId: localId,
            depositoLocalId,
            cabecera: importacion,
          },
          config: {
            ...reg.config,
            recargoPct: Number(importacion.recargoPct ?? 0),
            impuestoAdicionalPct: numeroONull(importacion.impuestoAdicionalPct),
            umbralVariacionPct: numeroONull(importacion.aumentoEsperadoMaxPct),
          },
        });

        const datos = filaAPersistir(recalculada);

        await tx.importacionListaFila.update({
          where: { id: fila.id },
          data: {
            costoAnterior: datos.costoAnterior,
            montoRecargo: datos.montoRecargo,
            precioConRecargo: datos.precioConRecargo,
            factorErp: datos.factorErp,
            costoUnitarioCalculado: datos.costoUnitarioCalculado,
            costoMaestroPropuesto: datos.costoMaestroPropuesto,
            diferencia: datos.diferencia,
            diferenciaPct: datos.diferenciaPct,
            variacionAlta: datos.variacionAlta,
            estado: datos.estado,
            motivo: datos.motivo,
            resultadoInterpretacion: datos.resultadoInterpretacion,
            seleccionable: datos.seleccionable,
            seleccionada: datos.seleccionada,
            // ── LA CONFIRMACIÓN VENCE ──────────────────────────────────
            //
            // `vinculadoEn` pasa a ser posterior a `confirmadoEn`, así que el
            // multiplicador confirmado deja de contar. `confirmadoEn`,
            // `confirmadoPor` y el multiplicador NO se tocan: la autoría de esa
            // decisión es un hecho y sigue estando.
            vinculadoEn: ahora,
            // ── Y LA ACEPTACIÓN DEL FUERA DE RANGO TAMBIÉN ─────────────
            //
            // `laEligioUnaPersona` la compara contra `confirmadoEn`, no contra
            // `vinculadoEn`, así que vencer la confirmación no la alcanza: una
            // aceptación vieja seguiría habilitando a escribir un costo NUEVO
            // fuera de rango que nadie vio. Se limpia, y si el costo de hoy
            // vuelve a caer afuera la pantalla lo va a volver a preguntar.
            fueraDeRangoAceptadaEn: null,
          },
        });

        if (datos.seleccionada === true) quedaronListas++;
        else quedaronParaRevisar++;
      }

      // Los contadores de la cabecera se recalculan con la misma función que usan
      // las demás rutas: dejarlos viejos haría que el listado diga un número y
      // esta pantalla otro.
      await recalcularContadores(tx, importacionId);
    }, OPCIONES_TX);

    return NextResponse.json({
      ok: true,
      releidas: filas.length,
      quedaronListas,
      quedaronParaRevisar,
    });
  } catch (e) {
    console.error("[listas/releer-propuestas] error:", e);
    return NextResponse.json(
      { ok: false, error: "No se pudieron volver a leer esos precios. Probá de nuevo." },
      { status: 500 }
    );
  }
}
