const MAX_LINEAS = 500;

// El renglón de pie que cierra el documento. Se saltea como LÍNEA —no es un
// producto— pero su importe sí se usa: es el total contra el que se verifica la
// suma de los subtotales.
const ES_RENGLON_DE_PIE = /^(sub\s*total|subtotal|total|total general|iva|impuestos?|percepcion(es)?)$/i;

export function extraerFilasExcel(filas = []) {
  const limiteCabecera = Math.min(filas.length, 30);
  for (let i = 0; i < limiteCabecera; i++) {
    const indices = identificarColumnas(filas[i] || []);
    if (indices.cantidad == null || (indices.codigo == null && indices.descripcion == null)) continue;

    // ── EL BOOLEANO ACÁ SE OBSERVA, NO SE PREGUNTA ─────────────────────────
    //
    // En la lectura visual hay que preguntarle al modelo si la tabla tiene
    // columna de subtotal, porque el subtotal se puede calcular y un campo
    // calculable que hay que completar es una orden de inventar. En un Excel no
    // hace falta preguntar nada: la columna está en el encabezado o no está, y
    // eso ya se resolvió arriba. Es el mismo dato, obtenido de la única forma
    // que no puede mentir.
    const hayColumnaSubtotal = indices.subtotal != null;
    const hayColumnaBonificacion = indices.bonificacion != null;

    const lineas = [];
    let totalDocumento = null;
    for (let r = i + 1; r < filas.length && lineas.length < MAX_LINEAS; r++) {
      const fila = filas[r] || [];
      const codigo = texto(fila[indices.codigo]);
      const descripcion = texto(fila[indices.descripcion]);

      if (ES_RENGLON_DE_PIE.test(descripcion.trim()) || ES_RENGLON_DE_PIE.test(codigo.trim())) {
        // Solo el TOTAL cierra el documento; un subtotal parcial o una línea de
        // IVA no. Y se toma el último que aparezca: si hay "subtotal" y después
        // "total", el que vale es el segundo.
        if (/^total( general)?$/i.test(descripcion.trim()) || /^total( general)?$/i.test(codigo.trim())) {
          const valor = numero(fila[indices.subtotal]) ?? numero(fila[indices.precio]) ?? ultimoNumero(fila);
          if (valor !== null) totalDocumento = valor;
        }
        continue;
      }

      const cantidadLeida = cantidadYUnidad(fila[indices.cantidad], fila[indices.unidad]);
      if ((!codigo && !descripcion) || cantidadLeida.cantidad == null) continue;
      lineas.push({
        filaOrigen: r + 1,
        codigo: codigo || null,
        descripcion: descripcion || codigo || "Sin descripción",
        cantidad: cantidadLeida.cantidad,
        unidad: cantidadLeida.unidad,
        precioUnitario: numero(fila[indices.precio]),
        bonificacionPct: hayColumnaBonificacion ? porcentaje(fila[indices.bonificacion]) : null,
        subtotal: hayColumnaSubtotal ? numero(fila[indices.subtotal]) : null,
      });
    }
    if (lineas.length) {
      return {
        ok: true,
        documento: {
          numeroPedido: null,
          fecha: null,
          hayColumnaSubtotal,
          hayColumnaBonificacion,
          // Que el total esté o no se sabe por haberlo encontrado, no por
          // preguntárselo a nadie.
          hayTotalImpreso: totalDocumento !== null,
          totalDocumento,
          lineas,
        },
      };
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
    if (salida.precio == null && /^(precio unitario|precio unit|precio|precio lista|precio de lista|costo unitario|costo)$/.test(h)) salida.precio = indice;
    // Los nombres que una lista de proveedor le pone a estas dos columnas. No
    // hay ninguno de un proveedor concreto: son los genéricos del rubro.
    if (salida.bonificacion == null && /^(bonificacion|bonif|bonificacion 1|descuento|descuento 1|desc|dto|dto 1|dcto|porcentaje descuento)$/.test(h)) salida.bonificacion = indice;
    if (salida.subtotal == null && /^(subtotal|sub total|importe|importe renglon|total renglon|total linea|total item|monto)$/.test(h)) salida.subtotal = indice;
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

/**
 * Una bonificación de una celda de Excel.
 *
 * Una hoja puede tener el 14 % escrito como `14` o como `0,14` con formato de
 * porcentaje —Excel guarda el segundo como número—. Se interpreta como fracción
 * SOLO si es menor a 1: un `0,14` es 14 %, y un `14` es 14 %. El caso que queda
 * afuera a propósito es una bonificación real menor al 1 %, que se leería como
 * si fuera de decenas; no se puede distinguir de la fracción sin mirar el
 * formato de la celda, así que se elige el caso frecuente y se deja dicho.
 */
function porcentaje(valor) {
  const n = numero(valor);
  if (n === null) return null;
  // El redondeo no es cosmético: `0.14 * 100` da 14.000000000000002 en coma
  // flotante, y ese valor viaja hasta el cálculo del precio. Se cierra a seis
  // decimales, que alcanza para cualquier bonificación real.
  if (n > 0 && n < 1) return Number((n * 100).toFixed(6));
  return n;
}

/** El último número de una fila, para el renglón de total sin columna clara. */
function ultimoNumero(fila) {
  for (let i = fila.length - 1; i >= 0; i--) {
    const n = numero(fila[i]);
    if (n !== null) return n;
  }
  return null;
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
