// LA FOTO SE ACHICA ANTES DE MANDARLA A LEER. LA ORIGINAL NO SE TOCA.
//
// ── POR QUÉ ────────────────────────────────────────────────────────────────
//
// Una foto de comprobante sacada con un celular moderno pesa entre 4 y 12 MB y
// mide 4000 px o más de lado largo. Eso viaja entero a la IA en base64 —un 33 %
// más grande todavía— en cada intento de lectura. Con una factura de cinco
// hojas son cincuenta megas de subida por lectura, y si hay que reintentar, el
// doble.
//
// El lado largo de 3000 px no es un número elegido por gusto: a esa resolución
// un renglón de factura ocupa entre 25 y 40 px de alto, que es holgado para
// leer dígitos chicos. Bajar de ahí empieza a comerse los centavos, que es
// exactamente lo que no se puede perder — el control del total compara contra
// el centavo.
//
// ── LA ORIGINAL NO SE TOCA, Y ESO NO ES UN DETALLE ─────────────────────────
//
// Lo que se achica es lo que viaja, no lo que queda guardado. La foto del
// volumen es EL DOCUMENTO: es contra lo que alguien va a mirar dentro de seis
// meses cuando discuta un número con el proveedor, y volver a comprimirla le
// bajaría calidad justo en los dígitos chicos. Es la misma razón que ya está
// escrita en `ComprobanteArchivo.giroGrados`, que tampoco reescribe el archivo.
//
// ── QUÉ SE ACHICA Y QUÉ NO ─────────────────────────────────────────────────
//
// Solo las IMÁGENES. Un PDF pasa tal cual: su texto ya es texto, achicarlo no
// existe como operación y rasterizarlo sería empeorarlo. Un Excel, lo mismo.
//
// Y hay dos guardas que importan más que el achicado:
//
//   · NUNCA SE AGRANDA. Una foto que ya mide menos de 3000 px se manda como
//     está. `withoutEnlargement` lo hace, y sin eso una foto de 900 px se
//     estiraría a 3000 inventando píxeles borrosos.
//   · NUNCA SE MANDA ALGO PEOR. Si el resultado pesa igual o más que el
//     original —pasa con capturas de pantalla en PNG y con fotos ya
//     comprimidas—, se manda el original. Achicar es una optimización: si no
//     optimiza, no corresponde pagar la pérdida de calidad.
//
// ── SI FALLA, SE MANDA LA ORIGINAL ─────────────────────────────────────────
//
// Un problema para redimensionar no se puede convertir en "no se pudo leer la
// factura". Cualquier error devuelve el archivo intacto y lo DICE en el
// resultado, para que quien mire el informe de una lectura sepa que ese archivo
// viajó entero y por qué.
//
// Módulo sin React, sin Prisma y sin red. `sharp` entra por parámetro para que
// los candados puedan ejercer las cuatro decisiones sin la librería nativa.

/**
 * El lado largo al que se lleva la foto.
 *
 * Medido sobre la factura del pedido 242 —la de Paty, la más chica de letra que
 * entró hasta ahora—: a 3000 px la lectura devuelve los mismos números que con
 * la original, incluidos el total y los dos renglones que se usan de control.
 */
export const LADO_LARGO_MAX = 3000;

/** Calidad del JPEG. 85 es el punto donde el archivo cae a un tercio y el texto no. */
export const CALIDAD_JPEG = 85;

/** Lo que se achica. Todo lo demás viaja como está. */
const IMAGENES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

/** Por qué un archivo viajó sin achicar. Se informa, no se esconde. */
export const MOTIVO_SIN_ACHICAR = Object.freeze({
  NO_ES_IMAGEN: "NO_ES_IMAGEN",
  YA_ERA_CHICA: "YA_ERA_CHICA",
  NO_MEJORABA: "NO_MEJORABA",
  FALLO: "FALLO",
});

/**
 * ¿ESTE ARCHIVO SE ACHICA?
 *
 * Aparte para que el candado pueda preguntarlo sin librería y sin bytes.
 */
export function seAchica(mime) {
  return IMAGENES.has(String(mime ?? "").toLowerCase());
}

