// CUÁNTAS UNIDADES DICE EL PAPEL QUE TRAE EL BULTO.
//
// ── PARA QUÉ ──────────────────────────────────────────────────────────────
//
// El stock y el costo se calculan con el `factor_pack` del PRODUCTO, y así
// tiene que seguir siendo: es el dato que alguien cargó mirando la mercadería.
// Pero la descripción del papel muchas veces trae el contenido impreso —"(83u)",
// "12X30G", "90u x405g"— y cuando ese número NO coincide con el del producto,
// uno de los dos está mal y conviene que quien está recibiendo lo sepa.
//
// Medido sobre el pedido 245 de Arcor: de sus veinte renglones, varios traen el
// contenido y dos NO coinciden —el papel dice 210 por bolsa y el producto tiene
// 208; dice 90 y el producto tiene 86—.
//
// ── LO QUE ESTE MÓDULO NO HACE ────────────────────────────────────────────
//
// **No cambia nada solo.** Devuelve un número y la pantalla lo dice en una
// línea. Corregir el `factor_pack` es una decisión sobre el producto y va por
// editar producto, no como efecto lateral de leer una factura — que es la misma
// regla por la que vincular no escribe la relación del proveedor.
//
// ── POR QUÉ ES DIFÍCIL Y CÓMO SE ACOTA ────────────────────────────────────
//
// Una descripción trae varios números y casi todos son PESO, no cantidad:
// "x822g", "x 500Grs", "x1 Kg", "x405g". Tomar cualquiera daría un aviso falso
// en casi todos los renglones, que es peor que no avisar. Así que solo se
// reconocen dos formas, y las dos dicen unidades explícitamente:
//
//   · UN NÚMERO SEGUIDO DE "u" —"(83u)", "(137u)", "90u"—. Es la forma en que
//     este proveedor escribe el contenido, y la "u" lo hace inequívoco.
//   · "NxM" AL PRINCIPIO, con M en gramos o mililitros —"12X30G"—: son N
//     unidades de M gramos. El peso está del lado derecho, así que el de la
//     izquierda es la cantidad.
//
// Todo lo demás devuelve `null`, que significa "el papel no lo dice" y no
// "el papel dice cero". Sin número no hay nada que comparar y no se avisa nada.
//
// Módulo puro: sin React, sin Prisma y sin red.

/** Lo que cuenta como unidad de peso o volumen, para no confundirla con cantidad. */
const PESO_O_VOLUMEN = "(?:g|gr|grs|gramos|kg|k|ml|cc|l|lt|litros)";

/**
 * CUÁNTAS UNIDADES DICE EL TEXTO DEL PAPEL, O NULL.
 *
 * @param texto la descripción impresa del renglón
 */
export function contenidoQueDiceElPapel(texto) {
  const t = String(texto ?? "").trim();
  if (!t) return null;

  // 1. Un número pegado a una "u" de unidades: "(83u)", "(137 u)", "90u".
  //    Se exige que la "u" no sea el principio de otra palabra —"12 UVAS"— y
  //    que el número no venga precedido por una x de peso.
  const porUnidades = t.match(/(?:^|[^0-9a-zA-Z])(\d{1,4})\s*u(?:n|nid|nidad|nidades)?(?![a-zA-Z])/i);
  if (porUnidades) {
    const n = Number(porUnidades[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }

  // 2. "NxM" con el peso a la derecha: "12X30G" son doce de treinta gramos.
  //    Si a la derecha NO hay unidad de peso, no se interpreta: "2x4" puede ser
  //    cualquier cosa.
  const porNxPeso = t.match(new RegExp(`(?:^|[^0-9a-zA-Z])(\\d{1,4})\\s*[xX]\\s*\\d+(?:[.,]\\d+)?\\s*${PESO_O_VOLUMEN}\\b`, "i"));
  if (porNxPeso) {
    const n = Number(porNxPeso[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }

  return null;
}

/**
 * ¿EL PAPEL Y EL PRODUCTO DICEN LO MISMO DEL BULTO?
 *
 * @returns `{ loDice, delPapel, delProducto, coincide }`. `loDice: false`
 *          cuando el papel no trae el contenido: ahí no hay nada que avisar.
 */
export function contenidoDelBulto({ texto, factorPack } = {}) {
  const delPapel = contenidoQueDiceElPapel(texto);
  const delProducto = Number(factorPack);
  const hayProducto = Number.isFinite(delProducto) && delProducto > 0;

  if (delPapel === null || !hayProducto) {
    return { loDice: false, delPapel, delProducto: hayProducto ? delProducto : null, coincide: null };
  }
  return { loDice: true, delPapel, delProducto, coincide: delPapel === delProducto };
}

/**
 * LA LÍNEA QUE SE MUESTRA CUANDO NO COINCIDEN. Una sola, y no cambia nada.
 *
 * Dice los dos números porque quien mira tiene que poder decidir cuál está mal
 * con la bolsa en la mano. No dice "corregí el producto": eso lo decide quien
 * recibe, y se hace en editar producto.
 */
export function textoDelContenido(r) {
  if (!r || !r.loDice || r.coincide !== false) return null;
  return (
    `El papel dice ${r.delPapel} por bolsa y el producto tiene ${r.delProducto}. ` +
    `El stock y el costo se calculan con ${r.delProducto}, que es lo que está cargado.`
  );
}
