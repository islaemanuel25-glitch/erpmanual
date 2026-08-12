// lib/compras-proveedor/comprobante/textosDeFila.js
//
// QUÉ DICE UNA FILA, Y DÓNDE LO DICE.
//
// ── LA CONTRADICCIÓN QUE ESTO VINO A SACAR ─────────────────────────────────
//
// La misma fila decía tres cosas sobre lo mismo, dos de ellas opuestas:
//
//   · "Pedido —"                            (la grilla de números)
//   · "Sin línea del pedido: vinculala"     (el bloque de recepción)
//   · "Está en el pedido"                   (la tira de aviso)
//
// Las tres salían de lugares distintos que no se hablaban. Y la tercera era la
// peor: "Está en el pedido" describe DE DÓNDE SALIÓ EL CANDIDATO sugerido, no
// cómo está la línea — pero puesta arriba se leía como el estado.
//
// Acá se separan los dos hechos de una vez:
//
//   `estadoDeLaFila`      → CÓMO ESTÁ la línea. Una palabra, un solo lugar.
//   `origenDelCandidato`  → DE DÓNDE salió lo que se sugiere. Va pegado al
//                           candidato, en letra chica, y nunca arriba.
//
// ── Y NINGÚN VALOR VACÍO ───────────────────────────────────────────────────
//
// Los números se arman como pedazos con su etiqueta PEGADA al valor, y el que no
// existe no se arma. Antes había una fila de encabezados arriba y los valores
// abajo: cuando faltaba uno quedaba un guion suelto sin nombre, y en 360 los
// encabezados se separaban de los valores.

export const ESTADO_FILA = Object.freeze({
  VINCULADO: "VINCULADO",
  VINCULADO_SOLO: "VINCULADO_SOLO",
  SIN_VINCULAR: "SIN_VINCULAR",
});

/**
 * CÓMO ESTÁ LA LÍNEA. Es lo único que habla del estado, y se dice una vez.
 *
 * Ojo con lo que NO decide: que la búsqueda no haya encontrado candidatos no es
 * un estado distinto de la línea —sigue sin vincular—, es un resultado de la
 * búsqueda y se cuenta al lado del candidato.
 */
export function estadoDeLaFila(f) {
  if (f?.productoLocalId != null) {
    return { codigo: ESTADO_FILA.VINCULADO, palabra: "Vinculado", tono: "sunmi-text-success" };
  }
  if (f?.vinculadaSola === true) {
    return { codigo: ESTADO_FILA.VINCULADO_SOLO, palabra: "Vinculado solo", tono: "sunmi-text-success" };
  }
  return { codigo: ESTADO_FILA.SIN_VINCULAR, palabra: "Sin vincular", tono: "sunmi-text-warning" };
}

/**
 * DE DÓNDE SALIÓ el candidato. Va pegado al candidato, nunca arriba.
 *
 * El del catálogo se dice con tono de aviso a propósito: es el único que sale de
 * fuera de lo que se le compra a este proveedor, y confirmarlo sin mirar es cómo
 * un costo termina en el producto equivocado.
 */
export function origenDelCandidato(origen) {
  switch (origen) {
    case "LINEA_DEL_PEDIDO":
      return { texto: "de tu pedido", tono: "sunmi-text-muted" };
    case "UNIVERSO_PROVEEDOR":
      return { texto: "de lo que le comprás a este proveedor", tono: "sunmi-text-muted" };
    case "ERP_COMPLETO":
      return { texto: "del catálogo, no de este proveedor", tono: "sunmi-text-warning" };
    case "CODIGO_PROVEEDOR":
      return { texto: "por el código del proveedor", tono: "sunmi-text-muted" };
    case "ALIAS_DESCRIPCION":
      return { texto: "por un nombre ya asociado antes", tono: "sunmi-text-muted" };
    default:
      return null;
  }
}

