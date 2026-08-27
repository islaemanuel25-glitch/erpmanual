import { naturalezaLinea } from "../calculoPedido.js";
import { baseDeProducto, convertirCostoDeEscala } from "./merge.js";
import { ORIGEN_PRECIO, precioElegido } from "./precios.js";

const numero = (valor) => {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Lo que este renglón le enseña al proveedor.
 *
 * Viaja también CÓMO se llegó al producto y SI una persona lo eligió. Sin esos
 * dos datos, el servidor no puede distinguir una deducción del motor de una
 * decisión humana, y guardar todo como humano vuelve irrevocable justamente lo
 * que hay que poder revocar.
 */
const aliasesDeLinea = (linea) => [{
  codigoProveedor: linea?.codigo || null,
  descripcionProveedor: linea?.descripcion || null,
  metodoDeteccion: linea?.origenVinculo || null,
  productoElegidoAMano: linea?.productoElegidoAMano === true,
  // La presentación que declara el papel para este renglón. Es lo único que el
  // ERP no puede deducir solo, y es lo que después da el factor de conversión.
  presentacionProveedor: linea?.unidad || null,
}];

const unirAliases = (anteriores = [], nuevos = []) => {
  const salida = new Map();
  for (const alias of [...anteriores, ...nuevos]) {
    const clave = `${alias?.codigoProveedor || ""}\u0000${alias?.descripcionProveedor || ""}`;
    salida.set(clave, alias);
  }
  return [...salida.values()];
};

/**
 * Arma el cuerpo de crear/aplicar sin perder precio ni memoria del proveedor.
 *
 * Si dos renglones del papel terminan en el mismo producto, se consolidan. El
 * costo resultante es un promedio ponderado, no "el primero" ni "el último":
 * así el subtotal de los renglones originales se conserva exactamente. Cuando
 * las unidades difieren, ambas cantidades y ambos costos se llevan a UNIDAD
 * usando la misma conversión canónica de Compras.
 */
export function consolidarLineasImportadas({ lineas = [], productosPorId } = {}) {
  const salida = new Map();

  for (const linea of lineas) {
    const producto = productosPorId?.get?.(String(linea.productoLocalId));
    if (!producto) continue;

    const unidad = linea.unidadPedido === "UNIDAD" ? "UNIDAD" : "BULTO";
    const cantidad = Number(linea.cantidadPedido);
    const costo = precioElegido({ precios: linea, origen: linea.origenPrecio });
    const item = {
      productoLocalId: Number(linea.productoLocalId),
      cantidad,
      unidad,
      precioCosto: numero(costo),
      origenPrecio: linea.origenPrecio || ORIGEN_PRECIO.SISTEMA,
      aliases: aliasesDeLinea(linea),
    };

    const anterior = salida.get(item.productoLocalId);
    if (!anterior) {
      salida.set(item.productoLocalId, item);
      continue;
    }

    const esPack = naturalezaLinea(baseDeProducto(producto)) === "PACK";
    const factor = esPack ? Math.max(1, Math.floor(Number(producto.factor_pack) || 1)) : 1;
    const unidadFinal = anterior.unidad === item.unidad ? item.unidad : "UNIDAD";
    const cantidadAnterior = unidadFinal === anterior.unidad
      ? anterior.cantidad
      : anterior.cantidad * factor;
    const cantidadNueva = unidadFinal === item.unidad
      ? item.cantidad
      : item.cantidad * factor;
    const costoAnterior = numero(anterior.precioCosto) === null
      ? null
      : convertirCostoDeEscala({
          costo: anterior.precioCosto,
          desde: anterior.unidad,
          hacia: unidadFinal,
          producto,
        });
    const costoNuevo = numero(item.precioCosto) === null
      ? null
      : convertirCostoDeEscala({
          costo: item.precioCosto,
          desde: item.unidad,
          hacia: unidadFinal,
          producto,
        });
    const cantidadTotal = cantidadAnterior + cantidadNueva;
    const precioCosto = costoAnterior === null || costoNuevo === null
      ? costoAnterior ?? costoNuevo
      : ((cantidadAnterior * costoAnterior) + (cantidadNueva * costoNuevo)) / cantidadTotal;

    salida.set(item.productoLocalId, {
      ...anterior,
      cantidad: cantidadTotal,
      unidad: unidadFinal,
      precioCosto,
      origenPrecio:
        anterior.origenPrecio === ORIGEN_PRECIO.PAPEL || item.origenPrecio === ORIGEN_PRECIO.PAPEL
          ? ORIGEN_PRECIO.PAPEL
          : ORIGEN_PRECIO.SISTEMA,
      aliases: unirAliases(anterior.aliases, item.aliases),
    });
  }

  return [...salida.values()];
}
