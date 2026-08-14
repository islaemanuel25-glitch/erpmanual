import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { proveedorVisibleWhere } from "@/lib/visibilidad";
import { errorInesperado } from "@/lib/compras-proveedor/comprobante/errorDeRuta";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    // Lectura de proveedor: se usa tanto en Proveedores como en flujos de Compras.
    // Aceptar cualquiera de los dos permisos para no romper roles operativos.
    const permProv = checkPerm(session, "proveedores.ver");
    const permCompras = checkPerm(session, "compras.ver");
    if (!permProv.ok && !permCompras.ok) {
      return NextResponse.json({ ok: false, error: permProv.error }, { status: permProv.status });
    }

    // ── EL MISMO RESOLUTOR QUE EL LISTADO, Y NO OTRO ────────────────────────
    //
    // Acá decía `resolveGrupo`, que devuelve el GRUPO y puede dejar el `localId`
    // sin resolver. El listado usa `resolveLocalAndGrupo`, que además resuelve el
    // contexto operativo activo. Con dos resolutores distintos, el listado y la
    // ficha contestaban cosas distintas sobre el mismo proveedor: medido, el
    // listado devolvía a "Als" y la ficha del mismo proveedor daba 404.
    //
    // La entrada a esta ruta es una fila del listado, así que **tienen que
    // acotar igual**. Es la misma razón por la que el `where` reusa
    // `proveedorVisibleWhere`: si dos lugares deciden lo mismo, deciden con el
    // mismo código.
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }

    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id") || 0);

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    // ── EL ALCANCE SALE DEL PREDICADO CANÓNICO, NO DE UNA CONDICIÓN PROPIA ───
    //
    // Acá decía `grupoId: scope.grupoId`, y **`Proveedor` no tiene `grupoId`** —
    // el schema lo dice al lado del modelo: es compartido entre grupos y son las
    // tablas que cuelgan de él las que llevan el suyo. Prisma rechazaba el
    // argumento, la ruta contestaba 500 y el modal de editar no abría NUNCA.
    // Desde el 2026-07-26, en producción. Está en `docs/incidents/INC-0006`.
    //
    // La regla de negocio es que **cada local tiene sus propios proveedores**, y
    // eso ya está escrito en `proveedorVisibleWhere`, que es lo que usan
    // `listar`, `catalogos/proveedores`, `pedidos/opciones` y la importación de
    // listas. Se reusa esa y no se escribe una parecida al lado: dos condiciones
    // que deciden lo mismo no se rompen el día que se escriben, se rompen el día
    // que alguien cambia una.
    //
    // Y hay una consecuencia buena de reusarla: esta ruta pasa a coincidir con
    // el LISTADO, que ya la usaba. Antes podían discrepar sin que nada avisara.
    const item = await prisma.proveedor.findFirst({
      where: { id, ...proveedorVisibleWhere(scope.localId, scope.grupoId) },
      select: {
        id: true,
        nombre: true,
        cuit: true,
        telefono: true,
        email: true,
        direccion: true,
        dias_pedido: true,   // 🔥 EL CAMPO QUE FALTABA
        activo: true,
      },
    });

    if (!item) {
      return NextResponse.json(
        { ok: false, error: "Proveedor no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, item });

  } catch (e) {
    console.error("GET proveedor:", e);
    // "Error interno" es lo único que se vio durante diecinueve días, y no dice
    // qué se estaba haciendo ni qué pasó con los datos de quien mira. Se reusa el
    // armador que ya existe —nació del mismo defecto en comprobantes— en vez de
    // escribir otro texto a mano.
    return NextResponse.json(
      {
        ok: false,
        error: errorInesperado({
          operacion: "abrir la ficha del proveedor",
          quedo: "No se modificó ningún dato del proveedor.",
        }),
      },
      { status: 500 }
    );
  }
}
