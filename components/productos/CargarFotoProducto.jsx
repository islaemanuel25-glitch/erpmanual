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
// ── LO QUE PASA AL TOCAR ──────────────────────────────────────────────────
//
// Se abre la cámara o la galería —lo decide el sistema—, la foto se achica en el
// navegador a 1200 px de lado y se sube. La ruta devuelve la url y esta pieza la
// avisa hacia arriba; QUIEN LA GUARDA es el formulario, al guardar el producto.
// Así una foto subida y no confirmada no deja el producto apuntando a algo que
// nadie aprobó.

import { useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import { achicarFoto } from "@/lib/productos/achicarFoto";
import { LADO_MAXIMO } from "@/lib/productos/fotoProducto";

export default function CargarFotoProducto({ productoBaseId, valor, onCambio, disabled = false }) {
  const entradaRef = useRef(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState(null);

  // ── SIN PRODUCTO TODAVÍA NO SE PUEDE SUBIR ──────────────────────────────
  //
  // El archivo se nombra con el id, así que un producto que aún no existe no
  // tiene dónde guardarla. Se dice con esas palabras en vez de dejar un botón
  // que falla al tocarlo.
  const sinProducto = !Number(productoBaseId);

  const alElegir = async (e) => {
    const archivo = e.target.files?.[0];
    // Se limpia la entrada SIEMPRE: sin esto, elegir la misma foto dos veces
    // seguidas no dispara el evento y parece que el botón dejó de andar.
    e.target.value = "";
    if (!archivo) return;

    setError(null);
    setSubiendo(true);
    try {
      const achicada = await achicarFoto(archivo);
      const cuerpo = new FormData();
      cuerpo.set("productoBaseId", String(productoBaseId));
      cuerpo.set("archivo", achicada);

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
      // en `error` y se muestra tal cual: quien está con el teléfono necesita
      // saber si reintentar o avisar.
      if (!res.ok || !data?.ok) {
        setError(data?.error || `No se pudo subir la foto (${res.status}).`);
        return;
      }
      onCambio?.(data.url);
    } catch (e) {
      setError(e?.message || "No se pudo procesar la foto.");
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {valor ? (
          // La foto que hay, chica. Es la confirmación de que lo que se subió es
          // lo que se quería subir — sin esto, la única señal es que un campo de
          // texto cambió.
          <img
            src={valor}
            alt="Foto del producto"
            className="w-[64px] h-[64px] shrink-0 rounded-lg object-contain [background:var(--hover-bg)]"
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
          disabled={disabled || sinProducto || subiendo}
        />

        <SunmiButton
          color="amber"
          onClick={() => entradaRef.current?.click()}
          disabled={disabled || sinProducto || subiendo}
          className="inline-flex items-center gap-1.5"
        >
          {subiendo ? (
            <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden="true" />
          ) : (
            <Camera className="w-4 h-4 shrink-0" aria-hidden="true" />
          )}
          {subiendo ? "Subiendo…" : valor ? "Cambiar foto" : "Cargar foto"}
        </SunmiButton>

        {valor && !subiendo && (
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
        <p className="text-xs pos-text-danger" role="status">
          {error}
        </p>
      )}

      <p className="text-xs sunmi-text-muted">
        Se achica a {LADO_MAXIMO} px antes de subir, así no gasta datos del celular.
      </p>
    </div>
  );
}
