// lib/productos/estadoDeRetorno.js
//
// VOLVER AL MISMO LUGAR DESPUÉS DE EDITAR. Un solo estado, versionado, con todo
// lo que hace falta para reconstruir dónde estaba parada la persona.
//
// ── QUÉ ESTABA MAL, Y POR QUÉ NO ALCANZABA CON ARREGLAR UNA LÍNEA ──────────
//
// La pantalla ya guardaba `productos:scrollY` y `productos:selectedProductId`,
// y aun así en el celular no volvía a ningún lado. Tres motivos, y los tres hay
// que resolverlos juntos:
//
//   1. **El scroll que guardaba era el de otro elemento.** El contenedor que
//      buscaba —`#productos-scroll`— es el de la TABLA DE ESCRITORIO, que en el
//      celular vive adentro de un `hidden md:block`. Está en el DOM, así que
//      `getElementById` lo encuentra; está oculto, así que su `scrollTop` es 0.
//      Guardaba un cero, restauraba un cero, y nada avisaba.
//
//   2. **La tarjeta del celular no tenía ancla.** No recibía el id, así que al
//      volver no había forma de encontrar la card: ni para llevar el scroll ni
//      para marcarla.
//
//   3. **Restaurar por scroll solo no alcanza.** Entre que se sale y se vuelve
//      el listado se pide de nuevo: si el nombre cambió y el orden es por
//      nombre, la fila se movió, y el mismo `scrollTop` deja a la persona
//      mirando otro producto. Por eso lo que manda es el ELEMENTO.
//
// ── LA IDENTIDAD ES ESTABLE Y DIFERENCIADA, Y ESO NO ES UN DETALLE ─────────
//
// Un producto se identifica por `ProductoBase.id` y un combo por
// `ProductoLocal.id` —`localProductoId` en el listado—. **Son dos numeraciones
// distintas y se pisan**: el id 12 puede ser un producto y también un combo.
// Guardar el número solo haría que volver de editar un combo marcara un
// producto cualquiera que tuviera ese id.
//
// Por eso la clave lleva el tipo adelante: `producto:12` y `combo:12` son dos
// anclas distintas. Es el mismo motivo por el que `editarDesdeLaCard` despacha
// por `esCombo` y nunca cae al id del otro.
//
// ── NADA DE ESTO TOCA REGLAS DE NEGOCIO ───────────────────────────────────
//
// Acá no se decide ningún precio, ningún stock ni ninguna visibilidad: es dónde
// estaba el scroll y qué fila se abrió. Se guarda en `sessionStorage` —que muere
// con la pestaña— y no en `localStorage`, porque un estado de navegación que
// sobrevive a cerrar el navegador es un estado que va a restaurar algo que la
// persona ya no está mirando.

/**
 * ── LA VERSIÓN, Y PARA QUÉ SIRVE DE VERDAD ────────────────────────────────
 *
 * Una pestaña abierta durante un despliegue se queda con el `sessionStorage`
 * viejo y el código nuevo. Sin versión, el código nuevo leería la forma vieja
 * —`{ scrollY }` a secas— y trabajaría con campos en `undefined`: no explota,
 * restaura mal, y no hay ningún error que mirar.
 *
 * Con la versión adentro, una forma que no es la esperada se descarta y la
 * pantalla se comporta como en una entrada fresca, que es el peor caso
 * aceptable.
 */
export const VERSION_ESTADO_RETORNO = 1;

/** La única clave. Lleva la versión en el nombre además de adentro. */
export const CLAVE_ESTADO_RETORNO = "productos:retorno:v1";

/**
 * ── EL VENCIMIENTO, Y POR QUÉ ES ESTE Y NO UNO MÁS CORTO ──────────────────
 *
 * Protege un caso concreto: el estado se guardó, la persona no volvió al
 * listado —se fue a otro módulo, cerró el editor de otra forma— y el estado
 * quedó ahí. La próxima entrada al módulo restauraría un scroll de otro momento.
 *
 * Treinta minutos y no cinco porque el costo de los dos errores no es el mismo.
 * Restaurar algo viejo mueve el scroll y se arregla deslizando; vencer temprano
 * rompe la función justo en el caso más largo —una edición de varios minutos con
 * fotos— que es cuando volver al lugar más falta. El estado además se borra al
 * consumirlo, así que el vencimiento es la segunda barrera y no la primera.
 */
export const VENCIMIENTO_ESTADO_RETORNO_MS = 30 * 60 * 1000;

/** Los dos tipos, con nombre y no con un booleano. */
export const TIPO_PRODUCTO = "producto";
export const TIPO_COMBO = "combo";

