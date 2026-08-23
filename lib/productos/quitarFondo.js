// QUITAR EL FONDO DE LA FOTO DE UN PRODUCTO.
//
// ── LO QUE ESTE ARCHIVO ES, Y LO QUE NO ────────────────────────────────────
//
// Es la COSTURA, y sigue siéndolo. El flujo aprobado —procesar, mostrar el
// resultado, dejar elegir entre el recorte y la original— no depende de qué
// motor haga el recorte. La pantalla importa `quitarFondo` y nada más; no sabe
// que adentro cambió todo.
//
// Que eso se cumpla no es una intención: hay un candado que exige que
// `CargarFotoProducto` no toque ni un pixel ni nombre a ningún motor.
//
// ── QUÉ CAMBIÓ, Y POR QUÉ ──────────────────────────────────────────────────
//
// El motor principal pasó a ser **u2netp**, una red de segmentación que corre en
// el navegador. El motor por bordes —el que venía puesto— quedó como respaldo en
// `motorBordes.js`.
//
// El motivo es el que Emanuel escribió al aprobarlo: el objetivo real es que al
// subir una foto quede el producto solo, y el motor por bordes no llega. Fallaba
// en producto blanco sobre fondo claro, en fondo del mismo tono, en botellas con
// reflejo y en el producto que toca el borde del cuadro. Esos no son problemas de
// ajuste: son el límite de mirar color en vez de forma.
//
// En `DEC-0010` u2netp estaba aprobado técnicamente y NO adoptado, esperando ver
// fallar al motor barato sobre fotos reales. Ya se lo vio fallar.
//
// ── LA CASCADA, Y EN QUÉ ORDEN ─────────────────────────────────────────────
//
//   1. u2netp. Si da una máscara, esa es la respuesta.
//   2. Si u2netp no puede —sin WebAssembly, la descarga se cortó, el modelo no
//      se pudo leer, la red devolvió cualquier cosa— se cae al motor por bordes.
//   3. Si tampoco puede, `quitarFondo` tira, y la pantalla se queda con la
//      original y dice por qué. Un fallo del procesador NUNCA bloquea la carga.
//
// El escalón 2 existe para que un teléfono viejo pueda seguir teniendo algo, no
// para tapar que el motor bueno falló: el resultado dice con `motor` cuál lo
// hizo, y la pantalla lo puede contar.
//
// ── NUNCA DEVUELVE JPEG ────────────────────────────────────────────────────
//
// Es la regla dura y no cambió. JPEG no tiene canal alfa y no falla al guardar:
// rellena el fondo de negro. Todo el trabajo se pierde en el último paso, sin
// error, y se ve recién en la tarjeta.

import { TIPOS_ACEPTADOS } from "@/lib/productos/fotoProducto";
import {
  confiaEnElRecorte,
  fraccionDelBloqueMayor,
} from "@/lib/productos/confianzaDelRecorte";
import { quitarFondoPorBordes } from "@/lib/productos/motorBordes";
import { componerAlfa, mascaraDeProducto } from "@/lib/productos/u2netpMotor";

/**
 * Quita el fondo de un `File` y devuelve otro `File` con transparencia.
 *
 * @param {File} archivo
 * @param {{tolerancia?:number, alAvanzar?:Function, permitirRespaldo?:boolean}} opciones
 * @returns {Promise<{archivo: File, confia: boolean, proporcionQuitada: number,
 *                    fraccionDelBloque: number, motor: string, motivoDelRespaldo: string|null}>}
 */
export async function quitarFondo(
  archivo,
  { tolerancia = 42, alAvanzar = null, permitirRespaldo = true } = {}
) {
  if (!archivo) throw new Error("No hay archivo al que quitarle el fondo.");

  const mapa = await crearMapaDeBits(archivo);
  const lienzo = document.createElement("canvas");
  lienzo.width = mapa.width;
  lienzo.height = mapa.height;
  const ctx = lienzo.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(mapa, 0, 0);
  if (typeof mapa.close === "function") mapa.close();

  const datos = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
  const medida = await recortar(datos, { tolerancia, alAvanzar, permitirRespaldo });
  ctx.putImageData(datos, 0, 0);

  // WEBP SI ESTÁ, PNG SI NO. Los dos tienen alfa; jpeg no entra ni como
  // respaldo, y hay un candado que lo fija.
  const tipo = tipoConAlfa();
  const blob = await new Promise((resolve, reject) => {
    lienzo.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("El navegador no pudo guardar la imagen recortada."))),
      tipo,
      0.9
    );
  });

  // La extensión sale del MISMO mapa que el servidor usa para aceptar el
  // archivo. Un ternario acá vuelve a abrir el agujero que Q2 cerró en la
  // función que achica: un tercer formato olvidado sube un `.png` que adentro es
  // otra cosa, y el servidor lo acepta por su `type` sin que nadie se entere.
  return {
    archivo: new File([blob], `foto-sin-fondo.${TIPOS_ACEPTADOS[tipo]}`, { type: tipo }),
    ...medida,
  };
}

