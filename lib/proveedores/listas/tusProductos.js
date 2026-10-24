// TUS PRODUCTOS DE ESTE PROVEEDOR, FRENTE A LA LISTA QUE SE LEYÓ.
//
// ── POR QUÉ LA REVISIÓN ARRANCA DE ACÁ (Emanuel, 2026-10-23) ──────────────
//
// La revisión de una lista eran cuatro pantallas sueltas —el resultado con seis
// tarjetas de números, "Para revisar" de a uno, "Vincular" que recorría los
// renglones del archivo de a uno ("1 de 1546") y "No cambian"— y Emanuel la
// llamó una ensalada. La primera lista de Dab, un PDF sin código de barras, lo
// mostró: de sus 158 productos de Dab la lista emparejó 14, y para encontrar
// los otros 144 había que recorrer 1.546 renglones de un archivo que trae casi
// todo lo que Dab vende y él no.
//
// La pregunta que importa no es "qué trae el archivo" sino "qué le pasa a LO
// MÍO". Así que la pantalla es una sola, y su lista son tus productos: cada uno
// dice si la lista lo trae, si cambia, si hay que mirarlo, o si falta
// vincularlo. Los renglones que no son tuyos no se listan: solo aparecen en el
// buscador de la hoja que vincula.
//
// ── NINGUNA REGLA NUEVA DECIDE NADA ──────────────────────────────────────
//
// Cada estado sale de los predicados que ya deciden: `seVaAEscribir` (el mismo
// que cuenta "Aplicar los N" y que consulta aplicar), `motivoDeRevision` y
// `laDejaronComoEsta`. Lo único propio de este módulo es AGRUPAR por producto
// y elegir el renglón que se muestra. Si se escribiera acá otra cuenta de
// "cambia", la tarjeta podría decir «Cambia» sobre algo que aplicar no toca.
//
// Módulo puro: sin Prisma, sin React y sin red.

import { ESTADO_LINEA } from "./estados.js";
import {
  MOTIVO_REVISION,
  laDejaronComoEsta,
  motivoDeRevision,
  seVaAEscribir,
} from "./resultadoDeLaLista.js";

/** Lo que le pasa a un producto tuyo con esta lista. */
export const ESTADO_TU_PRODUCTO = Object.freeze({
  /** La lista no lo trae, o no se lo pudo atar a ningún renglón. */
  SIN_VINCULAR: "SIN_VINCULAR",
  /** Lo trae, y hay algo que mirar antes de escribirle el costo. */
  REVISAR: "REVISAR",
  /** Lo trae, y al aplicar se le escribe el costo nuevo. */
  CAMBIA: "CAMBIA",
  /** Ya se le escribió el costo de esta lista. */
  ACTUALIZADO: "ACTUALIZADO",
  /** Lo trae con el mismo costo que ya tiene. */
  MISMO_PRECIO: "MISMO_PRECIO",
  /** Lo trae, y alguien decidió no cambiarlo. */
  NO_LO_CAMBIO: "NO_LO_CAMBIO",
  /** No lo trae, y alguien lo dijo en la hoja de vincular. */
  NO_VIENE: "NO_VIENE",
});

/**
 * QUÉ HACE EL BOTÓN DE ARRIBA A LA DERECHA DE LA TARJETA (2026-10-24).
 *
 * Es el «✓ Coincide» de la recepción de transferencias: el caso feliz en un
 * toque. Cada acción es una ruta que ya existía y con sus reglas de siempre:
 *
 *   CONFIRMAR   «✓ Usar» sobre una para revisar: confirma la lectura que la
 *               tarjeta muestra (`filas/[filaId]/confirmar`), la misma que la
 *               hoja ofrece. Fuera de rango, se pregunta antes, como en la hoja.
 *   MARCAR      «✓ Usar» sobre una que alguien desmarcó: la vuelve a tildar
 *               (`seleccion`).
 *   DESMARCAR   el mismo botón, relleno, sobre una que cambia: la destilda y
 *               vuelve a «Para revisar».
 */
