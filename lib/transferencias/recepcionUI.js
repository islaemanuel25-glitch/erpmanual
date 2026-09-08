// lib/transferencias/recepcionUI.js
//
// LAS DECISIONES DE LA PANTALLA DE RECEPCIÓN, FUERA DE LA PANTALLA.
//
// ── POR QUÉ ESTO NO VIVE EN EL COMPONENTE ─────────────────────────────────
//
// La recepción se dibuja de dos formas —cards en el teléfono, tabla en el
// escritorio— y las dos tienen que decidir LO MISMO: qué motivos ofrecer, si una
// línea es faltante o excedente, si se puede agregar un producto, y qué cuerpo
// exacto se le manda al servidor. Si cada presentación decidiera por su cuenta,
// la primera vez que una cambie el teléfono y el escritorio van a discrepar, y
// nadie se va a enterar hasta que alguien reciba de más en el que quedó atrás.
//
// Además, nada de esto necesita un DOM para ser cierto, así que se puede probar
// como función pura. Los candados de esta tanda viven casi todos acá.
//
// ── LO QUE ACÁ NO SE HACE ─────────────────────────────────────────────────
//
// Matemática nueva. La conversión BULTO→unidades sale de `aUnidadesFisicas`, la
// misma que usa `validarDetalleRecepcion` en el servidor. Si esta pantalla
// tuviera su propia versión, el día que el factor cambie de lugar habría dos
// respuestas para la misma pregunta — y una de las dos escribe stock.
//
// Y la validación de la unidad sale de `resolverUnidadEnviada`, la misma que el
// servidor aplica sobre `linea-recepcion`. Acá se usa para no MANDAR un pedido
// que ya se sabe que va a fallar, no para reemplazar la del servidor: el
// servidor sigue siendo el que manda.

import {
  ERRORES_RECEPCION,
  aUnidadesFisicas,
  resolverUnidadEnviada,
} from "./recepcion.js";

/** El estado de una línea, mirado desde la recepción. */
export const ESTADO_LINEA = Object.freeze({
  SIN_RECEPCION: "sinRecepcion",
  EXACTO: "exacto",
  FALTANTE: "faltante",
  EXCEDENTE: "excedente",
});

