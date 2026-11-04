// lib/conversiones/stock.js
// Helpers para conversión entre bultos+sueltas y unidades

/**
 * Tres decimales, que es la escala física de StockLocal.cantidad
 * (`Decimal(12,3)`). Todo lo que se muestre o se derive de esa columna se
 * redondea acá: la aritmética binaria de JavaScript inventa dígitos que la
 * columna no puede contener, y esos dígitos terminan en pantalla.
 */
function aEscalaFisica(n) {
  return Math.round(Number(n || 0) * 1000) / 1000;
}

/**
 * Convierte cantidad en bultos+sueltas a unidades totales
 * @param {Object} params
 * @param {number} params.cantidad - Cantidad (puede ser bultos o unidades según unidad)
 * @param {string} params.unidad - "BULTO" | "UNIDAD"
 * @param {number} params.factorPack - Factor del pack (ej: 12 para cajón x12)
 * @returns {number} Total en unidades
 */
export function toUnidades({ cantidad, unidad, factorPack = 1, sueltosPorUnidad = null }) {
  if (!cantidad || cantidad <= 0) return 0;

  // Cuántas unidades de stock es UNA de lo que se cargó. Sale del embudo y no
  // de una cuenta propia. Con `sueltosPorUnidad` (tercer nivel de empaque, las
  // entradas de mercadería desde la tanda 5) un bulto es factor × N y una
  // unidad N; sin él, lo de siempre.
  const escalones = unidadesDeStockPorEscalon({ factor_pack: factorPack, sueltos_por_unidad: sueltosPorUnidad });
  const porCada = unidad === "BULTO" ? escalones.bulto : escalones.unidad;

  // Con uno por cada, se devuelve lo que vino TAL CUAL —sin multiplicar por
  // 1—, que es lo que hacía antes: un texto sigue siendo un texto.
  return porCada > 1 ? cantidad * porCada : cantidad;
}

/**
 * Convierte unidades totales a bultos + sueltas
 * @param {Object} params
 * @param {number} params.unidades - Total en unidades
 * @param {number} params.factorPack - Factor del pack (ej: 12)
 * @returns {Object} { bultos: number, sueltas: number, totalUnidades: number }
 */
export function fromUnidades({ unidades, factorPack: factorRecibido = 1 }) {
  const total = Number(unidades || 0);

  // Las unidades de stock que trae un bulto, pedidas al embudo. Hoy es el
  // factor: la unidad todavía no trae sueltos (tercer nivel, tanda 2 en
  // adelante — docs/roadmap/tercer-nivel-empaque.md).
  const factorPack = unidadesDeStockPorEscalon({ factor_pack: factorRecibido }).bulto;

  if (factorPack <= 1) {
    return {
      bultos: 0,
      sueltas: aEscalaFisica(total),
      totalUnidades: total,
    };
  }

  // Se calcula sobre el VALOR ABSOLUTO y recién al final se le pone el signo.
  //
  // Antes era `Math.floor(total / factorPack)` con `total % factorPack`, y esas
  // dos no son operaciones compañeras cuando el número es negativo: `Math.floor`
  // redondea hacia abajo y `%` conserva el signo del dividendo. Con -13 y factor
  // 12 daba -2 bultos y -1 sueltas, que reconstruido es -25 y no -13: contaba un
  // bulto de más. Se veía en el buscador del POS, que es la única superficie que
  // pinta el par sin mirar el signo.
  const signo = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const bultos = Math.floor(abs / factorPack);
  // La resta, y no el módulo: `18.35 % 10` da 8.350000000000001 porque el módulo
  // arrastra el error binario. Restar y redondear a la escala física deja 8.35.
  const sueltas = aEscalaFisica(abs - bultos * factorPack);

  // El `|| 0` no es adorno: `-1 * 0` en JavaScript da -0, y -0 no es 0 para
  // Object.is —que es con lo que comparan los candados— ni se ve igual al
  // imprimirlo. Un "-0 bultos" en pantalla sería una respuesta nueva.
  return {
    bultos: signo * bultos || 0,
    sueltas: signo * sueltas || 0,
    totalUnidades: total,
  };
}

