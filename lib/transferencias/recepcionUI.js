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
  exigeMotivo,
  resolverUnidadEnviada,
  unidadesFisicasDe,
} from "./recepcion.js";
import { presentacionDeProducto } from "@/lib/productos/presentacionDeProducto";
import {
  unidadFisicaDe,
  descriptorDeEnvio,
  agrupa,
  rotuloConSueltas,
  fmtCantidadDeEnvio,
} from "./presentacionEnvio.js";
// `unidadDeDiferencia`, `rotuloDeEnvio` y `conversionParaAdoptar` se importaban
// acá para `resultadoDeConteo`. Se fueron con él: un import que solo sostenía
// código borrado deja el módulo diciendo que depende de algo que ya no usa.

/**
 * ════════════════════════════════════════════════════════════════════════════
 * LAS UNIDADES FÍSICAS DE UNA LÍNEA, EN LA ESCALA CANÓNICA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── POR QUÉ NO SE LEE `unidadEnviada` Y `factorPack` DIRECTO ──────────────
 *
 * Porque mienten en la mayoría de las líneas reales. El camino que crea casi
 * todas estas transferencias —la venta interna del POS— convierte los packs a
 * unidades ANTES de guardar, así que escribe `unidadEnviada: "UNIDAD"` siempre.
 * Una línea con snapshot "PACK x6" y tres sueltas queda entonces pidiéndole a
 * `unidadesFisicasDe` que sume sueltas sobre una unidad que no agrupa, y eso
 * devuelve **null** — no un número raro: null.
 *
 * El síntoma es el peor: la cuenta no da mal, da NADA, y quien la consume la
 * trata como "no hay diferencia". Se descubrió con el arnés, ejerciendo la
 * pantalla: la barra de cierre no contaba una diferencia que la tarjeta de
 * arriba sí estaba mostrando.
 *
 * La escala sale del DESCRIPTOR, que es el que lee el snapshot cuando está y
 * reconstruye cuando no. Es la misma fuente que ya usan el stock y el dinero.
 *
 * ── Y VIVE ACÁ, UNA SOLA VEZ ─────────────────────────────────────────────
 *
 * La tarjeta móvil y la barra de cierre necesitan exactamente esto. Con una
 * copia en cada una, el día que la escala cambie una diría que hay diferencia y
 * la otra que no, sobre la misma línea y en la misma pantalla.
 */
export function escalaFisicaDeLinea(d = {}) {
  const envio = descriptorDeEnvio(d);
  const agrupada = agrupa(envio.presentacion);
  return {
    envio,
    agrupa: agrupada,
    // Las sueltas solo significan algo dentro de un bulto: es la misma regla que
    // aplica `escalaDeEnvio`, y por eso se pregunta por la PRESENTACIÓN y no por
    // la columna cruda.
    unidad: agrupada ? "BULTO" : "UNIDAD",
    factorPack: Number(envio.factor) || 1,
  };
}

/** Las físicas que el remito dice haber despachado. `null` si no se puede saber. */
export function fisicasEnviadasDe(d = {}) {
  const e = escalaFisicaDeLinea(d);
  return unidadesFisicasDe({
    cantidad: e.envio.cantidad,
    sueltas: e.envio.sueltas,
    unidad: e.unidad,
    factorPack: e.factorPack,
  });
}

/**
 * Las físicas contadas. Sin argumentos toma lo PERSISTIDO; con ellos, lo que el
 * operador tiene escrito ahora —que es lo que la tarjeta necesita mientras se
 * mueve el contador—.
 */
export function fisicasRecibidasDe(d = {}, { cantidad, sueltas } = {}) {
  const e = escalaFisicaDeLinea(d);
  const cant = cantidad === undefined ? d.cantidadRecibida : cantidad;
  if (cant === null || cant === undefined) return null;
  return unidadesFisicasDe({
    cantidad: cant,
    sueltas: sueltas === undefined ? d.recibidoUnidadesSueltas : sueltas,
    unidad: e.unidad,
    factorPack: e.factorPack,
  });
}

