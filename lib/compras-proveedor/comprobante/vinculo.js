// lib/compras-proveedor/comprobante/vinculo.js
//
// A QUÉ PRODUCTO CORRESPONDE CADA LÍNEA DE LA FACTURA.
//
// ── LA CASCADA, Y POR QUÉ ESE ORDEN ────────────────────────────────────────
//
// 1. CÓDIGO DEL PROVEEDOR — la factura de DYSSA trae "Cód Art" (010027, 010193…)
//    y `ProductoCodigoProveedor` guarda exactamente eso, con su índice único por
//    grupo y proveedor. Es el único vínculo que NO es una interpretación: el
//    proveedor y nosotros estamos hablando del mismo código.
//
// 2. ALIAS POR DESCRIPCIÓN — el texto crudo que alguien ya vinculó antes, en
//    `descripcionProveedor`. Es lo que hace que la segunda factura del mismo
//    proveedor salga sola.
//
// 3. EL UNIVERSO DEL PROVEEDOR — los productos que se le compran a ese
//    proveedor. Se busca por texto acá antes que en todo el ERP porque un
//    "AMARGO OBRERO" del proveedor de bebidas es mucho más probable que uno
//    homónimo de otro rubro.
//
// 4. TODO EL ERP — la última red. Puede traer al producto correcto de un
//    proveedor nuevo, pero también al equivocado, así que de acá NUNCA se
//    vincula solo.
//
// ── LO QUE SE VINCULA SOLO Y LO QUE PREGUNTA ───────────────────────────────
//
// SOLO SE VINCULA AUTOMÁTICAMENTE POR CÓDIGO EXACTO O POR ALIAS EXACTO.
//
// El motivo es concreto: un vínculo equivocado no se ve. La línea queda al lado
// de un producto plausible, alguien acepta el precio, y el costo entra en el
// producto que no era. Un texto parecido no alcanza para eso — "GANCIA LIMA ONE
// 3.5" y "GANCIA LIMA 3.5" pueden ser el mismo producto o dos presentaciones
// distintas, y la diferencia vale una factura.
//
// Por eso lo fuzzy SUGIERE y no decide. Es la misma línea que separa la
// conciliación automática de la revisión humana en el módulo de listas.
//
// ── EL ALIAS SE ESCRIBE AL VINCULAR A MANO ─────────────────────────────────
//
// Cada vez que alguien vincula un nombre, ese texto queda en
// `descripcionProveedor`. Es lo único que hace que el trabajo manual de hoy
// ahorre trabajo mañana: sin eso, la misma factura del mes que viene vuelve a
// pedir las mismas veinte decisiones.

import {
  normalizarTexto,
  rankearFuzzy,
  rankearLiteral,
  rankearPorPalabras,
} from "@/lib/productos/busquedaFuzzyProducto";
import { normalizarCodigo } from "@/lib/proveedores/listas/normalizarCodigo";

export const ORIGEN_VINCULO = Object.freeze({
  CODIGO_PROVEEDOR: "CODIGO_PROVEEDOR",
  ALIAS_DESCRIPCION: "ALIAS_DESCRIPCION",
  /// Sugerido entre las líneas DEL PEDIDO que se está conciliando. Es el
  /// universo chico —34 líneas contra 2.366 fichas— y el que casi siempre tiene
  /// la respuesta: se está recibiendo lo que se pidió.
  LINEA_DEL_PEDIDO: "LINEA_DEL_PEDIDO",
  UNIVERSO_PROVEEDOR: "UNIVERSO_PROVEEDOR",
  ERP_COMPLETO: "ERP_COMPLETO",
  SIN_CANDIDATOS: "SIN_CANDIDATOS",
});

