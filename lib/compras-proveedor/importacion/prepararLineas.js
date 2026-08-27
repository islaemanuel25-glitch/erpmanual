import { buscarCandidatos } from "../comprobante/vinculo.js";
import { convertirUnidadPedido } from "../calculoPedido.js";
import { buscarCandidatosDeProveedor } from "@/lib/proveedores/identidad/motorCandidatos";
import { normalizarUnidadFuente, proponerCantidadPedido } from "./cantidad.js";
import { preguntaDeUnidad, resolverUnidadDelPapel } from "./unidadDelPapel.js";
import { precioFinalDelRenglon } from "./precioDelPapel.js";
import { ORIGEN_PRECIO, preciosComparables } from "./precios.js";

/**
 * El precio del papel de un renglón, ya resuelto, con su rastro visible.
 *
 * ── POR QUÉ ESTO ES UNA FUNCIÓN Y NO CÓDIGO PEGADO EN LOS DOS LUGARES ──────
 *
 * Porque hay DOS caminos que tienen que dar el mismo número: la preparación
 * inicial del documento y el recálculo cuando alguien cambia el producto o la
 * unidad. Si se escribieran al lado, el día que uno cambie la pantalla mostraría
 * un precio y el borrador guardaría otro.
 *
 * ── LA CANTIDAD QUE DIVIDE ES LA DEL PAPEL, NO LA DEL PEDIDO ──────────────
 *
 * `subtotal ÷ cantidad` usa `linea.cantidad`, que es la del renglón del
 * documento y está en la unidad de compra de ESE renglón. `cantidadPedido` es
 * otra cosa: es la que el ERP propone después de convertir a bultos o unidades
 * según el producto. Dividir por la del pedido mezclaría dos escalas y daría un
 * precio por bulto donde el papel cobra por unidad.
 *
 * Por eso el número que sale de acá está en la MISMA escala que el precio
 * impreso, y la receta del proveedor —`facturaPor`— se aplica después, sin
 * cambios, en `preciosComparables`.
 */
function precioDelPapelDeLaLinea(linea, { hayColumnaSubtotal = true } = {}) {
  return precioFinalDelRenglon({
    cantidad: linea?.cantidad,
    precioImpreso: linea?.precioUnitario,
    bonificacionPct: linea?.bonificacionPct,
    subtotal: linea?.subtotal,
    // `null` —el lector no contestó— NO se trata como "sí". Un subtotal que
    // vino sin que conste que la columna existe puede ser un número calculado,
    // y usarlo devolvería el precio de lista creyendo que es el efectivo, que
    // es exactamente el defecto que este módulo arregla. Con la duda se baja al
    // escalón del descuento, que al menos aplica la bonificación.
    haySubtotalImpreso: hayColumnaSubtotal === true,
  });
}

/**
 * Los dos precios comparables más el rastro de cómo se armó el del papel.
 *
 * `precioPapelEditado` existe para que una corrección a mano no se pierda: si
 * alguien escribió el precio final en la pantalla, ese gana sobre lo calculado.
 * Sin esta marca, cualquier cambio de unidad recalcularía desde el papel y le
 * pisaría el número escrito.
 */
function conPrecios(base, { producto, facturaPor, hayColumnaSubtotal, papelManual = null }) {
  const delPapel = precioDelPapelDeLaLinea(base, { hayColumnaSubtotal });
  const usaManual = papelManual !== null && papelManual !== undefined && papelManual !== "";
  const precioPapelCrudo = usaManual ? papelManual : delPapel.precioFinal;
  const precios = preciosComparables({
    precioPapel: precioPapelCrudo,
    facturaPor,
    unidadPedido: base.unidadPedido,
    producto,
  });
  return {
    ...base,
    ...precios,
    precioFinalPapelCrudo: precioPapelCrudo,
    origenPrecioPapel: usaManual ? null : delPapel.origen,
    papelRequiereRevision: usaManual ? false : delPapel.requiereRevision,
    papelMotivoRevision: usaManual ? null : delPapel.motivo,
    precioPapelEditado: usaManual,
    origenPrecio: precios.precioPapel !== null ? ORIGEN_PRECIO.PAPEL : ORIGEN_PRECIO.SISTEMA,
    precioConfirmado: !precios.diferentes,
  };
}