/**
 * Valida si se puede enviar con la unidad elegida según modo_envio
 * @param {Object} params
 * @param {string} params.modoEnvio - "SOLO_BULTO" | "MIXTO" | "SOLO_UNIDAD"
 * @param {string} params.unidadElegida - "BULTO" | "UNIDAD"
 * @returns {Object} { ok: boolean, error?: string }
 */
export function validarEnvio({ modoEnvio, unidadElegida }) {
  if (!modoEnvio || modoEnvio === "MIXTO") {
    return { ok: true };
  }
  
  if (modoEnvio === "SOLO_BULTO" && unidadElegida !== "BULTO") {
    return {
      ok: false,
      error: "Este producto solo se puede enviar por bulto",
    };
  }
  
  if (modoEnvio === "SOLO_UNIDAD" && unidadElegida !== "UNIDAD") {
    return {
      ok: false,
      error: "Este producto solo se puede enviar por unidad",
    };
  }
  
  return { ok: true };
}

/**
 * Devuelve el factor para conversión BULTO ↔ UNIDAD.
 * Fuente única: ProductoBase.factor_pack (Int?).
 * Si factor_pack es null/0/1, retorna 1 (sin conversión).
 * @param {Object} base - Objeto ProductoBase (o { factor_pack })
 * @returns {number} Factor >= 1
 */
export function factorBulto(base) {
  const fp = Number(base?.factor_pack || 1);
  return fp > 1 ? fp : 1;
}

/**
 * Cuántos sueltos trae una unidad cuando el producto no dice nada.
 *
 * Es 1, y es lo que tiene TODO producto hasta la tanda 9 del tercer nivel de
 * empaque: la columna `ProductoBase.sueltos_por_unidad` existe desde la tanda 2
 * (`20261103230000_tercer_nivel_empaque`) y nadie la escribe.
 *
 * ── QUIÉN LE PASA LOS SUELTOS AL EMBUDO, Y QUIÉN TODAVÍA NO ─────────────────
 *
 * El embudo usa los sueltos SOLO si el que pregunta se los pasa. Se los pasan:
 *
 *   · el COSTO (`costoPorUnidadFisica`, y por ella la valuación del stock),
 *     desde la tanda 3: repartir el costo hacia abajo no cobra ni descuenta;
 *   · la VENTA (`cantidadParaStockNormal`, con el `baseStock` de
 *     `cargarMapasDeProductos`), desde la tanda 4: la unidad descuenta N, el
 *     bulto factor × N y el suelto 1. La atadura de las tres escalas está en
 *     `lib/precios/escalaDeVenta.test.mjs`.
 *
 *   · las ENTRADAS de mercadería, desde la tanda 5: `toUnidades` con
 *     `sueltosPorUnidad` (crear y enviar una transferencia, la venta interna) y
 *     `milesimasFisicas` de `lib/transferencias/recepcion.js` con el N
 *     CONGELADO en la línea (recibir, cancelar); la compra multiplica lo que
 *     entra. El depósito manda y recibe bultos o unidades, nunca sueltos.
 *
 * Las pantallas —`fromUnidades`, la carga manual— todavía no: tandas 6 y 7.
 * Nada de esto se nota mientras nadie cargue el dato (tanda 9).
 */
export const SUELTOS_POR_UNIDAD_SIN_DATO = 1;

/**
 * Los sueltos que dice la escala, o 1 si no dice o dice algo que no sirve.
 *
 * Lo que se mide por peso no tiene sueltos: si la escala dice que es kilo
 * (`unidad_medida`), vale 1 aunque la columna tuviera un número. Es la única
 * definición de esa regla; el que pregunta pasa `unidad_medida` si la tiene.
 */
