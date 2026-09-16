// GET /api/proveedores/listas/[id]/resultado
//
// TODO LO QUE NECESITA LA PANTALLA DE RESULTADO, EN UNA SOLA LLAMADA.
//
// ── POR QUÉ NO SE ARMA CON LOS QUE YA ESTÁN ─────────────────────────────────
//
// Porque la pantalla necesita CONTAR sobre las 954 filas y MOSTRAR tres. El
// endpoint que pagina filas puede hacer lo segundo y no lo primero: para contar
// habría que traerse las 954 al navegador, y dos clientes con versiones distintas
// contarían distinto sobre los mismos datos. Los contadores se calculan en el
// servidor, con `contarResultado`, que es la misma función que decide en qué
// grupo cae cada fila.
//
// ── QUÉ DEVUELVE ───────────────────────────────────────────────────────────
//
//   cabecera   proveedor, archivo, cuándo se leyó, en qué estado está
//   lectura    con qué columna del archivo se leyó, y qué otras se probaron
//   conteo     listos, sin cambio, salteadas, y la cola de revisión por grupo
//   muestra    tres filas de las que se van a actualizar, para poder mirarlas
//
// Con `?motivo=` devuelve además LA COLA de ese grupo, paginada: es la pantalla
// de revisar, y va acá y no en otro endpoint para que el conteo que decide los
// chips y la lista que se muestra salgan de la misma consulta.
//
// NO ESCRIBE NADA.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";
import { paginacion } from "@/lib/proveedores/listas/persistencia";
import {
  contarResultado,
  motivoDeRevision,
  resultadoCierra,
  MOTIVO_REVISION,
  ORDEN_MOTIVOS,
} from "@/lib/proveedores/listas/resultadoDeLaLista";
import { ESTADO_LINEA } from "@/lib/proveedores/listas/estados";
import { analizarFila } from "@/lib/proveedores/listas/confirmarPresentacion";
import { baseParaHelpers } from "@/lib/proveedores/listas/conciliarLista";
import { resolverParserDeProveedor } from "@/lib/proveedores/listas/registro";
import { productoDelProveedorWhere } from "@/lib/proveedores/listas/cargaErp";
import { filtroDeLaCola } from "@/lib/proveedores/listas/panelDecision";
import { whereDelGrupo, GRUPO_PRODUCTO } from "@/lib/proveedores/listas/gruposProducto";

/** Cuántas filas de ejemplo muestra la tapa. */
const MUESTRA = 3;

/**
 * Las columnas que hacen falta para contar y para dibujar.
 *
 * Se piden EXACTAMENTE éstas: traer la fila entera de 954 filas por dos números
 * es pagar el ancho de banda de una tabla completa para mostrar tres tarjetas.
 */