/** Qué se le dice a quien mira la pantalla, por origen. */
export const TEXTO_ORIGEN = Object.freeze({
  [ORIGEN_VINCULO.CODIGO_PROVEEDOR]: "Vinculado por el código del proveedor",
  [ORIGEN_VINCULO.ALIAS_DESCRIPCION]: "Vinculado por un nombre que ya se había asociado antes",
  [ORIGEN_VINCULO.LINEA_DEL_PEDIDO]:
    "Está en el pedido que estás recibiendo. Confirmalo vos.",
  [ORIGEN_VINCULO.UNIVERSO_PROVEEDOR]:
    "Sugerido entre los productos que se le compran a este proveedor. Confirmalo vos.",
  [ORIGEN_VINCULO.ERP_COMPLETO]:
    "Sugerido de todo el catálogo, fuera de lo que se le compra a este proveedor. Miralo bien antes de confirmar.",
  [ORIGEN_VINCULO.SIN_CANDIDATOS]:
    "No se encontró ningún producto parecido. Buscalo a mano, o crealo si es nuevo.",
});

/** Los únicos orígenes que vinculan sin preguntar. */
export const ORIGENES_AUTOMATICOS = Object.freeze([
  ORIGEN_VINCULO.CODIGO_PROVEEDOR,
  ORIGEN_VINCULO.ALIAS_DESCRIPCION,
]);

export function esAutomatico(origen) {
  return ORIGENES_AUTOMATICOS.includes(origen);
}

/** Cuántas sugerencias se ofrecen. Más que esto es una lista, no una sugerencia. */
export const MAX_SUGERENCIAS = 5;

/**
 * Busca a qué producto corresponde una línea leída.
 *
 * TODO ENTRA POR PARÁMETRO: los vínculos, el universo del proveedor y el
 * catálogo. Así el criterio se puede ejercer sin base, que es lo que permite
 * probarlo contra las líneas reales de las dos facturas.
 *
 * @param {object} linea               { codigoProveedor, descripcion }
 * @param {Array}  vinculos            filas de ProductoCodigoProveedor de ESE proveedor
 * @param {Array}  universoProveedor   [{ productoBaseId, nombre }] que se le compran
 * @param {Array}  catalogo            [{ productoBaseId, nombre }] de todo el ERP
 */
export function buscarCandidatos({
  linea,
  vinculos = [],
  lineasDelPedido = [],
  universoProveedor = [],
  catalogo = [],
} = {}) {
  const codigo = normalizarCodigo(linea?.codigoProveedor);
  const texto = String(linea?.descripcion ?? "").trim();
  const textoNorm = normalizarTexto(texto);

  // ── 1. El código. Es el único que no interpreta nada ──────────────────
  if (codigo) {
    const porCodigo = vinculos.filter((v) => v?.activo !== false && normalizarCodigo(v?.codigoInterno) === codigo);
    if (porCodigo.length === 1) {
      return armar(ORIGEN_VINCULO.CODIGO_PROVEEDOR, [candidatoDeVinculo(porCodigo[0])], { codigo, texto });
    }
    // Dos vínculos activos con el mismo código es un dato roto, no una duda:
    // el índice único lo impide, así que si pasa hay que mirarlo, no elegir.
    if (porCodigo.length > 1) {
      return armar(ORIGEN_VINCULO.SIN_CANDIDATOS, [], {
        codigo,
        texto,
        problema: `Hay ${porCodigo.length} productos vinculados al código ${codigo} de este proveedor.`,
      });
    }
  }

  // ── 2. El alias por descripción ───────────────────────────────────────
  if (textoNorm) {
    const porAlias = vinculos.filter(
      (v) => v?.activo !== false && v?.descripcionProveedor && normalizarTexto(v.descripcionProveedor) === textoNorm
    );
    if (porAlias.length === 1) {
      return armar(ORIGEN_VINCULO.ALIAS_DESCRIPCION, [candidatoDeVinculo(porAlias[0])], { codigo, texto });
    }
    if (porAlias.length > 1) {
      // El mismo texto vinculado a dos productos distintos: alguien se
      // equivocó antes. Se ofrecen los dos y decide una persona.
      return armar(ORIGEN_VINCULO.UNIVERSO_PROVEEDOR, porAlias.map(candidatoDeVinculo), {
        codigo,
        texto,
        problema: "Ese mismo nombre está vinculado a más de un producto. Elegí cuál corresponde.",
      });
    }
  }

  // ── 3 y 4. El texto, primero en el universo del proveedor ─────────────
  if (!texto) return armar(ORIGEN_VINCULO.SIN_CANDIDATOS, [], { codigo, texto });

  // ── 3. LAS LÍNEAS DEL PEDIDO, PRIMERO ────────────────────────────────
  //
  // Se está conciliando una factura CONTRA UN PEDIDO. Ese pedido tiene 34
  // líneas y el catálogo 2.366 fichas: buscar en el grande cuando el chico
  // casi siempre tiene la respuesta es lo que producía candidatos absurdos
  // —"CHESTERFIELD 10 CONV" ofrecía Lucky 20, ALA POLVO y ARCOR BATATA—.
  //
  // Y no es solo cuestión de tamaño: lo que está en el pedido es lo que se
  // ENCARGÓ, así que la probabilidad de que la línea de la factura sea una de
  // esas es altísima. Por eso además se dice aparte en la pantalla: "está en tu
  // pedido" no es lo mismo que "existe en el catálogo".
  const enPedido = sugerir(lineasDelPedido, texto);
  if (enPedido.length) return armar(ORIGEN_VINCULO.LINEA_DEL_PEDIDO, enPedido, { codigo, texto });

  const enProveedor = sugerir(universoProveedor, texto);
  if (enProveedor.length) return armar(ORIGEN_VINCULO.UNIVERSO_PROVEEDOR, enProveedor, { codigo, texto });

  const enTodo = sugerir(catalogo, texto);
  if (enTodo.length) return armar(ORIGEN_VINCULO.ERP_COMPLETO, enTodo, { codigo, texto });

  return armar(ORIGEN_VINCULO.SIN_CANDIDATOS, [], { codigo, texto });
}