function sueltosDe(base) {
  if (base?.unidad_medida === "kg") return SUELTOS_POR_UNIDAD_SIN_DATO;
  const s = Number(base?.sueltos_por_unidad);
  // La base exige entero mayor que 1 (CHECK de la migración). Cualquier otra
  // cosa —null, 1, un texto— es "no se vende más chico".
  return Number.isInteger(s) && s > 1 ? s : SUELTOS_POR_UNIDAD_SIN_DATO;
}

/**
 * EL EMBUDO DE LA ESCALA: CUÁNTAS UNIDADES DE `StockLocal.cantidad` SON UN
 * BULTO, UNA UNIDAD Y UN SUELTO DE ESTE PRODUCTO.
 *
 * Es la única respuesta a esa pregunta. Todo lo que convierte entre la escala en
 * que se cobra o se carga y la escala en que se cuenta el stock la pide acá:
 * `cantidadParaStockNormal`, `toUnidades`/`fromUnidades` y
 * `costoPorUnidadFisica`.
 *
 * El stock se cuenta en el escalón más chico. Hoy ese escalón es la unidad,
 * porque ningún producto tiene sueltos; con el tercer nivel será el suelto (el
 * cigarrillo), y la unidad (el atado) valdrá `sueltosPorUnidad` de ellos. Por
 * eso el bulto es factor × sueltos y no el factor solo: un cartón de 10 atados
 * de 20 son 200 en la columna.
 *
 * No aplica a kilos ni a piezas de fiambre: esos tienen su propia cuenta y
 * ninguno de los llamadores pregunta por ellos acá.
 *
 * @param {object} base  la escala con nombres de la base:
 *   `{ factor_pack, sueltos_por_unidad? }`. Sin `sueltos_por_unidad`, 1.
 * @returns {{ bulto: number, unidad: number, suelto: number }}
 */
export function unidadesDeStockPorEscalon(base) {
  const sueltosPorUnidad = sueltosDe(base);
  return {
    bulto: factorBulto(base) * sueltosPorUnidad,
    unidad: sueltosPorUnidad,
    suelto: 1,
  };
}

/**
 * EL COSTO DEL SUELTO: el costo de la unidad dividido los sueltos que trae.
 *
 * Es la única definición. El suelto es la unidad de `StockLocal.cantidad` cuando
 * el producto tiene tercer nivel, así que esto es también lo que vale una unidad
 * de stock: lo usa `costoPorUnidadFisica`, y por ella la valuación del stock y
 * la diferencia de un control.
 *
 * El COSTO se reparte; el PRECIO no. El precio del suelto se carga aparte
 * (`ProductoLocal.precio_venta_suelto`): el suelto no es la unidad dividida.
 *
 * Sin sueltos devuelve el costo de la unidad tal cual, sin dividir por 1.
 *
 * @param {number|null} costoDeLaUnidad  el costo de UNA unidad (el atado, la caja).
 * @param {{ unidad: number }} escalones  lo de `unidadesDeStockPorEscalon`.
 * @returns {number|null}
 */
export function costoDelSuelto(costoDeLaUnidad, escalones) {
  if (costoDeLaUnidad === null || costoDeLaUnidad === undefined) return costoDeLaUnidad ?? null;
  return escalones.unidad > 1 ? costoDeLaUnidad / escalones.unidad : costoDeLaUnidad;
}

/** Lo que se le dice a quien carga a mano, en las dos formas que se rechazan. */
export const TEXTO_CARGA_SIN_SUELTOS = "Este producto no se cuenta en sueltos: cargá la cantidad.";
export const TEXTO_CARGA_DOBLE = "Mandá la cantidad o las unidades y los sueltos, no las dos cosas.";
export const TEXTO_CARGA_INVALIDA = "Las unidades y los sueltos tienen que ser números enteros, cero o más.";

/** ¿El pedido trae la cantidad en la forma de tres niveles, unidades + sueltos? */
export function esCargaEnSueltos(c) {
  return c != null && typeof c === "object" && (c.unidades !== undefined || c.sueltos !== undefined);
}