function num(v) {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * ¿Qué le pasó a esta línea?
 *
 * `recibida = null` es "todavía no se contó" y NO es lo mismo que 0. El 0 es un
 * dato: no llegó ninguna unidad. Colapsarlos hacía que un 0 guardado reapareciera
 * como el total enviado, y eso ya costó una corrección en esta misma pantalla.
 */
export function estadoDeLinea({ enviada, recibida } = {}) {
  if (recibida === null || recibida === undefined || recibida === "") {
    return ESTADO_LINEA.SIN_RECEPCION;
  }
  const d = num(recibida) - num(enviada);
  if (d === 0) return ESTADO_LINEA.EXACTO;
  return d < 0 ? ESTADO_LINEA.FALTANTE : ESTADO_LINEA.EXCEDENTE;
}

/**
 * La diferencia CON SIGNO. Positiva = llegó de más.
 *
 * Devuelve `null` cuando todavía no hay recepción cargada, por el mismo motivo
 * de arriba: un `0` acá significaría "llegó exactamente lo enviado".
 */
export function diferenciaDeLinea({ enviada, recibida } = {}) {
  if (recibida === null || recibida === undefined || recibida === "") return null;
  return num(recibida) - num(enviada);
}

/**
 * El signo que se antepone al número.
 *
 * Solo el `+`: el menos ya lo trae el número formateado, y ponérselo de nuevo
 * daría "--5". Existe como función y no como un `? :` suelto en cada
 * presentación porque son dos —card y tabla— y tienen que decir lo mismo.
 */
export function signoDeDiferencia(diff) {
  return typeof diff === "number" && diff > 0 ? "+" : "";
}

// ── MOTIVOS ────────────────────────────────────────────────────────────────
//
// Hasta acá la lista era una sola —Faltante, Producto dañado, Otro— porque
// recibir de más no se podía. Con el excedente permitido, ofrecer "Faltante"
// para explicar que llegaron 5 de más no es un detalle de redacción: es pedirle
// a alguien que clasifique un sobrante como una falta, y ese dato después se
// lee en un reporte.
//
// El backend NO cambia: sigue exigiendo que haya un motivo cuando hay
// diferencia, y no valida cuál. La UI elige cuáles OFRECE según el signo. No se
// inventa una validación nueva del lado del servidor.

export const MOTIVOS_FALTANTE = Object.freeze([
  { value: "Faltante", label: "Faltante" },
  { value: "Producto dañado", label: "Producto dañado" },
  { value: "Otro", label: "Otro (especificar)" },
]);

export const MOTIVOS_SOBRANTE = Object.freeze([
  { value: "Sobrante", label: "Sobrante" },
  { value: "Otro", label: "Otro (especificar)" },
]);

/**
 * Los motivos que corresponden a esta diferencia.
 *
 * Sin diferencia devuelve lista vacía: no hay nada que explicar, y el propio
 * llamador ya limpia el motivo cuando las cantidades se igualan.
 */
export function motivosParaDiferencia({ enviada, recibida } = {}) {
  const estado = estadoDeLinea({ enviada, recibida });
  if (estado === ESTADO_LINEA.FALTANTE) return MOTIVOS_FALTANTE;
  if (estado === ESTADO_LINEA.EXCEDENTE) return MOTIVOS_SOBRANTE;
  return [];
}

/**
 * ¿El motivo que hay guardado sigue teniendo sentido con esta diferencia?
 *
 * Sirve para el caso real: alguien cargó 8 sobre 10, eligió "Faltante", y
 * después corrige a 15. El motivo viejo quedaría diciendo lo contrario de lo que
 * pasó. Devuelve false y el llamador lo limpia.
 */
export function motivoSigueSiendoValido({ enviada, recibida, motivoPrincipal } = {}) {
  if (!motivoPrincipal) return true;
  const validos = motivosParaDiferencia({ enviada, recibida });
  if (validos.length === 0) return false;
  return validos.some((m) => m.value === motivoPrincipal);
}

// ── AGREGAR UN PRODUCTO QUE NO ESTABA EN EL REMITO ─────────────────────────

/**
 * Las unidades en las que se puede haber contado ESTE producto.
 *
 * BULTO solo aparece si el producto tiene un factor de pack mayor que 1: ofrecer
 * "BULTO · x1" no significa nada y solo agrega una opción que no cambia el
 * resultado.
 *
 * **La lista NO trae una opción preseleccionada, y eso es a propósito.** Ver
 * `validarLineaNueva`.
 */
export function opcionesDeUnidad(producto = {}) {
  const factor = Number(producto?.factorPack || 1);
  const opciones = [{ clave: "UNIDAD", texto: "UNIDAD" }];
  if (factor > 1) {
    opciones.push({ clave: "BULTO", texto: `BULTO · x${factor}` });
  }
  return opciones;
}

/**
 * CUÁNTAS UNIDADES FÍSICAS ENTRAN. Informativo y nada más.
 *
 * Se muestra debajo del campo para que el operador vea que 2 bultos de 6 son 12
 * unidades ANTES de agregar. Es la mitad que evita el error caro: contar en
 * bultos creyendo que se cuenta en unidades.
 *
 * **Este número NO se le manda al servidor.** Ver `cuerpoLineaNueva`.
 *
 * Devuelve `null` cuando no hay nada que aclarar —unidad UNIDAD, o factor 1—
 * porque "Ingreso físico: 3 unidades" debajo de un campo que dice 3 es ruido.
 */
export function previsualizarIngresoFisico({ cantidad, unidad, factorPack } = {}) {
  const c = Number(cantidad);
  if (!Number.isFinite(c) || c <= 0) return null;
  if (unidad !== "BULTO") return null;
  const f = Number(factorPack || 1);
  if (!(f > 1)) return null;
  return aUnidadesFisicas({ cantidad: c, unidad, factorPack: f });
}

/**
 * EL CUERPO EXACTO DEL POST, Y POR QUÉ ES ESTE Y NO OTRO.
 *
 * ── LA DOBLE CONVERSIÓN ───────────────────────────────────────────────────
 *
 * Se manda `recibido: 2` y `unidadEnviada: "BULTO"`. **NO** se manda 12.
 *
 * El servidor aplica el factor UNA sola vez, en `aUnidadesFisicas`, al calcular
 * lo que entra al destino y lo que se le descuenta al origen. Si la pantalla
 * mandara ya convertido, el servidor volvería a multiplicar y un pedido de 2
 * bultos de 6 movería 72 unidades en vez de 12. Eso es stock inventado, en las
 * dos puntas, y no deja rastro de por qué.
 *
 * La preview de arriba existe para que el operador VEA las 12 sin que las 12
 * viajen. Son dos números con dos destinos distintos y por eso están en dos
 * funciones distintas.
 *
 * ── LA UNIDAD NO TIENE DEFAULT ────────────────────────────────────────────
 *
 * Si no la eligió, esto devuelve `ok: false` y **no hay POST**. No se elige por
 * el operador ni "UNIDAD" ni "BULTO": el mismo número significa cosas distintas
 * según cuál sea, y una línea agregada descuenta del origen sin ningún envío
 * contra el cual contrastar la diferencia. Es el mismo candado que el servidor
 * ya tiene; acá se repite para no mandar un pedido que se sabe que va a fallar y
 * para poder decirlo con un mensaje de pantalla.
 *
 * @returns {{ok:true, cuerpo:object} | {ok:false, error:string, mensaje:string}}
 */
export function validarLineaNueva({
  transferenciaId,
  producto,
  unidadEnviada,
  recibido,
} = {}) {
  const productoLocalId = Number(producto?.productoLocalId || 0);
  if (!productoLocalId) {
    return {
      ok: false,
      error: "PRODUCTO_NO_ELEGIDO",
      mensaje: "Elegí primero el producto que llegó.",
    };
  }

  const uni = resolverUnidadEnviada(unidadEnviada);
  if (!uni.ok) {
    return {
      ok: false,
      error: uni.error,
      mensaje:
        uni.error === ERRORES_RECEPCION.UNIDAD_AUSENTE
          ? "Elegí cómo lo contaste: en UNIDAD o en BULTO. La misma cantidad significa distinto según cuál sea."
          : "Unidad desconocida: se esperaba BULTO o UNIDAD.",
    };
  }

  const cantidad = Number(recibido);
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    return {
      ok: false,
      error: "CANTIDAD_INVALIDA",
      mensaje: "Ingresá cuántos llegaron. Tiene que ser un número mayor que cero.",
    };
  }

  return {
    ok: true,
    cuerpo: {
      transferenciaId: Number(transferenciaId),
      productoLocalId,
      unidadEnviada: uni.unidad,
      // EN LA UNIDAD ELEGIDA. Sin multiplicar por el factor: ver arriba.
      recibido: cantidad,
    },
  };
}

