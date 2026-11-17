// lib/compras-proveedor/comprobante/listaGuardada.js
//
// LA LISTA DE PRECIOS GUARDADA DEL PROVEEDOR, COMO CATÁLOGO DE LA RECEPCIÓN.
//
// ── EL CASO (Arcor, pedido 654, 2026-11-17) ──────────────────────────────
//
// Siete renglones de Arcor quedaban "Sin vincular" —TABL. TOP LINE MENTA
// 20x6,7G, MR POP EXPLOSIVE FRUTILLA 20u x 10…— con la lista de Arcor subida.
// La lista sí estaba guardada entera, con sus 972 renglones (679 sin
// producto), pero la recepción no la miraba: buscaba el código del papel solo
// en los vínculos de código del proveedor (`ProductoCodigoProveedor`). Los
// siete renglones de la lista no tenían producto, así que no había nada que
// encontrar y la hoja de Corregir no sabía que la lista los conocía.
//
// La regla de Emanuel, que no se discute: el motor de macheo es UNO SOLO. Lo
// que se vincula en una lista sirve para boletas y facturas del mismo
// proveedor, y al revés. Por eso acá no hay un buscador nuevo: los renglones
// de la lista entran al MISMO índice y a la MISMA escalera de Listas
// (`indexarCodigosProveedor` + `macheePorCodigo`), con sus límites —por
// terminación solo códigos internos, mínimo 4 dígitos, coincidencia única; un
// código de barras coincide entero o no coincide—.
//
// ── QUÉ LISTA ES "LA GUARDADA" ────────────────────────────────────────────
//
// La última importación del proveedor que NO está cancelada. Cancelar es
// descartarla a propósito (la 7 de Arcor se canceló dos minutos después de
// subir la 6, con el mismo archivo): sus renglones siguen en la base pero no
// son la lista de nadie.
//
// ── LOS DOS USOS ──────────────────────────────────────────────────────────
//
//   a) Un renglón de la lista CON producto es un vínculo más para la cascada
//      (`vinculosDeLaListaGuardada`): el papel que trae ese código se vincula
//      solo, como con cualquier vínculo de código. Solo los que el proveedor
//      no tiene ya como vínculo —activo o dado de baja—: un vínculo de código
//      es una decisión y la lista no la pisa, y uno dado de baja es alguien
//      que dijo que no, que la lista no puede resucitar por la puerta de atrás.
//      Y solo si el producto es del universo del proveedor, el mismo filtro
//      que `cargarDatosDeConciliacion` le aplica a los vínculos.
//
//   b) Un renglón de la lista SIN producto (`filaDeLaListaSinProducto`) viaja
//      con la línea a la hoja de Corregir, que ofrece crear el producto con lo
//      que dice la lista. El alta es `AltaDesdeLaLista`, la de Listas, tal
//      cual; el vínculo se guarda por la ruta de vincular de la recepción, que
//      escribe el código del proveedor en la memoria que comparten listas y
//      recepción (`persistirIdentidad`). Así la próxima boleta y la próxima
//      lista lo encuentran por código.
//
// El renglón de una lista CERRADA no se reescribe: una lista terminada no
// cambia sus vínculos (`filas/[filaId]/vincular` la rechaza con CERRADA), y el
// vínculo de código ya es lo que la próxima lista lee.

import { indexarCodigosProveedor, macheePorCodigo } from "@/lib/proveedores/listas/conciliarLista";
import { normalizarCodigo } from "@/lib/proveedores/listas/normalizarCodigo";
import { CAMPOS_FILA_SIN_PRODUCTO, filaSinProductoParaLaPantalla } from "@/lib/proveedores/listas/sinProducto";

/** Los campos del renglón: los del alta desde la lista, más su producto. */
export const CAMPOS_FILA_LISTA_GUARDADA = Object.freeze({
  ...CAMPOS_FILA_SIN_PRODUCTO,
  productoBaseId: true,
});

/**
 * Lee de la base la lista guardada del proveedor y los códigos que ya tiene
 * vinculados. Null si el proveedor no tiene ninguna lista sin cancelar.
 */
export async function cargarListaGuardada(prisma, { grupoId, proveedorId }) {
  if (!grupoId || !proveedorId) return null;
  const cabecera = await prisma.importacionListaProveedor.findFirst({
    where: { grupoId, proveedorId, estado: { not: "CANCELADA" } },
    orderBy: { id: "desc" },
    select: { id: true, recargoPct: true, impuestoAdicionalPct: true },
  });
  if (!cabecera) return null;
  const [filas, codigos] = await Promise.all([
    prisma.importacionListaFila.findMany({
      where: { importacionId: cabecera.id },
      select: CAMPOS_FILA_LISTA_GUARDADA,
    }),
    // Activos Y dados de baja: los dos dicen que el código ya tiene dueño.
    prisma.productoCodigoProveedor.findMany({
      where: { grupoId, proveedorId },
      select: { codigoInterno: true, productoBaseId: true, activo: true },
    }),
  ]);
  return { cabecera, filas, vinculosDelProveedor: codigos };
}

/** El código del renglón tal como lo indexa el motor. */
function codigoDeLaFila(f) {
  return f?.codigoNormalizado ?? f?.codigoCrudo ?? null;
}