/**
 * ACHICAR UNA FOTO PARA MANDARLA A LEER.
 *
 * @param archivo `{ bytes, mime, orden }` tal como sale del volumen.
 * @param sharp   la fábrica de sharp. Se inyecta para poder ejercerlo.
 * @returns el mismo archivo, con `bytes` y `mime` ya listos para viajar, más
 *          `achicado: { hubo, motivo, bytesAntes, bytesDespues, ancho, alto }`.
 *          La forma de entrada se conserva: quien llama no tiene que saber si
 *          se achicó o no.
 */
export async function achicarParaLeer(archivo, sharp) {
  const bytesAntes = archivo?.bytes?.length ?? 0;
  const base = { ...archivo };

  const sinAchicar = (motivo) => ({
    ...base,
    achicado: { hubo: false, motivo, bytesAntes, bytesDespues: bytesAntes, ancho: null, alto: null },
  });

  if (!seAchica(archivo?.mime)) return sinAchicar(MOTIVO_SIN_ACHICAR.NO_ES_IMAGEN);
  if (typeof sharp !== "function") return sinAchicar(MOTIVO_SIN_ACHICAR.FALLO);

  try {
    // `rotate()` sin argumentos aplica el giro que dice el EXIF. Sin esto, una
    // foto sacada de costado viaja de costado: el modelo la lee igual pero
    // peor, y el que la mira en el visor la ve derecha, así que nadie
    // entendería por qué leyó mal.
    const imagen = sharp(archivo.bytes).rotate();
    const meta = await imagen.metadata();
    const ladoLargo = Math.max(Number(meta?.width) || 0, Number(meta?.height) || 0);

    const salida = await imagen
      .resize({
        width: LADO_LARGO_MAX,
        height: LADO_LARGO_MAX,
        fit: "inside",
        // NUNCA se agranda: una foto de 900 px se manda de 900 px.
        withoutEnlargement: true,
      })
      .jpeg({ quality: CALIDAD_JPEG, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });

    const bytesDespues = salida?.data?.length ?? 0;

    // Si no mejora, va la original. Achicar es una optimización y una
    // optimización que no optimiza es solo pérdida de calidad.
    if (!bytesDespues || bytesDespues >= bytesAntes) {
      return sinAchicar(
        ladoLargo && ladoLargo <= LADO_LARGO_MAX
          ? MOTIVO_SIN_ACHICAR.YA_ERA_CHICA
          : MOTIVO_SIN_ACHICAR.NO_MEJORABA
      );
    }

    return {
      ...base,
      bytes: salida.data,
      mime: "image/jpeg",
      achicado: {
        hubo: true,
        motivo: null,
        bytesAntes,
        bytesDespues,
        ancho: salida.info?.width ?? null,
        alto: salida.info?.height ?? null,
      },
    };
  } catch {
    return sinAchicar(MOTIVO_SIN_ACHICAR.FALLO);
  }
}

/**
 * LAS FOTOS DE UNA LECTURA, TODAS ACHICADAS.
 *
 * En serie y no con `Promise.all`: redimensionar es trabajo de CPU, y cinco
 * hojas a la vez en el mismo proceso que atiende a los cinco locales es
 * exactamente la clase de ráfaga que compite con las ventas. En serie tarda lo
 * mismo en total y no hace un pico.
 */
export async function achicarTodas(archivos, sharp) {
  const lista = Array.isArray(archivos) ? archivos : [];
  const salida = [];
  for (const a of lista) salida.push(await achicarParaLeer(a, sharp));
  return salida;
}

/** Una línea para el log: cuánto se ahorró. Sin esto el achicado es invisible. */
export function resumenDelAchicado(archivos) {
  const lista = (Array.isArray(archivos) ? archivos : []).map((a) => a?.achicado).filter(Boolean);
  if (!lista.length) return null;
  const antes = lista.reduce((s, a) => s + (a.bytesAntes || 0), 0);
  const despues = lista.reduce((s, a) => s + (a.bytesDespues || 0), 0);
  const achicadas = lista.filter((a) => a.hubo).length;
  return { archivos: lista.length, achicadas, antes, despues };
}