/**
 * Las sugerencias por texto.
 *
 * Se delega en el buscador que ya usan el POS y productos. No se escribe una
 * comparación de textos al lado: si algún día mejora la del buscador, esta
 * mejora con ella.
 *
 * PRIMERO LITERAL, DESPUÉS FUZZY, y el orden importa. Una descripción de
 * factura —"GANCIA LIMA ONE 3.5\" 473MLX6X4"— es un nombre abreviado con
 * medidas pegadas, no una palabra mal escrita. Lo literal encuentra al que
 * CONTIENE ese texto, que es lo que suele pasar; lo fuzzy es la red para
 * cuando el proveedor escribe distinto, y por eso va después y no lo pisa.
 *
 * Los dos devuelven `{ item, score }` con MENOR MEJOR, y ninguno decide: lo que
 * sale de acá siempre requiere que alguien confirme.
 */
function sugerir(items, texto) {
  if (!Array.isArray(items) || !items.length || !texto) return [];
  const opciones = { getNombre: (i) => i?.nombre || "" };

  const vistos = new Set();
  const salida = [];
  const agregar = (rankeados) => {
    for (const { item, score } of rankeados) {
      // SOLO `productoBaseId`. Antes caía a `item.id` si faltaba, y eso es una
      // trampa desde que la cascada mira las líneas del pedido: ahí `id` es el
      // del DETALLE del pedido, no el del producto. Un detalle cuyo producto no
      // tiene base habría producido un candidato con un id ajeno, y vincular
      // habría atado la línea al producto equivocado — que es exactamente el
      // error que no se ve, porque queda al lado de un nombre plausible.
      const id = item?.productoBaseId ?? null;
      if (!id || vistos.has(id)) continue;
      vistos.add(id);
      salida.push({ productoBaseId: id, nombre: item?.nombre ?? null, puntaje: score });
      if (salida.length >= MAX_SUGERENCIAS) return true;
    }
    return false;
  };

  // EL ORDEN IMPORTA. Literal primero —es el que no interpreta nada—, después
  // POR PALABRAS, y el fuzzy último.
  //
  // El de palabras entró en el medio porque es el que resuelve el caso real de
  // una factura: dos nombres distintos del mismo producto, que no se contienen
  // uno al otro. Sin él, el literal no matchea y el fuzzy rankea por parecido
  // de la frase entera, que es de donde salían "Lucky 20 convertible xl" para
  // "CHESTERFIELD 10 CONV" y dos líneas sin ningún candidato.
  if (agregar(rankearLiteral(items, texto, opciones))) return salida;
  if (agregar(rankearPorPalabras(items, texto, opciones))) return salida;
  agregar(rankearFuzzy(items, texto, opciones));
  return salida;
}

