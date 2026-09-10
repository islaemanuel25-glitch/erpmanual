// lib/transferencias/controlFisico.js
//
// LA RECEPCIÓN COMO CONTROL FÍSICO DE MERCADERÍA.
//
// ── QUÉ CAMBIÓ, Y POR QUÉ NO ES UN CAMBIO DE PANTALLA ─────────────────────
//
// Con 150 productos, recorrer el remito en su orden no es una forma de trabajar:
// el operador tiene la mercadería en la mano y va encontrando lo que va
// encontrando. Que "9 de Oro" sea el producto 20, el 97 o el 140 del remito no
// significa nada para él.
//
// Así que la unidad de trabajo pasa a ser: encontrar el producto —escaneando o
// buscando—, contarlo, marcarlo revisado, y que desaparezca de pendientes.
//
// ── POR QUÉ ESTO ES UN MÓDULO PURO Y NO ESTÁ EN LA PANTALLA ───────────────
//
// El resumen de arriba y el listado de abajo tienen que decir LO MISMO. Si la
// card dice "7 faltantes" y al tocarla aparecen 6, uno de los dos cálculos está
// mal y no hay forma de saber cuál. Por eso las cards no son un contador aparte:
// **son el mismo `estadoDeProducto` agrupado**, y el filtro es ese mismo estado
// usado como predicado. Un solo cálculo, dos usos.
//
// Y móvil y escritorio consumen esto, no cada uno el suyo.
//
// ── LA ARITMÉTICA NO SE REIMPLEMENTA ──────────────────────────────────────
//
// Cuántas unidades son sale de `milesimasFisicas`, la misma que usan el servidor
// al confirmar y la validación. Acá no se multiplica por `factor_pack` ni se
// suman sueltas a mano: eso es lo que produce un pack incompleto mal contado en
// una pantalla y bien en la otra.

import { codigosDeItem } from "@/lib/productos/busquedaCodigoBarra";
import { milesimasFisicas } from "./recepcion.js";
import { escalaDeEnvio } from "./presentacionEnvio.js";

/** El estado de un producto del remito, mirado desde el control físico. */
export const ESTADO_PRODUCTO = Object.freeze({
  /** Del remito y todavía sin revisar. */
  PENDIENTE: "pendiente",
  /** Revisado y lo que llegó coincide exactamente con lo enviado. */
  CORRECTO: "correcto",
  /** Revisado y llegó menos. */
  FALTANTE: "faltante",
  /** Revisado y llegó más. */
  SOBRANTE: "sobrante",
  /** No estaba en el remito: apareció al abrir los bultos. */
  NO_DECLARADO: "noDeclarado",
});

/** Los filtros de la pantalla. Cada uno es un predicado sobre el estado. */
export const FILTRO = Object.freeze({
  TODOS: "todos",
  PENDIENTES: "pendientes",
  REVISADOS: "revisados",
  DIFERENCIAS: "diferencias",
  CORRECTOS: "correctos",
  FALTANTES: "faltantes",
  SOBRANTES: "sobrantes",
  NO_DECLARADOS: "noDeclarados",
});

/** Lo que se muestra cuando un producto no tiene categoría asignada. */
export const SIN_CATEGORIA = Object.freeze({ id: "sin-categoria", nombre: "Sin categoría" });

/**
 * En qué escala se cuenta esta línea, para la aritmética física.
 *
 * ── POR QUÉ NO ALCANZA CON `unidadEnviada` ────────────────────────────────
 *
 * `unidadEnviada` es BULTO o UNIDAD, y en casi todas las líneas dice UNIDAD
 * porque la venta interna ya convirtió los packs antes de guardar. Con eso, una
 * línea que SÍ tiene bultos y sueltas —4 packs de 6 más 5— caía en
 * `SUELTAS_SIN_BULTO` y `milesimasFisicas` devolvía null: el producto quedaba
 * eternamente "Pendiente de revisar" aunque alguien lo hubiera contado.
 *
 * Se vio en la captura de la lista: una línea decía "✓ Revisado" arriba y
 * "Pendiente de revisar" abajo, que es una contradicción en la misma tarjeta.
 *
 * El descriptor contesta con la presentación REGISTRADA y su factor congelado, y
 * de ahí sale si esta línea agrupa de verdad.
 *
 * ── Y AHORA LA CONTESTA `escalaDeEnvio`, QUE ES LA MISMA DEL SERVIDOR ─────
 *
 * Esta decisión vivía acá, privada, mientras las rutas de recepción la tomaban
 * por su cuenta leyendo los campos crudos. Dos respuestas para la misma
 * pregunta, y una de las dos escribe stock. Se mudó al dominio compartido para
 * que la pantalla y el servidor no puedan discrepar.
 */

