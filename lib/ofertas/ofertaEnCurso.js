// lib/ofertas/ofertaEnCurso.js
//
// LA OFERTA A MEDIO ARMAR, GUARDADA DEL LADO DEL NAVEGADOR.
//
// ── EL MISMO MECANISMO QUE EL PEDIDO A PROVEEDOR, NO UNO NUEVO ───────────
//
// Es la copia deliberada de `lib/compras-proveedor/retornoPedido.js`: una clave
// de `sessionStorage`, una función que serializa y otra que deserializa, las dos
// puras y con sus candados. La pantalla solo llama a estas dos.
//
// NO se guarda como borrador en el servidor. Crear un borrador al elegir un
// producto haría aparecer una oferta en la lista que nadie pidió crear, y habría
// que salir a limpiarla. Esto es invisible, vive en la pestaña y se descarta
// solo al cerrarla.
//
// ── QUÉ SE GUARDA Y QUÉ NO ──────────────────────────────────────────────
//
// Se guarda LO QUE LA PERSONA ELIGIÓ: qué producto, qué escribió en los dos
// campos, si dejó el redondeo puesto, hasta cuándo y si es solo efectivo.
//
// NO se guardan el precio normal ni el costo del producto. Es la misma decisión
// que tomó el pedido a proveedor y por el mismo motivo: al volver, la pantalla
// los vuelve a pedir al servidor, porque entre que se fue y volvió el costo pudo
// cambiar — y mostrar el guardado sería mostrar el viejo justo en el número que
// decide si la oferta conviene.
//
// Se guarda el MARGEN y el PRECIO como texto, tal como estaban en los campos, y
// no el número resuelto: si se guardara el número, al volver el campo mostraría
// "18" donde la persona había dejado "18." a medio tipear.

export const CLAVE_OFERTA_EN_CURSO = "ofertasOfertaEnCurso";

function enteroPositivo(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const texto = (v) => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));

/**
 * Lo que hace falta para reconstruir la oferta al volver.
 *
 * Devuelve `null` cuando no hay nada que valga la pena guardar: sin producto
 * elegido no hay oferta a medio armar, hay una pantalla recién abierta, y
 * guardar eso haría aparecer el cartel de "tenés una oferta a medio armar" sobre
 * una pantalla vacía.
 */
export function serializarOfertaEnCurso({
  productoLocalId,
  productoBaseId,
  nombre,
  margen,
  precio,
  redondear,
  duracion,
  fechaElegida,
  soloEfectivo,
} = {}) {
  const id = enteroPositivo(productoLocalId);
  if (id === null) return null;
  return {
    productoLocalId: id,
    productoBaseId: enteroPositivo(productoBaseId),
    nombre: texto(nombre),
    margen: texto(margen),
    precio: texto(precio),
    // El interruptor arranca ENCENDIDO, así que se guarda el booleano y no
    // "si viene lo prendo": un `undefined` al volver tiene que quedar encendido
    // igual, y eso lo decide la pantalla con su valor por defecto.
    redondear: redondear !== false,
    duracion: texto(duracion),
    fechaElegida: texto(fechaElegida),
    soloEfectivo: soloEfectivo === true,
  };
}

/**
 * La vuelta atrás. Devuelve `null` ante CUALQUIER cosa que no sea lo que se
 * guardó: un JSON roto, una versión vieja del formato o algo manipulado a mano
 * no puede romper la pantalla ni cargar un producto que no existe.
 *
 * El `productoLocalId` es lo único obligatorio, y se valida como entero
 * positivo: es con lo que la pantalla vuelve a pedirle el producto al servidor.
 */
export function deserializarOfertaEnCurso(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  let obj;
  try {
    obj = typeof valor === "string" ? JSON.parse(valor) : valor;
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;

  const id = enteroPositivo(obj.productoLocalId);
  if (id === null) return null;

  return {
    productoLocalId: id,
    productoBaseId: enteroPositivo(obj.productoBaseId),
    nombre: texto(obj.nombre),
    margen: texto(obj.margen),
    precio: texto(obj.precio),
    redondear: obj.redondear !== false,
    duracion: texto(obj.duracion),
    fechaElegida: texto(obj.fechaElegida),
    soloEfectivo: obj.soloEfectivo === true,
  };
}

/** "MANI CASCARA 500G" → el texto del cartel de arriba. */
export function textoDelCartel(enCurso) {
  if (!enCurso) return "";
  return enCurso.nombre
    ? `Tenés una oferta a medio armar: ${enCurso.nombre}`
    : "Tenés una oferta a medio armar";
}