/**
 * La cascada de motores, sobre el `ImageData` ya listo.
 *
 * Se separa de `quitarFondo` porque acá adentro no hay ni `File` ni `canvas`: es
 * la decisión de qué motor corre y qué se informa, y así se puede leer sola.
 */
async function recortar(datos, { tolerancia, alAvanzar, permitirRespaldo }) {
  try {
    const mascara = await mascaraDeProducto(datos, { alAvanzar });
    const { proporcionQuitada, esFondo } = componerAlfa(datos, mascara);
    const fraccionDelBloque = fraccionDelBloqueMayor(esFondo, datos.width, datos.height);
    return {
      proporcionQuitada,
      fraccionDelBloque,
      confia: confiaEnElRecorte(proporcionQuitada, fraccionDelBloque),
      motor: "u2netp",
      motivoDelRespaldo: null,
    };
  } catch (e) {
    if (!permitirRespaldo) throw e;

    // ── EL RESPALDO NO PUEDE SER SILENCIOSO ───────────────────────────────
    //
    // Los dos motores devuelven una imagen plausible, así que desde afuera "anda"
    // y "anda el de atrás" se ven igual. Sin esta línea, un modelo que nunca
    // carga en cierto teléfono es indistinguible del motor bueno funcionando, y
    // la sonda daría verde sobre el respaldo sin que nadie lo note.
    //
    // Va a la consola y no a la pantalla a propósito: para la persona el flujo es
    // el mismo y no hay nada que decidir. Para quien mide, es la diferencia entre
    // las dos cosas.
    //
    // Verificar cuál corrió NO se hace mirando el log del servidor: Next no
    // registra los estáticos de `public/`, así que ahí los pedidos del modelo no
    // aparecen nunca y el conteo da cero con el motor andando perfecto. Se
    // pregunta del lado del navegador, con Resource Timing — y aun así hay que
    // usar un perfil limpio, porque con la Cache API caliente tampoco hay pedido
    // de red que ver. Las dos cosas dieron un diagnóstico falso al escribir esto.
    try {
      console.warn("[quitarFondo] u2netp no pudo, se usa el respaldo por bordes:", e);
    } catch {
      // Una consola que no existe no puede tumbar el recorte.
    }

    // ── EL RESPALDO EMPIEZA DESDE LA IMAGEN LIMPIA ────────────────────────
    //
    // No se puede: u2netp pudo haber escrito alfa antes de fallar —falla en la
    // inferencia, no necesariamente antes de componer— y el motor por bordes
    // trabaja sobre el mismo arreglo. Se restituye el alfa a opaco para que el
    // respaldo no arranque sobre un recorte a medio hacer.
    const px = datos.data;
    for (let i = 3; i < px.length; i += 4) px[i] = 255;

    const r = quitarFondoPorBordes(datos, { tolerancia });
    return {
      proporcionQuitada: r.proporcionQuitada,
      fraccionDelBloque: r.fraccionDelBloque,
      confia: r.confia,
      motor: "bordes",
      motivoDelRespaldo: e?.message || "el motor principal no pudo",
    };
  }
}

/** El tipo de salida para una imagen CON transparencia. Solo dos opciones. */
export function tipoConAlfa(crear = (t) => document.createElement("canvas").toDataURL(t)) {
  try {
    return String(crear("image/webp")).startsWith("data:image/webp") ? "image/webp" : "image/png";
  } catch {
    return "image/png";
  }
}

/** Igual que en `achicarFoto`: se respeta la orientación de la foto del celular. */
async function crearMapaDeBits(archivo) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(archivo, { imageOrientation: "from-image" });
    } catch {
      // Sigue por el respaldo.
    }
  }
  const url = URL.createObjectURL(archivo);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("No se pudo abrir la imagen."));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
