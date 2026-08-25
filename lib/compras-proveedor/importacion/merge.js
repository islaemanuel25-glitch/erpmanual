export function sumarCantidadesImportadas({ actual, importada, factorPack } = {}) {
  const factor = Math.max(1, Math.floor(Number(factorPack) || 1));
  const cantidadActual = Math.floor(Number(actual?.cantidad) || 0);
  const cantidadNueva = Math.floor(Number(importada?.cantidad) || 0);
  const unidadActual = actual?.unidad === "UNIDAD" ? "UNIDAD" : "BULTO";
  const unidadNueva = importada?.unidad === "UNIDAD" ? "UNIDAD" : "BULTO";

  if (unidadActual === unidadNueva) {
    return { cantidad: cantidadActual + cantidadNueva, unidad: unidadActual };
  }
  if (unidadActual === "UNIDAD") {
    return { cantidad: cantidadActual + cantidadNueva * factor, unidad: "UNIDAD" };
  }
  if (cantidadNueva % factor === 0) {
    return { cantidad: cantidadActual + cantidadNueva / factor, unidad: "BULTO" };
  }
  return { cantidad: cantidadActual * factor + cantidadNueva, unidad: "UNIDAD" };
}
