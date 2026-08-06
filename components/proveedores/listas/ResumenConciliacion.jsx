"use client";

// EL ENCABEZADO DE LA CONCILIACIÓN.
//
// ── QUÉ PREGUNTA RESPONDE ───────────────────────────────────────────────────
//
// "De los productos de Arcor que tengo en el sistema, ¿cuántos ya corregí y
// cuántos me faltan?"
//
// Esa es la pregunta del negocio, y se responde contra el CATÁLOGO. Por eso el
// bloque principal cuenta productos del ERP y no filas del Excel: de las 917
// filas que trae Arcor, 625 son productos que este negocio no compra. Medir el
// avance contra el archivo diría que falta el 68 % cuando en realidad está casi
// terminado.
//
// El archivo no desaparece: queda abajo, en una línea, porque sirve para
// entender el macheo. Pero no es la medida del trabajo.
//
// ── POR QUÉ SE MUESTRA SI EL RESUMEN CIERRA ─────────────────────────────────
//
// Las tres situaciones son excluyentes y tienen que sumar el universo. Cuando no
// suman, el resumen está mal y se dice, en vez de mostrar tres números lindos
// que no describen nada.

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { TONO_SITUACION } from "@/lib/proveedores/listas/resumenSistema";
import { PRESENTACION_ESTADO_IMPORTACION } from "@/lib/proveedores/listas/presentacion";
import BotonReporte from "@/components/proveedores/listas/BotonReporte";

/**
 * Una métrica del resumen. Es un BOTÓN: el número solo no sirve para trabajar,
 * y entrar a ver qué productos lo componen es la mitad del valor de la pantalla.
 */
/** Cada situación del resumen abre su propia lista de productos. */
const SITUACION_A_DETALLE = {
  ACTUALIZADO: "ACTUALIZADOS",
  PENDIENTE: "PENDIENTES",
  AUSENTE: "AUSENTES",
};

function Metrica({ valor, etiqueta, detalle, tono, grande, activa, onAbrir }) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-expanded={activa}
      className={`min-w-0 text-left rounded p-1 -m-1 ${activa ? "sunmi-surface" : ""}`}
    >
      <div className={`${grande ? "text-[20px]" : "text-[17px]"} font-bold tabular-nums leading-none ${tono}`}>
        {valor}
      </div>
      <div className="text-[10.5px] font-semibold sunmi-text-strong leading-tight mt-0.5">{etiqueta}</div>
      {detalle && (
        <div className="hidden sm:block text-[9.5px] sunmi-text-muted leading-tight">{detalle}</div>
      )}
      <div className="text-[9.5px] sunmi-text-accent leading-tight">
        {activa ? "ocultar" : "ver productos"}
      </div>
    </button>
  );
}

function Dato({ etiqueta, children }) {
  return (
    <span className="text-[10.5px] sunmi-text-muted whitespace-nowrap">
      {etiqueta} <span className="sunmi-text-strong tabular-nums font-medium">{children}</span>
    </span>
  );
}