/**
 * CUÁNTAS LÍNEAS SE CORRIGIERON. Lo pide la barra: "Total · 2 corregidos".
 *
 * ── POR QUÉ ES UNA FUNCIÓN Y NO UN `filter` EN EL JSX ───────────────────
 *
 * Porque tiene tres exclusiones y ninguna es obvia leyéndola:
 *
 *   · una línea SIN revisar no cuenta. Tener una diferencia cargada no es
 *     haberla cerrado, y la barra dice cuántas quedaron corregidas;
 *   · un NO DECLARADO no cuenta. No venía en el remito, así que no hay nada
 *     que se le haya corregido — contarlo diría que se tocaron líneas del
 *     documento que nadie tocó;
 *   · y se mide en FÍSICO. 5 packs de 24 más 24 sueltas son las mismas 144 que
 *     6 packs: cambió cómo se contó, no cuánto llegó. Medirlo en la
 *     presentación daría 5 ≠ 6 y contaría una corrección que no existe, que es
 *     el mismo error que ya rompió esta pantalla midiendo diferencias fuera de
 *     físico.
 *
 * Cada una de las tres tiene su candado en `recepcionUI.test.mjs`.
 */
export function contarCorregidas(items) {
  if (!Array.isArray(items)) return 0;
  return items.filter((d) => {
    if (!d || d.agregadoEnRecepcion || d.revisadoEnRecepcion !== true) return false;
    const env = fisicasEnviadasDe(d);
    const rec = fisicasRecibidasDe(d);
    return env != null && rec != null && rec !== env;
  }).length;
}

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

/** Cantidades: enteras sin decimales, fraccionarias con hasta 3 útiles. */
function fmtCant(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  return Number.isInteger(v)
    ? v.toLocaleString("es-AR")
    : v.toLocaleString("es-AR", { maximumFractionDigits: 3 });
}

/**
 * LO ENVIADO Y LO CONTADO, CON LA FLECHA: "6 → 4 PACK x24".
 *
 * ── ACÁ ESTABA `resultadoDeConteo`, Y POR QUÉ SE FUE ────────────────────
 *
 * Decía "4 PACK x24 de 6 PACK x24 · faltan 48 unidades" y lo dibujaban dos
 * lugares: el renglón teñido del panel y el aviso de la tarjeta. El V26 lo sacó
 * de los dos, y con eso quedó sin un solo consumidor — que es el patrón del
 * `conImporte`: doce candados verdes montando una rama que ya no se
 * renderizaba. Se dio de baja en vez de dejarlo.
 *
 * El motivo del diseño es el criterio de toda esa tanda: si un dato ya está en
 * la pantalla, no se repite. Ese renglón decía tres veces lo mismo —el enviado
 * ya estaba arriba, lo contado en el campo, y la diferencia es la resta de los
 * dos— y encima lo decía largo.
 *
 * ── POR QUÉ ESTA FUNCIÓN ES UNA Y NO DOS ───────────────────────────────
 *
 * Hay dos momentos del mismo hecho —conté algo distinto de lo que dice el
 * remito— y hasta ahora tenían dos redacciones:
 *
 *   · la línea YA REVISADA y corregida, colapsada en la lista;
 *   · la línea con conteo cargado y todavía sin revisar. Son 7 en producción,
 *     contadas el 2026-09-12 sobre las transferencias abiertas.
 *
 * Son el mismo hecho en dos momentos, así que dicen lo mismo y con una sola
 * función. Dos redacciones para un hecho se separan el día que una cambia, y
 * esta pantalla ya se comió ese defecto una vez.
 *
 * ── LA REDACCIÓN PERDIÓ DOS PALABRAS, Y ES A PROPÓSITO ─────────────────
 *
 * La colapsada decía "enviado 6 → contaste 4 PACK x24". La flecha ya dice de
 * qué a qué, así que "enviado" y "contaste" son rótulos que no agregan un dato
 * — y en la colapsada competían por el ancho con el nombre del producto, que
 * es lo que dice sobre qué línea se está trabajando. El caso está anotado ahí
 * mismo: con el botón puesto, los nombres se truncaban a "DON SATUR BIZCO…".
 *
 * @param {object} a
 * @param {number} a.enviadas    cantidad PRESENTADA del remito (6, no 144)
 * @param {number} a.recibidas   cantidad PRESENTADA contada
 * @param {number} a.sueltas     unidades sueltas contadas, si el bulto se abrió
 * @param {object} a.envio       el descriptor, que nombra la presentación
 * @returns {string|null} `null` si falta alguno de los dos números
 */
