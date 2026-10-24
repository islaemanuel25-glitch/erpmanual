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
import { MOTIVO_BLOQUEO } from "./calculoCosto.js";
import { respuestaSugerida } from "./cajaRecordada.js";
import { FALTA, queFaltaPreguntar } from "./lecturasDeLaFila.js";
import { MOTIVO_CONCILIACION } from "./conciliarLista.js";
import { MOTIVO_NO_CONFIRMABLE } from "./confirmarPresentacion.js";
import { porQueNoSeConfirma } from "./porQueNoSeConfirma.js";
import { localPropietarioDelCosto } from "../../productos/propiedadCosto.js";
import { esMismoPrecio } from "./rangoAumento.js";
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

/** Los chips, en el orden del diseño. «Vinculados» no es un estado: es tener renglón. */
// ── «VINCULADOS» EN LUGAR DE «TODOS» (Emanuel, 2026-10-24) ────────────────
//
// Los productos con renglón vinculado —33 en Dab— estaban repartidos entre
// «Para revisar» y «Cambian», y no había dónde verlos juntos. «Todos» se fue:
// para encontrar uno cualquiera está el buscador, que busca en todos sin mirar
// el chip.
export const FILTRO = Object.freeze({
  SIN_VINCULAR: ESTADO_TU_PRODUCTO.SIN_VINCULAR,
  VINCULADOS: "VINCULADOS",
  REVISAR: ESTADO_TU_PRODUCTO.REVISAR,
  CAMBIA: ESTADO_TU_PRODUCTO.CAMBIA,
});

export const TEXTO_FILTRO = Object.freeze({
  SIN_VINCULAR: "Sin vincular",
  VINCULADOS: "Vinculados",
  REVISAR: "Para revisar",
  CAMBIA: "Cambian",
});

export const ORDEN_FILTROS = Object.freeze([FILTRO.SIN_VINCULAR, FILTRO.VINCULADOS, FILTRO.REVISAR, FILTRO.CAMBIA]);

/**
 * El motivo de revisión, dicho de UN producto y en criollo.
 *
 * `TEXTO_MOTIVO_REVISION` titula GRUPOS ("Aumentan distinto de lo esperado");
 * la tarjeta habla de un solo producto y tiene un renglón. Por eso es otro
 * texto, y por eso vive acá y no en el JSX.
 */
