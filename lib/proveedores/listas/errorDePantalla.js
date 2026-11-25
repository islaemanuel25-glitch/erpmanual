// QUÉ DECIR CUANDO UNA PANTALLA DE LISTAS NO SE PUEDE MOSTRAR.
//
// Emanuel, 2026-11-25 (producción en c70d8813): en la lista de Arcor, tocar un
// botón de la tarjeta dejaba "Application error: a client-side exception has
// occurred". Ninguna tarjeta de las tres pantallas se cae con renglones raros
// —probado con miles de combinaciones de vacíos, nulos, texto, cero y
// negativos—, y el código de Listas no cambió desde el 18/11.
//
// Hay una causa que no depende de los datos y que da exactamente ese cartel:
// un despliegue con la pantalla abierta. El celular tiene el código de antes,
// y al tocar un botón pide el de la pantalla siguiente con un nombre que ya no
// existe en el servidor. Eso no se arregla reintentando: se arregla
// recargando, que trae el código nuevo. Por eso se distingue.
//
// Módulo puro: sin React.

/** ¿El error es el código de la pantalla que no llegó, por un despliegue en el medio? */
export function esVersionVieja(error) {
  const nombre = String(error?.name ?? "");
  const mensaje = String(error?.message ?? "");
  return /chunk/i.test(nombre) || /(loading|failed to load|cargar).{0,20}chunk|chunk.{0,40}(failed|404)/i.test(mensaje);
}

/** El texto del límite de error de Listas, para cada caso. */
export function textoDelErrorDePantalla(error) {
  if (esVersionVieja(error)) {
    return {
      titulo: "El sistema se actualizó mientras la pantalla estaba abierta.",
      detalle: "Recargá la página para traer la versión nueva. No se cambió ningún precio.",
      accion: "RECARGAR",
    };
  }
  return {
    titulo: "No se pudo mostrar esta pantalla de la lista. No se cambió ningún precio.",
    detalle: error?.message ? String(error.message) : null,
    accion: "REINTENTAR",
  };
}