/**
 * UNA CANTIDAD CARGADA A MANO, LLEVADA A LA ESCALA DE `StockLocal`.
 *
 * Tercer nivel de empaque, tanda 6. Quien carga a mano —el ajuste, los límites,
 * el conteo de un control— puede mandar la cantidad de dos formas:
 *
 *   · `cantidad`: ya en unidades de stock, como siempre. Es la ÚNICA que acepta
 *     un producto sin sueltos, y pasa tal cual, sin tocarla.
 *   · `unidades` + `sueltos`: "9 atados y 15 sueltos". Solo para un producto con
 *     `sueltos_por_unidad`; se guarda en sueltos: 9 × 20 + 15 = 195. Las
 *     unidades pasan por el embudo (`toUnidades`), no por una cuenta propia.
 *
 * @param {object} p
 * @param {*} [p.cantidad]  la forma de siempre.
 * @param {*} [p.unidades]  las unidades enteras (atados).
 * @param {*} [p.sueltos]   los sueltos fuera de ellas.
 * @param {object} p.base   la ficha, con `sueltos_por_unidad` y `unidad_medida`.
 * @returns {{ ok: true, cantidad: * } | { ok: false, error: string }}
 */
export function cantidadDeStockDeUnaCarga({ cantidad, unidades, sueltos, base } = {}) {
  if (!esCargaEnSueltos({ unidades, sueltos })) return { ok: true, cantidad };
  if (cantidad !== undefined && cantidad !== null && cantidad !== "") return { ok: false, error: TEXTO_CARGA_DOBLE };

  const n = sueltosParaCongelar(base);
  if (n === null) return { ok: false, error: TEXTO_CARGA_SIN_SUELTOS };

  const entero = (v) => (v === undefined || v === null || v === "" ? 0 : Number(v));
  const u = entero(unidades);
  const s = entero(sueltos);
  if (![u, s].every((x) => Number.isInteger(x) && x >= 0)) return { ok: false, error: TEXTO_CARGA_INVALIDA };

  return { ok: true, cantidad: toUnidades({ cantidad: u, unidad: "UNIDAD", factorPack: 1, sueltosPorUnidad: n }) + s };
}

/**
 * LO QUE SE CONGELA EN UNA VENTA O UNA TRANSFERENCIA: los sueltos por unidad
 * con que se calculó la cantidad de stock, o null si eran 1.
 *
 * Null y no 1 porque la columna (`sueltosPorUnidadCongelado`) exige mayor que 1:
 * el vacío ya dice "1", que es lo que vale toda fila escrita antes de que el
 * producto tuviera sueltos.
 *
 * @param {object} base  `{ sueltos_por_unidad }`, como lo recibe el embudo.
 * @returns {number|null}
 */
export function sueltosParaCongelar(base) {
  const s = sueltosDe(base);
  return s > 1 ? s : null;
}

/**
 * UNA CANTIDAD DE STOCK GUARDADA, LLEVADA A LA ESCALA DE HOY.
 *
 * `VentaDetalle.cantidadStock` está en la escala de StockLocal del momento de la
 * venta. Si después la ficha cambió de sueltos por unidad, devolver esa cantidad
 * tal cual mete stock en la escala equivocada: anular la venta de 1 atado
 * hecha antes de cargar 20 sueltos tiene que devolver 20 sueltos, no 1.
 *
 * Por eso se convierte con los dos N: el congelado de entonces (null = 1, la
 * venta vieja) y el de hoy. Con los dos iguales —hoy, todas las ventas— devuelve
 * la cantidad TAL CUAL, sin tocarla.
 *
 * @param {object} p
 * @param {*} p.cantidad          la cantidad guardada (número, texto o Decimal).
 * @param {*} p.sueltosAlMoverse  el N congelado en la fila, o null.
 * @param {*} p.sueltosHoy        `ProductoBase.sueltos_por_unidad` de hoy, o null.
 */
