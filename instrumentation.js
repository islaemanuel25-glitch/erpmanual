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
    console.error("[comprobantes] el chequeo de arranque falló inesperadamente:", e?.message ?? e);
  }

  // ── ¿EL MODELO CONFIGURADO SIGUE EXISTIENDO? ─────────────────────────────
  //
  // Google da modelos de baja SIN AVISAR. El 2026-08-11 `gemini-2.5-flash`
  // devolvió 404 —"no longer available to new users"— y nos enteramos porque
  // falló una lectura en medio de una recepción. Este chequeo adelanta ese aviso
  // al arranque, que es cuando no hay nadie esperando con el camión en la
  // puerta.
  //
  // Va DESPUÉS del chequeo del volumen y sin bloquear nada: es una consulta de
  // red y no puede demorar el arranque de la aplicación.
  try {
    const { verificarModelo } = await import(
      "./lib/compras-proveedor/comprobante/lector/gemini.js"
    );
    const v = await verificarModelo();
    if (v.ok) {
      console.log(`[comprobantes] modelo de lectura verificado: ${v.modelo}`);
    } else if (v.motivo === "DADO_DE_BAJA") {
      console.error(
        `[comprobantes] EL MODELO DE LECTURA YA NO EXISTE: ${v.modelo}
` +
          `[comprobantes] ${v.queHacer}
` +
          `[comprobantes] El resto de la aplicación sigue funcionando normalmente.`
      );
    } else if (v.motivo === "NO_CONFIGURADO") {
      console.log("[comprobantes] sin clave de lectura configurada: no se verifica el modelo.");
    } else {
      // No se pudo preguntar NO es lo mismo que dado de baja, y decirlo como
      // baja mandaría a cambiar un modelo que probablemente esté bien.
      console.log(
        `[comprobantes] no se pudo verificar el modelo ${v.modelo} (${v.motivo}). ` +
          "Puede ser la red; no quiere decir que no exista."
      );
    }
  } catch (e) {
    // No debería pasar —`verificarAlArrancar` ya atrapa lo suyo— pero un
    // arranque no se cae por el chequeo de un volumen de fotos ni por
    // accidente.
    console.error("[comprobantes] el chequeo de arranque falló inesperadamente:", e?.message ?? e);
  }
}