export const ACCION_USAR = Object.freeze({
  CONFIRMAR: "CONFIRMAR",
  MARCAR: "MARCAR",
  DESMARCAR: "DESMARCAR",
});

/** Los chips, en el orden del diseño. "Todos" va último y no es un estado. */
export const FILTRO = Object.freeze({
  SIN_VINCULAR: ESTADO_TU_PRODUCTO.SIN_VINCULAR,
  REVISAR: ESTADO_TU_PRODUCTO.REVISAR,
  CAMBIA: ESTADO_TU_PRODUCTO.CAMBIA,
  TODOS: "TODOS",
});

export const TEXTO_FILTRO = Object.freeze({
  SIN_VINCULAR: "Sin vincular",
  REVISAR: "Para revisar",
  CAMBIA: "Cambian",
  TODOS: "Todos",
});

export const ORDEN_FILTROS = Object.freeze([FILTRO.SIN_VINCULAR, FILTRO.REVISAR, FILTRO.CAMBIA, FILTRO.TODOS]);

/**
 * El motivo de revisión, dicho de UN producto y en criollo.
 *
 * `TEXTO_MOTIVO_REVISION` titula GRUPOS ("Aumentan distinto de lo esperado");
 * la tarjeta habla de un solo producto y tiene un renglón. Por eso es otro
 * texto, y por eso vive acá y no en el JSX.
 */
export function motivoEnCriollo({ motivo, variacionPct = null, rango = null }) {
  switch (motivo) {
    case MOTIVO_REVISION.AUMENTO_DISTINTO: {
      const min = numero(rango?.minPct);
      const max = numero(rango?.maxPct);
      const v = numero(variacionPct);
      const esperado = min !== null && max !== null ? ` (esperabas entre ${formatoPct(min)} y ${formatoPct(max)})` : "";
      if (v === null) return "La lista no dice de qué presentación es el precio: elegí cómo leerlo.";
      if (v < 0) return `Baja, y esperabas un aumento${esperado}.`;
      if (max !== null && v > max) return `Aumenta más de lo que esperabas${esperado}.`;
      return `Aumenta menos de lo que esperabas${esperado}.`;
    }
    case MOTIVO_REVISION.SIN_COSTO:
      return "No tiene costo cargado, así que no hay con qué comparar el precio de la lista.";
    case MOTIVO_REVISION.REPETIDO:
      return "Su código viene más de una vez en la lista, con precios distintos.";
    case MOTIVO_REVISION.NO_SE_PUEDE_ESCRIBIR:
      return "Desde esta ubicación no se le puede cambiar el costo.";
    case MOTIVO_REVISION.NO_SE_PUDO_LEER:
      return "Ese renglón de la lista no se pudo leer.";
    case MOTIVO_OMITIDA:
      return "Con los datos de hoy el costo da distinto del que se había propuesto.";
    case MOTIVO_DESMARCADA:
      return "Lo desmarcaste: no se aplica hasta que toques «Usar».";
    default:
      return "Quedó en un estado que no sé explicar: por las dudas no se toca.";
  }
}

/**
 * Una fila tildada y lista que el recálculo de HOY va a omitir al aplicar
 * (`revisarAntesDeAplicar`). Para la persona es un producto para mirar, con su
 * motivo propio: no es "Cambia", porque aplicar no lo va a escribir.
 */
export const MOTIVO_OMITIDA = "OMITIDA_AL_APLICAR";

/**
 * Una fila lista y en rango que alguien DESTILDÓ, con la lista abierta.
 *
 * Hasta el 2026-10-24 caía en «No lo cambio», junto con lo que se dejó como
 * está. Son dos decisiones distintas y por eso dos columnas —`seleccionada` y
 * `excluidaManual`, la regla 3—: destildar es reversible y no se recuerda para
 * las próximas listas. En la tarjeta nueva el «Usar» relleno se toca para
 * desmarcar, y lo desmarcado tiene que quedar donde se lo puede volver a usar:
 * en «Para revisar». Con la lista cerrada ya no hay nada que tildar, y vuelve a
 * ser «No lo cambio».
 */
