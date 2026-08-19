// app/api/me/route.js
import { NextResponse } from "next/server";
import { getTokenFromRequest, verificarToken } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { operarioObligatorio } from "@/lib/config/acceso";
import { getContextoActivo } from "@/lib/contexto";
import { normalizarPermisos, esAdminPorPermisos } from "@/lib/rbac/permisosSesion";

export async function GET(req) {
  try {
    const token = getTokenFromRequest(req);

    if (!token) {
      return NextResponse.json({ ok: false, user: null });
    }

    const payload = verificarToken(token);
    if (!payload) {
      return NextResponse.json({ ok: false, user: null });
    }

    // -------------------------------------------
    // Normalización de permisos
    // -------------------------------------------
    // FAIL-CLOSED, igual que login y que getUsuarioSession. Esto devolvía
    // ["*"] ante un payload con permisos corruptos: el backend rechazaba igual
    // cada operación, pero el frontend arma menú y botones con esta respuesta y
    // le mostraba la aplicación entera a quien no debía verla.
    const permisos = normalizarPermisos(payload.permisos);
    const esAdmin = esAdminPorPermisos(permisos);

    // -------------------------------------------
    // Saber si es depósito (solo si tiene localId)
    // -------------------------------------------
    let esDeposito = false;

    // 🔵 ESTA ES LA CORRECCIÓN IMPORTANTE:
    const localId =
      payload.localId !== undefined &&
      payload.localId !== null &&
      payload.localId !== ""
        ? Number(payload.localId)
        : null;

    // Operario obligatorio EFECTIVO del local de la sesión (per-local; null=true).
    // El frontend lo usa para no forzar el flujo de operario cuando el local lo
    // desactivó (ver perfilExentoDeOperador). El backend revalida en cada operación.
    let exigirOperador = true;

    // ── LA TARJETA DE PRODUCTO, CONFIGURADA POR LOCAL ──────────────────────
    //
    // Viajan por acá y no por el layout raíz a propósito: el tema tiene que
    // llegar ANTES del primer pintado para que no haya un parpadeo, y por eso
    // vive en el arranque de la aplicación. Esto no — se ve al recargar, y meter
    // una consulta más en el camino por el que pasan TODAS las páginas se paga
    // en cada request de cada pantalla.
    //
    // `/api/me` ya es el camino probado para una preferencia del local que llega
    // al cliente: es por donde viaja `exigirOperador`. Y esta consulta ya existía
    // acá: solo se le agregan dos columnas al `select`, sin ida y vuelta nueva.
    //
    // Se pasan TAL CUAL, sin convertir el null: quien las lea decide.
    let tarjetaPrecioUnitario = null;
    let tarjetaOcultarEquivalencia = null;

    // ── CUÁL ES "MI LOCAL" PARA LA TARJETA: EL ACTIVO, NO EL DEL JWT ───────
    //
    // `payload.localId` viene vacío para un admin sin local fijo, que es
    // justamente quien recorre las ubicaciones. Con el JWT solo, las dos
    // preferencias le llegaban siempre en null y el catálogo no cambiaba nunca
    // por más que las prendiera — medido: el PUT contestaba 200, la columna
    // quedaba escrita, y `/api/me` seguía diciendo null.
    //
    // La causa es que había DOS maneras de decidir cuál es el local: la ruta
    // que guarda usa `resolveLocalAndGrupo`, que cae al contexto activo, y acá
    // se leía el payload a mano. Se reusa la que ya decide —`getContextoActivo`,
    // que es la misma que hay abajo de aquella— en vez de escribir una tercera.
    //
    // Lo que NO se toca: `localId`, `esDeposito` y `exigirOperador` siguen
    // saliendo del JWT como hasta hoy. Los tres alimentan el POS y el control de
    // acceso, y moverlos es otra tanda con su propia verificación.
    // `getContextoActivo` ya valida lo que saca de la cookie —positivo, numérico,
    // y `global` no cuenta como ubicación—, así que acá no se vuelve a validar:
    // o trae un `localId` bueno o no trae ninguno.
    const contexto = getContextoActivo(req, { localId });
    const localDeLaTarjeta = localId !== null ? localId : (contexto?.localId ?? null);

    if (localId !== null) {
      const [loc, cl] = await Promise.all([
        prisma.local.findUnique({
          where: { id: localId },
          select: { es_deposito: true },
        }),
        prisma.configuracionLocal.findUnique({
          where: { localId },
          select: {
            exigirOperador: true,
            tarjetaPrecioUnitario: true,
            tarjetaOcultarEquivalencia: true,
          },
        }),
      ]);
      if (loc) esDeposito = loc.es_deposito === true;
      exigirOperador = operarioObligatorio(cl?.exigirOperador);
      tarjetaPrecioUnitario = cl?.tarjetaPrecioUnitario ?? null;
      tarjetaOcultarEquivalencia = cl?.tarjetaOcultarEquivalencia ?? null;
    } else if (localDeLaTarjeta !== null) {
      // Solo para el admin parado en una ubicación. Una consulta más, y nada
      // más que las dos columnas: `esDeposito` y `exigirOperador` se quedan
      // como estaban a propósito.
      const cl = await prisma.configuracionLocal.findUnique({
        where: { localId: localDeLaTarjeta },
        select: {
          tarjetaPrecioUnitario: true,
          tarjetaOcultarEquivalencia: true,
        },
      });
      tarjetaPrecioUnitario = cl?.tarjetaPrecioUnitario ?? null;
      tarjetaOcultarEquivalencia = cl?.tarjetaOcultarEquivalencia ?? null;
    }

    // -------------------------------------------
    // Usuario final normalizado
    // -------------------------------------------
    const user = {
      id: Number(payload.id),
      nombre: payload.nombre ?? "",
      email: payload.email ?? "",
      rolId: payload.rolId ?? null,
      rolNombre: payload.rolNombre ?? "",
      permisos,
      esAdmin,
      // Flag para el frontend (perfilExentoDeOperador). JWT viejos → false.
      esDuenoLocal: payload.esDuenoLocal === true,

      // 🔵 localId ahora es CORRECTO SIEMPRE
      localId,

      esDeposito,
      // Operario obligatorio efectivo del local de la sesión (null=true).
      exigirOperador,

      // Preferencias de la tarjeta de producto, del LOCAL. `null` = nunca las
      // tocaron = apagadas = lo que se ve hoy.
      tarjetaPrecioUnitario,
      tarjetaOcultarEquivalencia,
    };

    return NextResponse.json({
      ok: true,
      user,
    });

  } catch (err) {
    return NextResponse.json({
      ok: false,
      user: null,
      error: err.message,
    });
  }
}