/** Milésimas físicas de lo ENVIADO, incluidas las sueltas si el envío fue mixto. */
export function enviadoFisicoM(d = {}) {
  // Un envío puede haber salido con bultos completos MÁS sueltas. Ignorarlas
  // haría que la línea pareciera tener una diferencia que no tiene.
  const { cantidad, sueltas, unidad, factorPack } = escalaDeEnvio(d);
  return milesimasFisicas({ cantidad, sueltas, unidad, factorPack });
}

/**
 * Milésimas físicas de lo RECIBIDO, o `null` si todavía no se contó.
 *
 * `cantidadRecibida == null` es "nadie cargó nada" y no es lo mismo que 0. El 0
 * es un dato: no llegó ninguna unidad.
 */
export function recibidoFisicoM(d = {}) {
  if (d.cantidadRecibida === null || d.cantidadRecibida === undefined) return null;
  const { unidad, factorPack } = escalaDeEnvio(d);
  return milesimasFisicas({
    cantidad: d.cantidadRecibida,
    sueltas: unidad === "BULTO" ? d.recibidoUnidadesSueltas : 0,
    unidad,
    factorPack,
  });
}

/**
 * EL ESTADO DE UN PRODUCTO. De acá salen las cards Y el filtro.
 *
 * El orden de las preguntas importa: primero la PROCEDENCIA. Un producto
 * agregado en recepción no es "un sobrante": no estaba en el remito, así que no
 * pertenece a ninguna de las cuatro categorías del control y va aparte.
 *
 * Después la REVISIÓN. Un producto con cantidad cargada pero sin revisar sigue
 * siendo pendiente: alguien empezó a contarlo y no terminó, y darlo por correcto
 * sería cerrar un conteo que nadie cerró.
 */
export function estadoDeProducto(d = {}) {
  if (d.agregadoEnRecepcion === true) return ESTADO_PRODUCTO.NO_DECLARADO;
  if (d.revisadoEnRecepcion !== true) return ESTADO_PRODUCTO.PENDIENTE;

  const env = enviadoFisicoM(d);
  const rec = recibidoFisicoM(d);
  // Revisado sin cantidad legible no debería existir —la ruta valida antes de
  // marcar— pero si pasara, no se inventa: se lo trata como pendiente en vez de
  // contarlo como correcto.
  if (env === null || rec === null) return ESTADO_PRODUCTO.PENDIENTE;

  if (rec === env) return ESTADO_PRODUCTO.CORRECTO;
  return rec < env ? ESTADO_PRODUCTO.FALTANTE : ESTADO_PRODUCTO.SOBRANTE;
}

/**
 * EL RESUMEN DE ARRIBA.
 *
 * ── EL DENOMINADOR SON LOS PRODUCTOS DEL REMITO ───────────────────────────
 *
 * `totalRemito` cuenta solo los originales. Un producto agregado en recepción NO
 * entra en el denominador: si entrara, agregar uno haría que "149 / 150" pasara
 * a "149 / 151" y el operador vería aparecer un pendiente que no existe.
 *
 * Por eso la suma que tiene que cerrar es:
 *
 *     correctos + faltantes + sobrantes = revisados
 *     revisados + pendientes            = totalRemito
 *
 * y `noDeclarados` queda aparte, con su propia card.
 *
 * Ejemplo del pedido: 149/150 revisados, 139 correctos, 7 faltantes, 3
 * sobrantes, 1 no declarado. 139 + 7 + 3 = 149. Diferencias = 10. El no
 * declarado no suma a las diferencias del remito.
 */
