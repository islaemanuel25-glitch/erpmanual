import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkPerm, PERMISOS_LEER_CLIENTES } from "@/lib/authorize";
import { resolveGrupo } from "@/lib/grupos";

export async function GET(req) {
  try {
    // localId opcional: permite buscar por grupoId solo (admin sin local)
    const scope = await resolveGrupo(req, false);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    // La agenda de clientes NO es pública: hasta acá alcanzaba con estar
    // autenticado y cualquier usuario veía los clientes del grupo entero.
    // Alcanza con UNO de los dos permisos, porque son dos caminos legítimos.
    const permiso = checkPerm(scope.session, PERMISOS_LEER_CLIENTES);
    if (!permiso.ok) {
      return NextResponse.json({ ok: false, error: permiso.error }, { status: permiso.status });
    }

    const { grupoId, localId } = scope;

    const q = req.nextUrl.searchParams.get("q");

    if (!q || q.length < 2) {
      return NextResponse.json({ ok: true, items: [] });
    }

    // Construir where: siempre por grupoId, localId opcional
    const where = {
      grupoId,
      activo: true,
      OR: [
        { nombre: { contains: q, mode: "insensitive" } },
        { documento: { contains: q } },
        { telefono: { contains: q } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    };

    // Si hay localId, filtrar por localId también (scope más específico)
    if (localId) {
      where.localId = localId;
    }

    const clientes = await prisma.cliente.findMany({
      where,
      take: 20,
      orderBy: { nombre: "asc" },
      include: {
        listaPrecio: {
          select: {
            id: true,
            nombre: true,
            esDefault: true,
            activo: true,
            tipoBase: true,
            margenPorcentaje: true,
            redondeo_100: true,
          },
        },
        // Local interno que el cliente representa (Cliente.localVinculadoId, que ya
        // viaja como escalar del modelo). Alimenta el aviso "Venta interna" del POS,
        // que necesita el NOMBRE para no mostrar un id pelado.
        //
        // Solo id, nombre y activo: la UI no necesita —ni debe recibir— dirección,
        // teléfono ni el resto de la ficha del local. `activo` viene porque un
        // vínculo histórico con un local dado de baja hace que el backend rechace la
        // venta, y conviene avisarlo antes de cobrar.
        //
        // Es aditivo: null en todo cliente externo.
        localVinculado: {
          select: { id: true, nombre: true, activo: true },
        },
      },
    });

    return NextResponse.json({ ok: true, items: clientes });
  } catch (error) {
    console.error("Error buscando clientes:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