export function correccionDeCantidad({ enviadas, recibidas, sueltas = 0, envio } = {}) {
  if (enviadas == null || recibidas == null) return null;
  const contado = rotuloConSueltas({
    ...(envio || {}),
    cantidad: recibidas,
    sueltas: Number(sueltas) || 0,
  });
  // ── LOS DOS LADOS DE LA FLECHA SE FORMATEAN IGUAL ─────────────────────
  //
  // El derecho sale de `rotuloConSueltas`, que ya escribe tres decimales en KG.
  // El izquierdo usaba el `fmtCant` local, que no sabe la presentación: sobre una
  // línea por peso el renglón salía "3,25 → 3,100 KG", los dos números en la
  // misma frase y con distinta precisión.
  //
  // Por eso acá se usa el formateador del módulo que SÍ sabe la escala. Es la
  // única de las cuatro copias que esta tanda convirtió, y es porque hacía falta
  // para el peso — el resto está anotado, no arrastrado.
  return `${fmtCantidadDeEnvio(enviadas, envio?.presentacion)} → ${contado}`;
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
 * Lista vacía significa "no se pide motivo", y hay DOS razones para eso:
 *
 *   · no hay diferencia — no hay nada que explicar;
 *   · la línea se AGREGÓ en recepción — su procedencia ya está registrada, con
 *     autor y fecha, y pedirle además "Sobrante" es pedir dos veces lo mismo.
 *
 * Quién decide eso NO se escribe acá: sale de `exigeMotivo`, la misma función que
 * usa `validarDetalleRecepcion` en el servidor. Con una copia de la regla de cada
 * lado, la pantalla terminaría pidiendo un motivo que el servidor no exige, o al
 * revés — y esta pantalla ya se rompió una vez exactamente por eso.
 */
export function motivosParaDiferencia({ enviada, recibida, agregadoEnRecepcion } = {}) {
  const estado = estadoDeLinea({ enviada, recibida });
  const hayDiferencia = estado === ESTADO_LINEA.FALTANTE || estado === ESTADO_LINEA.EXCEDENTE;
  if (!exigeMotivo({ hayDiferencia, agregadoEnRecepcion })) return [];
  return estado === ESTADO_LINEA.FALTANTE ? MOTIVOS_FALTANTE : MOTIVOS_SOBRANTE;
}

/**
 * LOS MISMOS MOTIVOS, CON LA ETIQUETA CORTA DE LA TARJETA MÓVIL.
 *
 * ── POR QUÉ UNA ETIQUETA DISTINTA Y NO UN VALOR DISTINTO ──────────────────
 *
 * El diseño aprobado de la tarjeta móvil pide un chip que diga **"Roto"**. En la
 * base ese motivo se guarda desde siempre como `"Producto dañado"`, y ahí tiene
 * que seguir: crear un valor nuevo dejaría las líneas viejas con una etiqueta
 * que la UI nueva ya no ofrece, y cualquier reporte por motivo vería dos
 * nombres para la misma cosa.
 *
 * Así que lo que cambia es CÓMO SE LEE, no QUÉ SE GUARDA. El `value` es el
 * canónico y viaja tal cual al servidor.
 *
 * ── Y LOS CHIPS SIGUEN SALIENDO DEL SIGNO ────────────────────────────────
 *
 * No se ofrecen los cuatro siempre. Sobre un faltante no se ofrece "Sobrante" y
 * al revés: eso ya lo decide `motivosParaDiferencia`, que es la misma función
 * que respalda `exigeMotivo` en el servidor. Esta función no elige nada — solo
 * acorta el texto. Si eligiera, habría dos criterios y un día dirían distinto.
 *
 * En una fila angosta "Otro (especificar)" no entra, y el chip ya abre el campo
 * de detalle cuando se elige: la aclaración está en la acción, no en el rótulo.
 */
export const ETIQUETA_CHIP_MOVIL = Object.freeze({
  "Producto dañado": "Roto",
  Otro: "Otro",
});

/**
 * Los chips de motivo de una tarjeta móvil: `[{ clave, texto }]`.
 *
 * Lista vacía = no se pide motivo, por las mismas dos razones de siempre (no hay
 * diferencia, o la línea se agregó en recepción).
 */
export function chipsDeMotivo(args) {
  return motivosParaDiferencia(args).map((m) => ({
    clave: m.value,
    texto: ETIQUETA_CHIP_MOVIL[m.value] || m.label,
  }));
}

/**
 * ¿El motivo que hay guardado sigue teniendo sentido con esta diferencia?
 *
 * Sirve para el caso real: alguien cargó 8 sobre 10, eligió "Faltante", y
 * después corrige a 15. El motivo viejo quedaría diciendo lo contrario de lo que
 * pasó. Devuelve false y el llamador lo limpia.
 */
export function motivoSigueSiendoValido({
  enviada,
  recibida,
  motivoPrincipal,
  agregadoEnRecepcion,
} = {}) {
  if (!motivoPrincipal) return true;
  const validos = motivosParaDiferencia({ enviada, recibida, agregadoEnRecepcion });
  if (validos.length === 0) return false;
  return validos.some((m) => m.value === motivoPrincipal);
}

// ── AGREGAR UN PRODUCTO QUE NO ESTABA EN EL REMITO ─────────────────────────

/**
 * QUÉ ES ESTE PRODUCTO, SEGÚN EL CATÁLOGO DEL ORIGEN.
 *
 * ── ACÁ SE PREGUNTABA, Y ERA LA PREGUNTA EQUIVOCADA ─────────────────────
 *
 * Antes esto era `opcionesDeUnidad`: armaba la lista UNIDAD / BULTO para que el
 * operador eligiera. El razonamiento escrito al lado era que suponer la unidad
 * es caro —con factor 20, suponer son 57 unidades que no aparecen en ningún
 * lado— y eso sigue siendo cierto. Lo que estaba mal era de dónde salía la
 * respuesta: **no hace falta suponerla, el catálogo del origen la sabe.**
 *
 * Un producto con `unidad_medida = "cajon"` y factor 8 es un CAJÓN x8; un
 * fiambre de pieza fija es una PIEZA; un producto de kilo es KG. Pedirle a
 * alguien que traduzca eso al enum técnico BULTO/UNIDAD es pedirle que haga a
 * mano una cuenta que el dominio ya tiene resuelta, y le da la oportunidad de
 * equivocarla.
 *
 * Lo que sí queda para el operador es lo único que el catálogo NO puede saber:
 * CUÁNTOS llegaron, y —en un agrupado— cuántos vinieron sueltos fuera de bulto.
 *
 * La decisión no se toma acá: sale de `presentacionDeProducto`, el único lugar
 * del repo donde se decide qué es un pack, un cajón, un kilo o una pieza.
 */
export function presentacionDeProductoNuevo(producto = {}) {
  return presentacionDeProducto({
    unidadMedida: producto?.unidadMedida,
    factorPack: producto?.factorPack,
    modoVentaDeposito: producto?.modoVentaDeposito,
    pesoReferenciaKg: producto?.pesoReferenciaKg,
    modoCompraProveedor: producto?.modoCompraProveedor,
    pesoEsFijo: producto?.pesoEsFijo,
    // SIN `contadoEn`: nadie eligió nada, y ese es el punto. Manda el catálogo.
  });
}

/** El enum técnico que le corresponde. La traducción vive en el dominio. */
export function unidadDeProductoNuevo(producto = {}) {
  return unidadFisicaDe(presentacionDeProductoNuevo(producto));
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
export function previsualizarIngresoFisico({ cantidad, sueltas, unidad, factorPack } = {}) {
  const c = Number(cantidad);
  const s = Number(sueltas || 0);
  const hayCantidad = Number.isFinite(c) && c > 0;
  const haySueltas = Number.isFinite(s) && s > 0;
  // Con dos campos, llenar SOLO las sueltas es un caso real: llegó un bulto
  // abierto y nada entero. Antes esto exigía cantidad y devolvía null.
  if (!hayCantidad && !haySueltas) return null;
  if (unidad !== "BULTO") return null;
  const f = Number(factorPack || 1);
  if (!(f > 1)) return null;
  // Por `unidadesFisicasDe` —la misma que el servidor— y no multiplicando acá:
  // es lo que hace que el pack incompleto dé exacto. 2 × 6 + 1 = 13.
  return unidadesFisicasDe({
    cantidad: hayCantidad ? c : 0,
    sueltas: haySueltas ? s : 0,
    unidad,
    factorPack: f,
  });
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
 * ── LA UNIDAD SIGUE SIN TENER DEFAULT, PERO YA NO LA ELIGE NADIE ─────────
 *
 * Si llega vacía, esto devuelve `ok: false` y **no hay POST**. Lo que cambió es
 * de dónde viene: la pantalla la deriva del catálogo del origen con
 * `unidadDeProductoNuevo` en vez de pedírsela al operador. El candado se queda
 * igual —es el mismo que el servidor ya tiene— pero desde esta pantalla no puede
 * dispararse, porque el catálogo siempre contesta.
 *
 * ── EL PACK INCOMPLETO TAMBIÉN ACÁ ───────────────────────────────────────
 *
 * Llegaron 2 packs enteros y 1 suelta. Se mandan los DOS números
 * —`recibido: 2` y `recibidoUnidadesSueltas: 1`— y el servidor multiplica una
 * sola vez: 2 × 6 + 1 = 13. Mandar 2,167 packs sería el mismo error de
 * exactitud que el resto de la recepción ya evita: 2,167 × 6 = 13,002.
 *
 * Las sueltas solo existen dentro de un bulto. En UNIDAD, KG y PIEZA la cantidad
 * YA está en unidades físicas, así que un desglose se sumaría encima de sí mismo
 * — es la misma regla que `milesimasFisicas` aplica del lado del servidor.
 *
 * @returns {{ok:true, cuerpo:object} | {ok:false, error:string, mensaje:string}}
 */
export function validarLineaNueva({
  transferenciaId,
  producto,
  unidadEnviada,
  recibido,
  recibidoUnidadesSueltas,
  /** Solo el alta EN LÍNEA del teléfono. Ver el bloque de la regla del cero. */
  permitirCero = false,
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

  const vacio = (v) => v === null || v === undefined || v === "";

  // Las sueltas primero: deciden si un `recibido` en cero es válido. Llegó un
  // bulto abierto con 4 unidades y ninguno entero es un caso real.
  let sueltas = 0;
  if (!vacio(recibidoUnidadesSueltas)) {
    if (uni.unidad !== "BULTO") {
      return {
        ok: false,
        error: ERRORES_RECEPCION.SUELTAS_SIN_BULTO,
        mensaje:
          "Este producto no viene en bultos, así que no puede tener unidades sueltas: cargá todo en el campo de cantidad.",
      };
    }
    sueltas = Number(recibidoUnidadesSueltas);
    if (!Number.isFinite(sueltas) || sueltas < 0) {
      return {
        ok: false,
        error: "SUELTAS_INVALIDAS",
        mensaje: "Las unidades sueltas tienen que ser un número de cero para arriba.",
      };
    }
  }

  const cantidad = vacio(recibido) ? 0 : Number(recibido);
  if (!Number.isFinite(cantidad) || cantidad < 0) {
    return {
      ok: false,
      error: "CANTIDAD_INVALIDA",
      mensaje: "Ingresá cuántos llegaron. Tiene que ser un número de cero para arriba.",
    };
  }
  // ── UNA LÍNEA EN CERO: CUÁNDO NO, Y CUÁNDO SÍ ──────────────────────────
  //
  // La regla de siempre: una línea que no informa NADA no tiene sentido, sería
  // agregar un producto para decir que llegaron cero. Vale para el panel de
  // escritorio, donde el operador escribe la cantidad ANTES de confirmar el
  // alta: si la dejó vacía, es que se equivocó de producto.
  //
  // El V16 le dio al teléfono otro camino: se toca el producto en la lista del
  // catálogo y la línea CAE en cero, para cargarla en la tarjeta con el mismo
  // contador que las demás. Ahí el cero no es "llegaron cero": es "todavía no
  // lo conté", y el paso siguiente es contarlo.
  //
  // Se abre con una opción explícita en vez de aflojar la regla, para que el
  // camino de escritorio siga protegido. Y el cero no queda suelto: una línea
  // agregada sin cantidad TRABA la confirmación —ver `sinCargar` en
  // `RecepcionMovil`—, así que no se puede cerrar un remito con un borrador
  // adentro.
  if (!permitirCero && cantidad <= 0 && sueltas <= 0) {
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
      // EN LA UNIDAD DEL CATÁLOGO. Sin multiplicar por el factor: ver arriba.
      recibido: cantidad,
      // Solo cuando hay bulto incompleto. Mandar un 0 explícito sobre una línea
      // en UNIDAD sería mandar un campo que ahí no significa nada.
      ...(uni.unidad === "BULTO" ? { recibidoUnidadesSueltas: sueltas } : {}),
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
    // ESTRUCTURAL, y por eso NO está en `CAMPOS_EDITABLES`: decide si esta línea
    // tiene que explicar su diferencia con un motivo. Viaja en la fila de edición
    // porque la prevalidación de "Guardar cambios" recorre `editItems` y necesita
    // la misma respuesta que el servidor.
    //
    // Sale SIEMPRE de la respuesta fresca. La reconciliación pisa lo fresco con
    // los tres campos editables y nada más, así que una versión vieja de este
    // flag no puede sobrevivir a una recarga — que es justo lo que haría que la
    // pantalla pidiera un motivo sobre una línea agregada, o al revés.
    agregadoEnRecepcion: d.agregadoEnRecepcion === true,
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

// ── LOS DOS MODOS DE LA PANTALLA, Y POR QUÉ EL LEGACY NO PUEDE GOBERNAR ────
//
// La pantalla de una transferencia dibuja UNA de dos cosas:
//
//   · CONTROL FÍSICO — quien está recibiendo. Cada producto se persiste solo, al
//     marcarlo revisado. No hay "Guardar cambios" y no puede haberlo: la ficha
//     PROPONE lo enviado para el caso feliz, así que un guardado masivo
//     escribiría 150 valores propuestos como cantidades reales.
//
//   · EDITOR POR LOTES — todos los demás. La tabla histórica, con `editItems`,
//     `dirty` y su botón de guardar.
//
// ── EL DIRTY FANTASMA ─────────────────────────────────────────────────────
//
// Los dos modos compartían el mismo `editItems`, y el editor por lotes seguía
// vivo debajo del control físico aunque su tabla no estuviera montada. Eso
// producía un bloqueo imposible de resolver:
//
//     el remito trae 6 BULTO x6, sin recepción cargada
//     → `filaDeServidor` PROPONE recibido = 6
//     el operador cuenta en la ficha 5 packs + 5 sueltas y marca revisado
//     → el servidor persiste recibido = 5, sueltas = 5
//     → la recarga reconcilia lo fresco (5) con la propuesta vieja (6)
//     → hayEdicionPendiente compara 6 contra 5 → dirty = true
//
// y entonces Confirmar decía "Tenés cambios sin guardar. Guardalos antes de
// confirmar." sobre una edición que nunca existió, con el botón de guardar
// retirado a propósito. El operador quedaba sin salida.
//
// ── POR QUÉ SE ARREGLA ACÁ Y NO CON UN setDirty(false) ────────────────────
//
// Un `setDirty(false)` después de cada fetch tapa el síntoma y deja la causa:
// el estado legacy sigue gobernando, y basta que mañana alguien agregue una
// cuarta recarga para que el fantasma vuelva por esa puerta. Lo que hace falta
// es que sea IMPOSIBLE, y para eso la decisión tiene que ser una sola y estar
// en un lugar: en modo control físico no se reconcilia y `dirty` no puede ser
// true, porque no hay nada que guardar.
//
// El editor por lotes NO se toca: sigue reconciliando y sigue avisando, porque
// tiene un consumidor válido —la tabla histórica— y ahí el aviso es correcto.

/** Cuál de las dos pantallas de productos está montada. */
export const MODO_RECEPCION = Object.freeze({
  CONTROL_FISICO: "controlFisico",
  EDITOR_LOTES: "editorLotes",
});

/**
 * El modo lo decide UNA sola pregunta: si esta persona está recibiendo.
 *
 * Es la misma condición que elige qué componente se monta, así que el modelo de
 * datos y lo que se dibuja no pueden desincronizarse.
 */
export function modoDeRecepcion({ puedeRecibir } = {}) {
  return puedeRecibir === true ? MODO_RECEPCION.CONTROL_FISICO : MODO_RECEPCION.EDITOR_LOTES;
}

/**
 * QUÉ QUEDA EN `editItems` Y EN `dirty` DESPUÉS DE UNA RECARGA.
 *
 * Es el único lugar donde se decide, y por eso el llamador no puede equivocarse:
 * pedir `preservar: true` desde el control físico no preserva nada. La petición
 * no es un error del llamador —agregar y quitar SÍ tienen que preservar en el
 * editor por lotes— sino algo que solo significa algo en uno de los dos modos.
 *
 * @returns {{editItems: object[], dirty: boolean}}
 */
export function siguienteEdicion({ modo, preservar = false, items = [], previos = [] } = {}) {
  const conservar = modo === MODO_RECEPCION.EDITOR_LOTES && preservar === true;

  const editItems = conservar
    ? reconciliarEditItems({ items, previos })
    : construirEditItems(items);

  return {
    editItems,
    // Reemplazar no deja nada pendiente. Preservar sí puede, y se PREGUNTA en vez
    // de suponerse: si la única edición que había estaba en la línea que se acaba
    // de quitar, vuelve a false solo.
    dirty: conservar ? hayEdicionPendiente({ items, editItems }) : false,
  };
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