export function resumenDeRecepcion(items = []) {
  let totalRemito = 0;
  let correctos = 0;
  let faltantes = 0;
  let sobrantes = 0;
  let noDeclarados = 0;
  let pendientes = 0;

  for (const d of items) {
    const estado = estadoDeProducto(d);
    if (estado === ESTADO_PRODUCTO.NO_DECLARADO) {
      noDeclarados += 1;
      continue;
    }
    totalRemito += 1;
    if (estado === ESTADO_PRODUCTO.PENDIENTE) pendientes += 1;
    else if (estado === ESTADO_PRODUCTO.CORRECTO) correctos += 1;
    else if (estado === ESTADO_PRODUCTO.FALTANTE) faltantes += 1;
    else if (estado === ESTADO_PRODUCTO.SOBRANTE) sobrantes += 1;
  }

  return {
    totalRemito,
    revisados: correctos + faltantes + sobrantes,
    pendientes,
    correctos,
    faltantes,
    sobrantes,
    diferencias: faltantes + sobrantes,
    noDeclarados,
    // ── EL OTRO TOTAL, QUE NO ES EL DEL REMITO ───────────────────────────
    //
    // `totalRemito` cuenta el DOCUMENTO: cuántas líneas despachó el origen. Ese
    // es el denominador del avance y no se mueve porque alguien encuentre una
    // caja de más.
    //
    // `totalFisico` cuenta la MERCADERÍA QUE HAY SOBRE LA MESA, agregados
    // incluidos. Es el que le corresponde al tab "Todos", porque ese tab ahora
    // los muestra.
    //
    // Van los dos y con nombres distintos justamente para que nadie tenga que
    // elegir cuál es "el total": son dos preguntas y cada pantalla usa la suya.
    // Con 52 originales y 1 agregado: remito 52, físico 53.
    totalFisico: totalRemito + noDeclarados,
  };
}

/** ¿Este producto entra en este filtro? Mismo estado que alimenta las cards. */
export function pasaFiltro(d, filtro) {
  const estado = estadoDeProducto(d);
  const esDelRemito = estado !== ESTADO_PRODUCTO.NO_DECLARADO;

  switch (filtro) {
    case FILTRO.PENDIENTES:
      return estado === ESTADO_PRODUCTO.PENDIENTE;
    case FILTRO.REVISADOS:
      return esDelRemito && estado !== ESTADO_PRODUCTO.PENDIENTE;
    case FILTRO.DIFERENCIAS:
      return estado === ESTADO_PRODUCTO.FALTANTE || estado === ESTADO_PRODUCTO.SOBRANTE;
    case FILTRO.CORRECTOS:
      return estado === ESTADO_PRODUCTO.CORRECTO;
    case FILTRO.FALTANTES:
      return estado === ESTADO_PRODUCTO.FALTANTE;
    case FILTRO.SOBRANTES:
      return estado === ESTADO_PRODUCTO.SOBRANTE;
    case FILTRO.NO_DECLARADOS:
      return estado === ESTADO_PRODUCTO.NO_DECLARADO;
    case FILTRO.TODOS:
    default:
      // ── "TODOS" SON TODAS LAS LÍNEAS FÍSICAS DE ESTA RECEPCIÓN ──────────
      //
      // Acá decía `return esDelRemito`, o sea que "Todos" excluía a los
      // agregados. El razonamiento escrito era que el listado tenía que
      // coincidir con el "150" del encabezado.
      //
      // Estaba mal, y el síntoma es el peor que puede tener esta pantalla:
      // alguien informa un producto que llegó de más, y **lo ve desaparecer**.
      // No estaba en Pendientes, ni en Diferencias, ni en Revisados, ni en
      // Todos. Existía en la base y en ningún filtro.
      //
      // Lo que hay que separar no es el listado del encabezado: son DOS
      // preguntas distintas y cada una tiene su lugar.
      //
      //   · el ENCABEZADO cuenta el remito — cuánto falta del documento que
      //     alguien despachó. Ese denominador NO cambia, y `resumenDeRecepcion`
      //     sigue dejando los no declarados afuera de `totalRemito` y de
      //     `pendientes`. 49 de 52 pendientes siguen siendo 49.
      //
      //   · el LISTADO muestra la mercadería que hay sobre la mesa. Ahí el
      //     agregado existe, se toca, se edita y se quita como cualquier otro.
      //
      // Con 52 originales y 1 agregado, "Todos" son 53 y el remito sigue siendo
      // 52. Los dos números son correctos porque cuentan cosas distintas.
      return true;
  }
}

