// app/api/transferencias/listar/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveVistaOperativa } from "@/lib/grupos";
import { inicioDiaArgentina, finDiaArgentina } from "@/lib/fechas/rangoArgentina";
// Agregados del período. Viven en lib/ —puros, sin Prisma— para que la regla que
// importa se pueda probar: TODO agregado se calcula sobre el barrido completo,
// nunca sobre `items`, que es solo la página visible. El mismo módulo lo usa
// /api/transferencias/por-destino, así que las dos pantallas no pueden divergir.
import {
  importeDeDetalle,
  importeDeDetalleCentavos,
  cantidadesDeDetalle,
  desdeCentavos,
  resumenPorEstado,
  productosMasTransferidos,
  recortarPeriodo,
  MAX_TRANSFERENCIAS,
  MAX_PRODUCTOS,
} from "@/lib/transferencias/agregadosPeriodo";
import { origenEsDepositoDe } from "@/lib/transferencias/costoTransferencia";

const PAGE_SIZE = 25;

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, items: [], total: 0, totalPages: 1, error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "transferencias.ver");
    if (!perm.ok) {
      return NextResponse.json(
        { ok: false, items: [], total: 0, totalPages: 1, error: perm.error },
        { status: perm.status }
      );
    }

    // Vista operativa por UBICACIÓN (antes: sin localId no filtraba → veía TODOS
    // los grupos). No-admin → su local; admin → contexto (local o global explícito
    // del grupo activo); admin sin contexto → 409.
    const vista = await resolveVistaOperativa(req);
    if (vista.error) {
      return NextResponse.json(
        { ok: false, items: [], total: 0, totalPages: 1, error: vista.error, needsContexto: vista.needsContexto },
        { status: vista.status }
      );
    }

    const { searchParams } = new URL(req.url);

    const page = Math.max(Number(searchParams.get("page") || 1), 1);
    const estado = searchParams.get("estado") || "";
    const fechaDesde = searchParams.get("fechaDesde") || "";
    const fechaHasta = searchParams.get("fechaHasta") || "";

    const where = {};

    if (estado) where.estado = estado;

    // La UI manda días calendario (YYYY-MM-DD) tal como los ve el usuario. Hay
    // que convertirlos a límites de día ARGENTINO, no del proceso: el contenedor
    // corre en UTC, así que `new Date(fechaHasta + "T23:59:59")` cortaba a las
    // 20:59:59 hora argentina y escondía todo lo enviado entre las 21:00 y la
    // medianoche —una transferencia de las 22:19 del 30/07 caía en el 31/07 UTC
    // y no aparecía filtrando por el 30/07—.
    const desde = inicioDiaArgentina(fechaDesde);
    const hasta = finDiaArgentina(fechaHasta);
    if (desde || hasta) {
      where.fechaEnvio = {};
      if (desde) where.fechaEnvio.gte = desde;
      if (hasta) where.fechaEnvio.lte = hasta;
    }

    // Filtro por PARTICIPACIÓN (origen o destino), acotado a la vista.
    if (vista.modo === "GLOBAL") {
      where.OR = [
        { origenId: { in: vista.localIds } },
        { destinoId: { in: vista.localIds } },
      ];
    } else {
      where.OR = [{ origenId: vista.localId }, { destinoId: vista.localId }];
    }

    // Selección mínima para valorizar un remito. Se usa dos veces: en la página
    // visible y en el agregado del período, así las dos suman exactamente lo
    // mismo con las mismas reglas.
    const selectValorizacion = {
      cantidad: true,
      recibido: true,
      precioCosto: true,
      unidadEnviada: true,
      // `productoId` y los dos nombres alimentan "Productos más transferidos".
      // El join a producto→base YA existía para valorizar (precio_costo,
      // unidad_medida, factor_pack): pedir `nombre` no agrega una consulta, solo
      // dos columnas al mismo SELECT. Sin esto habría que resolver los nombres
      // aparte, una vez por producto, que es exactamente el N+1 a evitar.
      productoId: true,
      producto: {
        select: {
          precio_costo: true,
          nombre: true,
          base: {
            select: {
              precio_costo: true,
              unidad_medida: true,
              factor_pack: true,
              nombre: true,
              // ── LOS CUATRO DEL FIAMBRE DE PIEZA FIJA ────────────────────
              //
              // Faltaban, y por eso la #97 seguía mostrando 144.086,40 acá
              // después del arreglo que se desplegó para eso. El origen se
              // pasaba bien y la fórmula estaba bien: lo que llegaba a medias
              // era el PRODUCTO. `esProductoFiambre` mira `unidad_medida`,
              // `modoCompraProveedor` y `pesoReferenciaKg`, y `esFiambreFijo`
              // mira además `modoVentaDeposito`. Sin ellos el predicado
              // contesta "no es fiambre" y la conversión no ocurre.
              //
              // No agregan una consulta: son cuatro columnas del mismo SELECT
              // que ya hace el join a `base`.
              pesoEsFijo: true,
              pesoReferenciaKg: true,
              modoVentaDeposito: true,
              modoCompraProveedor: true,
            },
          },
        },
      },
    };

    // ======================================
    // CONSULTA PRINCIPAL CORREGIDA
    // ======================================
    const [total, registros, porEstado, conDiferencias, valorizacionPeriodo] = await Promise.all([
      prisma.transferencia.count({ where }),

      prisma.transferencia.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          origen: { select: { id: true, nombre: true, es_deposito: true } },
          destino: { select: { id: true, nombre: true } },

          detalle: { select: selectValorizacion },
        },
      }),

      // Métricas del PERÍODO completo, no de la página. Con PAGE_SIZE 25 y un
      // filtro que devuelve más, contar sobre `registros` daría cifras que no
      // cierran contra el total que se muestra al lado.
      prisma.transferencia.groupBy({
        by: ["estado"],
        where,
        _count: { _all: true },
      }),

      prisma.transferencia.count({ where: { ...where, tieneDiferencias: true } }),

      // BARRIDO DEL PERÍODO. Mismo `where` que el listado, SIN skip/take: de acá
      // salen el importe total, el desglose por estado y los productos más
      // transferidos. Es una sola consulta para los tres bloques.
      //
      // `estado` y `tieneDiferencias` se agregaron al select porque el desglose
      // los necesita por transferencia; antes alcanzaba con el detalle porque el
      // único agregado era el importe.
      //
      // Techo defensivo: si el rango supera MAX_TRANSFERENCIAS se corta y se
      // avisa con `truncado`. Preferimos un reporte explícitamente parcial antes
      // que una consulta que tumbe el proceso — pero nunca en silencio.
      //
      // Se piden MAX + 1 a propósito. Con `take: MAX` no hay forma de saber si
      // el período tenía exactamente MAX o más: en los dos casos vuelven MAX
      // filas, y un período de exactamente 5000 se marcaría como truncado sin
      // faltarle nada. La fila extra es la que responde esa pregunta; después se
      // descarta y los agregados se calculan sobre las primeras MAX.
      prisma.transferencia.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: MAX_TRANSFERENCIAS + 1,
        select: {
          estado: true,
          tieneDiferencias: true,
          // EL ORIGEN, que faltaba entero. De este barrido salen los TRES
          // agregados del período —el importe total, el desglose por estado y
          // los productos más transferidos— y ninguno podía valorizar el
          // fiambre de pieza fija porque `t.origen` llegaba `undefined`.
          //
          // No se veía porque el `=== true` de los llamadores lo convertía en
          // `false` sin quejarse. Ahora eso lo hace `origenEsDepositoDe`, que
          // lanza; este select es lo que hace que no tenga que lanzar.
          origen: { select: { es_deposito: true } },
          detalle: { select: selectValorizacion },
        },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    // Autor del remito. `Transferencia.creadaPor` guarda el id del usuario, no su
    // nombre: sin esta resolución la tabla solo podría mostrar un número. Una
    // sola consulta por página (como máximo 25 ids distintos).
    const idsCreadores = [...new Set(registros.map((t) => t.creadaPor).filter((v) => v != null))];
    const creadores = idsCreadores.length
      ? await prisma.usuario.findMany({
          where: { id: { in: idsCreadores } },
          select: { id: true, nombre: true },
        })
      : [];
    const nombrePorCreador = new Map(creadores.map((u) => [u.id, u.nombre]));

    // ======================================
    // CÁLCULO EXACTO DEL DETALLE (COPIADO)
    // ======================================
    const items = registros.map((t) => {
      // Cantidades AGREGADAS del remito, en milésimas enteras.
      //
      // `recibidaM` arranca en null y solo deja de serlo si ALGÚN detalle tiene
      // recepción cargada. Esa distinción es la que la pantalla necesita:
      //   null → todavía nadie registró recepción  → se muestra "—"
      //   0    → se registró que no llegó nada     → se muestra "0"
      // Colapsar el null a 0 haría que una transferencia recién enviada se vea
      // igual que una que llegó vacía.
      //
      // Nota deliberada: se suman las cantidades tal como están en el remito
      // (cada detalle en la unidad de su `unidadEnviada`), igual que hace
      // `resumen.itemsEnviados` en /api/transferencias/detalle. Es un total de
      // documento, no de unidades físicas: un remito con bultos y unidades suma
      // ambos. Convertir a unidades físicas cambiaría el número que el detalle
      // ya viene mostrando.
      const { cantidadEnviada, cantidadRecibida } = cantidadesDeDetalle(t.detalle);

      return {
        id: t.id,
        origenNombre: t.origen?.nombre,
        origenEsDeposito: t.origen?.es_deposito,
        destinoNombre: t.destino?.nombre,
        estado: t.estado,
        cantidadItems: t.detalle.length,
        createdAt: t.createdAt,
        fechaEnvio: t.fechaEnvio,
        fechaRecepcion: t.fechaRecepcion,
        // Faltaba en la serialización aunque la fila ya lo traía: la pantalla lo
        // leía como `undefined` y mostraba "Correcta" en TODA transferencia
        // recibida, incluidas las que tenían faltantes.
        tieneDiferencias: t.tieneDiferencias === true,
        cantidadEnviada,
        cantidadRecibida,
        // ÉSTE es el importe que se ve en cada fila de la lista, y era el que
        // faltaba: mostraba la #97 en 144.086,40 mientras su detalle decía
        // 155.486,40. El total de arriba ya pasaba el origen, así que la lista
        // ni siquiera cerraba consigo misma.
        totalCosto: importeDeDetalle(t.detalle, {
          origenEsDeposito: origenEsDepositoDe(t, "listar/fila"),
        }),
        // Autor del remito, para el subtítulo de la columna "Transferencia".
        creadaPorNombre: nombrePorCreador.get(t.creadaPor) || null,
      };
    });

    // ======================================
    // AGREGADOS DEL PERÍODO
    //
    // Los tres salen de `valorizacionPeriodo` —el barrido sin paginar—, nunca de
    // `items`, que trae 25 filas. Calcularlos sobre `items` haría que el
    // desglose cambiara al pasar de página.
    // ======================================
    // Decide truncamiento y descarta la fila sonda. La comparación es
    // estrictamente MAYOR: recibir MAX de MAX + 1 pedidas significa que el
    // período entra completo.
    const { truncado, periodo } = recortarPeriodo(valorizacionPeriodo, MAX_TRANSFERENCIAS);

    // Importe de TODO el período filtrado. Antes esta clave sumaba solo la
    // página visible pese a llamarse "global": con más de 25 resultados el
    // importe cambiaba al pasar de página.
    const totalCostoGlobal = desdeCentavos(
      periodo.reduce(
        (acc, t) =>
          acc +
          // El origen decide cómo se valoriza el fiambre de pieza fija: en el
          // depósito la cantidad está en piezas y su costo, por kilo.
          importeDeDetalleCentavos(t.detalle, {
            origenEsDeposito: origenEsDepositoDe(t, "listar/totalDelPeriodo"),
          }),
        0
      )
    );

    const desgloseEstado = resumenPorEstado(periodo);
    const productos = productosMasTransferidos(periodo, MAX_PRODUCTOS);

    const cuentaEstado = (nombre) =>
      porEstado.find((g) => g.estado === nombre)?._count?._all || 0;

    return NextResponse.json({
      ok: true,
      items,
      total,
      totalPages,
      totalCostoGlobal,
      // Métricas del período completo (mismo `where` que el listado), para la
      // franja superior de la pantalla.
      resumen: {
        total,
        enviadas: cuentaEstado("Enviada"),
        recibidas: cuentaEstado("Recibida"),
        conDiferencias,
        importeTotal: totalCostoGlobal,
      },
      // Una fila por estado realmente presente. `conDiferencias` viaja DENTRO de
      // la fila (solo es informativo en "Recibida"): no es un estado ni una fila
      // aparte, así la columna de transferencias sigue sumando `total`.
      resumenPorEstado: desgloseEstado,
      // Agrupado por producto real de TODO el período, ordenado por importe.
      productosMasTransferidos: productos,
      // El barrido llegó al techo: el reporte es parcial y la UI tiene que
      // decirlo. Nunca truncar en silencio.
      truncado,
      error: null,
    });

  } catch (err) {
    console.error("Error listando transferencias:", err);
    return NextResponse.json(
      {
        ok: false,
        items: [],
        total: 0,
        totalPages: 1,
        error: err.message,
      },
      { status: 500 }
    );
  }
}
