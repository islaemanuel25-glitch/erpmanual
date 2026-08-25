const MAX_LINEAS = 500;

export function extraerFilasExcel(filas = []) {
  const limiteCabecera = Math.min(filas.length, 30);
  for (let i = 0; i < limiteCabecera; i++) {
    const indices = identificarColumnas(filas[i] || []);
    if (indices.cantidad == null || (indices.codigo == null && indices.descripcion == null)) continue;

    const lineas = [];
    for (let r = i + 1; r < filas.length && lineas.length < MAX_LINEAS; r++) {
      const fila = filas[r] || [];
      const codigo = texto(fila[indices.codigo]);
      const descripcion = texto(fila[indices.descripcion]);
      const cantidadLeida = cantidadYUnidad(fila[indices.cantidad], fila[indices.unidad]);
      if ((!codigo && !descripcion) || cantidadLeida.cantidad == null) continue;
      if (/^(subtotal|total)$/i.test(descripcion.trim())) continue;
      lineas.push({
        filaOrigen: r + 1,
        codigo: codigo || null,
        descripcion: descripcion || codigo || "Sin descripción",
        cantidad: cantidadLeida.cantidad,
        unidad: cantidadLeida.unidad,
        precioUnitario: numero(fila[indices.precio]),
      });
    }
    if (lineas.length) {
      return { ok: true, documento: { numeroPedido: null, fecha: null, lineas } };
    }
  }
  return { ok: false, codigo: "COLUMNAS_NO_ENCONTRADAS", error: "No se encontraron filas de productos utilizables." };
}

function identificarColumnas(celdas) {
  const salida = {};
  celdas.forEach((celda, indice) => {
    const h = normalizarEncabezado(celda);
    if (!h) return;
    if (salida.codigo == null && /^(articulo|producto|codigo|cod art|cod articulo|item|sku)$/.test(h)) salida.codigo = indice;
    if (salida.cantidad == null && /^(cantidad|cant|qty|pedido|cantidad pedida)$/.test(h)) salida.cantidad = indice;
    if (salida.descripcion == null && /^(descripcion|producto descripcion|detalle|nombre)$/.test(h)) salida.descripcion = indice;
    if (salida.unidad == null && /^(unidad|unid|um|u m|unidad medida)$/.test(h)) salida.unidad = indice;
    if (salida.precio == null && /^(precio unitario|precio unit|precio|costo unitario|costo)$/.test(h)) salida.precio = indice;
  });
  return salida;
}

function cantidadYUnidad(valorCantidad, valorUnidad) {
  const unidadSeparada = texto(valorUnidad).toUpperCase() || null;
  if (typeof valorCantidad === "number") {
    return { cantidad: Number.isFinite(valorCantidad) ? valorCantidad : null, unidad: unidadSeparada };
  }
  const crudo = texto(valorCantidad).replace(",", ".");
  const match = crudo.match(/(-?\d+(?:\.\d+)?)\s*([A-Za-zÁÉÍÓÚáéíóú.]+)?/);
  return {
    cantidad: match ? Number(match[1]) : null,
    unidad: unidadSeparada || match?.[2]?.toUpperCase() || null,
  };
}

function normalizarEncabezado(valor) {
  return texto(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function texto(valor) {
  if (valor === null || valor === undefined || typeof valor === "boolean") return "";
  return String(valor).trim();
}

function numero(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(typeof valor === "string" ? valor.replace(",", ".") : valor);
  return Number.isFinite(n) ? n : null;
}