export const MOTIVO_DESMARCADA = "DESMARCADA";

/**
 * QUÉ LE PASA A UN PRODUCTO, Y QUÉ RENGLÓN DE LA LISTA SE MUESTRA.
 *
 * ── EL ORDEN DE LAS RAMAS ES LA MITAD DE LO QUE AFIRMA ────────────────────
 *
 * Un producto puede tener más de un renglón en la lista. Gana el que más
 * importa decir, y el orden es el de `grupoQueNoCambia`, que ya lo decidió:
 * lo ya escrito, después lo que se va a escribir, después lo que falta mirar,
 * y recién al final lo que una persona dejó como está.
 *
 * @param filas    las filas de ESTA lista que apuntan al producto
 * @param rango    el del proveedor, para juzgar el aumento
 * @param omitidas Set de ids de fila que aplicar va a omitir hoy, o null
 * @param noViene  true si alguien dijo "No viene en esta lista"
 * @param abierta  si la lista se puede tocar todavía: una desmarcada solo es
 *                 «Para revisar» mientras se la pueda volver a tildar
 * @returns `{ estado, fila, motivo }`: `fila` es la que se muestra, o null
 */
export function estadoDeTuProducto({ filas = [], rango = null, omitidas = null, noViene = false, abierta = true } = {}) {
  const lista = Array.isArray(filas) ? filas : [];
  if (lista.length === 0) {
    return { estado: noViene ? ESTADO_TU_PRODUCTO.NO_VIENE : ESTADO_TU_PRODUCTO.SIN_VINCULAR, fila: null, motivo: null };
  }

  const aplicada = lista.find((f) => f?.aplicada === true);
  if (aplicada) return { estado: ESTADO_TU_PRODUCTO.ACTUALIZADO, fila: aplicada, motivo: null };

  const seEscribe = lista.find((f) => seVaAEscribir(f, rango, omitidas));
  if (seEscribe) return { estado: ESTADO_TU_PRODUCTO.CAMBIA, fila: seEscribe, motivo: null };

  // Lo que aplicar va a omitir hoy: estaba tildada y lista, así que no tiene
  // motivo de revisión propio, pero no se va a escribir.
  const omitida = lista.find((f) => omitidas?.has?.(f?.id) === true && !laDejaronComoEsta(f));
  if (omitida) return { estado: ESTADO_TU_PRODUCTO.REVISAR, fila: omitida, motivo: MOTIVO_OMITIDA };

  for (const f of lista) {
    const m = motivoDeRevision(f, rango);
    // SIN_PRODUCTO no puede venir de una fila atada a un producto; se saltea
    // igual, como hace `grupoQueNoCambia`.
    if (m !== null && m !== MOTIVO_REVISION.SIN_PRODUCTO) {
      return { estado: ESTADO_TU_PRODUCTO.REVISAR, fila: f, motivo: m };
    }
  }

  // Lista, en rango y destildada: es «Usar» desmarcado. Ver `MOTIVO_DESMARCADA`.
  // Va antes del mismo precio por el mismo orden de arriba: lo que falta decidir
  // le gana a lo que ya está igual.
  if (abierta) {
    const desmarcada = lista.find(
      (f) => f?.estado === ESTADO_LINEA.LISTO_PARA_ACTUALIZAR && !laDejaronComoEsta(f) && f?.seleccionada === false
    );
    if (desmarcada) return { estado: ESTADO_TU_PRODUCTO.REVISAR, fila: desmarcada, motivo: MOTIVO_DESMARCADA };
  }

  const igual = lista.find((f) => f?.estado === ESTADO_LINEA.SIN_CAMBIOS && !laDejaronComoEsta(f));
  if (igual) return { estado: ESTADO_TU_PRODUCTO.MISMO_PRECIO, fila: igual, motivo: null };

  // Dejada a mano, o —con la lista cerrada— lista pero destildada: una persona
  // decidió que esta lista no la cambia, y aplicar no la toca.
  return { estado: ESTADO_TU_PRODUCTO.NO_LO_CAMBIO, fila: lista[0], motivo: null };
}