/**
 * El cuerpo del DELETE. Existe por simetría con el de arriba: las dos rutas se
 * llaman desde dos presentaciones y ninguna arma el objeto a mano.
 */
export function cuerpoQuitarLinea({ transferenciaId, detalleId } = {}) {
  return {
    transferenciaId: Number(transferenciaId),
    detalleId: Number(detalleId),
  };
}

/**
 * ¿ESTA LÍNEA SE PUEDE QUITAR?
 *
 * Solo las agregadas durante la recepción, y solo mientras la recepción esté
 * abierta. Una línea del REMITO no se borra nunca desde acá: haría desaparecer
 * mercadería que sí salió del origen, con su tránsito reservado para siempre. Si
 * no llegó nada de esa línea el camino es `recibido = 0`, que la aritmética ya
 * contempla.
 *
 * El servidor lo vuelve a comprobar —`LINEA_DEL_REMITO_NO_SE_BORRA`—; esto
 * decide si la acción siquiera se DIBUJA, que es lo que evita que alguien la
 * toque y reciba un error que no puede resolver.
 */
export function sePuedeQuitarLinea({ linea, puedeRecibir } = {}) {
  return puedeRecibir === true && linea?.agregadoEnRecepcion === true;
}

// ── RECONCILIAR LO QUE EL SERVIDOR MANDA CON LO QUE EL OPERADOR ESCRIBIÓ ───
//
// ── EL DEFECTO QUE ESTO ARREGLA ───────────────────────────────────────────
//
// Agregar o quitar una línea obliga a releer la transferencia: el id, el autor,
// la fecha, el factor y el costo de la línea nueva los pone el servidor y la
// pantalla no los puede inventar. Pero la relectura reconstruía `editItems`
// ENTERO desde la respuesta, y eso pisaba lo que el operador tenía escrito sin
// guardar.
//
// El flujo aprobado se rompía en el paso más común:
//
//     enviado 10 → el operador escribe 15 → agrega Fanta → el 15 vuelve a 10
//
// Y no se arregla obligando a guardar antes de agregar —sería inventar un paso
// que nadie pidió— ni auto-guardando —sería escribir cantidades que nadie
// confirmó—. Se arregla distinguiendo QUÉ dato es de quién.
//
// ── LA DIVISIÓN, QUE ES TODA LA IDEA ──────────────────────────────────────
//
// Del SERVIDOR sale todo lo estructural y no se discute: qué líneas existen, su
// id, el producto, la cantidad ENVIADA, el factor, la procedencia, el costo. Si
// una línea ya no viene, desapareció; si viene una nueva, aparece con sus
// valores.
//
// Del OPERADOR sobreviven únicamente los tres campos que él edita —`recibido`,
// `motivoPrincipal` y `motivoDetalle`— y solo en las líneas que YA existían. Una
// línea nueva no tiene edición previa que preservar, así que arranca con lo que
// dijo el servidor.
//
// Nada del snapshot viejo sobrevive fuera de esos tres campos. Preservar la
// cantidad enviada, el costo o el factor sería exactamente la clase de dato
// inventado que la relectura viene a evitar.

