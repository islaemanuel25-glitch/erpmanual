"use client";

// LEER UN CÓDIGO DE BARRAS CON LA CÁMARA.
//
// ── LO ÚNICO QUE HACE ─────────────────────────────────────────────────────
//
// Abre la cámara, detecta un código, lo devuelve por callback y cierra. Eso es
// todo. **No sabe qué es un producto, ni una transferencia, ni una recepción, ni
// stock, ni llama a ninguna ruta.** Devuelve un string y se apaga.
//
// Está en el kit y no adentro de Transferencias por eso: lo que hace no tiene
// nada que ver con recepción, y la próxima pantalla que necesite leer un código
// —el POS, una auditoría de stock— tiene que poder usar esto sin arrastrar media
// recepción atrás.
//
// ── EL LECTOR ES ZXING EN TODOS LOS EQUIPOS ───────────────────────────────
//
// Decía "`BarcodeDetector` del navegador, cero bytes". En producción la cámara
// del Control de stock se abría y no leía nada: en varios Android el nativo
// existe, no soporta todos los formatos y devuelve vacío sin error. El lector
// es `lib/sunmi/lectorCodigoBarra.js` —zxing en WebAssembly, con el `.wasm`
// servido desde el sitio y cargado recién al abrir—, el mismo en todos los
// equipos y el mismo que su candado ejerce con imágenes.
//
// ── CÓMO SE LEE ───────────────────────────────────────────────────────────
//
// Cámara trasera pidiendo 1280×720 y enfoque continuo donde se pueda. Cada
// `INTERVALO_LECTURA_MS`, con el video ya reproduciéndose, el cuadro se copia a
// un canvas del tamaño REAL del video —no del que ocupa en pantalla— y se lee.
// Un cuadro que falla no corta el bucle: se prueba con el siguiente.
//
// ── LA CÁMARA SE LIBERA SIEMPRE ───────────────────────────────────────────
//
// Un `MediaStream` que queda abierto deja el LED prendido, come batería y en
// algunos Android impide que otra pantalla abra la cámara hasta reiniciar la
// app. Se corta en el cierre, en el desmontaje y en el camino de error, y la
// referencia se guarda en un ref para que el cleanup no dependa de que el
// render haya terminado.
//
// ── CONTEXTO SEGURO ───────────────────────────────────────────────────────
//
// `getUserMedia` no existe fuera de HTTPS (o localhost). No es algo que se pueda
// sortear desde acá: si el navegador no lo expone, se informa y el operador
// teclea. Producción sirve por HTTPS, así que en el uso real está disponible.

import { useCallback, useEffect, useRef, useState } from "react";

import SunmiModalLayout, { NIVEL_MODAL_GLOBAL } from "@/components/sunmi/SunmiModalLayout";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import { crearLector, leerCuadro } from "@/lib/sunmi/lectorCodigoBarra";

/** Los formatos que se piden. Los de góndola argentina más los de etiqueta propia. */
export const FORMATOS_CODIGO = Object.freeze([
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "itf",
]);

/** Por qué no se pudo escanear. El consumidor decide qué decirle al operador. */
export const MOTIVO_SIN_CAMARA = Object.freeze({
  NO_SOPORTADO: "noSoportado",
  SIN_PERMISO: "sinPermiso",
  // El equipo no tiene cámara. Antes caía en FALLO y decía "no respondió",
  // que hace pensar en reintentar algo que no va a aparecer.
  NO_HAY_CAMARA: "noHayCamara",
  FALLO: "fallo",
});

export const MENSAJES_SIN_CAMARA = Object.freeze({
  [MOTIVO_SIN_CAMARA.NO_SOPORTADO]:
    "Este navegador no puede leer códigos con la cámara. Escribí el código o usá el lector.",
  [MOTIVO_SIN_CAMARA.SIN_PERMISO]:
    "No se pudo usar la cámara: falta el permiso. Escribí el código o usá el lector.",
  [MOTIVO_SIN_CAMARA.NO_HAY_CAMARA]:
    "Este equipo no tiene cámara. Escribí el código o usá el lector.",
  [MOTIVO_SIN_CAMARA.FALLO]:
    "La cámara no respondió. Escribí el código o usá el lector.",
});

/** Cuánto vibra el teléfono al leer, con `vibrar`. Un toque, no una alarma. */
export const VIBRACION_LECTURA_MS = 80;

/** La resolución que se le pide a la cámara: con menos, un EAN chico no se lee. */
export const RESOLUCION_CAMARA = Object.freeze({ ancho: 1280, alto: 720 });

/** Cada cuánto se lee un cuadro. Leer los 60 por segundo solo calienta el teléfono. */
export const INTERVALO_LECTURA_MS = 150;

