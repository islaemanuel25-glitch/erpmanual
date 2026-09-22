"use client";

// MIRAR LA FOTO DEL PAPEL, EN EL TELÉFONO.
//
// ── QUÉ REEMPLAZA ─────────────────────────────────────────────────────────
//
// Un `window.open` a la imagen cruda. El navegador la abría en una pestaña
// nueva, centrada sobre fondo negro y al tamaño que él decidía: el papel de
// Paty se veía DADO VUELTA y apaisado, en una franja en el medio de la
// pantalla. No se podían leer los números, que es lo único para lo que se abre.
//
// Tres cosas lo arreglan y ninguna toca la foto:
//
//   · EL EXIF SE RESPETA. El celular no rota los píxeles: anota aparte cómo hay
//     que girar la imagen. El de esta foto dice 180°. Se pregunta antes de
//     bajarla y se dibuja derecha desde el primer cuadro.
//   · «Girar» gira 90° por toque, para lo que el EXIF no alcanza a arreglar —un
//     papel fotografiado de costado sobre la mesa no tiene marca que lo diga—.
//   · EL ANCHO COMPLETO. La foto entra al ancho de la pantalla y se agranda con
//     dos dedos. Antes entraba "a lo que quepa" y quedaba chica.
//
// ── Y EL GIRO QUEDA GUARDADO ──────────────────────────────────────────────
//
// Una foto mal orientada se mira muchas veces —al probar la explicación, al
// corregir un renglón, al controlar contra el papel— y girarla en cada vuelta
// es repetir un trabajo ya hecho. Se guarda en la foto, no en la pantalla.

import { useEffect, useState } from "react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";

export const TEXTO_GIRAR = "Girar";
export const TEXTO_AYUDA = "Con dos dedos se agranda.";

/**
 * @param comprobanteId  de qué papel
 * @param orden          cuál hoja, si hay varias
 * @param abierto
 * @param onCerrar
 */
export default function VisorDeFoto({ comprobanteId, orden = 1, abierto = false, onCerrar }) {
  const [giro, setGiro] = useState(0);
  const [giroElegido, setGiroElegido] = useState(0);
  const [cargandoGiro, setCargandoGiro] = useState(true);

  // ── EL GIRO SE PREGUNTA ANTES DE BAJAR LA FOTO ────────────────────────
  //
  // Son cinco megas: dibujarla mal y corregirla después se ve como un salto.
  // `?meta=1` contesta en lo que tarda leer los primeros 64 KB del archivo.
  useEffect(() => {
    if (!abierto || !comprobanteId) return;
    let vigente = true;
    setCargandoGiro(true);
    (async () => {
      try {
        const r = await fetch(
          `/api/compras-proveedor/comprobantes/foto/${comprobanteId}?orden=${orden}&meta=1`,
          { credentials: "include", cache: "no-store" }
        );
        const d = await r.json();
        if (!vigente) return;
        if (d?.ok) {
          setGiro(Number(d.giro) || 0);
          setGiroElegido(Number(d.giroElegido) || 0);
        }
      } catch {
        // Sin la marca se muestra como está: es lo que pasaba antes y no
        // impide mirar la foto.
      } finally {
        if (vigente) setCargandoGiro(false);
      }
    })();
    return () => {
      vigente = false;
    };
  }, [abierto, comprobanteId, orden]);

  if (!abierto) return null;

  const girar = async () => {
    const nuevoTotal = (giro + 90) % 360;
    const nuevoElegido = (giroElegido + 90) % 360;
    setGiro(nuevoTotal);
    setGiroElegido(nuevoElegido);
    // Se guarda sin esperar y sin avisar si falla: el giro ya se aplicó en
    // pantalla, que es lo que la persona pidió. Que no se haya podido recordar
    // para la próxima vez no es algo que valga interrumpir una revisión.
    try {
      await fetch(`/api/compras-proveedor/comprobantes/foto/${comprobanteId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orden, giro: nuevoElegido }),
      });
    } catch {}
  };

  // Girada 90° o 270°, la foto ocupa el alto donde antes ocupaba el ancho. Sin
  // esto, una foto apaisada girada se sale de la pantalla por los costados.
  const decostado = giro === 90 || giro === 270;

  return (
    <SunmiModalLayout
      open
      title="El papel"
      onClose={onCerrar}
      forma="hoja-o-centrado"
      maxWidth="max-w-3xl"
      z={9999}
      // El kit dejó de tener un default para esto, así que cada modal declara
      // el suyo. Acá el cuerpo es una sola foto: sin separación arriba, que
      // desperdiciaría alto en una pantalla de teléfono.
      espacioCuerpo="mt-2"
      footer={
        <div className="flex items-center justify-between gap-renglon">
          <SunmiButton color="slate" type="button" onClick={girar} className="min-h-toque text-sm3">
            {TEXTO_GIRAR}
          </SunmiButton>
          <span className="text-sm2 sunmi-text-muted">{TEXTO_AYUDA}</span>
        </div>
      }
    >
      {/* ── EL ANCHO COMPLETO, Y DOS DEDOS PARA AGRANDAR ──────────────────
          `touch-action: pinch-zoom` deja el gesto de dos dedos al navegador, que
          lo hace mejor que cualquier cosa escrita acá: sin saltos y sin perder
          nitidez. El scroll queda para moverse por la foto ya agrandada. */}
      <div className="w-full overflow-auto" style={{ touchAction: "pinch-zoom" }}>
        {cargandoGiro ? (
          <p className="text-sm3 sunmi-text-muted py-4 text-center">Abriendo la foto…</p>
        ) : (
          <img
            src={`/api/compras-proveedor/comprobantes/foto/${comprobanteId}?orden=${orden}`}
            alt="La foto del comprobante"
            className={`block ${decostado ? "h-auto max-w-none" : "w-full h-auto"}`}
            style={{
              transform: `rotate(${giro}deg)`,
              // El giro pivotea en el centro, que es donde la foto se queda
              // quieta al girar. Con el origen arriba a la izquierda —el de
              // fábrica— una foto girada 90° se va de la pantalla.
              transformOrigin: "center center",
              ...(decostado ? { width: "100vh", marginInline: "auto" } : {}),
            }}
          />
        )}
      </div>
    </SunmiModalLayout>
  );
}