/** La categoría de presentación de un producto. Nunca inventa una en la base. */
export function categoriaDeProducto(d = {}) {
  if (d.categoria?.id != null) return { id: String(d.categoria.id), nombre: d.categoria.nombre };
  return { ...SIN_CATEGORIA };
}

/**
 * Las categorías del filtro salen ÚNICAMENTE de los productos de este remito.
 *
 * Cargar el catálogo entero pondría cientos de chips de los cuales el operador
 * no puede usar ninguno: si "Limpieza" no vino en esta transferencia, filtrar
 * por Limpieza da una lista vacía y no ayuda a nadie.
 */
export function categoriasDelRemito(items = []) {
  const vistas = new Map();
  for (const d of items) {
    // ── SOLO LAS DEL REMITO, Y ESTO ERA UN DEFECTO ─────────────────────────
    //
    // Antes recorría TODOS los items, incluidos los agregados en recepción. El
    // resultado era un chip que no filtraba nada:
    //
    //     el remito trae solo Golosinas
    //     se informa un producto no declarado de Limpieza
    //     → aparece el chip "Limpieza"
    //
    // y al tocarlo, la lista sale VACÍA — porque los tabs del remito
    // (Todos, Pendientes, Revisados, Diferencias) excluyen los agregados a
    // propósito. Un filtro que siempre da vacío no es un filtro, es una
    // contradicción entre dos partes de la misma pantalla.
    //
    // Los no declarados se llegan por su card, que no filtra por categoría.
    if (d.agregadoEnRecepcion === true) continue;
    const c = categoriaDeProducto(d);
    if (!vistas.has(c.id)) vistas.set(c.id, { ...c, cantidad: 0 });
    vistas.get(c.id).cantidad += 1;
  }
  const lista = [...vistas.values()];
  // Alfabético, con "Sin categoría" al final: es un estado de presentación, no
  // una categoría más, y arriba de todo distraería.
  lista.sort((a, b) => {
    if (a.id === SIN_CATEGORIA.id) return 1;
    if (b.id === SIN_CATEGORIA.id) return -1;
    return String(a.nombre).localeCompare(String(b.nombre), "es");
  });
  return lista;
}

// ── BÚSQUEDA DENTRO DEL REMITO ────────────────────────────────────────────
//
// Son ~150 productos ya cargados: buscar acá no necesita una consulta por tecla.
// El servidor solo entra cuando el producto NO está en el remito, que es el
// camino de excepción.

/**
 * Los códigos escaneables de una línea.
 *
 * ── ES LA DEFINICIÓN CENTRAL, NO UNA COPIA ────────────────────────────────
 *
 * Acá había una lista propia de tres propiedades. Funcionaba y estaba mal: el
 * repo ya tiene `codigosDeItem`, y con dos listas, el día que el ERP aprenda a
 * escanear un cuarto código la recepción se queda atrás — sin ponerse roja, solo
 * dejando de encontrar productos que el resto del sistema sí encuentra.
 *
 * El DTO del detalle expone `codigoBarraPropio`, `codigoBarra` y
 * `codigoBarraSecundario` justamente con los nombres que esa función espera, así
 * que no hace falta ningún adaptador: se la llama y listo.
 *
 * Se conserva el nombre local porque es el que usa esta pantalla, pero adentro no
 * decide nada.
 */
export function codigosDeLinea(d = {}) {
  return codigosDeItem(d);
}

const normalizar = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/**
 * COINCIDENCIA EXACTA POR CÓDIGO. Es lo que usa el scanner.
 *
 * Exacta y no "contiene": un código escaneado identifica un producto o no lo
 * identifica. Una coincidencia parcial abriría la ficha del producto equivocado
 * con la mercadería en la mano.
 */
