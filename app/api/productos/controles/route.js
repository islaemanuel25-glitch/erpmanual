// app/api/productos/controles/route.js
//
// LOS CONTADORES DE "PARA REVISAR". Devuelve cuántos productos marca cada control
// en la ubicación activa.
//
// ── EL MISMO SCOPE QUE PRODUCTOS, Y NO UNO PARECIDO ────────────────────────
//
// `resolveScope` y `productoVisibleWhere` son exactamente los que usa
// `/api/productos/listar`. Si acá se armara un scope propio, el contador miraría
// un universo distinto del listado y el número de la card no coincidiría con el
// total de la lista que abre — que es justamente lo que hay que evitar.
//
// ── SOLO ACTIVOS ───────────────────────────────────────────────────────────
//
// Son controles de MANTENIMIENTO: sirven para arreglar lo que se vende hoy. Un
// producto dado de baja con el precio viejo no es una tarea pendiente, y contarlo
// inflaría las cards con trabajo que nadie va a hacer.
//
// ── EL CONTEO ES DEL CATÁLOGO, Y EL LISTADO FILTRADO TAMBIÉN ───────────────
//
// La card cuenta TODOS los productos activos de la ubicación, y el criterio
// aprobado del issue #2 es que el total del listado que esa card abre sea el
// MISMO número. No "parecido" ni "explicado al lado": el mismo.
//
// Quien lo sostiene es la pantalla, con un invariante: **mientras un control está
// activo, los filtros están en su valor por defecto**. Vale por los tres caminos
// —tocar la card, tocar un filtro después, y entrar por una URL que traiga los
// dos—, y está en `lib/productos/filtrosCatalogo.js` con sus candados.
//
// ── ESTE COMENTARIO DECÍA LO CONTRARIO, Y POR ESO SE REESCRIBE ────────────
//
// Describía la primera implementación: que el listado conservaba los filtros y
// podía traer menos que la card, y que la pantalla mostraba los dos números para
// que la diferencia se leyera. Eso se corrigió en `ff5076cc` y el comentario
// quedó atrás.
//
// No es un detalle de prolijidad: un comentario viejo al lado de código nuevo es
// peor que no tener comentario, porque el que lo lea va a creer que el
// comportamiento es el que está escrito y va a buscar el defecto en otro lado.
// En este repo ya pasó con una defensa que estaba escrita y era inalcanzable.
//
// Lo que NO cambió: esta ruta no recibe los filtros del listado y no tiene que
// recibirlos. El panel contesta "cuánto trabajo de mantenimiento tiene el
// catálogo", que es una pregunta sobre el catálogo entero.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { filtrosBaseDelCatalogo } from "@/lib/productos/whereCatalogo";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { CONTROLES } from "@/lib/productos/controlesCalidad";
import {
  contarDesdePrisma,
  dentroDelTecho,
  opcionesDelTecho,
  seTrunco,
  SELECT_CONTROLES_BASE,
  SELECT_CONTROLES_LOCAL,
  TECHO_CONTROL,
} from "@/lib/productos/controlesDesdePrisma";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    const perm = checkPerm(session, "productos.ver");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const { searchParams } = new URL(req.url);
    const qLocal = Number(searchParams.get("localId") || 0) || null;
    const scope = await resolveScope(req, { explicitLocalId: qLocal });
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, ...(scope.needsContexto ? { needsContexto: true } : {}) },
        { status: scope.status }
      );
    }
    const { localId, grupoId } = scope;

    const where = {
      AND: [
        // ── EL MISMO UNIVERSO QUE EL LISTADO, DE LA MISMA FUNCIÓN ──────────
        //
        // Grupo, visibilidad depósito/local y la regla de combos. Acá estaban
        // escritas a mano y le faltaba la de combos: un combo de otro local se
        // habría contado sin aparecer nunca en la lista que la card abre.
        //
        // No se vio en la primera corrida porque en desarrollo no hay ningún
        // combo —la sonda lo informa como "NO EJERCIDO"—, que es exactamente
        // cómo un caso que no ocurre en la base de prueba pasa en verde.
        ...filtrosBaseDelCatalogo({ grupoId, localId }),
        // ── SOLO ACTIVOS, Y ESO SÍ ES DECISIÓN DE ACÁ ─────────────────────
        //
        // El listado deja elegir activos/inactivos/todos; el contador fija
        // activos. Por eso este filtro no está en la función compartida: no es
        // parte del universo, es qué se pregunta sobre él.
        //
        // Y un combo lleva su estado en el ProductoLocal, no en la ficha — la
        // misma rama que usa el listado.
        {
          OR: [
            { es_combo: false, activo: true },
            { es_combo: true, locales: { some: { localId, activo: true } } },
          ],
        },
      ],
    };

    const rows = await prisma.productoBase.findMany({
      where,
      // El techo Y el orden salen de la misma función que usa el filtro del
      // listado. Sin `orderBy`, con más de 5.000 productos las dos consultas
      // podían cortar por lugares distintos y las cards quedarían informando un
      // límite inferior de otra muestra que la del listado.
      ...opcionesDelTecho(),
      select: {
        ...SELECT_CONTROLES_BASE,
        locales: { where: { localId }, take: 1, select: SELECT_CONTROLES_LOCAL },
      },
    });

    const truncado = seTrunco(rows);
    const conteo = contarDesdePrisma(dentroDelTecho(rows));

    return NextResponse.json({
      ok: true,
      // La definición de las cards viaja con los números: la pantalla no tiene
      // que saber cuáles son los controles ni en qué orden van. Agregar un quinto
      // es agregarlo al array del dominio.
      controles: CONTROLES.map((c) => ({ ...c, cantidad: conteo[c.id] ?? 0 })),
      localId,
      truncado,
      // El techo viaja con el flag. Sin él la pantalla tendría que escribir 5.000
      // a mano para poder decir sobre cuántos se contó, y ese número quedaría
      // definido en dos lugares.
      techo: TECHO_CONTROL,
    });
  } catch (err) {
    console.error("productos/controles", err);
    return NextResponse.json(
      { ok: false, error: `No se pudieron calcular los controles: ${err.message}` },
      { status: 500 }
    );
  }
}
