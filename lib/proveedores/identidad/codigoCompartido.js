// lib/proveedores/identidad/codigoCompartido.js
//
// UN CÓDIGO DEL PROVEEDOR COMPARTIDO ENTRE VARIANTES DE UN PRODUCTO.
//
// ── EL CASO (Dab, 2026-11-18) ─────────────────────────────────────────────
//
// Dab usa el mismo código para los aromas de un producto: el 2530 es
// "GIGANTE LIMPIADOR LIMON 900CC" en su lista y "GIGANTE LIMPIADOR CITRONELA
// 900CC" en su factura. Un vínculo por el código solo ataría los dos aromas a
// un mismo producto, y la próxima lista le pondría el precio del Limón al
// Citronela.
//
// Decisión de Emanuel: cuando un mismo código aparece con nombres de variantes
// distintas (`difierenEnVariante`), el vínculo se guarda por código + texto —el
// par de texto, `claveDeAlias`, que ya existe—, no por el código solo.
//
// Medido ese día sobre las listas guardadas y los papeles: 8 códigos con
// variantes distintas —los Ramen Cup y los Tatín de Arcor, los Gigante de
// Dab—.
//
// ── CUANDO EL CÓDIGO Y EL TEXTO DICEN PRODUCTOS DISTINTOS ─────────────────
//
// Primero mandaba el texto. El mismo día apareció el caso que lo desmiente:
// en el pedido 473 de Arcor la lectura del papel quedó corrida un renglón, y
// el 3750 —ALFAJOR BYN NEGRO en la lista, a ~$1.540 la unidad en el papel—
// llegó con el texto "TATIN TRIPLE BLANCO". El par de texto lo mandaba al Tatín
// (~$852): otro producto, atado solo, por un texto que era de otro renglón.
//
// Regla de Emanuel (2026-11-18), que reemplaza a "manda el texto": gana el que
// CONCUERDA con el renglón del papel en precio —contra la lista del proveedor
// y el último costo del producto, con `precioCuadra`, que ya prueba la unidad
// y el bulto—. Si concuerdan los dos o ninguno, no se vincula solo: queda para
// revisar, con los dos candidatos en Corregir (`desempatarCodigoYTexto`).
// Los tres casos que la fijaron, en `codigoCompartido.test.mjs`.

import { clavesDeCodigo } from "../listas/normalizarCodigo.js";
import { claveDeAlias } from "./servicioIdentidad.js";
import { difierenEnVariante } from "../../productos/variantes.js";

/** El código como se comparan dos códigos del mismo proveedor: sin ceros adelante. */
export function claveDelCodigo(codigo) {
  const k = clavesDeCodigo(codigo);
  return k.sinCeros || k.normalizado || null;
}

/**
 * ¿ALGÚN DOCUMENTO MUESTRA ESTE CÓDIGO CON DOS VARIANTES DISTINTAS?
 *
 * ── LA CONDICIÓN NUEVA (Emanuel, 2026-11-19) ──────────────────────────────
 *
 * El caso que la originó no era un código compartido: en la factura 00614085
 * de Dab cada aroma tiene su código —002532 Citronela, 002530 Limón, 002531
 * Marina— y lo que se vio como "el 2530 es Citronela en el papel y Limón en la
 * lista" fue la lectura de la foto corrida, igual que en el pedido 473. Una
 * diferencia entre la lista y la lectura de un papel no prueba nada: es una
 * posible lectura corrida (`lecturaCorrida.js`) y la resuelve el desempate.
 *
 * Compartido de verdad es cuando el MISMO documento lo repite: dos renglones
 * de una misma lista guardada, o dos renglones de un mismo papel, con el mismo
 * código y variantes distintas. Ahí el proveedor usa un código para dos
 * productos, y el vínculo se guarda por código + texto.
 *
 * @param documentos  un arreglo por documento con los nombres de sus renglones de ESE código
 */
export function compartidoEnUnMismoDocumento(documentos = []) {
  return (documentos ?? []).some((nombres) =>
    (nombres ?? []).some((a, i) => (nombres ?? []).slice(i + 1).some((b) => difierenEnVariante(a, b)))
  );
}

/**
 * EL PAR DE TEXTO QUE CONTRADICE AL CÓDIGO, o null.
 *
 * Un par de texto (`TXT:…`) activo con exactamente este nombre, que apunta a
 * un producto distinto del que encontró el código: es el que se guardó a
 * propósito para una variante. Quién gana lo decide `desempatarCodigoYTexto`.
 * Solo los pares de texto: un vínculo de código que guarda su descripción no
 * cuenta, porque no se escribió para distinguir el nombre.
 */
export function parDeTextoQueContradice({ texto, vinculos = [], productoDelCodigo = null } = {}) {
  const clave = claveDeAlias(texto);
  if (!clave) return null;
  const pares = (vinculos ?? []).filter(
    (v) => v?.activo !== false && v?.codigoInterno === clave && Number(v?.productoBaseId) !== Number(productoDelCodigo)
  );
  const productos = new Set(pares.map((v) => Number(v.productoBaseId)));
  return productos.size === 1 ? pares[0] : null;
}