export function buscarPorCodigoExacto(items = [], codigo) {
  const c = String(codigo || "").trim();
  if (!c) return null;
  return items.find((d) => codigosDeLinea(d).some((x) => String(x).trim() === c)) || null;
}

/** Búsqueda tecleada: por nombre o por cualquiera de los tres códigos. */
export function buscarEnRemito(items = [], texto) {
  const q = normalizar(texto);
  if (!q) return items;
  return items.filter((d) => {
    if (normalizar(d.nombre).includes(q)) return true;
    return codigosDeLinea(d).some((x) => normalizar(x).includes(q));
  });
}

/**
 * ¿ESTE TEXTO NO ENCUENTRA NADA EN TODA LA TRANSFERENCIA?
 *
 * ── LA DISTINCIÓN QUE ESTO EXISTE PARA HACER ────────────────────────────
 *
 * Son dos cosas que se ven iguales en pantalla —una lista vacía— y significan lo
 * opuesto:
 *
 *   · CERO RESULTADOS DEL FILTRO — el producto SÍ está en la transferencia, pero
 *     está tapado porque el operador está mirando "Revisados", o una categoría
 *     distinta. Ofrecerle informarlo como no declarado acá es el camino directo a
 *     una segunda línea del mismo producto.
 *
 *   · AUSENTE DE LA TRANSFERENCIA — no está, punto. Recién acá corresponde el
 *     catálogo del origen.
 *
 * Por eso la pregunta se le hace a `items` COMPLETO y nunca al subconjunto
 * visible. Quien llame a esto con la lista ya filtrada va a obtener la respuesta
 * equivocada, y por eso el parámetro se llama como se llama.
 *
 * No hay matching nuevo: sale de `buscarPorCodigoExacto` y `buscarEnRemito`, las
 * mismas dos que usa la cascada de `resolverEntrada`.
 *
 * Con texto vacío devuelve `false`: sin búsqueda no hay nada que declarar ausente.
 */
export function faltaEnLaTransferencia(todosLosItems = [], texto) {
  const q = String(texto || "").trim();
  if (!q) return false;
  if (buscarPorCodigoExacto(todosLosItems, q)) return false;
  return buscarEnRemito(todosLosItems, q).length === 0;
}

// ── QUÉ HACER CON LO QUE ENTRÓ POR EL CAMPO ───────────────────────────────
//
// El mismo campo recibe tres cosas distintas y hasta acá se las trataba como
// una sola:
//
//   A. la CÁMARA, que devuelve un código leído;
//   B. un LECTOR FÍSICO, que teclea el código y manda Enter;
//   C. una PERSONA, que escribe "Fanta" y manda Enter.
//
// A y B son lo mismo y se resuelven por código exacto: un código identifica un
// producto o no lo identifica, y una coincidencia parcial abriría la ficha del
// producto equivocado con la mercadería en la mano.
//
// C no. El placeholder dice "buscá por nombre o código", la lista encuentra
// "Fanta Naranja 2,25 L" correctamente mientras se tipea, y al tocar Enter la
// pantalla contestaba "Este producto no figura en esta transferencia" — sobre un
// producto que estaba ahí, listado, a la vista. Un mensaje falso, y encima el que
// ofrece informarlo como no declarado: el camino directo a una línea duplicada
// del mismo producto.

/** Qué hacer con lo que se escribió o escaneó. */
export const RESOLUCION = Object.freeze({
  /** Hay UN producto y es este: abrir su ficha. */
  ABRIR: "abrir",
  /** Hay varios: que el operador elija. La lista ya los está mostrando. */
  LISTA: "lista",
  /** No hay ninguno: recién acá corresponde ofrecer el catálogo del origen. */
  NO_FIGURA: "noFigura",
});