const CAMPOS_CONTEO = {
  id: true,
  estado: true,
  motivo: true,
  costoAnterior: true,
  productoBaseId: true,
  // SIN ESTA COLUMNA EL CONTADOR NO PUEDE VER LO QUE LA PERSONA DECIDIÓ.
  // `excluidaManual` es donde vive "dejala como está"; sin pedirla, cada fila
  // llegaba con el campo en `undefined` y la cola seguía contando 595 después de
  // sacar una. El botón parecía no hacer nada.
  excluidaManual: true,
};

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

    const params = await context.params;
    const id = Number(params?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: "Importación inválida." }, { status: 400 });
    }

    // El grupo va en el WHERE junto al id: una importación de otro grupo no
    // existe para esta consulta, así que da 404 y no revela que existe.
    const cab = await prisma.importacionListaProveedor.findFirst({
      where: { id, grupoId },
      select: {
        id: true,
        estado: true,
        createdAt: true,
        conciliadaEn: true,
        archivoNombre: true,
        aumentoEsperadoMinPct: true,
        aumentoEsperadoMaxPct: true,
        recargoPct: true,
        impuestoAdicionalPct: true,
        columnaPrecioElegida: true,
        descuentoAplicado: true,
        decisionDeLectura: true,
        proveedor: { select: { id: true, nombre: true, parserListaId: true } },
      },
    });
    if (!cab) {
      return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
    }

    // ── Los contadores, sobre TODAS las filas ────────────────────────────
    const paraContar = await prisma.importacionListaFila.findMany({
      where: { importacionId: id },
      select: CAMPOS_CONTEO,
    });
    const conteo = contarResultado(paraContar);

    // ── CUÁNTOS PRODUCTOS SE ACTUALIZARON, CONTADOS SIN DUPLICADOS ──────
    //
    // En PRODUCTOS y no en filas, y con el mismo predicado que arma los grupos
    // del catálogo —`whereDelGrupo`— que es el que ya usa el historial. Contar
    // filas daría de más: dos filas del archivo pueden terminar en el mismo
    // producto, y el número de la tapa y el del detalle dirían cosas distintas.
    const universoWhere = { grupoId, ...productoDelProveedorWhere(cab.proveedor?.id) };
    const productosActualizados = await prisma.productoBase.count({
      where: whereDelGrupo(GRUPO_PRODUCTO.ACTUALIZADO, {
        universoWhere,
        importacionId: id,
        proveedorId: cab.proveedor?.id,
        filtroCola: filtroDeLaCola(),
      }),
    });

    // ── La muestra: tres de las que se van a actualizar ──────────────────
    // `excluidaManual: false` en los dos: una fila que el motor dejó lista y que
    // después alguien excluyó a mano NO se va a aplicar, así que no puede
    // aparecer entre "algunos de los que se actualizan" ni estirar el rango de
    // aumentos que la tarjeta grande promete.
    const muestra = await prisma.importacionListaFila.findMany({
      where: { importacionId: id, estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR, excluidaManual: false },
      orderBy: { filaExcel: "asc" },
      take: MUESTRA,
      select: {
        id: true,
        descripcionProveedor: true,
        codigoCrudo: true,
        costoAnterior: true,
        costoMaestroPropuesto: true,
        diferenciaPct: true,
        productoBase: { select: { nombre: true } },
      },
    });

    // ── El rango de los que SÍ se aplican, para poder decirlo ────────────
    //
    // "Todos aumentan entre 5 % y 8 %, como esperabas" solo se puede escribir si
    // se mira. Sale de la base con un agregado y no trayendo 850 porcentajes.
    const extremos = await prisma.importacionListaFila.aggregate({
      where: { importacionId: id, estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR, excluidaManual: false },
      _min: { diferenciaPct: true },
      _max: { diferenciaPct: true },
    });

    const url = new URL(req.url);
    const motivoPedido = url.searchParams.get("motivo");
    let cola = null;
    if (motivoPedido && Object.values(MOTIVO_REVISION).includes(motivoPedido)) {
      cola = await armarCola({ id, motivo: motivoPedido, url, cabecera: cab });
    }

    return NextResponse.json({
      ok: true,
      cabecera: {
        id: cab.id,
        estado: cab.estado,
        proveedor: cab.proveedor,
        archivoNombre: cab.archivoNombre,
        leidaEn: cab.conciliadaEn ?? cab.createdAt,
        productosActualizados,
        rango: {
          minPct: numero(cab.aumentoEsperadoMinPct),
          maxPct: numero(cab.aumentoEsperadoMaxPct),
        },
      },
      lectura: cab.decisionDeLectura ?? null,
      conteo: {
        ...conteo,
        cierra: resultadoCierra(conteo),
        orden: ORDEN_MOTIVOS,
      },
      variacion: {
        minPct: numero(extremos._min.diferenciaPct),
        maxPct: numero(extremos._max.diferenciaPct),
      },
      muestra: muestra.map((f) => ({
        id: f.id,
        nombre: f.productoBase?.nombre || f.descripcionProveedor,
        codigo: f.codigoCrudo,
        costoAnterior: numero(f.costoAnterior),
        costoNuevo: numero(f.costoMaestroPropuesto),
        variacionPct: numero(f.diferenciaPct),
      })),
      cola,
    });
  } catch (e) {
    console.error("[listas/resultado]", e);
    return NextResponse.json(
      { ok: false, error: "No se pudo leer el resultado de esta lista. Probá de nuevo." },
      { status: 500 }
    );
  }
}