export function motivoEnCriollo({
  motivo,
  variacionPct = null,
  rango = null,
  fila = null,
  puedeCambiarCostos = true,
  proveedor = null,
  // Si la lista se puede aplicar todavía: cerrada, lo de aplicar va en pasado.
  abierta = true,
}) {
  switch (motivo) {
    case MOTIVO_REVISION.AUMENTO_DISTINTO: {
      // ── EL CASO CONCRETO, CON SUS DOS NÚMEROS (Emanuel, 2026-10-24) ───────
      //
      // Decía "Baja, y esperabas un aumento (esperabas entre 0 % y 12 %)": ni
      // cuánto bajó ni de quién es el rango. Ahora: "Bajó 0,5 %. Dab suele
      // aumentar entre 0 % y 12 %." El porcentaje es el de la lectura elegida,
      // que es el que la tarjeta muestra abajo a la derecha.
      const min = numero(rango?.minPct);
      const max = numero(rango?.maxPct);
      const v = numero(variacionPct);
      if (v === null) return "La lista no dice de qué presentación es el precio: elegí cómo leerlo.";
      const quien = proveedor || "Este proveedor";
      const suele = min !== null && max !== null ? ` ${quien} suele aumentar entre ${formatoPct(min)} y ${formatoPct(max)}.` : "";
      if (v < 0) return `Bajó ${formatoPct(Math.abs(v))}.${suele}`;
      if (min !== null && v < min) return `Aumentó solo ${formatoPct(v)}.${suele}`;
      return `Aumentó ${formatoPct(v)}.${suele}`;
    }
    case MOTIVO_REVISION.SIN_COSTO:
      return "No tiene costo cargado, así que no hay con qué comparar el precio de la lista.";
    case MOTIVO_REVISION.REPETIDO:
      return "Su código viene más de una vez en la lista, con precios distintos.";
    case MOTIVO_REVISION.NO_SE_PUEDE_ESCRIBIR:
      // Decía "Desde esta ubicación no se le puede cambiar el costo" en TODA
      // tarjeta bloqueada —combos y precios en cero incluidos— y repetido en
      // cada una. Desde una ubicación que no administra los costos lo dice una
      // sola vez el aviso de arriba; en las demás, el porqué de ese renglón.
      if (!puedeCambiarCostos && fila?.motivo === MOTIVO_CONCILIACION.SIN_PROPIEDAD_COSTO) return null;
      return porQueNoSeConfirma(MOTIVO_NO_CONFIRMABLE.ESTADO_NO_CONFIRMABLE, fila);
    case MOTIVO_REVISION.NO_SE_PUDO_LEER:
      return "Ese renglón de la lista no se pudo leer.";
    case MOTIVO_OMITIDA:
      // Cerrada, en pasado: ya no se aplica, así que "con los datos de hoy" no
      // describe nada que vaya a pasar.
      return abierta
        ? "Con los datos de hoy el costo da distinto del que se había propuesto."
        : "Quedó sin aplicar aunque estaba tildado. Sigue con su costo anterior.";
    case MOTIVO_DESMARCADA:
      return "Lo desmarcaste: no se aplica hasta que toques «Usar».";
    case MOTIVO_SIN_COSTO_NUEVO:
      return "No sé por cuánto multiplicar el precio de la lista. Tocá «Corregir» y elegí si es de la caja o de una unidad.";
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
 * Una fila vinculada a tu producto de la que no salió costo nuevo, con la lista
 * abierta.
 *
 * El caso real (Emanuel, 2026-10-24, lista de Dab): ALFAJOR FULBITO, vinculado a
 * "532 · ALF FULBITO SABOR MANI 30GS · $ 190,43", quedaba sin botones y con
 * "—": no se entendía si estaba hecho o colgado. Una tarjeta con renglón
 * vinculado nunca queda sin acción: va a «Para revisar», con «Corregir» y el
 * porqué en criollo.
 */
export const MOTIVO_SIN_COSTO_NUEVO = "SIN_COSTO_NUEVO";

/**
 * QUÉ UBICACIÓN ADMINISTRA LOS COSTOS DE TUS PRODUCTOS DE ESTE PROVEEDOR.
 *
 * El dueño del costo de cada producto (`localPropietarioDelCosto`, la misma
 * regla que `confirmar` y `aplicar`), y gana el que administra más. Casi siempre
 * es el depósito; un local con productos exclusivos de ese proveedor es el otro
 * caso. Sin productos o sin dueño resoluble, null: no hay a dónde mandar.
 *
 * @param productos con `creadoEnLocalId`
 * @returns el localId, o null
 */
export function quienAdministraLosCostos(productos = [], depositoLocalId = null) {
  const cuenta = new Map();
  for (const p of Array.isArray(productos) ? productos : []) {
    const dueno = localPropietarioDelCosto(p?.creadoEnLocalId ?? null, depositoLocalId);
    if (dueno === null) continue;
    cuenta.set(dueno, (cuenta.get(dueno) ?? 0) + 1);
  }
  let elegido = null;
  for (const [localId, n] of cuenta) {
    if (elegido === null || n > cuenta.get(elegido)) elegido = localId;
  }
  return elegido;
}

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

    // Vinculada y SIN costo nuevo: no se sabe por cuánto multiplicar el precio
    // de la lista. Ver `MOTIVO_SIN_COSTO_NUEVO`. Lo que una persona dejó como
    // está no entra: ésa es una decisión, no un pendiente.
    const sinCosto = lista.find((f) => !laDejaronComoEsta(f) && numero(f?.costoMaestroPropuesto) === null);
    if (sinCosto) return { estado: ESTADO_TU_PRODUCTO.REVISAR, fila: sinCosto, motivo: MOTIVO_SIN_COSTO_NUEVO };
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
 * @param lecturaPorFila  Map filaId → `{ lectura, delPropuesto, confirmable }`,
 *                   de `lecturasDeLaFila`: la lectura elegida para revisar
 *                   (`lecturaElegida`), la del costo ya propuesto
 *                   (`lecturaDelPropuesto`) y si `confirmar` la aceptaría
 * @param proveedor  el nombre, para "Dab suele aumentar entre 0 % y 12 %"
 * @param abierta    si la lista se puede tocar todavía
 * @param puedeCambiarCostos  si la ubicación activa administra los costos de
 *                   la lista (`quienAdministraLosCostos`); si no, ninguna
 *                   tarjeta ofrece «Usar»: desde ahí se vincula y nada más
 * @param sugerencias  Map productoBaseId → renglón sugerido
 *                   (`sugerenciaDeRenglon`), para las sin vincular
 */
export function tusProductosDeLaLista({
  productos = [],
  rango = null,
  omitidas = null,
  noVienen = null,
  lecturaPorFila = null,
  abierta = true,
  puedeCambiarCostos = true,
  proveedor = null,
  sugerencias = null,
} = {}) {
  const items =(Array.isArray(productos) ? productos : []).map((p) => {
    const filas = Array.isArray(p?.filas) ? p.filas : [];
    const decidido = estadoDeTuProducto({
      filas,
      rango,
      omitidas,
      noViene: noVienen?.has?.(p.id) === true,
      abierta,
    });
    const { fila } = decidido;
    let { estado, motivo } = decidido;
    const costoHoy = numero(fila?.costoAnterior) ?? numero(p?.precio_costo);
    // ── PARA REVISAR, EL COSTO NUEVO ES EL DE LA LECTURA ELEGIDA ───────────
    //
    // «✓ Usar» acepta lo que la tarjeta muestra, así que lo que se muestra tiene
    // que ser esa lectura y no el número que el motor dejó guardado: si fueran
    // distintos, el botón escribiría un costo que nadie vio. Y la elegida existe
    // aunque ninguna caiga en el rango (`lecturaElegida`): la tarjeta ya no
    // compara la unidad contra la caja.
    const leida = fila ? lecturaPorFila?.get?.(fila.id) ?? null : null;
    const lectura = leida?.lectura ?? null;
    // ── LA BLOQUEADA POR KILO, CON UN LECTOR QUE SABE PASAR A KILO ──────────
    //
    // GRANIX en producción: la fila se concilió BLOQUEADA porque el producto
    // guarda el costo por kilo, antes de que el lector supiera pasar la pieza a
    // kilo (2026-10-24). Ya no es "no se puede escribir": es un precio para
    // revisar, con su porcentaje si ya hay kilos y con la pregunta si no.
    if (
      estado === ESTADO_TU_PRODUCTO.REVISAR &&
      motivo === MOTIVO_REVISION.NO_SE_PUEDE_ESCRIBIR &&
      fila?.motivo === MOTIVO_BLOQUEO.UNIDAD_INCOMPATIBLE &&
      leida?.admiteKilos === true
    ) {
      motivo = MOTIVO_REVISION.AUMENTO_DISTINTO;
    }
    const usaLaLectura = estado === ESTADO_TU_PRODUCTO.REVISAR && motivo !== MOTIVO_DESMARCADA && lectura !== null;
    const costoNuevo = usaLaLectura ? lectura.costoNuevo : fila ? numero(fila.costoMaestroPropuesto) : null;
    const variacionPct = usaLaLectura ? lectura.variacionPct : fila ? numero(fila.diferenciaPct) : null;
    // La lectura que corresponde al número que se muestra: la elegida si se está
    // revisando, la del costo propuesto si no. La cuenta "× 20" sale de ella.
    const lecturaDeLaCuenta = usaLaLectura ? lectura : leida?.delPropuesto ?? null;

    // ── UN REDONDEO DEL PROVEEDOR NO ES UNA BAJA (AGUANTADORA YERBA) ───────
    //
    // Si la diferencia con el costo de hoy es menor que la tolerancia, no hay
    // nada que decidir: es el mismo precio. Solo se mira en las que se revisan
    // por cuánto se movieron; una repetida o bloqueada sigue pidiendo lo suyo.
    if (
      estado === ESTADO_TU_PRODUCTO.REVISAR &&
      (motivo === MOTIVO_REVISION.AUMENTO_DISTINTO || motivo === MOTIVO_SIN_COSTO_NUEVO) &&
      costoNuevo !== null &&
      esMismoPrecio(variacionPct)
    ) {
      estado = ESTADO_TU_PRODUCTO.MISMO_PRECIO;
      motivo = null;
    }
    // Las dos preguntas de la tarjeta, que piden lo mismo —un número que falta
    // para armar la cuenta— y se reparten por cómo guarda el costo el producto:
    // por kilo, los kilos de la pieza; si no, las unidades de la caja.
    const falta = preguntaFaltaUnNumero({ estado, motivo, abierta, puedeCambiarCostos })
      ? queFaltaPreguntar({ ...leida, lectura, precioLista: fila?.precioConIva })
      : null;
    const preguntarKilos = falta === FALTA.KILOS;
    const preguntarCaja = falta === FALTA.CAJA;
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
      multiplicador: lecturaDeLaCuenta ? numero(lecturaDeLaCuenta.multiplicador) : null,
      // ── POR KILO (GRANIX, 2026-10-24) ─────────────────────────────────────
      // Si el producto guarda el costo por kilo, la cuenta va en kilos: "$
      // 22.105,73 ÷ 2 kg = $ 11.052,87 el kilo". `divisorKg` es entre cuántos
      // kilos se dividió; `kilosPorPieza` y `piezas` arman el texto del bulto.
      porKilo: leida?.porKilo === true,
      divisorKg: lecturaDeLaCuenta ? numero(lecturaDeLaCuenta.divisorKg) : null,
      kilosPorPieza: lecturaDeLaCuenta ? numero(lecturaDeLaCuenta.kilosPorPieza) : null,
      piezas: lecturaDeLaCuenta ? numero(lecturaDeLaCuenta.piezas) : null,
      precioBase: lecturaDeLaCuenta ? numero(lecturaDeLaCuenta.precioBase) : null,
      // Verde adentro del rango del proveedor, ámbar afuera, sin color cuando no
      // hay contra qué comparar.
      enRango: enElRango(variacionPct, rango),
      usar: puedeCambiarCostos ? accionDeUsar({ estado, motivo, fila, leida, abierta }) : null,
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
      // Sin los kilos de la pieza, el porqué es ése y no "elegí cómo leerlo".
      motivoTexto: preguntarKilos
        ? TEXTO_FALTAN_LOS_KILOS
        : motivo
          ? motivoEnCriollo({ motivo, variacionPct, rango, fila, puedeCambiarCostos, proveedor, abierta })
          : null,
      // Cuántos renglones de la lista apuntan a este producto. Con más de uno,
      // la tarjeta muestra el que decide su estado.
      renglones: filas.length,
      // "¿Es 101 · BIZCOCHITOS CAMPEON 300G?" (Emanuel, 2026-10-24): el renglón
      // que la hoja de vincular pondría primero, si se parece lo suficiente
      // (`sugerenciaDeRenglon`). Solo sin vincular y con la lista abierta. Es una
      // pregunta: el vínculo lo hace «✓ Sí», nunca esto.
      sugerencia:
        abierta && estado === ESTADO_TU_PRODUCTO.SIN_VINCULAR ? sugerencias?.get?.(p.id) ?? null : null,
      preguntarCaja,
      preguntarKilos,
      // Con lo que arranca el campo de la pregunta, si el nombre lo dice
      // ("2KG" → 2, "X 12" → 12). Solo se sugiere: guarda «Listo».
      respuestaSugerida:
        preguntarCaja || preguntarKilos
          ? respuestaSugerida({ porKilo: preguntarKilos, textos: [fila?.descripcionProveedor, p?.nombre] })
          : null,
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
      // La barra de arriba, "X de 158 listos" (Emanuel, 2026-10-24): listo es
      // lo que no pide trabajo, o sea ni «Sin vincular» ni «Para revisar».
      // Sale de los mismos contadores que los chips, así no se contradicen.
      listosDeLaRevision:
        items.length - porEstado[ESTADO_TU_PRODUCTO.SIN_VINCULAR] - porEstado[ESTADO_TU_PRODUCTO.REVISAR],
    },
  };
}

// ── UNA LISTA CERRADA SE CUENTA EN PASADO (Emanuel, 2026-10-24) ─────────────
//
// En una lista terminada decía "65 están listos pero sin tildar, así que
// aplicar no los va a tocar": aplicar en futuro, cuando ya no se puede. Lo que
// pasó es que quedaron sin aplicar, y eso es lo que se dice.

/** Lo que dice la barra de abajo de una lista cerrada: "12 costos actualizados". */
export function resumenDeLaCerrada(actualizados) {
  const n = Number(actualizados) || 0;
  return n === 1 ? "1 costo actualizado" : `${n} costos actualizados`;
}

/** Listos y sin tildar, en una lista cerrada. */
export function textoSinTildarEnUnaCerrada(n) {
  return n === 1
    ? "1 quedó sin aplicar: estaba listo pero sin tildar. Sigue con su costo anterior."
    : `${n} quedaron sin aplicar: estaban listos pero sin tildar. Siguen con su costo anterior.`;
}

/**
 * Tildados que no se escribieron, en una lista cerrada. Solo el hecho: que
 * estaban tildados y no se aplicaron. El porqué de HOY —"con los datos de hoy
 * el costo da distinto"— es una revalidación para aplicar, y una lista cerrada
 * ya no se aplica.
 */
export function textoTildadosSinAplicarEnUnaCerrada(n) {
  return n === 1
    ? "1 quedó sin aplicar aunque estaba tildado. Sigue con su costo anterior."
    : `${n} quedaron sin aplicar aunque estaban tildados. Siguen con su costo anterior.`;
}

/** El porqué de la tarjeta, y de la hoja, cuando faltan los kilos de la pieza. */
export const TEXTO_FALTAN_LOS_KILOS =
  "Lo tenés cargado por kilo y la lista cotiza la pieza: para pasar el precio a kilo falta saber cuántos kilos trae la pieza.";

/**
 * ¿A LA TARJETA LE FALTA UN NÚMERO PARA ARMAR LA CUENTA? (Emanuel, 2026-10-24)
 *
 * Dos preguntas con la misma forma, y por eso la misma condición:
 *
 * - "¿Cuántas trae la caja?" — ALICANTE PIMENTÓN 25G: renglón "4233 · $
 *   800,45", hoy $ 19.680, y ni el catálogo ni el papel dicen cuántas trae.
 * - "¿Cuántos kilos trae la pieza?" — GRANIX BOCADITO 2KG: guarda el costo por
 *   kilo, $ 6.405, y la lista cotiza la pieza a $ 22.105,73.
 *
 * Qué falta lo contesta `queFaltaPreguntar` —la MISMA función que usa la hoja
 * de «Corregir», para que la tarjeta y la hoja no digan cosas distintas—: sin
 * ninguna lectura elegida, con precio en el renglón y con una respuesta que
 * `confirmar` aceptaría. Lo que es de la tarjeta se mira acá:
 *
 * - para revisar y sin desmarcar;
 * - lista abierta, y desde la ubicación que administra el costo: la respuesta
 *   cambia el costo que se va a escribir.
 */
function preguntaFaltaUnNumero({ estado, motivo, abierta, puedeCambiarCostos }) {
  return (
    abierta === true &&
    puedeCambiarCostos === true &&
    estado === ESTADO_TU_PRODUCTO.REVISAR &&
    motivo !== MOTIVO_DESMARCADA
  );
}

/**
 * El chip con el que arranca la pantalla: el primero que pida trabajo. Si
 * ninguno pide, «Vinculados», que es lo que la lista trajo.
 */
export function filtroInicial(conteo) {
  for (const f of [FILTRO.SIN_VINCULAR, FILTRO.REVISAR, FILTRO.CAMBIA]) {
    if ((conteo?.porEstado?.[f] ?? 0) > 0) return f;
  }
  return FILTRO.VINCULADOS;
}

/**
 * EL CHIP QUE SE MUESTRA PUESTO.
 *
 * El que eligió la persona, salvo dos casos en que manda `filtroInicial`: que
 * todavía no haya elegido ninguno, o que la lista esté CERRADA y el chip esté
 * vacío. Lo segundo es el caso de Dab terminada (2026-10-24): arrancaba en
 * "Cambian 0" con "No hay ninguno en este grupo", porque era el chip que estaba
 * puesto para aplicar. Con la lista abierta un chip vacío se respeta: es lo que
 * pasa al resolver la última tarjeta, y saltar a otro sacaría a la persona de
 * donde está trabajando.
 */
export function filtroParaMostrar(filtro, conteo, { abierta = true } = {}) {
  if (!filtro) return filtroInicial(conteo);
  if (!abierta && cantidadDelFiltro(filtro, conteo) === 0) return filtroInicial(conteo);
  return filtro;
}

/**
 * Cuántos tiene cada chip. «Vinculados» es `traeLaLista`, el mismo número de la
 * tarjeta de arriba ("33 / 158 en la lista"): dos cuentas de lo mismo a cinco
 * centímetros no pueden decir cosas distintas.
 */
export function cantidadDelFiltro(filtro, conteo) {
  if (filtro === FILTRO.VINCULADOS) return conteo?.traeLaLista ?? 0;
  return conteo?.porEstado?.[filtro] ?? 0;
}

/**
 * ¿ESTA TARJETA SE VE CON ESTE FILTRO?
 *
 * ── LA RESUELTA SE VA DEL FILTRO (Emanuel, 2026-10-24) ────────────────────
 *
 * Reemplaza a los `fijados`, que la dejaban en el lugar aunque ya no fuera del
 * chip. Ahora la tarjeta que deja de pertenecer al chip sale de la lista, y el
 * aviso de abajo ("Listo: … · Deshacer") es lo que evita que se pierda.
 *
 * ── CON TEXTO EN EL BUSCADOR, EL CHIP NO CUENTA (2026-10-24) ──────────────
 *
 * Se busca en TODOS tus productos del proveedor. Antes el buscador filtraba
 * adentro del chip, y sin «Todos» un producto en otro chip sería imposible de
 * encontrar escribiendo su nombre.
 */
export function seVe(item, { filtro = FILTRO.VINCULADOS, buscar = "" } = {}) {
  const q = String(buscar ?? "").trim().toLowerCase();
  if (q) {
    const porNombre = String(item?.nombre ?? "").toLowerCase().includes(q);
    const porCodigo = (item?.codigos ?? []).some((c) => String(c).toLowerCase().includes(q));
    return porNombre || porCodigo;
  }
  if (filtro === FILTRO.VINCULADOS) return (item?.renglones ?? 0) > 0;
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
