// GET /api/proveedores/listas/[id]/actualizan
//
// LOS PRODUCTOS QUE SE VAN A ACTUALIZAR, para la pantalla "Ver los N".
//
// ── POR QUÉ NO SE REUSA `catalogo` ─────────────────────────────────────────
//
// Aquél alimentaba la tabla de la pantalla vieja: devuelve todas las filas de la
// importación con sus veinte columnas técnicas —tipo de coincidencia, dígitos de
// sufijo, motivo, factor, banderas— porque la tabla las mostraba. Esta pantalla
// muestra cuatro cosas por producto y las 954 filas no entran en un teléfono.
//
// Acá se devuelve SOLO lo que se dibuja, solo de las filas que se van a
// actualizar, de a veinte, y con el buscador resuelto EN LA BASE: filtrar en el
// navegador buscaría dentro de las veinte que se trajeron, así que escribir el
// nombre de un producto que está más abajo no daría nada y parecería que no
// está.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";
import { ESTADO_LINEA } from "@/lib/proveedores/listas/estados";
import { motivoDeRevision } from "@/lib/proveedores/listas/resultadoDeLaLista";
import { costoParaMirar } from "@/lib/proveedores/listas/costoSospechoso";
import { esImportacionAbierta } from "@/lib/proveedores/listas/persistencia";
// EL GRUPO DE CONTROL DE UNA FILA. Es la misma función que usa `contarControl`
// para el número de la tarjeta que trae hasta acá.
import { CONTROL, compararConLaLista } from "@/lib/proveedores/listas/modoDeLaLista";

const numero = (v) => (v === null || v === undefined ? null : Number(v));
const PAGINA = 20;

