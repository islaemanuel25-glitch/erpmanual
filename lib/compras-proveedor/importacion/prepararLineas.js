import { buscarCandidatos } from "../comprobante/vinculo.js";
import { buscarCandidatosDeProveedor } from "@/lib/proveedores/identidad/motorCandidatos";
import { normalizarUnidadFuente, proponerCantidadPedido } from "./cantidad.js";
import {
  ORIGEN_UNIDAD_PAPEL,
  cantidadBaseEnUnidades,
  preguntaDeUnidad,
  representarPedido,
  resolverUnidadDelPapel,
} from "./unidadDelPapel.js";
import {
  explicarDiferencia,
  representacionesQueCierran,
  verificarImporteDeLinea,
} from "./coherenciaDeLinea.js";
import { precioFinalDelRenglon } from "./precioDelPapel.js";
import { ORIGEN_PRECIO, preciosComparables } from "./precios.js";

/** Las unidades por bulto que declara el producto del ERP. Uno solo si no hay. */
const factorDe = (producto) => Math.max(1, Math.floor(Number(producto?.factor_pack) || 1));

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
  // ── EL CANDADO DE MAGNITUD, EN EL ÚNICO LUGAR POR EL QUE PASAN LOS TRES
  //    CAMINOS ──────────────────────────────────────────────────────────────
  //
  // Preparar el documento, cambiar el producto y cambiar la unidad terminan
  // todos acá. Poniendo la comprobación en este punto, ninguno de los tres puede
  // producir una línea sin verificar — que es lo que pasaría si cada uno la
  // llamara por su cuenta y alguien agregara un cuarto camino.
  const factor = factorDe(producto);

  // ── LA CANTIDAD QUE SE VERIFICA ES LA DEL PAPEL, NO LA QUE SE VA A PEDIR ──
  //
  // Son dos hechos distintos y confundirlos rompería una operación legítima.
  // "La interpretación del papel es coherente" se comprueba contra la cantidad
  // DERIVADA DE LA BASE, y bloquea. "Estamos pidiendo otra cantidad que la del
  // remito" es una decisión de quien arma el pedido —47 en vez de 50 porque
  // faltaban tres—, se avisa y no bloquea.
  //
  // Si se verificara la cantidad tecleada, cualquier corrección a mano frenaría
  // el borrador; y si no se verificara ninguna, un factor de bulto de más se
  // escondería detrás de un número editado.
  // La cantidad del papel se RECALCULA desde los campos inmutables, no desde
  // `cantidadBaseUnidades`. Es la diferencia que hace que el control sirva:
  // `cantidadBaseUnidades` es lo que se va a PEDIR y una persona puede
  // cambiarlo, así que si el control mirara ahí, cualquier cantidad tecleada se
  // volvería su propia referencia y cerraría siempre. Es el mismo agujero que
  // tuvo el total del pie: comparar un número contra sí mismo.
  const representacionDelPapel = representarPedido({
    cantidadBaseUnidades: cantidadBaseEnUnidades({
      cantidadPapel: base.cantidadPapel,
      unidadPapel: base.unidadCantidadPapel,
      unidadesPorBultoErp: factor,
    }),
    subtotalPapel: base.subtotalPapelOriginal,
    unidadPedido: base.unidadPedido,
    unidadesPorBultoErp: factor,
  });
  const cantidadSegunElPapel =
    representacionDelPapel && !representacionDelPapel.requiereConfirmacion
      ? representacionDelPapel.cantidad
      : base.cantidadPedido;

  const coherencia = verificarImporteDeLinea({
    cantidadPedido: cantidadSegunElPapel,
    // El precio DEL PAPEL llevado a la escala en que quedó el pedido. No el
    // precio elegido: alguien puede quedarse con el del sistema, y eso es una
    // decisión, no una incoherencia. Ver la nota larga en `coherenciaDeLinea`.
    //
    // Que la cantidad salga de la base y el precio de la conversión por
    // `factor_pack` es lo que hace que esto SIRVA: son dos derivaciones
    // independientes del mismo renglón, y compararlas es lo que delata el
    // factor de más. Si las dos salieran del mismo lado, cerraría siempre.
    precioPapelEnEsaEscala: precios.precioPapel,
    subtotalOriginalPapel: base.subtotalPapelOriginal,
    haySubtotalImpreso: hayColumnaSubtotal === true,
  });

  const cantidadNumerica = Number(base.cantidadPedido);
  const difiereDelPapel =
    cantidadSegunElPapel !== null &&
    Number.isFinite(cantidadNumerica) &&
    Number(cantidadSegunElPapel) !== cantidadNumerica;

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
    coherencia,
    // Qué interpretación produjo la diferencia, y con qué números. Se arma solo
    // cuando hace falta: un cartel que no se va a mostrar no se calcula.
    explicacionCoherencia: coherencia.bloquea
      ? explicarDiferencia({
          cantidadPapel: base.cantidadPapel,
          unidadCantidadPapel: base.unidadCantidadPapel,
          unidadesPorBultoErp: factor,
          cantidadPedido: cantidadSegunElPapel,
          unidadPedido: base.unidadPedido,
          importeCalculado: coherencia.importeCalculado,
          subtotal: coherencia.subtotal,
        })
      : null,
    // Se pidió a propósito una cantidad distinta de la del papel. Se avisa y no
    // bloquea: es una decisión, no una lectura equivocada.
    cantidadSegunElPapel,
    cantidadDifiereDelPapel: difiereDelPapel,
    // Las lecturas del papel que sí cierran, evaluadas con el precio IMPRESO —
    // que es un dato independiente del subtotal—. Sin esa independencia
    // cerrarían todas, y el cartel ofrecería tapar el error en vez de corregirlo.
    representacionesValidas: coherencia.bloquea
      ? representacionesQueCierran({
          cantidadPapel: base.cantidadPapel,
          precioImpresoPapel: base.precioPapelOriginal,
          subtotalOriginalPapel: base.subtotalPapelOriginal,
          unidadesPorBultoErp: factor,
          facturaPor,
        })
      : [],
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
  // La tolerancia comercial de este proveedor. `null` usa el default único.
  toleranciaEscalaPct = null,
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
      toleranciaEscalaPct,
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

    // ── LA BASE, Y LA REPRESENTACIÓN QUE SALE DE ELLA ─────────────────────
    //
    // `proponerCantidadPedido` sigue decidiendo en QUÉ unidad conviene guardar:
    // sus reglas sobre fiambre, kilos y packs son de negocio y no se reescriben.
    // Lo que ya no hace es aportar el NÚMERO cuando hay base: ese sale de
    // `representarPedido`, igual que en cualquier cambio posterior de unidad.
    //
    // Que el número inicial y el de cada toque salgan del mismo lugar es lo que
    // hace que alternar no mueva nada. Antes el primero venía de una función y
    // los siguientes de otra, y bastaba con que discreparan una vez.
    const baseUnidades = cantidadBaseEnUnidades({
      cantidadPapel: linea.cantidad,
      unidadPapel: lecturaDelPapel.unidad,
      unidadesPorBultoErp: factorErp,
    });
    const representacionInicial = propuesta
      ? representarPedido({
          cantidadBaseUnidades: baseUnidades,
          subtotalPapel: linea.subtotal,
          unidadPedido: propuesta.unidad,
          unidadesPorBultoErp: factorErp,
        })
      : null;
    const cantidadDerivada =
      representacionInicial && !representacionInicial.requiereConfirmacion
        ? representacionInicial.cantidad
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
      // Derivada de la base cuando la hay; si no, lo que propuso la regla de
      // negocio. Nunca el número leído tal cual con una unidad puesta al lado.
      cantidadPedido: cantidadDerivada ?? propuesta?.cantidad ?? (Number(linea.cantidad) || 1),
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
      // El texto tal cual se leyó. Se conserva aparte de `descripcion` porque
      // `descripcion` es lo que la pantalla muestra y puede terminar mostrando el
      // nombre del producto elegido; éste es lo que decía el papel, y es lo que
      // después se aprende como alias del proveedor.
      textoOriginal: linea.descripcion ?? null,
      unidadCantidadPapel: lecturaDelPapel.unidad,
      origenUnidadPapel: lecturaDelPapel.origen,
      unidadPapelConfirmada: lecturaDelPapel.confirmada,
      evidenciaUnidadPapel: lecturaDelPapel.evidencia ?? null,
      // ── LA BASE, CALCULADA UNA SOLA VEZ ─────────────────────────────────
      //
      // Todas las representaciones del pedido salen de acá. Nunca se convierte
      // el valor que se está mostrando: convertirlo una y otra vez acumula
      // redondeos y, peor, acumula el error de una interpretación equivocada.
      // Con la base, una lectura mala se corrige cambiando la interpretación y
      // todo se recalcula desde cero, sin arrastrar nada.
      cantidadBaseUnidades: baseUnidades,
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
    cantidadEn: linea?.unidadCantidadPapel ?? null,
  });
  const base = {
    ...linea,
    productoLocalId: producto ? String(producto.productoLocalId) : "",
    // LA BASE SE RECALCULA, porque el producto nuevo puede traer otro
    // `factor_pack`. Conservar la base vieja dejaría una cantidad en unidades
    // calculada con el bulto de OTRO producto — un error que después nada
    // distingue de una lectura mala del papel.
    cantidadBaseUnidades: cantidadBaseEnUnidades({
      cantidadPapel: linea?.cantidadPapel,
      unidadPapel: linea?.unidadCantidadPapel,
      unidadesPorBultoErp: factorDe(producto),
    }),
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
 * ── SE DERIVA DE LA BASE, NO SE CONVIERTE LO QUE SE MUESTRA ───────────────
 *
 * Antes esto llamaba a `convertirUnidadPedido` sobre `linea.cantidadPedido`, o
 * sea sobre el valor que estaba en pantalla, mientras el PRECIO se recalculaba
 * desde el papel. Los dos lados salían de fuentes distintas y podían separarse:
 * una interpretación equivocada quedaba adentro de la cantidad y cada toque la
 * arrastraba, mientras el precio volvía a nacer limpio del subtotal.
 *
 * Ahora las dos salen de `cantidadBaseUnidades`, que se calculó una sola vez
 * cuando se leyó el papel. Alternar diez veces devuelve exactamente los mismos
 * números que la primera, porque ninguna vuelta parte de la anterior.
 *
 * @returns la línea convertida, o `{ requiereConfirmacion: true, ... }` cuando
 *   la base no da bultos enteros. NO se redondea solo: 47 unidades no son ni 4
 *   ni 5 bultos, y elegir uno cambia lo que se le pide al proveedor.
 */
export function cambiarUnidadDeLinea(
  linea,
  producto,
  { unidadDestino, facturaPor = "UNIDAD", hayColumnaSubtotal = true, redondear = false } = {}
) {
  const factor = factorDe(producto);
  const destino = unidadDestino === "UNIDAD" ? "UNIDAD" : "BULTO";

  const representacion = representarPedido({
    cantidadBaseUnidades: linea?.cantidadBaseUnidades,
    subtotalPapel: linea?.subtotalPapelOriginal,
    unidadPedido: destino,
    unidadesPorBultoErp: factor,
  });

  // Sin base no se puede derivar nada: es una línea cuya cantidad del papel
  // todavía no se sabe qué significa. Se deja como está y se recalcula el
  // precio, que es lo único que sí se puede afirmar.
  if (!representacion) {
    return recalcularPrecioDeLinea(linea, producto, { facturaPor, hayColumnaSubtotal });
  }

  if (representacion.requiereConfirmacion && !redondear) {
    return {
      ...linea,
      requiereConfirmacionDeUnidad: true,
      conversionPendiente: {
        desde: linea?.unidadPedido === "UNIDAD" ? "UNIDAD" : "BULTO",
        hacia: destino,
        unidades: representacion.unidades,
        bultos: representacion.bultos,
        factor: representacion.factor,
      },
    };
  }

  // Redondear hacia arriba cambia LA CANTIDAD PEDIDA, no la lectura del papel:
  // se le piden más unidades al proveedor de las que traía el renglón. Por eso
  // la base no se toca y el subtotal deja de cerrar a propósito — el candado de
  // magnitud lo va a informar, que es lo correcto: es una diferencia real.
  const cantidad = representacion.requiereConfirmacion
    ? representacion.bultos
    : representacion.cantidad;

  return {
    ...recalcularPrecioDeLinea(
      { ...linea, cantidadPedido: cantidad, unidadPedido: destino },
      producto,
      { facturaPor, hayColumnaSubtotal }
    ),
    requiereConfirmacionDeUnidad: false,
    conversionPendiente: null,
    cantidadRedondeadaHaciaArriba: representacion.requiereConfirmacion === true,
  };
}

/**
 * CAMBIAR QUÉ SIGNIFICA LA CANTIDAD DEL PAPEL.
 *
 * Es la corrección de la LECTURA, no de cómo se guarda, y por eso recalcula la
 * base: es el único punto donde `cantidadBaseUnidades` puede cambiar después de
 * la lectura inicial. Todo lo demás deriva.
 *
 * Queda `unidadPapelConfirmada: true` porque lo contestó una persona, y ese
 * hecho es el que después se puede aprender como presentación del proveedor. La
 * evidencia por precio nunca lo pone en true: proponer no es decidir.
 */
export function cambiarUnidadDelPapel(
  linea,
  producto,
  { unidadPapel, facturaPor = "UNIDAD", hayColumnaSubtotal = true } = {}
) {
  const factor = factorDe(producto);
  const unidad = unidadPapel === "UNIDAD" || unidadPapel === "BULTO" ? unidadPapel : null;
  const base = cantidadBaseEnUnidades({
    cantidadPapel: linea?.cantidadPapel,
    unidadPapel: unidad,
    unidadesPorBultoErp: factor,
  });

  const conBaseNueva = {
    ...linea,
    unidadCantidadPapel: unidad,
    unidadPapelConfirmada: unidad !== null,
    origenUnidadPapel: unidad === null ? linea?.origenUnidadPapel : ORIGEN_UNIDAD_PAPEL.PRESENTACION_CONFIRMADA,
    cantidadBaseUnidades: base,
    preguntaUnidadPapel: null,
  };

  // La unidad del pedido se conserva; lo que cambia es de dónde salen sus
  // números. Se pasa por el mismo camino que cualquier otro cambio de unidad
  // para que no haya una segunda regla de derivación.
  return cambiarUnidadDeLinea(conBaseNueva, producto, {
    unidadDestino: conBaseNueva.unidadPedido,
    facturaPor,
    hayColumnaSubtotal,
  });
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