export function prepararLineasImportadas({
  lineas = [],
  productos = [],
  facturaPor = "UNIDAD",
  hayColumnaSubtotal = true,
  cantidadEn = null,
  // Presentaciones ya confirmadas para este proveedor, por `productoBaseId`.
  // Es lo que Listas de precios aprendió y que acá no hay que volver a
  // preguntar: entra segundo en la prioridad, después de la receta.
  presentacionesConfirmadas = null,
} = {}) {
  const porBase = new Map(productos.map((p) => [Number(p.baseId), p]));
  const vinculos = productos.flatMap((p) => {
    const codigos = Array.isArray(p.codigosInternos)
      ? p.codigosInternos
      : p.codigoInterno
      ? [p.codigoInterno]
      : [];
    return codigos.map((codigoInterno) => ({
      productoBaseId: p.baseId,
      codigoInterno,
      descripcionProveedor: (p.aliasesProveedor || []).find(
        (a) => a.codigoInterno === codigoInterno
      )?.descripcionProveedor,
      activo: true,
      nombre: p.nombre,
    }));
  });
  const universoProveedor = productos.map((p) => ({ productoBaseId: p.baseId, nombre: p.nombre }));

  return lineas.map((linea, indice) => {
    // ── EL MISMO MOTOR QUE USA LISTAS DE PRECIOS ─────────────────────────
    //
    // Antes acá se llamaba a `buscarCandidatos` del módulo de comprobante, que
    // rankea por palabras compartidas: con "MARLBIRO 10 ROJO" ponía primero a
    // "CAMEL 10 ROJO" —otra marca— porque compartía dos palabras contra una.
    //
    // El motor compartido pesa por PAPEL: una marca distinta contradice y una
    // variante que falta apenas descuenta. Y es el mismo objeto que consulta
    // Listas, así que lo que uno aprende el otro lo ve.
    const busqueda = buscarCandidatosDeProveedor({
      textoLeido: linea.descripcion,
      codigoLeido: linea.codigo,
      vinculos,
      productos,
      obtenerNombre: (p) => p?.nombre ?? "",
      obtenerId: (p) => p?.baseId ?? null,
    });
    // Se sigue exigiendo la escalera por terminación de código, que vive en el
    // módulo de comprobante y que el motor compartido no reemplaza: es un
    // macheo de CÓDIGO, no de texto. Solo se consulta si el motor no resolvió.
    const porTerminacion = busqueda.elegido
      ? null
      : buscarCandidatos({
          linea: { codigoProveedor: linea.codigo, descripcion: linea.descripcion },
          vinculos,
          universoProveedor,
          permitirCodigoAproximado: true,
        });
    const elegidoBaseId =
      busqueda.elegido?.productoBaseId ??
      (porTerminacion?.vinculoAutomatico?.productoBaseId ?? null);
    const automatico = elegidoBaseId !== null ? porBase.get(Number(elegidoBaseId)) || null : null;
    // ── QUÉ SIGNIFICA LA CANTIDAD DEL PAPEL ────────────────────────────────
    //
    // Se resuelve ANTES y aparte de cómo se va a guardar el pedido. Son dos
    // preguntas distintas y mezclarlas fue el defecto: un papel que decía
    // "10" unidades se interpretaba como 10 bultos porque el producto del ERP
    // se compra por bulto.
    const factorErp = Math.max(1, Math.floor(Number(automatico?.factor_pack) || 1));
    const lecturaDelPapel = resolverUnidadDelPapel({
      unidadDocumento: normalizarUnidadFuente(linea.unidad),
      unidadReceta: cantidadEn,
      presentacionConfirmada: presentacionesConfirmadas?.[String(automatico?.baseId)] ?? null,
      precioPapel: linea.precioUnitario,
      costoUnidadErp: automatico ? Number(automatico.precio_costo) / factorErp : null,
      costoBultoErp: automatico ? Number(automatico.precio_costo) : null,
    });

    const propuesta = automatico
      ? proponerCantidadPedido({
          cantidad: linea.cantidad,
          unidadFuente: linea.unidad,
          producto: automatico,
          // La escala que resolvió la prioridad de arriba. Si quedó en null, es
          // que hay que preguntar: `proponerCantidadPedido` no la inventa.
          cantidadEn: lecturaDelPapel.unidad,
        })
      : null;

    const base = {
      id: `linea-${indice + 1}`,
      ...linea,
      productoLocalId: automatico ? String(automatico.productoLocalId) : "",
      // Los candidatos ya vienen ordenados por el motor: primero los del mismo
      // proveedor, marca y presentación. Se conserva ese orden.
      // Se deduplica: los dos motores pueden proponer el mismo producto y una
      // lista con el mismo candidato dos veces no ayuda a elegir.
      candidatos: [
        ...new Set(
          [...busqueda.candidatos, ...(porTerminacion?.candidatos ?? [])]
            .map((c) => porBase.get(Number(c.productoBaseId)))
            .filter(Boolean)
            .map((p) => p.productoLocalId)
        ),
      ],
      // ── LOS SUGERIDOS SON UNA LISTA CORTA Y ORDENADA ────────────────────
      //
      // `candidatos` trae el catálogo ENTERO puntuado, que sirve para ordenar
      // pero no para sugerir: si todo es sugerido, nada lo es. Y era
      // exactamente eso lo que rompía la pantalla — mirá la nota en el
      // componente.
      sugeridos: busqueda.sugeridos
        .map((c) => porBase.get(Number(c.productoBaseId)))
        .filter(Boolean)
        .map((p) => p.productoLocalId),
      // Por qué se eligió este candidato. Es lo que la pantalla muestra y lo
      // que después viaja como `metodoDeteccion` a la memoria del proveedor.
      origenVinculo: busqueda.elegido ? busqueda.motivo : porTerminacion?.origen ?? busqueda.motivo,
      textoOrigenVinculo: busqueda.texto,
      cantidadPedido: propuesta?.cantidad ?? (Number(linea.cantidad) || 1),
      unidadPedido: propuesta?.unidad || "BULTO",
      requiereRevision: !automatico || Boolean(propuesta?.requiereRevision),
      motivoRevision: !automatico
        ? "El código no coincide exactamente con un producto. Elegilo y confirmá la línea."
        : propuesta?.motivo || null,
      equivalencia: propuesta?.equivalencia || null,
      confirmada: Boolean(automatico && !propuesta?.requiereRevision),
      // ── LO INMUTABLE DEL PAPEL ──────────────────────────────────────────
      //
      // Estos cuatro NO se tocan nunca más: son lo que dice el documento. Todas
      // las representaciones se recalculan desde acá, nunca convirtiendo el
      // valor que se está mostrando. Convertir lo mostrado una y otra vez
      // acumula redondeos y, peor, acumula el error de una interpretación mala.
      cantidadPapel: Number(linea.cantidad) || null,
      precioPapelOriginal: linea.precioUnitario ?? null,
      subtotalPapelOriginal: linea.subtotal ?? null,
      unidadCantidadPapel: lecturaDelPapel.unidad,
      origenUnidadPapel: lecturaDelPapel.origen,
      unidadPapelConfirmada: lecturaDelPapel.confirmada,
      evidenciaUnidadPapel: lecturaDelPapel.evidencia ?? null,
      // La pregunta se arma acá para que diga SIEMPRE el número del papel.
      preguntaUnidadPapel: lecturaDelPapel.unidad
        ? null
        : preguntaDeUnidad({ cantidadPapel: linea.cantidad, unidadesPorBultoErp: factorErp }),
    };
    return conPrecios(base, { producto: automatico, facturaPor, hayColumnaSubtotal });
  });
}