/** Lo único que el operador edita, y por lo tanto lo único que se preserva. */
export const CAMPOS_EDITABLES = Object.freeze(["recibido", "motivoPrincipal", "motivoDetalle"]);

/**
 * La fila de edición que le corresponde a una línea recién leída del servidor.
 *
 * `recibido` propone lo enviado mientras no haya recepción cargada. `null` es
 * "todavía no se contó" y 0 es "no llegó nada": no se colapsan, y por eso el
 * ternario no es una comprobación de truthiness.
 */
function filaDeServidor(d) {
  return {
    id: d.id,
    enviado: d.cantidadEnviada,
    recibido: d.cantidadRecibida == null ? d.cantidadEnviada : d.cantidadRecibida,
    motivoPrincipal: d.motivoPrincipal || "",
    motivoDetalle: d.motivoDetalle || "",
  };
}

/** `editItems` desde cero. Es lo que corresponde tras cargar, guardar o confirmar. */
export function construirEditItems(items = []) {
  return items.map(filaDeServidor);
}

/** ¿Estos dos valores de cantidad son el mismo? El input da texto y el servidor números. */
function mismaCantidad(a, b) {
  const vacio = (v) => v === null || v === undefined || v === "";
  // Un campo vaciado NO es un 0: `Number("")` da 0 y los haría iguales, y
  // entonces borrar el contenido sobre un 0 guardado no contaría como cambio.
  if (vacio(a) || vacio(b)) return vacio(a) && vacio(b);
  const na = Number(a);
  const nb = Number(b);
  if (Number.isNaN(na) || Number.isNaN(nb)) return String(a) === String(b);
  return na === nb;
}

/**
 * Las líneas frescas del servidor, con la edición pendiente del operador encima.
 *
 * @param {object[]} items    lo que devolvió `/api/transferencias/detalle`
 * @param {object[]} previos  el `editItems` que había antes de recargar
 */
export function reconciliarEditItems({ items = [], previos = [] } = {}) {
  const porId = new Map(previos.filter((e) => e && e.id != null).map((e) => [e.id, e]));

  return items.map((d) => {
    const fresca = filaDeServidor(d);
    const previa = porId.get(d.id);
    // Línea nueva: no hay nada que preservar. Sale entera del servidor.
    if (!previa) return fresca;

    const conservados = {};
    for (const campo of CAMPOS_EDITABLES) {
      if (previa[campo] !== undefined) conservados[campo] = previa[campo];
    }
    // El orden importa: lo estructural va primero y lo editable lo pisa. Así
    // `enviado`, `id` y cualquier campo que se agregue mañana salen SIEMPRE de la
    // respuesta fresca aunque el snapshot viejo tuviera otro valor.
    return { ...fresca, ...conservados };
  });
}

/**
 * ¿Queda alguna edición sin guardar después de reconciliar?
 *
 * Se compara la fila reconciliada contra la que el servidor propone. Si son
 * iguales no hay nada pendiente, y dejar `dirty` en true sería un fantasma: el
 * aviso de "guardá los cambios" quedaría encendido sin ningún cambio, y confirmar
 * seguiría bloqueado sin que se pueda destrabar.
 *
 * El caso concreto: la única edición pendiente estaba en la línea que se acaba de
 * quitar. Al desaparecer la línea desaparece la edición.
 */
export function hayEdicionPendiente({ items = [], editItems = [] } = {}) {
  const porId = new Map(editItems.filter((e) => e && e.id != null).map((e) => [e.id, e]));

  return items.some((d) => {
    const edit = porId.get(d.id);
    if (!edit) return false;
    const fresca = filaDeServidor(d);
    if (!mismaCantidad(edit.recibido, fresca.recibido)) return true;
    if ((edit.motivoPrincipal || "") !== fresca.motivoPrincipal) return true;
    if ((edit.motivoDetalle || "") !== fresca.motivoDetalle) return true;
    return false;
  });
}

/**
 * El mensaje de "ese producto ya estaba en el remito".
 *
 * El servidor contesta `{ ok: true, yaExistia: true, detalleId }` en vez de
 * crear una segunda fila: dos filas del mismo producto dejarían la transferencia
 * con dos verdades sobre lo mismo. La pantalla NO suma la cantidad sola —nadie
 * pidió eso y sería una escritura a ciegas—: dice dónde corregirla.
 */
export const MENSAJE_YA_EXISTIA =
  "Ese producto ya figura en la transferencia. Corregí la cantidad recibida en su línea.";