/**
 * La cola de un grupo de revisión, paginada.
 *
 * ── POR QUÉ SE FILTRA EN MEMORIA Y NO EN EL WHERE ───────────────────────────
 *
 * Porque el grupo no es una columna: sale de mirar el estado, el motivo Y el
 * costo juntos —`FACTOR_DUDOSO` con costo cero es otro grupo que `FACTOR_DUDOSO`
 * con costo—. Escribir esa condición como SQL sería tener la regla en dos
 * idiomas, y el día que cambie una sola quedaría la cola diciendo un número y el
 * chip de arriba otro.
 *
 * El costo de traerlas es acotado y medido: son las filas PARA REVISAR, no las
 * 954. En la lista más grande de las cuatro son 115.
 */
async function armarCola({ id, motivo, url, cabecera }) {
  const { page, pageSize, skip, take } = paginacion({
    page: url.searchParams.get("page"),
    pageSize: url.searchParams.get("pageSize"),
  });

  const candidatas = await prisma.importacionListaFila.findMany({
    where: {
      importacionId: id,
      estado: { notIn: [ESTADO_LINEA.LISTO_PARA_ACTUALIZAR, ESTADO_LINEA.SIN_CAMBIOS] },
      // LO QUE LA PERSONA YA RESOLVIÓ SE VA DE LA COLA, Y SE FILTRA EN LA BASE.
      // `ESTADO_LINEA.EXCLUIDO` no sirve para esto: está en el enum y nada lo
      // escribe nunca. Lo que se escribe es `excluidaManual`.
      excluidaManual: false,
    },
    orderBy: { filaExcel: "asc" },
    select: {
      id: true,
      estado: true,
      motivo: true,
      costoAnterior: true,
      productoBaseId: true,
      excluidaManual: true,
    },
  });
  const delGrupo = candidatas.filter((f) => motivoDeRevision(f) === motivo);
  const ids = delGrupo.slice(skip, skip + take).map((f) => f.id);

  const filas = ids.length === 0 ? [] : await prisma.importacionListaFila.findMany({
    where: { id: { in: ids } },
    orderBy: { filaExcel: "asc" },
    select: {
      id: true,
      filaExcel: true,
      hojaNombre: true,
      codigoCrudo: true,
      descripcionProveedor: true,
      unidadProveedor: true,
      unidadesPorBulto: true,
      precioConIva: true,
      descuentoPct: true,
      costoAnterior: true,
      precioConRecargo: true,
      costoMaestroPropuesto: true,
      diferencia: true,
      diferenciaPct: true,
      estado: true,
      motivo: true,
      excluidaManual: true,
      confirmadoEn: true,
      productoBaseId: true,
      sugerenciaProductoBaseId: true,
      productoBase: { select: { id: true, nombre: true, precio_costo: true, factor_pack: true, unidad_medida: true } },
    },
  });

  // EL PRODUCTO SUGERIDO SE BUSCA APARTE: `sugerenciaProductoBaseId` es un
  // escalar y NO tiene relación en el schema —se guarda como dato, no como
  // vínculo, porque nadie la confirmó—. Pedirla en el `select` compilaría igual y
  // fallaría recién contra Postgres.
  const idsSugeridos = [...new Set(filas.map((f) => f.sugerenciaProductoBaseId).filter(Boolean))];
  const sugeridos = idsSugeridos.length === 0 ? [] : await prisma.productoBase.findMany({
    where: { id: { in: idsSugeridos } },
    select: { id: true, nombre: true, precio_costo: true },
  });
  const sugeridoPorId = new Map(sugeridos.map((p) => [p.id, p]));

  const rango = {
    minPct: numero(cabecera.aumentoEsperadoMinPct),
    maxPct: numero(cabecera.aumentoEsperadoMaxPct),
  };
  const recargoPct = numero(cabecera.recargoPct) ?? 0;
  const impuestoAdicionalPct = numero(cabecera.impuestoAdicionalPct);
  // El MISMO enumerador con el que se conciliaron las filas y con el que el
  // endpoint de confirmar las va a aceptar. Con otro, la pantalla ofrecería un
  // costo que después no se puede confirmar.
  const reg = resolverParserDeProveedor(cabecera.proveedor);
  const lecturasPosibles = reg.ok ? reg.config?.lecturasPosibles ?? null : null;

  return {
    motivo,
    total: delGrupo.length,
    paginacion: { page, pageSize, paginas: Math.max(1, Math.ceil(delGrupo.length / pageSize)), total: delGrupo.length },
    // TODOS los ids del grupo, no solo los de la página: el botón "dejar los N
    // como están" actúa sobre el grupo entero, y pedirle a la pantalla que
    // pagine para juntarlos sería N llamadas para una sola acción.
    ids: delGrupo.map((f) => f.id),
    filas: filas.map((f) => ({
      id: f.id,
      filaExcel: f.filaExcel,
      donde: f.hojaNombre || null,
      codigo: f.codigoCrudo,
      nombre: f.productoBase?.nombre || f.descripcionProveedor,
      nombreEnElArchivo: f.descripcionProveedor,
      costoAnterior: numero(f.costoAnterior),
      diceLaLista: numero(f.precioConIva),
      descuentoPct: numero(f.descuentoPct),
      costoPropuesto: numero(f.costoMaestroPropuesto),
      variacionPct: numero(f.diferenciaPct),
      estado: f.estado,
      motivo: f.motivo,
      excluida: f.excluidaManual === true,
      confirmada: f.confirmadoEn !== null,
      productoBaseId: f.productoBaseId,
      factorPack: f.productoBase?.factor_pack ?? null,
      // LAS LECTURAS POSIBLES, que es lo que la pantalla ofrece como "Usar $X".
      // Salen de `hipotesisDeFila`, que es la misma función que usa el panel de
      // decisión: si la pantalla armara su propia cuenta, podría ofrecer un
      // costo que después el servidor no acepta confirmar.
      lecturas: lecturasDe({ fila: f, rango, recargoPct, impuestoAdicionalPct, lecturasPosibles }),
      sugerencia: sugeridoPorId.has(f.sugerenciaProductoBaseId)
        ? {
            productoBaseId: f.sugerenciaProductoBaseId,
            nombre: sugeridoPorId.get(f.sugerenciaProductoBaseId).nombre,
            costoActual: numero(sugeridoPorId.get(f.sugerenciaProductoBaseId).precio_costo),
          }
        : null,
    })),
  };
}