export function cantidadDeStockEnLaEscalaDeHoy({ cantidad, sueltosAlMoverse, sueltosHoy } = {}) {
  const entonces = sueltosDe({ sueltos_por_unidad: sueltosAlMoverse });
  const hoy = sueltosDe({ sueltos_por_unidad: sueltosHoy });
  if (entonces === hoy) return cantidad;
  return aEscalaFisica((Number(cantidad) * hoy) / entonces);
}

/**
 * Determina si el producto opera en modo BULTO.
 * SOLO_BULTO, MIXTO y null → true (bulto). SOLO_UNIDAD → false.
 * @param {string|null} modoEnvio
 * @returns {boolean}
 */
export function esBultoMode(modoEnvio) {
  return modoEnvio !== "SOLO_UNIDAD";
}

/**
 * Calcula el default de modo_envio según unidad_medida
 * cajon/pack/caja → SOLO_BULTO, unidad/kg → SOLO_UNIDAD
 * @param {string} unidadMedida - "unidad" | "pack" | "cajon" | "kg" (el enum entero)
 * @returns {string} "SOLO_BULTO" | "SOLO_UNIDAD"
 */
export function defaultModoEnvio(unidadMedida) {
  // Acá decía además "caja" y "carton", que no existen en el enum `UnidadMedida`
  // del schema. Eran ramas inalcanzables y se sacaron sin cambiar comportamiento.
  if (["cajon", "pack"].includes(unidadMedida)) {
    return "SOLO_BULTO";
  }
  return "SOLO_UNIDAD";
}

// ============================================================
// Fiambre: piezas ↔ kg (solo transferencias depósito → local)
// ============================================================

/**
 * ¿ESTE PRODUCTO SE MIDE EN KILOS?
 *
 * Contesta por la UNIDAD DE MEDIDA del producto y nada más: es el campo que usa
 * el POS para decidir si abre el teclado de peso al venderlo.
 *
 * ── OJO: NO ES LA PREGUNTA DE LA RECEPCIÓN ────────────────────────────────
 *
 * Para costear un renglón AL RECIBIR hay que preguntar
 * `elDepositoCuentaPorKilo`, más abajo. Son dos preguntas distintas sobre el
 * mismo producto: Papas Congeladas se mide en kilos —y se vende por kilo en dos
 * locales— pero el depósito la compra y la guarda POR PIEZA.
 *
 * Esta función se usó para las dos durante un día, y por eso la recepción le
 * pedía kilos a las papas. Son 40 de los 100 productos en kilos los que están
 * en esa situación, medido contra producción.
 *
 * @param {Object} base - ProductoBase o { unidad_medida }
 * @returns {boolean}
 */
export function seMideEnKilos(base) {
  if (!base) return false;
  return String(base.unidad_medida || "").toLowerCase() === "kg";
}

/**
 * Indica si el producto es fiambre (compra por pieza, stock en kg, venta por kg).
 * Condición: unidad_medida = kg, modoCompraProveedor = UNIDAD, pesoReferenciaKg > 0.
 * @param {Object} base - ProductoBase o { unidad_medida, modoCompraProveedor, pesoReferenciaKg }
 * @returns {boolean}
 */
export function esProductoFiambre(base) {
  if (!base) return false;
  // El "kg" lo lee `seMideEnKilos`, que es el único lugar que mira ese campo.
  const modo = base.modoCompraProveedor || "";
  const peso = Number(base.pesoReferenciaKg ?? 0);
  return seMideEnKilos(base) && modo === "UNIDAD" && peso > 0;
}

/**
 * Indica si el producto se vende/maneja por PIEZA en depósito.
 * Depósito maneja en PIEZAS, local en KG. Conversión solo al recibir.
 * Condición: esProductoFiambre + modoVentaDeposito = "PIEZA".
 * Fallback: pesoEsFijo (compatibilidad hasta migrar todos los productos).
 * @param {Object} base - ProductoBase
 * @returns {boolean}
 */