/**
 * El rótulo de la marca, en el dominio y no en cada pantalla.
 *
 * Lo consumen la tarjeta del celular, la fila de escritorio y la sonda que las
 * verifica. Escrito tres veces, el día que cambie la sonda seguiría buscando el
 * viejo y pasaría en verde sobre una pantalla que dice otra cosa.
 */
export const TEXTO_ULTIMO_EDITADO = "Último editado";

/** El nombre del atributo con el que se encuentra una fila o una card. */
export const ATRIBUTO_ANCLA = "data-ancla";

/**
 * La identidad de una fila del listado.
 *
 * Devuelve `null` cuando no se puede identificar en vez de inventar un id: una
 * identidad equivocada marca y mueve el scroll hacia OTRO producto, que es peor
 * que no restaurar.
 *
 * @param {object} fila fila del listado ya mapeada
 */
export function identidadDeFila(fila) {
  if (!fila) return null;
  if (fila.esCombo === true) {
    const id = Number(fila.localProductoId);
    return Number.isFinite(id) && id > 0 ? { tipo: TIPO_COMBO, id } : null;
  }
  const id = Number(fila.id);
  return Number.isFinite(id) && id > 0 ? { tipo: TIPO_PRODUCTO, id } : null;
}

/**
 * La clave del ancla del DOM. Es lo que viaja en el `data-` de cada card y de
 * cada fila, y lo que se busca al volver.
 */