export function recalcularLineaConProducto(
  linea,
  producto,
  { facturaPor = "UNIDAD", hayColumnaSubtotal = true } = {}
) {
  const propuesta = proponerCantidadPedido({
    cantidad: linea.cantidad,
    unidadFuente: linea.unidad,
    producto,
  });
  const base = {
    ...linea,
    productoLocalId: producto ? String(producto.productoLocalId) : "",
    cantidadPedido: propuesta.cantidad,
    unidadPedido: propuesta.unidad,
    requiereRevision: true,
    motivoRevision: producto
      ? propuesta.motivo || "Confirmá que el producto elegido corresponde a la línea del archivo."
      : "Elegí un producto.",
    equivalencia: propuesta.equivalencia || null,
    confirmada: false,
  };
  return conPrecios(base, {
    producto,
    facturaPor,
    hayColumnaSubtotal,
    // Un precio escrito a mano sobrevive al cambio de producto: lo escribió
    // alguien mirando el papel, que es más de lo que puede deducir el motor.
    papelManual: linea?.precioPapelEditado ? linea.precioFinalPapelCrudo : null,
  });
}

/**
 * Recalcula una línea después de un cambio de la pantalla.
 *
 * Es el tercer camino que tiene que dar el mismo número que los otros dos, y por
 * eso vive acá y no adentro del componente.
 */