export function esFiambreFijo(base) {
  if (!esProductoFiambre(base)) return false;
  // Campo nuevo: modoVentaDeposito
  if (base.modoVentaDeposito) return base.modoVentaDeposito === "PIEZA";
  // Fallback: pesoEsFijo (productos no migrados)
  return base.pesoEsFijo === true;
}

/**
 * EL PREDICADO ÚNICO. Si el stock de este producto, EN ESTA UBICACIÓN, se
 * cuenta en piezas.
 *
 * ── LA REGLA DE NEGOCIO, QUE ES DE UBICACIÓN Y NO DE PRODUCTO ───────────────
 *
 * En el DEPÓSITO el fiambre de pieza fija se guarda EN PIEZAS. En CUALQUIER
 * LOCAL se guarda EN KILOS, convertido con `pesoReferenciaKg` (una pieza de
 * mortadela son 4,5 kg). No es una propiedad del producto: el mismo producto se
 * cuenta distinto según dónde esté parado el stock.
 *
 * ── POR QUÉ EXISTE ESTA FUNCIÓN Y NO SE USA `esFiambreFijo` SUELTO ──────────
 *
 * Porque `esFiambreFijo(base)` contesta sobre el PRODUCTO y no sabe dónde está.
 * La recepción la llamaba sola y sumaba piezas a la fila de un local, mientras
 * el POS de ese local descontaba kilos: el mismo número leído en dos unidades.
 * Todo lo que ESCRIBE stock tiene que preguntar acá, no allá.
 *
 * `esFiambreFijo` sigue existiendo para las superficies que ya resuelven la
 * ubicación por su cuenta y solo necesitan la parte del producto.
 *
 * @param {Object} base - ProductoBase
 * @param {boolean} esDeposito - si la UBICACIÓN donde vive ese stock es depósito
 * @returns {boolean}
 */
export function esFiambreFijoEnUbicacion(base, esDeposito) {
  if (esDeposito !== true) return false;
  return esFiambreFijo(base);
}

/**
 * ¿EL DEPÓSITO GUARDA ESTE PRODUCTO POR KILO?
 *
 * ── LA PREGUNTA QUE HAY QUE HACER AL RECIBIR, Y NO ES LA DE LA VENTA ──────
 *
 * Decisión de Emanuel: *"acá estamos hablando de depósito"*. Si un producto se
 * costea por kilo o por pieza AL RECIBIR lo decide cómo lo COMPRA Y LO GUARDA
 * el depósito, no cómo lo vende el POS en los locales. Son dos preguntas
 * distintas sobre el mismo producto y se contestan con campos distintos.
 *
 * El caso que lo destapó: **Papas Congeladas**. Se vende POR KILO en Casiano
 * casas y en Mini unidas —medido: 53 de 95 renglones con decimales en uno, los
 * 2 que hay en el otro— y el depósito la compra y la guarda POR PIEZA, con sus
 * 47 renglones enteros. Preguntando por la venta, la recepción le pedía kilos a
 * un producto que entra en bolsones contados.
 *
 * Alcance medido contra producción: de los 100 productos activos que se miden
 * en kilos, **40 los guarda el depósito por pieza**. A esos cuarenta la
 * recepción les pedía kilos que nadie pesa.
 *
 * ── CÓMO SE CONTESTA, Y POR QUÉ NO HACE FALTA UN CAMPO NUEVO ──────────────
 *
 * `esFiambreFijoEnUbicacion(base, true)` ya contesta si el stock se cuenta en
 * PIEZAS en el depósito — es el predicado que el cierre de la recepción usa
 * desde antes para decidir cuánto stock entra. El campo que lo decide es
 * `modoVentaDeposito` (PIEZA o PESO), con `pesoEsFijo` de respaldo para los
 * productos que todavía no se migraron.
 *
 * Así que esto no agrega criterio: junta los dos que ya existen. Se mide en
 * kilos Y el depósito no lo cuenta por pieza.
 *
 * Medido sobre los cuatro renglones por peso del pedido #242:
 *
 *   Papas Congeladas         modoVentaDeposito PIEZA  → por PIEZA
 *   Salametro                modoVentaDeposito PESO   → por KILO
 *   Salamín Fox Picado Fino  modoVentaDeposito PESO   → por KILO
 *   Barra Tremblay           modoVentaDeposito PESO   → por KILO
 *
 * @param {Object} base - ProductoBase
 * @returns {boolean}
 */