export async function GET(req, context) {
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
    const { grupoId } = scope;

    const { id: idCrudo } = await context.params;
    const id = Number(idCrudo);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ ok: false, error: "Id inválido." }, { status: 400 });
    }

    const cab = await prisma.importacionListaProveedor.findFirst({
      where: { id, grupoId },
      select: {
        id: true,
        estado: true,
        aumentoEsperadoMinPct: true,
        aumentoEsperadoMaxPct: true,
        proveedor: { select: { id: true, nombre: true } },
      },
    });
    if (!cab) {
      return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
    }

    const url = new URL(req.url);
    const buscar = String(url.searchParams.get("buscar") ?? "").trim();
    const hasta = Math.max(PAGINA, Number(url.searchParams.get("hasta")) || PAGINA);

    // ── EL MISMO LISTADO, CON OTRO FILTRO ────────────────────────────────
    //
    // Esta pantalla dibuja, por producto, el costo de hoy, lo que dice la lista
    // y la diferencia — que es EXACTAMENTE lo que hay que mostrar de un grupo
    // del control. Lo único distinto es qué filas entran.
    //
    // Por eso se parametriza en vez de escribir una pantalla parecida al lado:
    // dos listados que muestran lo mismo con dos consultas distintas se separan
    // el día que se le agrega una columna a uno.
    //
    // Un `control` inválido se ignora en vez de rechazarse: lo peor que puede
    // pasar es mostrar el listado de siempre, y tirar un 400 sobre un parámetro
    // de la URL rompería la pantalla por algo que no es del usuario.
    const controlPedido = url.searchParams.get("control");
    const grupoDeControl = Object.values(CONTROL).includes(controlPedido) ? controlPedido : null;

    const rango = {
      minPct: numero(cab.aumentoEsperadoMinPct),
      maxPct: numero(cab.aumentoEsperadoMaxPct),
    };

    const where = {
      importacionId: id,
      // CONTROLANDO NO SE FILTRA POR ESTADO NI POR `aplicada`. Los estados los
      // decidió `clasificarLinea` pensando en escribir costos —listo, sin
      // cambios, para revisar— y controlando no se escribe ninguno: un producto
      // cuya lista dice el doble puede estar en cualquiera de los tres, y los
      // tres son igual de interesantes para quien vino a comparar. Filtrar por
      // LISTO dejaría afuera justo los casos raros.
      ...(grupoDeControl
        ? {}
        : { estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR, aplicada: false }),
      excluidaManual: false,
      // ── LO QUE YA SE ESCRIBIÓ NO "SE ACTUALIZA" ─────────────────────────
      //
      // Esta pantalla se llama "Se actualizan" y ahora cada fila se toca. Sobre
      // una fila YA APLICADA, "Dejarlo como está" ofrece no escribir un costo
      // que ya está escrito: el botón no miente por poco, miente del todo.
      //
      // `aplicar` filtra por `aplicada: false`, así que ésas ya no las toca
      // nadie. Lo que se hace con una fila aplicada es deshacer, que es otro
      // botón y otra pantalla.
      ...(buscar
        ? {
            OR: [
              { descripcionProveedor: { contains: buscar, mode: "insensitive" } },
              { productoBase: { nombre: { contains: buscar, mode: "insensitive" } } },
              { codigoCrudo: { contains: buscar, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    // ── SE TRAEN TODAS Y SE PAGINA ACÁ ──────────────────────────────────
    //
    // Se traían `hasta + 1` para poder decir "hay más" sin una segunda
    // consulta, y el título salía "Se actualizan · 20+" sobre 360 productos.
    // Un "20+" no es un número: no dice si son 21 o 900, que es justo lo que
    // esta pantalla viene a contestar.
    //
    // Contar en la base no alcanza, porque quién entra no es una columna: sale
    // de `motivoDeRevision`, que mira el estado, el porcentaje y el rango
    // juntos. Escribir esa regla como SQL sería tenerla en dos idiomas, y el
    // día que cambie una sola el título diría un número y la lista otro.
    //
    // El costo está acotado y medido: son las filas LISTO de la importación
    // —359 en la lista real de M Y F— con un `select` de doce campos, la misma
    // consulta que ya hace el endpoint del resultado sobre las 954.
    const crudas = await prisma.importacionListaFila.findMany({
      where,
      orderBy: { filaExcel: "asc" },
      select: {
        id: true,
        estado: true,
        motivo: true,
        codigoCrudo: true,
        descripcionProveedor: true,
        costoAnterior: true,
        costoMaestroPropuesto: true,
        diferenciaPct: true,
        factorErp: true,
        excluidaManual: true,
        productoBaseId: true,
        aumentoEsperadoMinPct: true,
        aumentoEsperadoMaxPct: true,
        confirmadoEn: true,
        vinculadoEn: true,
        multiplicadorConfirmado: true,
        fueraDeRangoAceptadaEn: true,
        productoBase: { select: { id: true, nombre: true, factor_pack: true } },
      },
    });

    // EL MISMO FILTRO QUE EL CONTADOR, y controlando el mismo que el resumen.
    //
    // Sin control: una fila LISTO que quedó fuera del rango sin que nadie la
    // eligiera NO se va a actualizar, y mostrarla acá diría que se actualizan
    // 112 cuando se actualizan 111.
    //
    // Con control: el grupo sale de `compararConLaLista`, que es la misma
    // función que usa `contarControl` para el número de la tarjeta. Si acá se
    // escribiera la comparación otra vez, la tarjeta diría 21 y la lista
    // mostraría 19 sin que nada avisara cuál de las dos tiene razón.
    const aplicables = grupoDeControl
      ? crudas.filter(
          (f) =>
            compararConLaLista({
              costoActual: numero(f.costoAnterior),
              precio: numero(f.costoMaestroPropuesto),
            }) === grupoDeControl
        )
      : crudas.filter((f) => motivoDeRevision(f, rango) === null);
    const hayMas = aplicables.length > hasta;
    const pagina = aplicables.slice(0, hasta);

    // ── EL RANGO QUE SE MUESTRA ES EL DE ESTAS FILAS ────────────────────
    //
    // Se mandaba el rango CONFIGURADO del proveedor y el renglón decía "todos
    // aumentan entre +2,0 % y +15,0 %" sin haber mirado una sola fila. Es la
    // misma familia del cartel de la #5: una frase sobre los productos que en
    // realidad describe otra cosa. Si los 359 aumentan todos +5 %, eso es lo
    // que hay que decir.
    let minReal = null;
    let maxReal = null;
    for (const f of aplicables) {
      const p = numero(f.diferenciaPct);
      if (p === null) continue;
      minReal = minReal === null ? p : Math.min(minReal, p);
      maxReal = maxReal === null ? p : Math.max(maxReal, p);
    }

    // ── ¿EL COSTO DE HOY PARECE CARGADO A MANO? ─────────────────────────
    //
    // Se pregunta SOLO por los productos de esta página —veinte, no 954— y con
    // una consulta sola: cuántas veces alguna lista le escribió el costo a cada
    // uno. Cero aplicaciones más un costo redondo es la forma de un número
    // puesto para salir del paso, que es lo que pasa con los TOSTEX de $1.000.
    //
    // El criterio vive en `costoSospechoso.js` y no acá: lo dicen dos pantallas
    // y tiene su candado.
    const idsBase = [...new Set(pagina.map((f) => f.productoBase?.id).filter(Boolean))];
    const aplicacionesPorProducto = new Map();
    if (idsBase.length > 0) {
      const previas = await prisma.importacionListaFila.groupBy({
        by: ["productoBaseId"],
        where: { productoBaseId: { in: idsBase }, aplicada: true },
        _count: { _all: true },
      });
      for (const p of previas) aplicacionesPorProducto.set(p.productoBaseId, p._count._all);
    }

    return NextResponse.json({
      ok: true,
      proveedor: cab.proveedor,
      // Con la lista cerrada la pantalla muestra y no deja tocar: el servidor
      // rechaza excluir una fila de una importación que no está abierta, así
      // que ofrecerlo sería ofrecer algo que falla.
      //
      // Y CONTROLANDO NO SE EDITA NUNCA, esté abierta o no: los botones de esta
      // pantalla —dejar como está, excluir— deciden qué se escribe al aplicar, y
      // un control no aplica nada. Ofrecerlos sería ofrecer trabajo que no tiene
      // efecto, que es peor que no ofrecerlos.
      editable: grupoDeControl ? false : esImportacionAbierta(cab.estado),
      // Qué grupo del control se está mirando, para que la pantalla se titule.
      // `null` cuando es el listado de siempre.
      control: grupoDeControl,
      // El configurado se manda igual, con su nombre, porque no es lo mismo y
      // alguna pantalla puede querer contrastarlos.
      rangoEsperado: rango,
      rango: { minPct: minReal, maxPct: maxReal },
      total: aplicables.length,
      hayMas,
      items: pagina.map((f) => ({
        id: f.id,
        nombre: f.productoBase?.nombre || f.descripcionProveedor,
        factorPack: f.productoBase?.factor_pack ?? f.factorErp ?? null,
        costoAnterior: numero(f.costoAnterior),
        costoNuevo: numero(f.costoMaestroPropuesto),
        variacionPct: numero(f.diferenciaPct),
        costoRedondo: costoParaMirar({
          costoActual: numero(f.costoAnterior),
          vecesAplicado: aplicacionesPorProducto.get(f.productoBase?.id) ?? 0,
        }),
      })),
    });
  } catch (e) {
    console.error("[listas/actualizan]", e);
    return NextResponse.json(
      { ok: false, error: "No se pudieron cargar los productos que se actualizan. Probá de nuevo." },
      { status: 500 }
    );
  }
}