/**
 * CAMBIAR LA UNIDAD DE PEDIDO ES UNA OPERACIÓN ATÓMICA.
 *
 * ── EL DEFECTO QUE ESTO ARREGLA ────────────────────────────────────────────
 *
 * La pantalla cambiaba `unidadPedido` y pedía recalcular el PRECIO. El precio se
 * convertía —de $3.360 por unidad a $33.600 por bulto— y la cantidad se quedaba
 * donde estaba. Resultado medido sobre el renglón real:
 *
 *   antes:   50 UNIDAD × $3.360  = $168.000   (lo que dice el papel)
 *   después: 50 BULTO  × $33.600 = $1.680.000 (diez veces de más)
 *
 * Los dos números son plausibles por separado y por eso no se ve. Lo que delata
 * el error es el SUBTOTAL, que tiene que sobrevivir a la conversión: cambiar de
 * unidad es reexpresar la misma compra, no comprar diez veces más.
 *
 * ── SE REUSA `convertirUnidadPedido`, NO SE ESCRIBE OTRA ───────────────────
 *
 * Esa función ya convierte cantidad Y costo juntos, y ya devuelve
 * `needsConfirm` cuando la conversión no es exacta. Es la que usa "Nuevo
 * pedido" desde siempre; el importador nunca la había llamado. Escribir la
 * división al lado habría sido una segunda regla de conversión en el mismo
 * módulo — la clase de cosa que no se rompe hoy sino el día que una cambie.
 *
 * @returns la línea convertida, o `{ requiereConfirmacion: true, ... }` cuando
 *   la conversión a bulto no da entera. NO se redondea solo: 47 unidades no son
 *   ni 4 ni 5 bultos, y elegir uno cambia lo que se le pide al proveedor.
 */
export function cambiarUnidadDeLinea(
  linea,
  producto,
  { unidadDestino, facturaPor = "UNIDAD", hayColumnaSubtotal = true, redondear = false } = {}
) {
  const factor = Math.max(1, Math.floor(Number(producto?.factor_pack) || 1));
  const actual = linea?.unidadPedido === "UNIDAD" ? "UNIDAD" : "BULTO";
  const destino = unidadDestino === "UNIDAD" ? "UNIDAD" : "BULTO";

  // Sin cambio de unidad no hay nada que convertir. Recalcular igual sería
  // pasar la cantidad por una conversión de ida y vuelta sin motivo.
  if (destino === actual) {
    return recalcularPrecioDeLinea(linea, producto, { facturaPor, hayColumnaSubtotal });
  }

  const convertida = convertirUnidadPedido({
    unidad: actual,
    cantidad: linea?.cantidadPedido,
    // El costo que se convierte es el del PAPEL en la escala de la línea, que es
    // el que después se compara. Si la línea no tiene precio del papel, la
    // conversión sigue valiendo para la cantidad.
    costo: Number(linea?.precioPapel ?? linea?.precioSistema ?? 0),
    factor,
    redondear,
  });

  if (convertida.needsConfirm) {
    return {
      ...linea,
      requiereConfirmacionDeUnidad: true,
      conversionPendiente: {
        desde: actual,
        hacia: destino,
        unidades: convertida.units,
        bultos: convertida.packs,
        factor: convertida.factor,
      },
    };
  }

  return {
    ...recalcularPrecioDeLinea(
      { ...linea, cantidadPedido: convertida.cantidad, unidadPedido: convertida.unidad },
      producto,
      { facturaPor, hayColumnaSubtotal }
    ),
    requiereConfirmacionDeUnidad: false,
    conversionPendiente: null,
  };
}

export function recalcularPrecioDeLinea(
  linea,
  producto,
  { facturaPor = "UNIDAD", hayColumnaSubtotal = true, papelManual = null } = {}
) {
  // Si no viene un precio nuevo escrito a mano, se conserva el que ya estaba
  // escrito: cambiar la unidad no puede borrar una corrección.
  const manual = papelManual !== null
    ? papelManual
    : linea?.precioPapelEditado
    ? linea.precioFinalPapelCrudo
    : null;
  return conPrecios({ ...linea }, { producto, facturaPor, hayColumnaSubtotal, papelManual: manual });
}