export default function ResumenConciliacion({ cabecera, sistema, archivo, proveedor, modo, onModo }) {
  const [verArchivo, setVerArchivo] = useState(false);
  // El encabezado no muestra listas: pide un MODO y el área principal cambia.
  // Meter una lista larga acá adentro empujaba la grilla fuera de la pantalla,
  // que es lo que veníamos de arreglar.
  const abierta = modo;
  const alternar = (clave) => onModo?.(modo === clave ? "CONCILIACION" : clave);
  if (!sistema) return null;

  // Los valores por clave, para poder escribir la frase principal sin repetir
  // búsquedas en el array.
  const m = Object.fromEntries(sistema.metricas.map((x) => [x.clave, x.valor]));

  const estado = PRESENTACION_ESTADO_IMPORTACION[cabecera?.estado] ?? null;
  const rango =
    cabecera?.aumentoEsperadoMinPct !== undefined && cabecera?.aumentoEsperadoMinPct !== null
      ? `${cabecera.aumentoEsperadoMinPct} % a ${cabecera.aumentoEsperadoMaxPct} %`
      : null;

  return (
    <div data-rol="resumen-conciliacion" className="sunmi-border border rounded-lg p-2.5 space-y-2">
      {/* ── Identificación, en una línea ──────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[13px] font-bold sunmi-text-strong">
          Importación #{cabecera?.id}
        </span>
        {estado && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${estado.tono}`}>
            {estado.etiqueta}
          </span>
        )}
        <Dato etiqueta="Proveedor">{proveedor?.nombre ?? "—"}</Dato>
        {cabecera?.archivoNombre && (
          <span className="hidden sm:inline">
            <Dato etiqueta="Archivo">{cabecera.archivoNombre}</Dato>
          </span>
        )}
        <Dato etiqueta="Recargo">{Number(cabecera?.recargoPct ?? 0)} %</Dato>
        {rango && <Dato etiqueta="Aumento esperado">{rango}</Dato>}
        <div className="ml-auto">
          <BotonReporte
            importacionId={cabecera?.id}
            cabecera={cabecera}
            sistema={sistema}
            proveedor={proveedor}
            usuario={cabecera?.usuario?.nombre}
          />
        </div>
      </div>

      {/* ── EL SISTEMA: el bloque principal ───────────────────────────────── */}
      <div className="sunmi-surface-soft rounded-lg p-2.5 space-y-1.5">
        <p className="text-[11.5px] sunmi-text-strong leading-snug">
          De los <span className="tabular-nums font-bold">{sistema.universo}</span> productos de{" "}
          {proveedor?.nombre ?? "este proveedor"} que tenés en el sistema,{" "}
          <span className="tabular-nums font-bold sunmi-text-success">{m.ACTUALIZADO}</span> fueron
          actualizados, <span className="tabular-nums font-bold sunmi-text-warning">{m.PENDIENTE}</span>{" "}
          siguen pendientes y <span className="tabular-nums font-bold">{m.AUSENTE}</span> no
          aparecieron en esta lista.
        </p>

        <div className="grid grid-cols-3 gap-1.5">
          {sistema.metricas.map((x) => (
            <Metrica
              key={x.clave}
              valor={x.valor}
              etiqueta={x.etiqueta}
              detalle={x.detalle}
              tono={TONO_SITUACION[x.clave]}
              grande={x.clave === "PENDIENTE"}
              activa={abierta === SITUACION_A_DETALLE[x.clave]}
              onAbrir={() => alternar(SITUACION_A_DETALLE[x.clave])}
            />
          ))}
        </div>

        {/* Barra de avance sobre los que participan, no sobre el universo:
            los ausentes no se resuelven desde esta pantalla. */}
        {sistema.avancePct !== null && (
          <div
            className="h-1 rounded sunmi-surface overflow-hidden"
            role="progressbar"
            aria-valuenow={sistema.avancePct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Avance sobre los productos que vinieron en el archivo"
          >
            <div className="h-full sunmi-badge-success" style={{ width: `${sistema.avancePct}%` }} />
          </div>
        )}

        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {sistema.filasAplicadas !== null && (
            <span className="text-[10.5px] sunmi-text-muted">
              Se aplicaron {sistema.filasAplicadas} filas sobre {m.ACTUALIZADO} productos distintos.
            </span>
          )}
          {sistema.conAlerta !== null && sistema.conAlerta > 0 && (
            <button
              type="button"
              onClick={() => alternar("PENDIENTES")}
              aria-expanded={abierta === "PENDIENTES"}
              className="text-[10.5px] sunmi-text-warning underline-offset-2 hover:underline"
            >
              {sistema.conAlerta} de los pendientes están en alerta: baja el costo, hay más de una
              interpretación o ninguna cierra · ver cuáles
            </button>
          )}
          {sistema.sinCodigo !== null && sistema.sinCodigo > 0 && (
            <button
              type="button"
              onClick={() => alternar("SIN_CODIGO")}
              aria-expanded={abierta === "SIN_CODIGO"}
              className="text-[10.5px] sunmi-text-accent underline-offset-2 hover:underline"
            >
              {sistema.sinCodigo} sin código de {proveedor?.nombre ?? "proveedor"} guardado ·{" "}
              {abierta === "SIN_CODIGO" ? "ocultar" : "ver productos"}
            </button>
          )}
          {!sistema.cierra && (
            <span className="text-[10.5px] sunmi-text-danger">
              El resumen no cierra: faltan {sistema.faltante} productos por clasificar. Avisá, es un
              error de cálculo.
            </span>
          )}
        </div>
      </div>

      {/* ── EL ARCHIVO: secundario, plegado ───────────────────────────────── */}
      {archivo && (
        <div>
          <button
            type="button"
            onClick={() => setVerArchivo((v) => !v)}
            aria-expanded={verArchivo}
            className="text-[10.5px] sunmi-text-muted inline-flex items-center gap-1"
          >
            <ChevronDown size={12} aria-hidden="true" className={verArchivo ? "rotate-180" : ""} />
            Qué trajo el archivo ({archivo.totalFilas} filas)
          </button>
          {verArchivo && (
            <div className="pt-1 flex flex-wrap gap-x-3 gap-y-0.5">
              <Dato etiqueta="Filas del Excel">{archivo.totalFilas}</Dato>
              <Dato etiqueta="Con producto del sistema">{archivo.conProducto}</Dato>
              <Dato etiqueta="Sin vincular">{archivo.sinVincular}</Dato>
              <Dato etiqueta="Ambiguas">{archivo.ambiguas}</Dato>
              <Dato etiqueta="Código duplicado">{archivo.duplicadas}</Dato>
              <span className="text-[10px] sunmi-text-muted leading-tight w-full">
                {archivo.sinVincular} filas del archivo no tienen actualmente un producto vinculado
                en el ERP. Pueden corresponder a productos no cargados, códigos faltantes,
                presentaciones diferentes o productos que el negocio no maneja.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