function candidatoDeVinculo(v) {
  return {
    productoBaseId: v.productoBaseId,
    nombre: v.nombre ?? v.productoBase?.nombre ?? null,
    puntaje: null,
    vinculoId: v.id ?? null,
  };
}

function armar(origen, candidatos, extra = {}) {
  const auto = esAutomatico(origen) && candidatos.length === 1;
  return {
    origen,
    texto: TEXTO_ORIGEN[origen],
    candidatos,
    // Solo uno, y solo por código o alias exacto. Un vínculo equivocado no se
    // ve: la línea queda al lado de un producto plausible y el costo entra en
    // el que no era.
    vinculoAutomatico: auto ? candidatos[0] : null,
    requiereDecision: !auto,
    ...extra,
  };
}

// ── LA LÍNEA DEL PEDIDO QUE LE CORRESPONDE ─────────────────────────────────

/**
 * Cuál de las líneas del pedido es la de este producto.
 *
 * Es determinista: se busca el detalle cuyo producto coincide. No hay nada que
 * adivinar acá, y por eso no se ofrece ninguna sugerencia parecida.
 *
 * Puede no haber ninguna —el proveedor facturó algo que no estaba pedido— y eso
 * NO es un error: es información que la pantalla tiene que mostrar. Se
 * distingue del caso "hay varias", que sí es raro y necesita a alguien.
 */
export function lineaDelPedido({ productoBaseId, detalles = [] } = {}) {
  if (!productoBaseId) return { detalle: null, motivo: "SIN_PRODUCTO" };
  const coinciden = (Array.isArray(detalles) ? detalles : []).filter(
    (d) => Number(d?.productoBaseId) === Number(productoBaseId)
  );
  if (coinciden.length === 1) return { detalle: coinciden[0], motivo: null };
  if (coinciden.length === 0) return { detalle: null, motivo: "NO_ESTABA_PEDIDO" };
  return { detalle: null, motivo: "VARIAS_LINEAS", cuantas: coinciden.length };
}

export const TEXTO_MOTIVO_PEDIDO = Object.freeze({
  SIN_PRODUCTO: "Todavía no se sabe qué producto es.",
  NO_ESTABA_PEDIDO:
    "El proveedor facturó este producto y no estaba en el pedido. Puede ser un agregado: revisalo.",
  VARIAS_LINEAS:
    "El pedido tiene más de una línea de este producto. Elegí a cuál corresponde lo facturado.",
});

// ── EL ALIAS QUE SE ESCRIBE AL VINCULAR ────────────────────────────────────

/**
 * Qué guardar en `ProductoCodigoProveedor` cuando alguien vincula a mano.
 *
 * Devuelve la intención, no escribe: quien escribe es la ruta, en su
 * transacción.
 *
 * EL CÓDIGO MANDA SOBRE LA DESCRIPCIÓN. Si la factura trae código, la fila se
 * identifica por ese código —es la clave única del modelo— y la descripción
 * viaja como dato. Si NO trae código, se guarda igual usando el texto
 * normalizado como código: sin fila no hay alias, y sin alias la próxima
 * factura vuelve a preguntar lo mismo.
 */
export function aliasAEscribir({ linea, productoBaseId, grupoId, proveedorId } = {}) {
  const codigo = normalizarCodigo(linea?.codigoProveedor);
  const descripcion = String(linea?.descripcion ?? "").trim() || null;

  if (!productoBaseId || !grupoId || !proveedorId) return null;
  // Sin código NI descripción no hay con qué reconocerlo la próxima vez.
  if (!codigo && !descripcion) return null;

  return {
    grupoId,
    proveedorId,
    productoBaseId,
    codigoInterno: codigo || `TXT:${normalizarTexto(descripcion).slice(0, 60)}`,
    descripcionProveedor: descripcion,
    // Queda registrado que lo eligió una persona. La columna existe para poder
    // revocar los deducidos sin tocar los humanos.
    origenAlta: "VINCULACION_MANUAL",
    activo: true,
  };
}