/**
 * LA LISTA DE LA PANTALLA, CON SUS CONTADORES.
 *
 * Los chips y el resumen salen de ACÁ, del mismo arreglo que se dibuja: así el
 * número de un chip y las tarjetas que abre no pueden decir cosas distintas.
 *
 * @param productos  `[{ id, nombre, precio_costo, filas: [...] }]` del universo
 *                   del proveedor (`productoDelProveedorWhere`), con las filas
 *                   de ESTA importación
 * @param noVienen   Set de productoBaseId marcados "No viene en esta lista"
 * @param lecturaPorFila  Map filaId → `{ lectura, confirmable }`, de
 *                   `lecturasDeLaFila` + `lecturaQueMuestraLaTarjeta`: la lectura
 *                   que la tarjeta muestra y si `confirmar` la aceptaría
 * @param abierta    si la lista se puede tocar todavía
 */
export function tusProductosDeLaLista({
  productos = [],
  rango = null,
  omitidas = null,
  noVienen = null,
  lecturaPorFila = null,
  abierta = true,
} = {}) {
  const items = (Array.isArray(productos) ? productos : []).map((p) => {
    const filas = Array.isArray(p?.filas) ? p.filas : [];
    const { estado, fila, motivo } = estadoDeTuProducto({
      filas,
      rango,
      omitidas,
      noViene: noVienen?.has?.(p.id) === true,
      abierta,
    });
    const costoHoy = numero(fila?.costoAnterior) ?? numero(p?.precio_costo);
    // ── PARA REVISAR, EL COSTO NUEVO ES EL DE LA LECTURA QUE SE VA A USAR ──
    //
    // «✓ Usar» acepta lo que la tarjeta muestra, así que lo que se muestra tiene
    // que ser esa lectura y no el número que el motor dejó guardado: si fueran
    // distintos, el botón escribiría un costo que nadie vio.
    const leida = fila ? lecturaPorFila?.get?.(fila.id) ?? null : null;
    const lectura = leida?.lectura ?? null;
    const usaLaLectura = estado === ESTADO_TU_PRODUCTO.REVISAR && motivo !== MOTIVO_DESMARCADA && lectura !== null;
    const costoNuevo = usaLaLectura ? lectura.costoNuevo : fila ? numero(fila.costoMaestroPropuesto) : null;
    const variacionPct = usaLaLectura ? lectura.variacionPct : fila ? numero(fila.diferenciaPct) : null;
    return {
      productoBaseId: p.id,
      nombre: p.nombre,
      estado,
      filaId: fila?.id ?? null,
      costoHoy,
      costoNuevo,
      variacionPct,
      // Por cuánto se multiplica el precio de la lista: "$ 955 × 20". Solo
      // cuando se sabe; sin lectura no se adivina.
      multiplicador: lectura ? numero(lectura.multiplicador) : null,
      // Verde adentro del rango del proveedor, ámbar afuera, sin color cuando no
      // hay contra qué comparar.
      enRango: enElRango(variacionPct, rango),
      usar: accionDeUsar({ estado, motivo, fila, leida, abierta }),
      // Para el buscador: tus códigos y el del renglón de la lista.
      codigos: [p?.codigo_barra, p?.codigo_barra_secundario, fila?.codigoCrudo].filter(Boolean).map(String),
      // El renglón de la lista, tal como lo trae el archivo: es lo que delata
      // un emparejamiento equivocado.
      renglon: fila
        ? {
            codigo: fila.codigoCrudo ?? null,
            descripcion: fila.descripcionProveedor ?? null,
            precio: numero(fila.precioConIva),
            cantidad: numero(fila.unidadesPorBulto),
          }
        : null,
      motivo,
      motivoTexto: motivo ? motivoEnCriollo({ motivo, variacionPct, rango }) : null,
      // Cuántos renglones de la lista apuntan a este producto. Con más de uno,
      // la tarjeta muestra el que decide su estado.
      renglones: filas.length,
    };
  });

  const porEstado = {};
  for (const e of Object.values(ESTADO_TU_PRODUCTO)) porEstado[e] = 0;
  for (const it of items) porEstado[it.estado] += 1;

  return {
    items,
    conteo: {
      total: items.length,
      // "La lista trae N": los tuyos que tienen al menos un renglón.
      traeLaLista: items.filter((i) => i.renglones > 0).length,
      porEstado,
    },
  };
}

