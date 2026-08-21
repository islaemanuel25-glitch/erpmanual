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
// ── EL CONTEO ES DEL CATÁLOGO, NO DE LO QUE HAY FILTRADO ───────────────────
//
// Y eso el issue no lo define, así que queda dicho acá con su consecuencia.
//
// La card cuenta TODOS los productos activos de la ubicación. El listado, cuando
// se toca la card, aplica ese control **encima de los filtros que ya estén
// puestos**. Si no hay ninguno —que es cómo se entra a la pantalla— los dos
// números son el mismo, y eso es lo que la sonda mide. Con una búsqueda escrita o
// un proveedor elegido, el listado trae menos que la card.
//
// Se eligió así porque el panel contesta "cuánto trabajo de mantenimiento tiene
// el catálogo", que es una pregunta sobre el catálogo entero: un número que se
// achicara al escribir en el buscador dejaría de servir para eso.
//
// Y para que la diferencia no se lea como un error, la pantalla muestra SIEMPRE
// el total real del listado en su línea de contexto, al lado del nombre del
// control que está filtrando. Los dos números están a la vista.
//
// La alternativa —que el conteo siga a los filtros— es defendible y es un cambio
// chico: pasarle a esta ruta los mismos parámetros que a `listar`. No se hizo
// porque nadie lo pidió y cambia lo que la card significa.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { filtrosBaseDelCatalogo } from "@/lib/productos/whereCatalogo";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { CONTROLES } from "@/lib/productos/controlesCalidad";
import {
  contarDesdePrisma,
  SELECT_CONTROLES_BASE,
  SELECT_CONTROLES_LOCAL,
} from "@/lib/productos/controlesDesdePrisma";

// Mismo techo que el filtro del listado: los dos clasifican en memoria y tienen
// que cortar en el mismo lugar, o el contador vería más filas que la lista.
const MAX_CONTROL = 5000;

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
      take: MAX_CONTROL + 1,
      select: {
        ...SELECT_CONTROLES_BASE,
        locales: { where: { localId }, take: 1, select: SELECT_CONTROLES_LOCAL },
      },
    });

    const truncado = rows.length > MAX_CONTROL;
    const conteo = contarDesdePrisma(truncado ? rows.slice(0, MAX_CONTROL) : rows);

    return NextResponse.json({
      ok: true,
      // La definición de las cards viaja con los números: la pantalla no tiene
      // que saber cuáles son los controles ni en qué orden van. Agregar un quinto
      // es agregarlo al array del dominio.
      controles: CONTROLES.map((c) => ({ ...c, cantidad: conteo[c.id] ?? 0 })),
      localId,
      truncado,
    });
  } catch (err) {
    console.error("productos/controles", err);
    return NextResponse.json(
      { ok: false, error: `No se pudieron calcular los controles: ${err.message}` },
      { status: 500 }
    );
  }
}