export function elDepositoCuentaPorKilo(base) {
  if (!seMideEnKilos(base)) return false;
  return !esFiambreFijoEnUbicacion(base, true);
}

/**
 * EL COSTO DEL CATÁLOGO, PUESTO EN LA UNIDAD EN QUE EL DEPÓSITO CUENTA.
 *
 * ── EL CASO, MEDIDO ───────────────────────────────────────────────────────
 *
 * Papas Congeladas: el catálogo guarda su costo POR KILO —$3.800— porque el
 * producto se mide en kilos, y el depósito lo cuenta POR PIEZA, en bolsas de
 * 2,5 kg. El papel de Paty cobra $8.166,54 por bolsa.
 *
 * Comparados como están, $8.166,54 contra $3.800 dan +114,9 % de aumento, que
 * es falso: son dos unidades distintas. En la misma unidad, la bolsa del
 * catálogo vale 3.800 × 2,5 = **$9.500**, así que el proveedor está cobrando
 * MENOS que el precio interno.
 *
 * Alcance medido contra producción: **40 productos activos** están en esa
 * situación, y **17 de ellos ya se pidieron alguna vez**, en 14 pedidos.
 *
 * ── SOLO ESTE CASO, Y SOLO EN ESTA DIRECCIÓN ──────────────────────────────
 *
 * Se convierte únicamente cuando el costo está por kilo y el depósito cuenta
 * piezas. Un producto por kilo que el depósito también cuenta por kilo no se
 * toca, y uno que no se mide en kilos tampoco: ahí el costo ya está en la
 * unidad de compra y multiplicar por un peso sería inventar.
 *
 * Sin `pesoReferenciaKg` no se puede convertir y se devuelve `null`: es la
 * misma regla que el resto del módulo —lo que no se sabe no se completa— y la
 * pantalla ya sabe dibujar una línea sin precio del ERP.
 *
 * @param {Object} base  ProductoBase
 * @param {number} costo el del catálogo, tal como está guardado
 * @returns {number|null}
 */
export function costoDelCatalogoEnLaUnidadDelDeposito({ base, costo } = {}) {
  const c = Number(costo);
  if (!Number.isFinite(c)) return null;
  // Por kilo de los dos lados, o nada que ver con kilos: el costo ya sirve.
  if (!seMideEnKilos(base) || elDepositoCuentaPorKilo(base)) return c;
  const peso = Number(base?.pesoReferenciaKg);
  if (!Number.isFinite(peso) || peso <= 0) return null;
  return c * peso;
}

/**
 * Convierte piezas a kg usando peso de referencia.
 * @param {number} piezas
 * @param {number} pesoReferenciaKg
 * @returns {number} kg (redondeado a 3 decimales)
 */
export function piezasToKg(piezas, pesoReferenciaKg) {
  const p = Number(piezas || 0);
  const ref = Number(pesoReferenciaKg || 0);
  if (p <= 0 || ref <= 0) return 0;
  return Math.round(p * ref * 1000) / 1000;
}

/**
 * Convierte kg a piezas (referencia para mostrar en UI).
 * @param {number} kg
 * @param {number} pesoReferenciaKg
 * @returns {number} piezas (redondeado a 2 decimales)
 */
export function kgToPiezas(kg, pesoReferenciaKg) {
  const k = Number(kg || 0);
  const ref = Number(pesoReferenciaKg || 0);
  if (k <= 0 || ref <= 0) return 0;
  return Math.round((k / ref) * 100) / 100;
}