/** El chip con el que arranca la pantalla: el primero que tenga algo. */
export function filtroInicial(conteo) {
  for (const f of [FILTRO.SIN_VINCULAR, FILTRO.REVISAR, FILTRO.CAMBIA]) {
    if ((conteo?.porEstado?.[f] ?? 0) > 0) return f;
  }
  return FILTRO.TODOS;
}

/** Cuántos tiene cada chip. "Todos" es el total. */
export function cantidadDelFiltro(filtro, conteo) {
  if (filtro === FILTRO.TODOS) return conteo?.total ?? 0;
  return conteo?.porEstado?.[filtro] ?? 0;
}

/**
 * ¿ESTA TARJETA SE VE CON ESTE FILTRO?
 *
 * `fijados` son los productos que se tocaron con este filtro puesto —vincular,
 * revisar—: siguen a la vista aunque su estado nuevo ya no sea el del chip, para
 * que la tarjeta se actualice EN EL LUGAR y no desaparezca debajo del dedo. Se
 * vacía al cambiar de chip.
 */
export function seVe(item, { filtro = FILTRO.TODOS, buscar = "", fijados = null } = {}) {
  const q = String(buscar ?? "").trim().toLowerCase();
  if (q) {
    const porNombre = String(item?.nombre ?? "").toLowerCase().includes(q);
    const porCodigo = (item?.codigos ?? []).some((c) => String(c).toLowerCase().includes(q));
    if (!porNombre && !porCodigo) return false;
  }
  if (filtro === FILTRO.TODOS) return true;
  if (fijados?.has?.(item?.productoBaseId)) return true;
  return item?.estado === filtro;
}

/**
 * Las primeras palabras del nombre, con las que arranca el buscador de la hoja.
 * Dos alcanzan para encontrar el renglón sin dejar afuera los que lo escriben
 * distinto; el resto del nombre suele ser el peso o la presentación.
 */
export function primerasPalabras(nombre, cuantas = 2) {
  return String(nombre ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, cuantas)
    .join(" ");
}

/**
 * Qué hace «✓ Usar» en esta tarjeta, o null si no tiene ese botón.
 *
 * Con la lista cerrada no hay botón: el servidor lo rechazaría. CONFIRMAR solo
 * si hay una lectura que mostrar y `confirmar` la aceptaría —una fila repetida,
 * bloqueada o sin leer no tiene caso feliz, tiene «Corregir»—.
 */
function accionDeUsar({ estado, motivo, fila, leida, abierta }) {
  if (!abierta || !fila) return null;
  if (estado === ESTADO_TU_PRODUCTO.CAMBIA) return { accion: ACCION_USAR.DESMARCAR };
  if (estado !== ESTADO_TU_PRODUCTO.REVISAR) return null;
  if (motivo === MOTIVO_DESMARCADA) return { accion: ACCION_USAR.MARCAR };
  if (!leida?.lectura || leida.confirmable !== true) return null;
  const l = leida.lectura;
  return {
    accion: ACCION_USAR.CONFIRMAR,
    clave: l.clave,
    fueraDeRango: l.fueraDeRango === true,
    costoNuevo: l.costoNuevo,
    variacionPct: l.variacionPct,
    cuenta: l.cuenta ?? null,
  };
}

/** true adentro del rango, false afuera, null sin porcentaje o sin rango. */
function enElRango(pct, rango) {
  const v = numero(pct);
  const min = numero(rango?.minPct);
  const max = numero(rango?.maxPct);
  if (v === null || min === null || max === null) return null;
  return v >= min && v <= max;
}

function numero(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatoPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${Number.isInteger(n) ? n : n.toFixed(1).replace(".", ",")} %`;
}
