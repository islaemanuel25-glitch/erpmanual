// lib/compras-proveedor/comprobante/paresDeLaLinea.js
//
// QUÉ PARES DEL PROVEEDOR RECONOCEN ESTE RENGLÓN.
//
// Arcor: "HW MOGUL MINI GUSANITOS 10×50G" quedó vinculado a "Mogul extreme mini
// gustnitos" y Emanuel dijo que está mal. Para que la próxima factura no lo
// vuelva a vincular solo, no alcanza con soltar el renglón: hay que dar de baja
// el par proveedor + código/texto → ese producto que la cascada usa para
// reconocerlo (`buscarCandidatos`, escalones 1 y 2).
//
// Son los mismos caminos que recorre la cascada, y por eso se preguntan acá con
// sus mismas piezas:
//
//   · el CÓDIGO del renglón, exacto o por la escalera de la lista
//     (`macheePorCodigo`) — puede venir de una lista de precios;
//   · la CLAVE DEL ALIAS (`claveDeAlias`, "TXT:…"), que es como se guarda un
//     renglón sin código;
//   · la DESCRIPCIÓN guardada en cualquier par, que es lo que mira el alias.
//
// Lo usan tres: quitar el producto (da de baja los que apuntan al producto
// quitado), cambiarlo (da de baja los que apuntan a otro, para que quede uno
// solo) y la vinculación automática contra el pedido (un par dado de baja dice
// que alguien lo rechazó, y no se vuelve a vincular solo a ese producto).
//
// Módulo puro: sin Prisma.

import { normalizarCodigo } from "@/lib/proveedores/listas/normalizarCodigo";
import { normalizarTexto } from "@/lib/productos/busquedaFuzzyProducto";
import { claveDeAlias } from "@/lib/proveedores/identidad/servicioIdentidad";
import { indexarCodigosProveedor, macheePorCodigo } from "@/lib/proveedores/listas/conciliarLista";

/**
 * Los pares de `vinculos` que reconocen el renglón `{ codigoProveedor, textoCrudo }`.
 * La escalera mira solo los activos —como la cascada—; el código exacto, el alias
 * y la descripción miran todos, para poder preguntar también por los dados de baja.
 */
export function paresQueReconocenLaLinea({ linea, vinculos = [] } = {}) {
  const codigo = normalizarCodigo(linea?.codigoProveedor);
  const alias = claveDeAlias(linea?.textoCrudo);
  const texto = normalizarTexto(linea?.textoCrudo);
  const lista = Array.isArray(vinculos) ? vinculos : [];

  // Solo si la escalera eligió UNO: ambigua, no vinculó nada, y los códigos que
  // empataron son de otros productos que no tienen por qué perder el suyo.
  const escalera = codigo
    ? macheePorCodigo(indexarCodigosProveedor(lista), { codigoCrudo: linea?.codigoProveedor, codigoNormalizado: codigo })
    : { candidatos: [] };
  const porEscalera = new Set(
    escalera.candidatos.length === 1 ? [normalizarCodigo(escalera.candidatos[0]?.codigoInterno)] : []
  );

  return lista.filter((v) => {
    const suyo = normalizarCodigo(v?.codigoInterno);
    if (codigo && (suyo === codigo || porEscalera.has(suyo))) return true;
    return reconocePorTexto(v, { alias, texto });
  });
}

function reconocePorTexto(v, { alias, texto }) {
  if (alias && v?.codigoInterno === alias) return true;
  return Boolean(texto) && normalizarTexto(v?.descripcionProveedor) === texto;
}

/**
 * ¿Alguien dio de baja el par que llevaba ESTE TEXTO a este producto?
 *
 * Solo por texto, y a propósito: una lista de precios también da de baja
 * códigos —el proveedor cambió el código de un producto— y eso no dice que el
 * renglón sea de otro producto. Quitar el producto siempre deja dado de baja el
 * par del texto (`parDelTextoRechazado`), así que esta pregunta lo encuentra.
 */
export function parRechazado({ linea, vinculos = [], productoBaseId } = {}) {
  const alias = claveDeAlias(linea?.textoCrudo);
  const texto = normalizarTexto(linea?.textoCrudo);
  return (Array.isArray(vinculos) ? vinculos : []).some(
    (v) => v?.activo === false && Number(v?.productoBaseId) === Number(productoBaseId) && reconocePorTexto(v, { alias, texto })
  );
}

/**
 * El par del texto, dado de baja, para cuando quitar no encontró ninguno que lo
 * diga: el vínculo venía solo por código —de una lista, por ejemplo—. Sin él,
 * la vinculación automática contra el pedido no sabría que ese texto ya se
 * rechazó para ese producto. Null si el renglón no tiene texto.
 */
export function parDelTextoRechazado({ linea, grupoId, proveedorId, productoBaseId } = {}) {
  const alias = claveDeAlias(linea?.textoCrudo);
  if (!alias) return null;
  const descripcion = String(linea.textoCrudo).trim();
  return {
    grupoId,
    proveedorId,
    productoBaseId,
    codigoInterno: alias,
    descripcionProveedor: descripcion,
    descripcionNormalizada: normalizarTexto(descripcion),
    origenAlta: "VINCULACION_MANUAL",
    activo: false,
  };
}
