// GET /api/proveedores/listas/proveedores
//
// Los proveedores del alcance activo, con el único dato extra que esta pantalla
// necesita: si tienen configurado el formato de su lista de precios.
//
// ── POR QUÉ NO SE REUTILIZA /api/proveedores/listar ─────────────────────────
//
// Ese endpoint existe y hace bien lo suyo, pero no devuelve `parserListaId` y lo
// usan varias pantallas. Agregárselo obligaría a tocar un endpoint compartido
// para una necesidad de una sola pantalla. Este es mínimo —tres campos, sin
// paginación, sin filtros, solo lectura— y no amplía nada: no crea, no edita y
// no borra.
//
// El alcance sale de `proveedorVisibleWhere`, la misma regla canónica que usa la
// importación. Que las dos usen el mismo predicado es lo que evita que la
// pantalla ofrezca un proveedor que después el endpoint rechaza con 404.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";
import { proveedorVisibleWhere } from "@/lib/visibilidad";
import { listarParsers, resolverParserDeProveedor } from "@/lib/proveedores/listas/registro";
import {
  configuracionDeProveedor,
  faltantesDeConfiguracion,
} from "@/lib/proveedores/listas/configuracionProveedor";

export async function GET(req) {
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

    // ── DÓNDE ESTÁ PARADO, PARA PODER EXPLICAR UNA LISTA VACÍA ───────────
    //
    // `proveedorVisibleWhere` muestra los proveedores cuyos productos se
    // crearon en la ubicación activa, y los productos se crean en el depósito.
    // Desde un local la respuesta es correcta y es VACÍA, y una lista vacía sin
    // explicación se lee como "no hay ninguno" o, peor, como que la pantalla
    // está rota. Con este dato la pantalla puede decir la única frase que sirve:
    // que hay que cambiar a un depósito.
    const ubicacion = localId
      ? await prisma.local.findFirst({ where: { id: localId }, select: { id: true, nombre: true, es_deposito: true } })
      : null;

    const items = await prisma.proveedor.findMany({
      where: { activo: true, ...proveedorVisibleWhere(localId, grupoId) },
      orderBy: { nombre: "asc" },
      select: {
        id: true, nombre: true, parserListaId: true,
        // La configuración comercial viaja con el proveedor y no en una llamada
        // aparte: la pantalla la necesita en el mismo momento en que se elige el
        // proveedor —para precargar el formulario— y pedirla después dejaría los
        // campos vacíos un instante, que en un teléfono se lee como "no hay
        // nada configurado".
        listaAumentoEsperadoMinPct: true, listaAumentoEsperadoMaxPct: true,
        listaRecargoPct: true, listaImpuestoAdicionalPct: true, listaImpuestosDefinidos: true,
      },
    });

    return NextResponse.json({
      ok: true,
      ubicacion: ubicacion
        ? { id: ubicacion.id, nombre: ubicacion.nombre, esDeposito: ubicacion.es_deposito === true }
        : null,
      // Se devuelven TODOS los visibles, incluidos los que no admiten
      // importación. Esconderlos dejaría al usuario buscando un proveedor que
      // está ahí; mostrarlos con el motivo le dice qué le falta configurar.
      items: items.map((p) => {
        const config = configuracionDeProveedor(p);
        return {
          id: p.id,
          nombre: p.nombre,
          parserListaId: p.parserListaId,
          // Todos admiten: el que no tiene formato propio va al lector genérico.
          admiteImportacion: true,
          // Qué archivos acepta ESTE proveedor, que depende de su lector. El de
          // Arcor solo .xlsx; el genérico también PDF, .xls y .csv. La pantalla
          // lo usa para el `accept` del selector de archivo y para avisar antes
          // de subir 10 MB que no van a servir.
          extensiones: resolverParserDeProveedor(p).extensiones ?? [],
          configuracion: config,
          // Qué le falta para poder importar. Se manda calculado y no se deja que
          // lo deduzca la pantalla: la regla de qué está completo es la misma que
          // usa `importar` para rechazar, y dos copias de esa regla terminan
          // ofreciendo un botón que el servidor después no acepta.
          faltaConfigurar: faltantesDeConfiguracion(config),
        };
      }),
      // Los formatos disponibles, por si la pantalla quiere explicar cuáles hay.
      parsers: listarParsers(),
    });
  } catch (error) {
    // "Error interno" no le dice a nadie qué pasó, y en esta pantalla era peor
    // que mudo: el selector quedaba sin opciones y mostraba "Sin resultados",
    // que es la respuesta de una búsqueda que anduvo bien. Un 500 se veía igual
    // que un proveedor que no existe.
    console.error("Error listando proveedores para listas:", error);
    return NextResponse.json(
      { ok: false, error: "No se pudo leer la lista de proveedores. Probá de nuevo." },
      { status: 500 }
    );
  }
}