/**
 * LA CASCADA, Y POR QUÉ NO ELIGE NUNCA POR EL OPERADOR.
 *
 *   1. código exacto → abrir. Es el escaneo, y no se discute.
 *   2. sin código exacto, UNA sola coincidencia por texto → abrir esa.
 *   3. varias coincidencias → LISTA. **No se abre la primera**: elegir una entre
 *      tres "Fanta" por el orden del remito es adivinar cuál tiene en la mano, y
 *      el error se descubre después de contar.
 *   4. ninguna → NO_FIGURA.
 *
 * `soloCodigo` es para la cámara: ahí el escalón 2 no corresponde, porque lo que
 * llegó es un código y no un texto que alguien tipeó. Un código que no está en el
 * remito es exactamente "no figura", sin fallback por nombre.
 */
export function resolverEntrada(items = [], entrada, { soloCodigo = false } = {}) {
  const q = String(entrada || "").trim();
  if (!q) return { tipo: RESOLUCION.LISTA, resultados: items, porCodigo: false };

  const exacto = buscarPorCodigoExacto(items, q);
  if (exacto) return { tipo: RESOLUCION.ABRIR, producto: exacto, porCodigo: true };

  if (soloCodigo) return { tipo: RESOLUCION.NO_FIGURA, resultados: [], porCodigo: true };

  const porTexto = buscarEnRemito(items, q);
  if (porTexto.length === 0) return { tipo: RESOLUCION.NO_FIGURA, resultados: [], porCodigo: false };
  if (porTexto.length === 1) {
    return { tipo: RESOLUCION.ABRIR, producto: porTexto[0], porCodigo: false };
  }
  return { tipo: RESOLUCION.LISTA, resultados: porTexto, porCodigo: false };
}

/**
 * EL LISTADO, con todo aplicado. Es lo único que las dos presentaciones dibujan.
 *
 * El orden: los revisados van por `revisadoEnRecepcionAt`, que es el orden real
 * en que apareció la mercadería —así el operador reconoce lo que acaba de
 * contar—. Los pendientes NO se ordenan por eso: todavía no tienen fecha, y
 * fingir un orden de llegada sería inventar un dato.
 */
export function productosVisibles(items = [], { filtro = FILTRO.TODOS, categoriaId = null, texto = "" } = {}) {
  let lista = items.filter((d) => pasaFiltro(d, filtro));

  // ── LA CATEGORÍA ELEGIDA ES DEL REMITO, Y LOS NO DECLARADOS NO SON DEL
  //    REMITO ───────────────────────────────────────────────────────────────
  //
  // `categoriasDelRemito` excluye a propósito los productos agregados en
  // recepción: sus categorías no son chips que el operador pueda usar. Pero el
  // filtro se aplicaba igual sobre ellos, y eso contradecía a la card:
  //
  //     el remito trae solo Golosinas
  //     llegó un no declarado de Limpieza
  //     el operador tiene elegido el chip "Golosinas"
  //     toca la card "No declarados · 1"
  //     → la lista sale VACÍA
  //
  // La card dice 1 y la pantalla muestra 0. Con la mercadería en la mano, eso es
  // el operador buscando un producto que el sistema afirma tener.
  //
  // Al entrar a los no declarados el chip del remito deja de aplicar. No se
  // inventa acá un segundo juego de chips para los extras: son pocos —tienen su
  // propia card justamente por eso— y un filtro de categorías para una lista de
  // uno o dos elementos es una respuesta a un problema que todavía no existe.
  const filtraNoDeclarados = filtro === FILTRO.NO_DECLARADOS;

  if (categoriaId && !filtraNoDeclarados) {
    lista = lista.filter((d) => categoriaDeProducto(d).id === String(categoriaId));
  }

  if (texto) lista = buscarEnRemito(lista, texto);

  return [...lista].sort((a, b) => {
    const ra = a.revisadoEnRecepcionAt ? new Date(a.revisadoEnRecepcionAt).getTime() : null;
    const rb = b.revisadoEnRecepcionAt ? new Date(b.revisadoEnRecepcionAt).getTime() : null;
    if (ra !== null && rb !== null) return rb - ra; // lo último revisado, primero
    if (ra !== null) return -1;
    if (rb !== null) return 1;
    // Sin revisar: el orden del remito, que es el único que existe.
    return Number(a.id) - Number(b.id);
  });
}