/**
 * La lista lista para la cascada. Puro: recibe lo que leyó `cargarListaGuardada`
 * y el universo del proveedor (`productoBaseId` de `cargarDatosDeConciliacion`).
 *
 * @returns `{ importacionId, cuentaDeLaLista, vinculos, indice }` o null
 */
export function armarListaGuardada({ cabecera, filas = [], vinculosDelProveedor = [] } = {}, { universo = null } = {}) {
  if (!cabecera) return null;
  const enUniverso = (id) => !universo || universo.has(Number(id));
  // ── UN RENGLÓN CUYO CÓDIGO YA TIENE VÍNCULO NO ENTRA A NINGUNO DE LOS DOS ─
  //
  // Lo que diga ese vínculo es lo que vale. Y "ya tiene" se pregunta con la
  // MISMA escalera, no comparando el texto: Arcor guarda sus vínculos con el
  // prefijo "10" que su lista no trae —el vínculo dice 1012631 y la lista
  // 12631—, y comparando el texto exacto la lista sumaba 135 vínculos que ya
  // existían, medido sobre la importación 6. Los dados de baja también cuentan:
  // tienen dueño, y el dueño dijo que no.
  const indiceDelProveedor = indexarCodigosProveedor(vinculosDelProveedor.filter((v) => v?.activo !== false));
  const codigosDadosDeBaja = new Set(
    vinculosDelProveedor
      .filter((v) => v?.activo === false)
      .map((v) => normalizarCodigo(v.codigoInterno))
      .filter(Boolean)
  );
  const conDueno = (f) => {
    const c = normalizarCodigo(codigoDeLaFila(f));
    if (!c) return true;
    if (codigosDadosDeBaja.has(c)) return true;
    const r = macheePorCodigo(indiceDelProveedor, { codigoCrudo: codigoDeLaFila(f), codigoNormalizado: c });
    return r.candidatos.length > 0 || Boolean(r.sugeridoPorTerminacion);
  };
  // Y un producto que ya tiene un vínculo activo con el proveedor ya se
  // encuentra por SU código: la lista no le agrega un segundo.
  const conVinculo = new Set(
    vinculosDelProveedor.filter((v) => v?.activo !== false).map((v) => Number(v.productoBaseId))
  );
  const libres = filas.filter((f) => !conDueno(f));
  const vinculos = libres
    .filter((f) => f.productoBaseId != null && enUniverso(f.productoBaseId) && !conVinculo.has(Number(f.productoBaseId)))
    .map((f) => ({
      id: null,
      productoBaseId: Number(f.productoBaseId),
      codigoInterno: codigoDeLaFila(f),
      // Sin descripción a propósito: la lista vincula por CÓDIGO. Con el texto
      // entraría al escalón del alias y nombraría productos por parecido.
      descripcionProveedor: null,
      activo: true,
      desdeLaLista: true,
    }));
  // El índice de TODOS los renglones libres, con y sin producto, para el uso b:
  // un código que por terminación toca dos renglones es ambiguo aunque uno solo
  // no tenga producto. Cada renglón sin producto es su propio candidato.
  const indice = indexarCodigosProveedor(
    libres
      .filter((f) => f.productoBaseId == null || enUniverso(f.productoBaseId))
      .map((f) => ({
        productoBaseId: f.productoBaseId != null ? Number(f.productoBaseId) : `fila:${f.id}`,
        codigoInterno: codigoDeLaFila(f),
        activo: true,
        fila: f,
      }))
  );
  const n = (v) => (v === null || v === undefined ? null : Number(v));
  return {
    importacionId: cabecera.id,
    // La cuenta de aplicar sobre el precio del renglón, la misma que manda
    // `GET sin-producto` a la pantalla de Listas para el costo del alta.
    cuentaDeLaLista: {
      recargoPct: n(cabecera.recargoPct) ?? 0,
      impuestoAdicionalPct: n(cabecera.impuestoAdicionalPct),
    },
    vinculos,
    indice,
  };
}

/** Los renglones con producto, como vínculos de código para la cascada. */
export function vinculosDeLaListaGuardada(listaGuardada) {
  return listaGuardada?.vinculos ?? [];
}

/**
 * EL RENGLÓN DE LA LISTA SIN PRODUCTO QUE TIENE EL CÓDIGO DE ESTA LÍNEA, o null.
 *
 * Con la misma escalera que todo lo demás: una sola coincidencia, y que sea de
 * un renglón sin producto. Lo que devuelve es lo que necesitan la hoja y el
 * alta: el renglón con la forma de `GET sin-producto`, la importación y su
 * cuenta.
 */
export function filaDeLaListaSinProducto({ linea, listaGuardada } = {}) {
  const codigo = normalizarCodigo(linea?.codigoProveedor);
  if (!codigo || !listaGuardada?.indice) return null;
  const r = macheePorCodigo(listaGuardada.indice, { codigoCrudo: linea.codigoProveedor, codigoNormalizado: codigo });
  if (r.candidatos.length !== 1) return null;
  const fila = r.candidatos[0].fila;
  if (!fila || fila.productoBaseId != null) return null;
  return {
    importacionId: listaGuardada.importacionId,
    cuentaDeLaLista: listaGuardada.cuentaDeLaLista,
    fila: filaSinProductoParaLaPantalla(fila),
  };
}