/**
 * QUÉ PIDE ESTA FILA, y si arranca abierta.
 *
 * ── LA FORMA NO CAMBIA, EL CONTENIDO SÍ ────────────────────────────────────
 *
 * Es la misma decisión que `formaDelPanel` en la conciliación de listas, y por
 * el mismo motivo, que está escrito allá: que la forma sea siempre la misma es
 * lo que permite mirar veintiuna filas distintas sin volver a aprender dónde
 * está cada cosa.
 *
 * Vive acá, fuera del componente, para que la regla se pueda ejercer sin
 * dibujar nada — y para que "arranca abierta" no quede escondida en un JSX.
 *
 * ── EL ORDEN DE LAS PREGUNTAS NO ES LIBRE ──────────────────────────────────
 *
 * Sin producto no hay unidad que deducir ni costo que comparar: la primera
 * pregunta tapa a las otras dos. Y la unidad va antes que el precio porque el
 * precio que se propone DEPENDE de la unidad — preguntarlo al revés sería pedir
 * que se acepte un número que todavía puede cambiar.
 */
export const PIDE = Object.freeze({
  PRODUCTO: "PRODUCTO",
  UNIDAD: "UNIDAD",
  PRECIO: "PRECIO",
});

export function formaDeLaFila(f) {
  const estado = estadoDeLaFila(f);

  if (estado.codigo === ESTADO_FILA.SIN_VINCULAR) {
    return { pide: PIDE.PRODUCTO, abierta: true, porque: "Falta decir qué producto es." };
  }
  if (f?.unidad?.requiereDecision === true) {
    return { pide: PIDE.UNIDAD, abierta: true, porque: "Falta saber si la factura cobra por unidad o por bulto." };
  }
  if (f?.precio?.decision?.ofreceAceptar === true) {
    return { pide: PIDE.PRECIO, abierta: true, porque: "El precio subió y espera un sí o un no." };
  }
  // Resuelta. Se dibuja cerrada: la pantalla muestra sola lo que necesita
  // atención, y lo demás se abre si alguien quiere revisarlo.
  return { pide: null, abierta: false, porque: null };
}

// AUSENTE NO ES CERO, y acá costó la quinta vez.
//
// `Number(null)` es 0 y `Number.isFinite(0)` es verdadero, así que una fila SIN
// línea del pedido armaba el pedazo "Pedido 0 × $0.00" — un dato inventado,
// justo en las filas donde el problema era que se afirmaban cosas del pedido que
// no existían. Se vio en la captura con las 21 líneas reales, no leyendo.
//
// El descarte va ANTES de convertir: nulo, indefinido y cadena vacía son
// ausencia. El cero que sí llega como número se muestra, porque un cero real es
// un dato.
const ausente = (n) => n === null || n === undefined || n === "";

/** Un número como lo escribiría una persona, o null si no hay ninguno. */
const limpio = (n) => {
  if (ausente(n)) return null;
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(3)));
};
const pesos = (n) => {
  if (ausente(n)) return null;
  const v = Number(n);
  return Number.isFinite(v) ? `$${v.toFixed(2)}` : null;
};

/**
 * Los números de la fila, cada uno con su etiqueta PEGADA.
 *
 * El que no existe NO SE ARMA. Así no hay forma de que quede un guion sin
 * nombre: si no hay línea del pedido, el pedazo "Pedido" simplemente no está.
 */
export function numerosDeLaFila(f) {
  const partes = [];

  const cantPedida = limpio(f?.cantidadPedida);
  const costoCat = pesos(f?.costoCatalogo);
  if (cantPedida != null || costoCat != null) {
    partes.push({
      clave: "pedido",
      etiqueta: "Pedido",
      valor: [cantPedida, costoCat].filter(Boolean).join(" × "),
    });
  }

  const cantFactura = limpio(f?.cantidad);
  const costoFac = pesos(f?.costoFactura);
  if (cantFactura != null || costoFac != null) {
    partes.push({
      clave: "factura",
      etiqueta: "Factura",
      valor: [cantFactura, costoFac].filter(Boolean).join(" × "),
    });
  }

  const sub = pesos(f?.subtotal);
  if (sub) partes.push({ clave: "subtotal", etiqueta: "Subtotal", valor: sub });

  return {
    partes,
    // ── LO QUE VINO SIN HABERSE PEDIDO ────────────────────────────────
    //
    // Una línea vinculada a un producto pero SIN línea del pedido es el
    // proveedor facturando algo que no se encargó. Es información real y antes
    // se perdía entre guiones: ahora se dice, en ámbar, al lado de los números.
    noEstabaEnElPedido: f?.productoLocalId != null && f?.pedidoDetalleId == null,
  };
}
