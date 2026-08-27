import { buscarCandidatos } from "../comprobante/vinculo.js";
import { buscarCandidatosDeProveedor } from "@/lib/proveedores/identidad/motorCandidatos";
import { proponerCantidadPedido } from "./cantidad.js";
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
    const propuesta = automatico
      ? proponerCantidadPedido({
          cantidad: linea.cantidad,
          unidadFuente: linea.unidad,
          producto: automatico,
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