function numero(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Las lecturas posibles de una fila, con su porcentaje contra el costo de hoy.
 *
 * Sale de `analizarFila`, que es la misma que usa el panel de decisión y la que
 * el endpoint de confirmar consulta para aceptar o rechazar. Calcularlas acá por
 * separado dejaría a la pantalla ofreciendo un "Usar $X" que el servidor después
 * no reconoce.
 */
function lecturasDe({ fila, rango, recargoPct, impuestoAdicionalPct, lecturasPosibles }) {
  if (!fila.productoBase) return [];
  const analisis = analizarFila({
    fila,
    base: baseParaHelpers({
      unidadMedida: fila.productoBase.unidad_medida,
      factorPack: fila.productoBase.factor_pack,
      precioCostoActual: fila.productoBase.precio_costo,
    }),
    recargoPct,
    rango,
    impuestoAdicionalPct,
    lecturasPosibles,
  });
  return (analisis.evaluadas ?? []).map((h) => ({
    clave: h.clave,
    costoNuevo: numero(h.costoNuevo),
    multiplicador: h.multiplicador ?? 1,
    variacionPct: numero(h.variacionPct),
    estado: h.estado,
    absurda: h.absurda === true,
    detalle: h.detalle ?? null,
    origenCantidad: h.origenCantidad ?? null,
    recomendada: analisis.recomendada === h.clave,
  }));
}
