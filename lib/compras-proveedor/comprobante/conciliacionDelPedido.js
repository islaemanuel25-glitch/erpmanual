// lib/compras-proveedor/comprobante/conciliacionDelPedido.js
//
// LA CONCILIACIÓN DE UN PEDIDO CONTRA SUS PAPELES, CARGADA EN UN SOLO LUGAR.
//
// Vivía adentro de `conciliacion/[pedidoId]/route.js`. Desde Mauro #298
// (2026-10-26) la necesitan tres: la pantalla, el acomodo de un papel leído
// corrido y `aceptar-precio`, que no puede aceptar el costo de un producto que
// la pantalla marca como sospechoso. Tres copias de las consultas son tres
// conciliaciones que un día contestan distinto (regla 1 de CLAUDE.md), así que
// se cargan acá y las tres preguntan lo mismo.

import { cargarContexto, aplanarDetalles, analizarLineas, vinculadasDeTodos } from "./analisisDeComprobante.js";
import { filasDeConciliacion } from "./filasDeConciliacion.js";
import { revisarCorrimiento, DECISIONES_SOBRE_LOS_NUMEROS, NUMEROS_DE_LA_FILA } from "./filasCorridas.js";
import { VARIACION_POR_DEFECTO } from "@/lib/compras-proveedor/decisionDeCostoSugerida";

/** Lo que se trae de cada línea del pedido: lo que la fila muestra al lado del papel. */
const DETALLE_SELECT = {
  id: true, cantidad: true, precioCosto: true, cantidadRecibida: true, unidad: true,
  kgRecibidos: true,
  // Lo que la hoja de corregir necesita para contar: cuántas sueltas se
  // anotaron y por qué la cantidad no coincide.
  unidadesSueltas: true, motivoPrincipal: true, motivoDetalle: true,
  // Lo que entró en unidades físicas, que no depende de la escala en que se
  // muestre: con esto la hoja rearma lo contado si la escala cambió (Pablo #337).
  unidadesFisicas: true,
  // "Llegó sin papel" o "No llegó", para las que no están en ninguna boleta.
  llegoSinPapel: true,
  // El producto del local: es lo que se escribe en la fila del papel cuando se
  // la ata a esta línea.
  productoLocalId: true,
  producto: {
    select: {
      id: true, baseId: true,
      base: {
        select: {
          id: true,
          nombre: true,
          // Decide si la línea es fiambre, y con eso la columna de kilos.
          modoCompraProveedor: true,
          // Cuántas unidades trae un bulto.
          factor_pack: true,
          // Para poner los dos precios en la misma unidad: el costo de un
          // producto en kilos está por kilo y el depósito puede contar piezas.
          unidad_medida: true,
          modoVentaDeposito: true,
          pesoEsFijo: true,
          pesoReferenciaKg: true,
          // El costo maestro de HOY, contra el que compara el cierre.
          precio_costo: true,
        },
      },
    },
  },
};

/** Lo que se trae de cada papel del pedido. */
const COMPROBANTE_SELECT = {
  id: true, estado: true, tipo: true, puntoVenta: true, numero: true, fecha: true,
  confirmadoEn: true, imagenBorradaEn: true, leidoEn: true, recetaUsada: true,
  // El total IMPRESO del papel, para el rótulo "Factura".
  totalLeido: true,
  // El resto del pie, que es parte del costo de cada producto.
  netoLeido: true,
  ivaLeido: true,
  internoLeido: true,
  conceptosDelPieLeidos: true,
  proveedor: { select: { id: true, nombre: true, umbralRevisarPct: true, umbralSospechaBajaPct: true } },
  lineas: {
    orderBy: { orden: "asc" },
    select: {
      id: true, orden: true, textoCrudo: true, codigoProveedor: true, cantidad: true,
      netoUnitario: true, subtotalImpreso: true, internoUnitario: true,
      // El subtotal corregido, que manda sobre el leído.
      subtotalCorregido: true,
      // Los kilos y el descuento del papel.
      pesoKg: true, bonificacionPct: true, descuento: true,
      // Lo que interpretó el modelo: de acá sale el costo del producto.
      costoFinalRenglon: true, enQueViene: true, tipoRenglon: true,
      // La alícuota de IVA de cada producto, si el papel la imprime.
      ivaPct: true,
      productoLocalId: true, pedidoDetalleId: true, precioPedidoPrevio: true,
      // La marca de controlado, que es un hecho guardado.
      revisadoEnRecepcion: true, revisadoEnRecepcionAt: true,
      // Por unidad o por bulto, cuando alguien ya lo eligió.
      unidadElegida: true,
      // Si alguien ya escribió el costo de esta fila, no se acomoda nada.
      costoEscrito: true,
      // "No vino" y lo tocado a mano en la hoja de Corregir: lo que una persona
      // decidió no lo pisa el recálculo, y lo que no vino no entra.
      noVino: true,
      corregidoAManoEn: true,
    },
  },
};

