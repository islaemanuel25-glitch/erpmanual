// instrumentation.js — lo que se comprueba UNA VEZ, al levantar el servidor.
//
// Next lo llama solo, una vez por proceso de servidor, antes de atender el
// primer pedido. No hay que importarlo desde ningún lado.
//
// REGLA DE ESTE ARCHIVO: lo que va acá AVISA, no tumba. Si algo de acá tirara,
// el servidor no levanta y se cae el POS de los cinco locales. Un chequeo que
// puede voltear la aplicación entera tiene que ser algo sin lo cual la
// aplicación no tiene sentido — y el volumen de fotos de comprobantes no lo es.
//
// Lo que sí frena está en el punto de uso: `exigirAlmacen()` se pregunta antes
// de CADA escritura y tira si el volumen no está. Ese es el que protege; este
// es el que avisa a tiempo.

export async function register() {
  // El guardia del runtime no es adorno: `instrumentation` también corre en el
  // runtime edge, donde no hay sistema de archivos y el import de `node:fs`
  // falla al cargar el módulo.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { verificarAlArrancar } = await import(
    "./lib/compras-proveedor/comprobante/almacenDisco.js"
  );
  try {
    await verificarAlArrancar();
  } catch (e) {
    // No debería pasar —`verificarAlArrancar` ya atrapa lo suyo— pero un
    // arranque no se cae por el chequeo de un volumen de fotos ni por
    // accidente.
    console.error("[comprobantes] el chequeo de arranque falló inesperadamente:", e?.message ?? e);
  }
}
