// lib/pedidos/guardiaDeLecturas.js
//
// QUE UNA LECTURA VIEJA DEL PEDIDO NO PISE LO QUE LA PERSONA ACABA DE TOCAR.
//
// Desde el 2026-10-25 las pantallas de Pedidos —el celular y la computadora—
// releen el carrito solas cada pocos segundos y al volver a la pestaña, para
// ver lo que cargan las otras personas del local (`useRefrescoDelPedido`).
// Esa lectura viaja mientras la persona sigue tocando: si salió ANTES de un
// toque y vuelve DESPUÉS, trae el pedido de antes del toque, y aplicarla
// volvería el número para atrás un instante —"se mueve solo"— hasta la
// lectura siguiente.
//
// La guardia lo evita sin relojes: cada escritura (`escribiendo()`) sube la
// versión al empezar y al terminar, y una lectura (`leyendo()`) solo se aplica
// si al volver no hay ninguna escritura en vuelo y la versión es la misma con
// la que salió. Si no, se descarta: la próxima vuelta trae lo bueno.
//
// Puro y sin imports: se corre bajo `node --test`.

export function crearGuardiaDeLecturas() {
  let enVuelo = 0;
  let version = 0;
  return {
    /** Marca el comienzo de una escritura. Devuelve la función que marca el fin (una sola vez). */
    escribiendo() {
      enVuelo += 1;
      version += 1;
      let terminada = false;
      return () => {
        if (terminada) return;
        terminada = true;
        enVuelo -= 1;
        version += 1;
      };
    },
    /** Lo que se anota al salir a leer. */
    leyendo() {
      return version;
    },
    /** Si la lectura que salió con `marca` todavía se puede aplicar. */
    vigente(marca) {
      return enVuelo === 0 && marca === version;
    },
  };
}