/**
 * TODO LO QUE HACE FALTA PARA CONCILIAR UN PEDIDO, o null si no existe.
 *
 * @returns `{ pedido, detallesPlanos, comprobantes, analizados, grupos,
 *          sinComprobante, hayFaltantes, totales, contexto, variacionNormalPct,
 *          corrimientos }`. `corrimientos` es un Map por id de comprobante con
 *          lo que contestó `revisarCorrimiento`.
 */
export async function cargarConciliacion(prisma, { grupoId, localId, pedidoId }) {
  const pedido = await prisma.pedidoProveedor.findFirst({
    where: { id: pedidoId, grupoId },
    // `nacidoDeFactura`: en ese pedido lo esperado es lo que dice el papel.
    select: { id: true, estado: true, proveedorId: true, nacidoDeFactura: true },
  });
  if (!pedido) return null;

  const detallesPlanos = aplanarDetalles(
    await prisma.pedidoProveedorDetalle.findMany({ where: { pedidoId }, orderBy: { id: "asc" }, select: DETALLE_SELECT })
  );
  // El alcance va en el WHERE: un comprobante de otro grupo no existe.
  const comprobantes = await prisma.comprobanteProveedor.findMany({
    where: { grupoId, pedidoId, estado: { not: "ANULADO" } },
    orderBy: { createdAt: "asc" },
    select: COMPROBANTE_SELECT,
  });
  const contexto = await cargarContexto(prisma, { grupoId, localId, proveedorId: pedido.proveedorId });
  const porProductoLocal = await vinculadasDeTodos(prisma, comprobantes);

  // ── CUÁNTO SE LE MUEVE EL PRECIO A ESTE PROVEEDOR ────────────────────
  //
  // Sale de la receta VIGENTE del proveedor. Sin receta cargada, el 10 % por
  // defecto.
  const proveedorId = comprobantes[0]?.proveedor?.id ?? pedido.proveedorId ?? null;
  const recetaVigente = proveedorId
    ? await prisma.recetaProveedor.findFirst({ where: { grupoId, proveedorId }, select: { variacionNormalPct: true } })
    : null;
  const variacionNormalPct =
    recetaVigente?.variacionNormalPct != null ? Number(recetaVigente.variacionNormalPct) : VARIACION_POR_DEFECTO;

  return conciliar({ pedido, detallesPlanos, comprobantes, contexto, porProductoLocal, variacionNormalPct });
}

/**
 * La parte pura: analiza cada papel, arma las filas y revisa si alguno se leyó
 * corrido. Separada para poder ejercerla con las filas reales sin base.
 */
export function conciliar({ pedido, detallesPlanos, comprobantes, contexto, porProductoLocal, variacionNormalPct }) {
  // Las filas que se acomodan pueden quedar atadas a un producto del pedido
  // que todavía no estaba atado a ninguna: su `baseId` sale de la línea.
  const productos = new Map(porProductoLocal);
  for (const d of detallesPlanos) {
    if (d.productoLocalId != null && !productos.has(d.productoLocalId)) {
      productos.set(d.productoLocalId, { id: d.productoLocalId, baseId: d.productoBaseId });
    }
  }
  const analizarTodas = (c, lineas) =>
    analizarLineas({ comprobante: { ...c, lineas }, contexto, detallesPlanos, porProductoLocal: productos, todasLasLineas: c.lineas });

  const analizados = comprobantes.map((c) => ({ ...c, lineas: analizarTodas(c, c.lineas) }));
  const nacidoDeFactura = pedido.nacidoDeFactura === true;
  const conciliacion = filasDeConciliacion({ comprobantes: analizados, detalles: detallesPlanos, nacidoDeFactura });

  // ── ¿ALGÚN PAPEL SE LEYÓ CORRIDO? ────────────────────────────────────
  //
  // Solo con pedido de verdad: en uno nacido de la factura, lo esperado es lo
  // que dice el mismo papel, y no hay contra qué probar.
  const corrimientos = new Map();
  if (!nacidoDeFactura) {
    for (const c of comprobantes) {
      const cache = new Map();
      const analizarUna = (l) => {
        const clave = JSON.stringify([l.id, l.textoCrudo, l.productoLocalId, l.pedidoDetalleId, NUMEROS_DE_LA_FILA.map((k) => l[k] ?? null)]);
        if (!cache.has(clave)) cache.set(clave, analizarTodas(c, [l])[0]);
        return cache.get(clave);
      };
      const filasDe = (lineas) => {
        const otros = analizados.filter((x) => x.id !== c.id);
        const { grupos } = filasDeConciliacion({
          comprobantes: [...otros, { ...c, lineas: lineas.map(analizarUna) }],
          detalles: detallesPlanos,
          nacidoDeFactura,
        });
        return grupos.find((g) => g.comprobante?.id === c.id)?.filas ?? [];
      };
      corrimientos.set(c.id, revisarCorrimiento({ lineas: c.lineas, filasDe, lineasDelPedido: detallesPlanos, variacionPct: variacionNormalPct }));
    }
  }

  return { pedido, detallesPlanos, comprobantes, analizados, contexto, variacionNormalPct, corrimientos, ...conciliacion };
}