export function claveDeAncla(identidad) {
  if (!identidad) return null;
  const id = Number(identidad.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  if (identidad.tipo !== TIPO_PRODUCTO && identidad.tipo !== TIPO_COMBO) return null;
  return `${identidad.tipo}:${id}`;
}

/** ¿Estas dos identidades son la misma? Compara tipo Y número. */
export function mismaIdentidad(a, b) {
  return claveDeAncla(a) !== null && claveDeAncla(a) === claveDeAncla(b);
}

/**
 * Arma el estado de retorno.
 *
 * @param {string} url            la URL EXACTA del listado, con su query
 * @param {object} identidad      `{ tipo, id }`
 * @param {number} scrollTop      el del contenedor visible, como respaldo
 * @param {number|null} offset    a qué altura estaba el elemento DENTRO del
 *                                contenedor visible. Es lo que permite dejarlo a
 *                                la misma altura y no solo dentro de la pantalla.
 * @param {number|null} offsetVentana  a qué altura estaba respecto de la
 *                                VENTANA. Ver abajo por qué hacen falta los dos.
 * @param {number} ahora          epoch en ms
 */
export function crearEstadoDeRetorno({
  url,
  identidad,
  scrollTop = 0,
  offset = null,
  offsetVentana = null,
  ahora,
}) {
  const clave = claveDeAncla(identidad);
  if (!clave || !url) return null;
  const t = Number(ahora);
  if (!Number.isFinite(t)) return null;
  return {
    v: VERSION_ESTADO_RETORNO,
    url: String(url),
    tipo: identidad.tipo,
    id: Number(identidad.id),
    scrollTop: Number.isFinite(Number(scrollTop)) ? Number(scrollTop) : 0,
    // `null` es "no se pudo medir" y 0 es "estaba arriba de todo". Son distintos:
    // con `null` se restaura por el elemento sin exigir altura, con 0 se exige.
    offset: offset === null || offset === undefined ? null : Number(offset),
    // ── POR QUÉ TAMBIÉN LA ALTURA RESPECTO DE LA VENTANA ──────────────────
    //
    // Porque en ESCRITORIO hay DOS contenedores que desplazan al mismo tiempo:
    // el de la tabla —`#productos-scroll`— y el `<main>` de la página. Restaurar
    // solo uno deja el otro en cero, y el producto aparece corrido justo lo que
    // valía el segundo.
    //
    // Está medido, no deducido: la sonda mostró el contenedor de la tabla
    // restaurado en su máximo —743— y el `main` en 0 donde antes tenía 123. La
    // diferencia de altura del producto era de 123 px, exactamente ese scroll
    // perdido.
    //
    // La altura respecto de la VENTANA no depende de cuántos contenedores haya
    // ni de cuál se eligió: es la que la persona ve. Por eso es la referencia
    // final, y `offset` queda como el primer ajuste, el del contenedor elegido.
    offsetVentana:
      offsetVentana === null || offsetVentana === undefined ? null : Number(offsetVentana),
    ts: t,
  };
}

/**
 * ¿Este estado se puede usar?
 *
 * Se comprueban la versión, la forma y el vencimiento. Una forma incompleta se
 * descarta entera: reconstruir a medias es lo que hace que la pantalla salte a
 * un lugar que nadie pidió.
 */
export function esEstadoVigente(estado, ahora, vencimientoMs = VENCIMIENTO_ESTADO_RETORNO_MS) {
  if (!estado || typeof estado !== "object") return false;
  if (estado.v !== VERSION_ESTADO_RETORNO) return false;
  if (typeof estado.url !== "string" || estado.url.length === 0) return false;
  if (claveDeAncla({ tipo: estado.tipo, id: estado.id }) === null) return false;
  const t = Number(estado.ts);
  const n = Number(ahora);
  if (!Number.isFinite(t) || !Number.isFinite(n)) return false;
  // Un `ts` del futuro es tan sospechoso como uno viejo: significa que el reloj
  // se movió, y con él cualquier cuenta de antigüedad.
  if (t > n) return false;
  return n - t <= vencimientoMs;
}

/** Guarda. Devuelve si pudo — el almacenamiento puede estar bloqueado. */
export function guardarEstadoDeRetorno(storage, estado) {
  if (!storage || !estado) return false;
  try {
    storage.setItem(CLAVE_ESTADO_RETORNO, JSON.stringify(estado));
    return true;
  } catch {
    return false;
  }
}

/**
 * Lee SIN consumir.
 *
 * Que leer y consumir sean dos cosas es la mitad del arreglo: el estado se borra
 * DESPUÉS de haber intentado restaurar, no antes. Borrando primero, un intento
 * que falla —porque la lista todavía no está montada— se lleva puesta la única
 * copia y no hay segundo intento posible.
 */
export function leerEstadoDeRetorno(storage, ahora, vencimientoMs = VENCIMIENTO_ESTADO_RETORNO_MS) {
  if (!storage) return null;
  let crudo = null;
  try {
    crudo = storage.getItem(CLAVE_ESTADO_RETORNO);
  } catch {
    return null;
  }
  if (!crudo) return null;
  let estado = null;
  try {
    estado = JSON.parse(crudo);
  } catch {
    // Un JSON roto no es un estado: se descarta como cualquier forma inválida.
    return null;
  }
  return esEstadoVigente(estado, ahora, vencimientoMs) ? estado : null;
}

/** Borra. Se llama una vez, después del intento de restauración. */
export function consumirEstadoDeRetorno(storage) {
  if (!storage) return;
  try {
    storage.removeItem(CLAVE_ESTADO_RETORNO);
  } catch {}
}

/**
 * ── A DÓNDE HAY QUE LLEVAR EL SCROLL ──────────────────────────────────────
 *
 * La cuenta que deja el elemento a la MISMA altura de pantalla que tenía antes,
 * y no solamente dentro de la vista.
 *
 * `posicionActual` es dónde está el elemento hoy respecto del contenedor —o sea
 * `elemento.offsetTop - contenedor.offsetTop` medido con rectángulos— y `offset`
 * es a qué altura de la ventana estaba cuando se salió. La diferencia es cuánto
 * hay que mover el contenedor.
 *
 * Se acota a `[0, maximo]` porque un elemento cerca del final no puede quedar a
 * media pantalla: el contenedor no tiene más para desplazar. Pedirlo igual
 * dejaría el scroll pegado al fondo y la comparación de alturas fallaría por
 * varios píxeles sin que nada estuviera mal.
 *
 * @returns {number} el `scrollTop` que hay que fijar
 */
export function scrollParaDejarloA({ scrollTopActual, posicionActual, offset, maximo }) {
  const base = Number(scrollTopActual) || 0;
  // ── `Number(null)` DA 0, NO NaN ───────────────────────────────────────────
  //
  // Y eso importa acá más que en ningún lado: `offset: null` significa "no se
  // pudo medir la altura", y convertido a 0 pasaría a significar "estaba pegado
  // arriba de todo". La pantalla llevaría el scroll al tope con total confianza.
  //
  // Lo encontró el candado R16, no la lectura del código.
  if (posicionActual === null || posicionActual === undefined) return base;
  if (offset === null || offset === undefined) return base;
  const pos = Number(posicionActual);
  const obj = Number(offset);
  if (!Number.isFinite(pos) || !Number.isFinite(obj)) return base;
  const destino = base + (pos - obj);
  const tope = Number.isFinite(Number(maximo)) ? Number(maximo) : Infinity;
  if (destino < 0) return 0;
  if (destino > tope) return tope;
  return destino;
}
