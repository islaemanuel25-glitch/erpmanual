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
// ── POR QUÉ `BarcodeDetector` Y NO UNA DEPENDENCIA ────────────────────────
//
// `BarcodeDetector` es del navegador: cero bytes que bajar, cero árbol de
// dependencias, y en los Sunmi —Android con WebView moderno— está. Meter una
// librería de decodificación para esto sería agregar cientos de kilobytes al
// bundle de una aplicación que se usa en un teléfono de tienda, para resolver
// algo que la plataforma ya resuelve.
//
// Donde no está, la recepción NO se rompe: ver el fallback abajo.
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

import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiAviso from "@/components/sunmi/SunmiAviso";

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
  FALLO: "fallo",
});

export const MENSAJES_SIN_CAMARA = Object.freeze({
  [MOTIVO_SIN_CAMARA.NO_SOPORTADO]:
    "Este navegador no puede leer códigos con la cámara. Escribí el código o usá el lector.",
  [MOTIVO_SIN_CAMARA.SIN_PERMISO]:
    "No se pudo usar la cámara: falta el permiso. Escribí el código o usá el lector.",
  [MOTIVO_SIN_CAMARA.FALLO]:
    "La cámara no respondió. Escribí el código o usá el lector.",
});

/** ¿Este navegador puede leer códigos con la cámara? Se pregunta antes de ofrecerlo. */
export function hayEscanerDisponible() {
  if (typeof window === "undefined") return false;
  if (typeof window.BarcodeDetector !== "function") return false;
  return Boolean(navigator?.mediaDevices?.getUserMedia);
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
      let detector;
      try {
        // `getSupportedFormats` evita pedirle al detector un formato que este
        // navegador no tiene: con uno solo desconocido, el constructor tira.
        const soportados = await window.BarcodeDetector.getSupportedFormats?.();
        const formats = Array.isArray(soportados)
          ? FORMATOS_CODIGO.filter((f) => soportados.includes(f))
          : FORMATOS_CODIGO;
        detector = new window.BarcodeDetector(formats.length ? { formats } : undefined);
      } catch {
        if (!detenido) fallar(MOTIVO_SIN_CAMARA.NO_SOPORTADO);
        return;
      }

      let stream;
      try {
        // La cámara TRASERA: quien escanea apunta al producto, no a su cara.
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch (e) {
        if (detenido) return;
        const negado = e?.name === "NotAllowedError" || e?.name === "SecurityError";
        fallar(negado ? MOTIVO_SIN_CAMARA.SIN_PERMISO : MOTIVO_SIN_CAMARA.FALLO);
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
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        try { await video.play(); } catch {}
      }

      // El bucle de detección. `requestAnimationFrame` y no un `setInterval`:
      // se detiene solo cuando la pestaña pasa a segundo plano, que es
      // exactamente lo que se quiere con la cámara abierta.
      const mirar = async () => {
        if (detenido || !vivoRef.current) return;
        const v = videoRef.current;
        if (v && v.readyState >= 2) {
          try {
            const encontrados = await detector.detect(v);
            const valor = encontrados?.[0]?.rawValue;
            if (valor) {
              // Se apaga ANTES de avisar: el consumidor va a cerrar el modal y
              // navegar, y no puede quedar una cámara viva detrás.
              apagar();
              onCodigo?.(String(valor));
              return;
            }
          } catch {
            // Un frame que no se pudo decodificar no es un error del escáner:
            // se sigue mirando.
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
  }, [abierto, apagar, fallar, onCodigo]);

  // Y por si el componente se desmonta sin pasar por `abierto = false`.
  useEffect(() => apagar, [apagar]);

  return (
    <SunmiModalLayout
      open={abierto}
      title={titulo}
      subtitle={ayuda}
      onClose={onCerrar}
      z={9999}
      forma="hoja-o-centrado"
      maxWidth="sm:max-w-lg"
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
            aria-label={ayuda}
          />
        </div>
      )}
    </SunmiModalLayout>
  );
}
