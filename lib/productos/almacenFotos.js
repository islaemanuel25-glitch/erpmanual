// DÓNDE VIVEN LAS FOTOS DE PRODUCTO. **ESTE ARCHIVO TOCA EL DISCO.**
//
// El contrato que también necesita el navegador —el lado máximo, los formatos,
// cómo se arma el nombre y la url— está en `fotoProducto.js`, que no importa
// nada de `node:`. La separación no es de estilo: el componente del formulario
// arrastraba este módulo al bundle del cliente y el build moría con "the
// chunking context does not support external modules (request: node:fs)".
//
// ── POR QUÉ UN VOLUMEN APARTE Y NO EL DE COMPROBANTES ─────────────────────
//
// El almacén de comprobantes está bien hecho y sus protecciones se reusan tal
// cual —el centinela que distingue un volumen montado de una carpeta vacía, la
// traducción de los errores de escritura, la detección de disco lleno—. Lo que
// NO se puede reusar es el lugar, y por una razón sola:
//
//   **Los comprobantes se borran a los siete días. Las fotos de producto no se
//   borran nunca.**
//
// `DIAS_DE_VIDA = 7` es una decisión escrita, con su comentario explicando que
// borrar antes de tiempo rompe una promesa en silencio. Guardar acá una foto de
// producto la pondría en ese reloj: andaría una semana y después la tarjeta
// mostraría un cuadrado roto, sin ningún error y sin que nadie relacione una
// cosa con la otra.
//
// Por eso: volumen propio, centinela propio, y NINGUNA rutina de retención. Si
// algún día hay que borrar fotos viejas, será una decisión con su nombre y no
// una consecuencia de haberlas guardado en el cajón de al lado.
//
// ── LO QUE SÍ SE REUSA ────────────────────────────────────────────────────
//
// `inspeccionarAlmacen` se llama con otro centinela — se le agregó el parámetro
// justamente para no copiar la inspección de disco. Escribir una versión
// "parecida" acá al lado sería la copia que ningún candado atrapa, porque las
// dos andarían.

import {
  inspeccionarAlmacen,
  AlmacenNoDisponible,
  traducirErrorDeEscritura,
} from "@/lib/compras-proveedor/comprobante/almacenDisco";
import {
  NOMBRE_CENTINELA_FOTOS,
  VARIABLE_RUTA_FOTOS,
} from "@/lib/productos/fotoProducto";

/** El veredicto del almacén de fotos, con SU centinela. */
export function inspeccionarAlmacenDeFotos({ ruta = process.env[VARIABLE_RUTA_FOTOS] } = {}) {
  return inspeccionarAlmacen({ ruta, centinela: NOMBRE_CENTINELA_FOTOS });
}

/**
 * Frena la escritura si el volumen no está.
 *
 * Se pregunta ANTES DE CADA ESCRITURA y no solo al arrancar: un montaje se puede
 * caer después, y ahí el chequeo del arranque ya pasó y no protege nada. Es la
 * misma regla del almacén de comprobantes y por el mismo motivo.
 */
export async function exigirAlmacenDeFotos() {
  const veredicto = await inspeccionarAlmacenDeFotos();
  if (!veredicto.ok) throw new AlmacenNoDisponible(veredicto.motivo, veredicto.ruta);
  return veredicto;
}

export { AlmacenNoDisponible, traducirErrorDeEscritura };
