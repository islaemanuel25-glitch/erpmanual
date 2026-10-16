"use client";

// components/pos-ventas/CampoFotoOArchivo.jsx
//
// LA FOTO O EL ARCHIVO DE UN PAPEL: el remito de un proveedor, el ticket de un
// gasto. Elige UN archivo y se lo devuelve a quien lo usa; subirlo es de él.
//
//   · Escritorio: se arrastra el archivo al recuadro, o "o elegí uno" abre el
//     selector de archivos (Figma EVJ2KvVCrY0oVSowfboymQ, nodo 398:770).
//   · Teléfono: "Sacar foto" abre la cámara y "Elegir archivo" la galería o
//     los archivos.
//
// Lo usan "Pagar" del POS y Finanzas → Gastos: la misma pieza en los dos, así
// que un papel se adjunta igual desde los dos lados.
//
// `botones` (2026-10-16, "Pagar"): dos botones iguales lado a lado, "Sacar
// foto" y "Elegir archivo", en el teléfono y en escritorio; en escritorio
// "Elegir archivo" también recibe el archivo arrastrado. Sin `botones`, la
// forma de siempre, que es la de Gastos.

import { useRef, useState } from "react";
import { Camera, FileText } from "lucide-react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";

/** Lo que acepta la subida de comprobantes: fotos y PDF. */
export const ACEPTA_FOTO_O_ARCHIVO = "image/*,application/pdf";

export default function CampoFotoOArchivo({ archivo, onCambiar, esEscritorio, deshabilitado = false, botones = false }) {
  const inputCamara = useRef(null);
  const inputArchivo = useRef(null);
  const [encima, setEncima] = useState(false);

  const elegido = (e) => {
    onCambiar(e.target.files?.[0] || null);
    // Elegir el mismo archivo otra vez después de quitarlo tiene que volver a avisar.
    e.target.value = "";
  };

  const entradas = (
    <>
      <SunmiInput
        ref={inputArchivo}
        type="file"
        accept={ACEPTA_FOTO_O_ARCHIVO}
        className="hidden"
        onChange={elegido}
        data-entrada-archivo
      />
      {!esEscritorio || botones ? (
        <SunmiInput
          ref={inputCamara}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={elegido}
          data-entrada-camara
        />
      ) : null}
    </>
  );

  const quitar = archivo ? (
    <SunmiLinkButton type="button" onClick={() => onCambiar(null)} disabled={deshabilitado} className="justify-self-start text-sm3">
      Quitar
    </SunmiLinkButton>
  ) : null;

  if (botones) {
    const claseBoton = "flex-1 min-h-toque justify-center gap-2 rounded-xl border sunmi-border text-sm3 font-semibold";
    // Arrastrar solo tiene sentido con un mouse: en escritorio.
    const soltar = esEscritorio
      ? {
          "data-soltar-archivo": true,
          onDragOver: (e) => {
            e.preventDefault();
            if (!deshabilitado) setEncima(true);
          },
          onDragLeave: () => setEncima(false),
          onDrop: (e) => {
            e.preventDefault();
            setEncima(false);
            if (deshabilitado) return;
            const f = e.dataTransfer?.files?.[0];
            if (f) onCambiar(f);
          },
        }
      : {};
    return (
      <div className="grid gap-1.5">
        <div className="flex gap-2">
          <SunmiButton
            type="button"
            color="ghost"
            disabled={deshabilitado}
            onClick={() => inputCamara.current?.click()}
            className={claseBoton}
          >
            <Camera size={18} aria-hidden="true" />
            Sacar foto
          </SunmiButton>
          <SunmiButton
            type="button"
            color="ghost"
            disabled={deshabilitado}
            onClick={() => inputArchivo.current?.click()}
            className={`${claseBoton} ${encima ? "sunmi-border-accent" : ""}`}
            {...soltar}
          >
            <FileText size={18} aria-hidden="true" />
            Elegir archivo
          </SunmiButton>
        </div>
        {archivo ? (
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 text-sm3 font-medium sunmi-text-strong break-all">{archivo.name}</span>
            {quitar}
          </div>
        ) : null}
        {entradas}
      </div>
    );
  }

  if (esEscritorio) {
    return (
      <div className="grid gap-1.5">
        <div
          data-soltar-archivo
          onDragOver={(e) => {
            e.preventDefault();
            if (!deshabilitado) setEncima(true);
          }}
          onDragLeave={() => setEncima(false)}
          onDrop={(e) => {
            e.preventDefault();
            setEncima(false);
            if (deshabilitado) return;
            const f = e.dataTransfer?.files?.[0];
            if (f) onCambiar(f);
          }}
          className={`flex flex-wrap items-center justify-center gap-4 rounded-xl border border-dashed sunmi-bg py-7 text-base2 ${
            encima ? "sunmi-border-accent" : "sunmi-border"
          }`}
        >
          {archivo ? (
            <span className="font-medium sunmi-text-strong break-all">{archivo.name}</span>
          ) : (
            <span className="font-medium sunmi-text-muted">Arrastrá el archivo acá</span>
          )}
          <SunmiLinkButton
            type="button"
            onClick={() => inputArchivo.current?.click()}
            disabled={deshabilitado}
            className="text-base2 font-semibold no-underline"
          >
            {archivo ? "o elegí otro" : "o elegí uno"}
          </SunmiLinkButton>
        </div>
        {quitar}
        {entradas}
      </div>
    );
  }

  return (
    <div className="grid gap-1.5">
      <SunmiButton
        type="button"
        color="ghost"
        disabled={deshabilitado}
        onClick={() => inputCamara.current?.click()}
        className="w-full min-h-toque justify-center rounded-xl border border-dashed sunmi-border sunmi-bg py-6 text-base2 font-semibold sunmi-text-accent"
      >
        {archivo ? `📷  ${archivo.name}` : "📷  Sacar foto"}
      </SunmiButton>
      <div className="flex items-center justify-between gap-3">
        <SunmiLinkButton type="button" onClick={() => inputArchivo.current?.click()} disabled={deshabilitado} className="text-sm3">
          Elegir archivo
        </SunmiLinkButton>
        {quitar}
      </div>
      {entradas}
    </div>
  );
}
