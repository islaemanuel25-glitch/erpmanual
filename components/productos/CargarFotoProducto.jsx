"use client";

// "CARGAR FOTO": la acción principal de la imagen de un producto.
//
// ── QUÉ REEMPLAZA ─────────────────────────────────────────────────────────
//
// Hasta acá lo único que había era un campo "Imagen URL": había que tener la
// foto en algún lado y pegar el enlace. Desde el celular eso no se puede hacer,
// que es donde se cargan los productos.
//
// El campo de la url NO se saca — sigue sirviendo para una foto que ya está en
// otro lado— pero pasa a ser lo secundario.
//
// ── EL FLUJO APROBADO: AUTOMÁTICO, PERO NO CIEGO ──────────────────────────
//
// Se elige cámara o galería, el sistema achica la foto Y LE QUITA EL FONDO SOLO,
// y muestra el resultado ANTES de subir nada. Recién ahí se elige:
//
//   · Usar sin fondo   — sube el recorte;
//   · Usar original    — sube la foto tal como salió;
//   · Cambiar foto     — vuelve a abrir la cámara.
//
// Se siente automático y sigue habiendo control. La razón de que la revisión
// exista está medida y no es teórica: el recorte falla en productos blancos,
// transparentes, con reflejos y con fondo parecido al producto. Guardando sin
// preguntar, eso se descubre en la tarjeta, después.
//
// ── SI EL RECORTE FALLA, NO PASA NADA ─────────────────────────────────────
//
// Un error del procesador NO puede bloquear la carga de la foto ni la edición
// del producto. Se cae a la original, se dice por qué, y la persona sigue. Eso
// está escrito abajo y tiene su candado.

import { useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import { achicarFoto } from "@/lib/productos/achicarFoto";
import { quitarFondo } from "@/lib/productos/quitarFondo";
import { LADO_MAXIMO } from "@/lib/productos/fotoProducto";

/**
 * El tablero a cuadros de la vista previa.
 *
 * ── POR QUÉ NO ES UN FONDO LISO ───────────────────────────────────────────
 *
 * Sobre blanco, un recorte que dejó medio fondo blanco pegado se ve idéntico a
 * uno perfecto. Sobre el tablero, lo que quedó de fondo tapa los cuadros y se
 * nota de inmediato. Es la tercera protección que pidió Emanuel: que se vea si
 * el recorte salió bien.
 */
const CUADROS =
  "[background-image:linear-gradient(45deg,var(--hover-bg)_25%,transparent_25%),linear-gradient(-45deg,var(--hover-bg)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,var(--hover-bg)_75%),linear-gradient(-45deg,transparent_75%,var(--hover-bg)_75%)] [background-size:12px_12px] [background-position:0_0,0_6px,6px_-6px,-6px_0]";

export default function CargarFotoProducto({ productoBaseId, valor, onCambio, disabled = false }) {
  const entradaRef = useRef(null);
  const [procesando, setProcesando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState(null);

  // La propuesta que espera confirmación: las dos versiones y qué dijo el motor.
  const [propuesta, setPropuesta] = useState(null);

  const sinProducto = !Number(productoBaseId);
  const ocupado = disabled || sinProducto || procesando || subiendo;

  const limpiarPropuesta = () => {
    if (propuesta) {
      // Las URL de objeto se sueltan a mano: sin esto cada foto elegida deja su
      // blob en memoria hasta que se recargue la página.
      URL.revokeObjectURL(propuesta.vistaOriginal);
      if (propuesta.vistaSinFondo) URL.revokeObjectURL(propuesta.vistaSinFondo);
    }
    setPropuesta(null);
  };

  const alElegir = async (e) => {
    const archivo = e.target.files?.[0];
    // Se limpia la entrada SIEMPRE: sin esto, elegir la misma foto dos veces
    // seguidas no dispara el evento y parece que el botón dejó de andar.
    e.target.value = "";
    if (!archivo) return;

    setError(null);
    limpiarPropuesta();
    setProcesando(true);
    try {
      const original = await achicarFoto(archivo);

      // ── EL RECORTE VA ADENTRO DE SU PROPIO `try` ──────────────────────
      //
      // Es lo que hace que un fallo del procesador no se lleve puesta la carga.
      // Si esto tirara para arriba, un navegador viejo o una foto rara dejarían
      // a la persona sin poder ponerle foto al producto — que es cambiar una
      // mejora por una regresión.
      let recorte = null;
      let motivo = null;
      try {
        recorte = await quitarFondo(original);
      } catch (e2) {
        motivo = e2?.message || "no se pudo procesar";
      }

      setPropuesta({
        original,
        vistaOriginal: URL.createObjectURL(original),
        sinFondo: recorte?.archivo ?? null,
        vistaSinFondo: recorte ? URL.createObjectURL(recorte.archivo) : null,
        confia: recorte?.confia ?? false,
        motivoDelFallo: motivo,
      });
    } catch (e2) {
      setError(e2?.message || "No se pudo procesar la foto.");
    } finally {
      setProcesando(false);
    }
  };

  const subir = async (archivo) => {
    setError(null);
    setSubiendo(true);
    try {
      const cuerpo = new FormData();
      cuerpo.set("productoBaseId", String(productoBaseId));
      cuerpo.set("archivo", archivo);

      const res = await fetch("/api/productos/foto/subir", {
        method: "POST",
        body: cuerpo,
        credentials: "include",
      });
      const data = await res.json().catch(() => null);

      // ── EL ERROR SE MUESTRA, NO SE DESCARTA ───────────────────────────
      //
      // Preguntar solo por el caso bueno es lo que hizo que un 500 se viera
      // igual que un botón que no hace nada — el INC-0006. Acá el motivo llega
      // en `error` y se muestra tal cual.
      if (!res.ok || !data?.ok) {
        setError(data?.error || `No se pudo subir la foto (${res.status}).`);
        return;
      }
      onCambio?.(data.url);
      limpiarPropuesta();
    } catch (e2) {
      setError(e2?.message || "No se pudo subir la foto.");
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* ── LA PROPUESTA, ANTES DE SUBIR NADA ──────────────────────────── */}
      {propuesta && (
        <div data-foto-propuesta className="flex flex-col gap-2 rounded-lg p-2 [background:var(--hover-bg)]">
          <div className="flex items-start gap-3">
            {propuesta.sinFondo && (
              <figure className="flex flex-col items-center gap-1">
                <img
                  data-foto-vista-sin-fondo
                  src={propuesta.vistaSinFondo}
                  alt="Vista previa sin fondo"
                  className={`w-[96px] h-[96px] rounded-lg object-contain ${CUADROS}`}
                />
                <figcaption className="text-[10px] sunmi-text-muted">Sin fondo</figcaption>
              </figure>
            )}
            <figure className="flex flex-col items-center gap-1">
              <img
                data-foto-vista-original
                src={propuesta.vistaOriginal}
                alt="Vista previa original"
                className="w-[96px] h-[96px] rounded-lg object-contain [background:var(--card-bg)]"
              />
              <figcaption className="text-[10px] sunmi-text-muted">Original</figcaption>
            </figure>
          </div>

          {/* ── LO QUE EL MOTOR PIENSA DE SU PROPIO TRABAJO ─────────────
              No es decoración: es lo que evita empujar un recorte roto. Cuando
              no confía, la acción principal pasa a ser la original. */}
          {propuesta.motivoDelFallo ? (
            <p data-foto-aviso className="text-xs sunmi-text-muted">
              No se pudo quitar el fondo ({propuesta.motivoDelFallo}). Podés usar la original.
            </p>
          ) : !propuesta.confia ? (
            <p data-foto-aviso className="text-xs sunmi-text-muted">
              El recorte no parece confiable en esta foto. Mirá la vista previa antes de elegir.
            </p>
          ) : (
            <p data-foto-aviso className="text-xs sunmi-text-muted">
              Fondo quitado. Los cuadritos son transparencia: si tapan parte del producto, usá la
              original.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {propuesta.sinFondo && (
              <SunmiButton
                color={propuesta.confia ? "amber" : "slate"}
                onClick={() => subir(propuesta.sinFondo)}
                disabled={ocupado}
              >
                Usar sin fondo
              </SunmiButton>
            )}
            <SunmiButton
              color={propuesta.confia && propuesta.sinFondo ? "slate" : "amber"}
              onClick={() => subir(propuesta.original)}
              disabled={ocupado}
            >
              Usar original
            </SunmiButton>
            <SunmiButton
              color="slate"
              onClick={() => {
                limpiarPropuesta();
                entradaRef.current?.click();
              }}
              disabled={ocupado}
            >
              Cambiar foto
            </SunmiButton>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        {valor && !propuesta ? (
          // La foto que ya tiene el producto. Es la confirmación de que lo que se
          // guardó es lo que se quería guardar.
          <img
            src={valor}
            alt="Foto del producto"
            className={`w-[64px] h-[64px] shrink-0 rounded-lg object-contain ${CUADROS}`}
          />
        ) : null}

        <input
          ref={entradaRef}
          type="file"
          // `image/*` y no una lista de extensiones: el sistema muestra la cámara
          // y la galería, y elige la persona. Sin `capture` fijo a propósito —
          // forzarlo a la cámara impide subir una foto que ya está en el
          // teléfono, que es la mitad de los casos.
          accept="image/*"
          onChange={alElegir}
          className="hidden"
          disabled={ocupado}
        />

        <SunmiButton
          color="amber"
          onClick={() => entradaRef.current?.click()}
          disabled={ocupado}
          className="inline-flex items-center gap-1.5"
        >
          {procesando || subiendo ? (
            <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden="true" />
          ) : (
            <Camera className="w-4 h-4 shrink-0" aria-hidden="true" />
          )}
          {procesando ? "Quitando el fondo…" : subiendo ? "Subiendo…" : valor ? "Cambiar foto" : "Cargar foto"}
        </SunmiButton>

        {valor && !propuesta && !subiendo && (
          <SunmiButton
            color="slate"
            onClick={() => onCambio?.("")}
            disabled={disabled}
            className="inline-flex items-center gap-1.5"
          >
            <X className="w-4 h-4 shrink-0" aria-hidden="true" />
            Quitar
          </SunmiButton>
        )}
      </div>

      {sinProducto && (
        <p className="text-xs sunmi-text-muted">
          Guardá el producto primero: la foto se guarda con su número y todavía no lo tiene.
        </p>
      )}

      {error && (
        <p className="text-xs sunmi-text-danger" role="status">
          {error}
        </p>
      )}

      <p className="text-xs sunmi-text-muted">
        Se achica a {LADO_MAXIMO} px y se intenta quitar el fondo antes de subir.
      </p>
    </div>
  );
}