/** Qué decide el desempate entre el código y el texto. */
export const DESEMPATE = Object.freeze({ CODIGO: "CODIGO", TEXTO: "TEXTO", REVISAR: "REVISAR" });

/**
 * QUIÉN GANA CUANDO EL CÓDIGO Y EL TEXTO DICEN PRODUCTOS DISTINTOS.
 *
 * Gana el único cuyo producto concuerda con el renglón; si concuerdan los dos
 * o ninguno, `REVISAR`: no se vincula solo. `concuerda(productoBaseId)` la
 * arma quien llama con lo que tiene —el precio del papel contra la lista y el
 * último costo, o el precio de la fila de una lista contra el costo—; sin ella
 * no concuerda ninguno, y queda para revisar.
 */
export function desempatarCodigoYTexto({ productoDelCodigo, productoDelTexto, concuerda = null } = {}) {
  const c = typeof concuerda === "function" && concuerda(productoDelCodigo) === true;
  const t = typeof concuerda === "function" && concuerda(productoDelTexto) === true;
  if (c && !t) return DESEMPATE.CODIGO;
  if (t && !c) return DESEMPATE.TEXTO;
  return DESEMPATE.REVISAR;
}

/** Lo que se le dice a quien revisa cuando el precio no alcanzó para decidir. */
export function problemaDelDesempate({ codigo, nombreDelCodigo = null, nombreDelTexto = null } = {}) {
  const delCodigo = nombreDelCodigo ? ` (${nombreDelCodigo})` : "";
  const delTexto = nombreDelTexto ? ` (${nombreDelTexto})` : "";
  return `El código ${codigo ?? ""} dice un producto${delCodigo} y el nombre dice otro${delTexto}, y el precio no alcanza para decidir. Elegí cuál corresponde.`;
}

/**
 * LOS NOMBRES DE UN CÓDIGO DEL PROVEEDOR, AGRUPADOS POR DOCUMENTO: uno por cada
 * lista sin cancelar y uno por cada papel. Los vínculos no cuentan: no son un
 * documento del proveedor, son lo que se guardó de uno.
 *
 * @param prisma  el cliente o una transacción
 * @returns `[[nombre, …], …]`
 */
export async function nombresDelCodigoPorDocumento(prisma, { grupoId, proveedorId, codigo } = {}) {
  const clave = claveDelCodigo(codigo);
  if (!clave || !proveedorId) return [];
  const mismo = (c) => claveDelCodigo(c) === clave;
  const [filas, lineas] = await Promise.all([
    prisma.importacionListaFila.findMany({
      where: { importacion: { grupoId, proveedorId, estado: { not: "CANCELADA" } }, codigoNormalizado: { endsWith: clave } },
      select: { importacionId: true, codigoNormalizado: true, descripcionProveedor: true },
    }),
    prisma.comprobanteLinea.findMany({
      where: { codigoProveedor: { endsWith: clave }, comprobante: { grupoId, proveedorId } },
      select: { comprobanteId: true, codigoProveedor: true, textoCrudo: true },
    }),
  ]);
  const porDocumento = new Map();
  const sumar = (doc, extra, nombre) => {
    if (!String(nombre ?? "").trim()) return;
    const g = porDocumento.get(doc) ?? { ...extra, nombres: [] };
    g.nombres.push(nombre);
    porDocumento.set(doc, g);
  };
  for (const f of filas) if (mismo(f.codigoNormalizado)) sumar(`lista:${f.importacionId}`, { importacionId: f.importacionId }, f.descripcionProveedor);
  for (const l of lineas) if (mismo(l.codigoProveedor)) sumar(`papel:${l.comprobanteId}`, { comprobanteId: l.comprobanteId }, l.textoCrudo);
  return [...porDocumento.values()];
}

/**
 * ¿El código es compartido de verdad? Para las rutas que guardan el vínculo.
 *
 * Un papel corrido no cuenta como documento: la lectura corrida de Dab
 * (00614085) dejó el 2533 en dos renglones —la Marina con el código de la
 * Lavandina—, y con dos aromas habría parecido compartido. Quién está corrido
 * lo contesta `esPapelCorrido(comprobanteId)` —`papelCorrido` de
 * `lecturaCorrida.js`—, que entra por parámetro porque la lista del proveedor
 * vive en el módulo de comprobantes, que importa a éste.
 */
export async function codigoCompartidoDeVerdad(prisma, { grupoId, proveedorId, codigo, esPapelCorrido = null } = {}) {
  const documentos = await nombresDelCodigoPorDocumento(prisma, { grupoId, proveedorId, codigo });
  const candidatos = documentos.filter((d) => compartidoEnUnMismoDocumento([d.nombres]));
  for (const d of candidatos) {
    if (d.comprobanteId != null && typeof esPapelCorrido === "function" && (await esPapelCorrido(d.comprobanteId))) continue;
    return true;
  }
  return false;
}