/**
 * ¿Se puede leer con la cámara? Se pregunta antes de ofrecer el botón. El
 * lector lo trae el sitio, así que alcanza con que haya cámara.
 */
export function hayEscanerDisponible() {
  if (typeof window === "undefined") return false;
  return Boolean(navigator?.mediaDevices?.getUserMedia);
}

/** Enfoque continuo, si la cámara lo ofrece. Si no, queda como venía. */
async function enfocarContinuo(stream) {
  const pista = stream.getVideoTracks?.()[0];
  const modos = pista?.getCapabilities?.().focusMode;
  if (!Array.isArray(modos) || !modos.includes("continuous")) return;
  try {
    await pista.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
  } catch {}
}

export default function SunmiEscanerCodigoBarra({
  abierto,
  onCerrar,
  /** Recibe SOLO el string leído. */
  onCodigo,
  /** Se avisa cuando no se puede escanear, con un motivo de `MOTIVO_SIN_CAMARA`. */
  onSinCamara = null,
  titulo = "Escanear código",
  // Neutral a propósito: esta pieza no sabe qué se está escaneando. La pantalla
  // que la usa pasa el texto que corresponda —"el producto que llegó", "la
  // etiqueta del pallet"—. Un default que hable de productos le metería una
  // suposición de dominio al kit.
  ayuda = "Apuntá al código de barras.",
  /** Los formatos a leer; sin declarar, todos los de `FORMATOS_CODIGO`. */
  formatos = FORMATOS_CODIGO,
  /** Vibra un toque al leer, donde el teléfono sabe vibrar. */
  vibrar = false,
  /**
   * La cámara a toda la pantalla, con un recuadro guía en el centro y "Cerrar"
   * fijo abajo. Sin declarar, la hoja de siempre.
   */
  pantallaCompleta = false,
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const vivoRef = useRef(false);
  const [error, setError] = useState("");

  /** Apaga la cámara. Idempotente: se la llama desde el cierre y el desmontaje. */
  const apagar = useCallback(() => {
    vivoRef.current = false;
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      for (const pista of stream.getTracks()) {
        try { pista.stop(); } catch {}
      }
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const fallar = useCallback(
    (motivo) => {
      apagar();
      setError(MENSAJES_SIN_CAMARA[motivo] || MENSAJES_SIN_CAMARA[MOTIVO_SIN_CAMARA.FALLO]);
      onSinCamara?.(motivo);
    },
    [apagar, onSinCamara]
  );

  useEffect(() => {
    if (!abierto) {
      apagar();
      setError("");
      return undefined;
    }

    if (!hayEscanerDisponible()) {
      fallar(MOTIVO_SIN_CAMARA.NO_SOPORTADO);
      return undefined;
    }

    let detenido = false;
    vivoRef.current = true;

    (async () => {
      let lector;
      try {
        lector = await crearLector(formatos);
      } catch {
        if (!detenido) fallar(MOTIVO_SIN_CAMARA.NO_SOPORTADO);
        return;
      }

      let stream;
      try {
        // La cámara TRASERA: quien escanea apunta al producto, no a su cara.
        // `ideal` y no `min`: una cámara que no llega a 1280×720 igual abre.
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: RESOLUCION_CAMARA.ancho },
            height: { ideal: RESOLUCION_CAMARA.alto },
          },
          audio: false,
        });
      } catch (e) {
        if (detenido) return;
        const negado = e?.name === "NotAllowedError" || e?.name === "SecurityError";
        const noHay = e?.name === "NotFoundError";
        fallar(
          negado
            ? MOTIVO_SIN_CAMARA.SIN_PERMISO
            : noHay
              ? MOTIVO_SIN_CAMARA.NO_HAY_CAMARA
              : MOTIVO_SIN_CAMARA.FALLO
        );
        return;
      }

      // Si el modal se cerró mientras se pedía el permiso, el stream ya no le
      // sirve a nadie: se apaga en vez de quedar prendido.
      if (detenido || !vivoRef.current) {
        for (const pista of stream.getTracks()) {
          try { pista.stop(); } catch {}
        }
        return;
      }

      streamRef.current = stream;
      await enfocarContinuo(stream);
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        try { await video.play(); } catch {}
      }

      // El cuadro se copia a un canvas del tamaño real del video.
      const lienzo = document.createElement("canvas");
      const contexto = lienzo.getContext("2d", { willReadFrequently: true });
      let ultima = 0;

      // El bucle de lectura. `requestAnimationFrame` y no un `setInterval`: se
      // detiene solo cuando la pestaña pasa a segundo plano, que es exactamente
      // lo que se quiere con la cámara abierta. Se lee uno cada
      // `INTERVALO_LECTURA_MS`, y nunca dos a la vez.
      const mirar = async (ahora) => {
        if (detenido || !vivoRef.current) return;
        const v = videoRef.current;
        // Recién cuando el video se está reproduciendo y ya sabe su tamaño.
        const listo = v && v.readyState >= v.HAVE_CURRENT_DATA && v.videoWidth > 0;
        if (listo && ahora - ultima >= INTERVALO_LECTURA_MS) {
          ultima = ahora;
          let valor = null;
          try {
            if (lienzo.width !== v.videoWidth) lienzo.width = v.videoWidth;
            if (lienzo.height !== v.videoHeight) lienzo.height = v.videoHeight;
            contexto.drawImage(v, 0, 0, lienzo.width, lienzo.height);
            valor = await leerCuadro(lector, contexto.getImageData(0, 0, lienzo.width, lienzo.height));
          } catch {
            // Un cuadro que no se pudo copiar no corta el bucle: va el siguiente.
          }
          if (valor && !detenido && vivoRef.current) {
            if (vibrar) {
              try { navigator.vibrate?.(VIBRACION_LECTURA_MS); } catch {}
            }
            // Se apaga ANTES de avisar: el consumidor va a cerrar el modal y
            // navegar, y no puede quedar una cámara viva detrás.
            apagar();
            onCodigo?.(valor);
            return;
          }
        }
        if (!detenido && vivoRef.current) requestAnimationFrame(mirar);
      };
      requestAnimationFrame(mirar);
    })();

    return () => {
      detenido = true;
      apagar();
    };
  }, [abierto, apagar, fallar, onCodigo, formatos, vibrar]);

  // Y por si el componente se desmonta sin pasar por `abierto = false`.
  useEffect(() => apagar, [apagar]);

  if (pantallaCompleta) {
    // El cajón a todo el ancho es la pantalla completa: la forma ya trae el alto
    // entero, las esquinas rectas y la columna con el pie fijo abajo. Sin
    // encabezado: lo que se ve es la cámara, y la salida es "Cerrar".
    return (
      <SunmiModalLayout
        open={abierto}
        title={titulo}
        onClose={onCerrar}
        z={NIVEL_MODAL_GLOBAL}
        forma="cajon"
        className="max-w-none"
        encabezado="ninguno"
        paddingTarjeta="p-3"
        espacioCuerpo="gap-3"
        footer={
          <SunmiButton color="slate" onClick={onCerrar} className="w-full min-h-toque">
            Cerrar
          </SunmiButton>
        }
      >
        {error ? (
          <SunmiAviso tono="warning">{error}</SunmiAviso>
        ) : (
          <>
            <p className="shrink-0 text-sm3 sunmi-text-muted text-center">{ayuda}</p>
            <div className="relative flex-1 sunmi-surface-soft rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover"
                playsInline
                muted
                autoPlay
                aria-label={ayuda}
              />
              {/* El recuadro guía: dónde apuntar. Proporción de código de barras
                  —más ancho que alto— sacada de la escala, no medida a ojo. */}
              <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-3/4 aspect-video rounded-lg border-2 sunmi-border-accent" />
              </div>
            </div>
          </>
        )}
      </SunmiModalLayout>
    );
  }

  return (
    <SunmiModalLayout
      open={abierto}
      title={titulo}
      subtitle={ayuda}
      onClose={onCerrar}
      // El escáner es kit: no puede conocer el número del apilado. Declara la
      // INTENCIÓN —va arriba de todo— y cuánto mide eso lo sabe el dueño de la
      // capa.
      z={NIVEL_MODAL_GLOBAL}
      forma="hoja-o-centrado"
      // Sin `maxWidth`: el default del kit alcanza. Declaraba `sm:max-w-lg`, que
      // es una medida responsive elegida acá para una pieza genérica — el visor
      // toma el ancho que le den y no necesita uno propio. Cambia 64 px en
      // pantallas de 640 para arriba (32rem → 36rem) y nada por debajo, donde el
      // `w-full` ya mandaba.
      espacioCuerpo="px-4 space-y-3"
      footer={
        <SunmiButton color="slate" onClick={onCerrar} className="w-full">
          Cancelar
        </SunmiButton>
      }
    >
      {error ? (
        <SunmiAviso tono="warning">{error}</SunmiAviso>
      ) : (
        <div className="sunmi-surface-soft sunmi-border rounded-lg overflow-hidden">
          {/* `aspect-video` es de la escala de Tailwind, no una medida elegida a
              ojo: el visor toma el ancho disponible y su alto sale de la
              relación. Así entra igual en 360 y en escritorio sin un `h-[…]`. */}
          <video
            ref={videoRef}
            className="w-full aspect-video object-cover"
            playsInline
            muted
            autoPlay
            aria-label={ayuda}
          />
        </div>
      )}
    </SunmiModalLayout>
  );
}