/** Los ids de las líneas que pueden estar corridas, de todos los papeles. */
export function lineasSospechadasDeCorrimiento(conciliacion) {
  return new Set([...(conciliacion?.corrimientos?.values() ?? [])].flatMap((r) => r.sospechosas ?? []));
}

/** Estados del pedido en que se puede acomodar: el que se está recibiendo. */
const SE_ACOMODA_EN = new Set(["ENVIADO"]);

/**
 * ACOMODAR LOS PAPELES LEÍDOS CORRIDOS DE UN PEDIDO, SIN VOLVER A LEERLOS.
 *
 * Lo llaman `recepcion/recalcular` al abrir el pedido y la lectura de un papel
 * al terminar. Escribe solo si `revisarCorrimiento` encontró UN acomodo con el
 * que todo el bloque coincide con el pedido; si no, no toca nada y la pantalla
 * avisa. No se toca un papel confirmado ni uno con algún costo ya escrito.
 *
 * Los números se mueven de fila y el nombre y el vínculo de cada fila se
 * quedan, que es lo que la persona y los alias ya decidieron. La fila que no se
 * mandó pasa a llevar los números que el lector dejó sin nombre, atada al
 * producto del pedido con el que coinciden. Cada fila tocada guarda en
 * `acomodo` qué tenía antes: el hecho de que se acomodó no se pierde.
 *
 * @returns `[{ comprobanteId, desde, hasta, sentido }]`, lo que se acomodó
 */
export async function acomodarFilasCorridas(prisma, { grupoId, localId, pedidoId }) {
  const conciliacion = await cargarConciliacion(prisma, { grupoId, localId, pedidoId });
  if (!conciliacion || !SE_ACOMODA_EN.has(conciliacion.pedido.estado)) return [];
  const hechos = [];
  for (const c of conciliacion.comprobantes) {
    const r = conciliacion.corrimientos.get(c.id);
    // Ni un papel donde una persona ya corrigió algo a mano: lo que tocó manda,
    // y acomodar las filas encima movería sus números a otra fila.
    if (
      !r?.acomodo ||
      c.confirmadoEn != null ||
      c.lineas.some((l) => l.costoEscrito || l.corregidoAManoEn != null || l.noVino === true)
    ) continue;
    const { desde, hasta, sentido, lineas, sinNumeros, textoQueSeFue } = r.acomodo;
    const en = new Date().toISOString();
    await prisma.$transaction(async (tx) => {
      for (let k = desde; k <= hasta; k++) {
        const antes = c.lineas[k];
        const despues = lineas[k];
        const numeros = Object.fromEntries(NUMEROS_DE_LA_FILA.map((campo) => [campo, despues[campo]]));
        await tx.comprobanteLinea.update({
          where: { id: antes.id },
          data: {
            ...numeros,
            ...DECISIONES_SOBRE_LOS_NUMEROS,
            ...(k === sinNumeros
              ? {
                  textoCrudo: despues.textoCrudo,
                  codigoProveedor: null,
                  productoLocalId: despues.productoLocalId,
                  pedidoDetalleId: despues.pedidoDetalleId,
                }
              : {}),
            acomodo: {
              en,
              motivo: "PAPEL_LEIDO_CORRIDO",
              sentido,
              // Lo que el lector había dejado en esta fila.
              textoLeido: antes.textoCrudo,
              numerosLeidos: Object.fromEntries(NUMEROS_DE_LA_FILA.map((campo) => [campo, antes[campo] == null ? null : String(antes[campo])])),
              ...(k === sinNumeros ? { nombreDelPedido: true, textoQueSeFue } : {}),
            },
          },
        });
      }
    });
    hechos.push({ comprobanteId: c.id, desde: c.lineas[desde].orden, hasta: c.lineas[hasta].orden, sentido });
  }
  return hechos;
}
