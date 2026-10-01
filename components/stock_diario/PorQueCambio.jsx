"use client";

// components/stock_diario/PorQueCambio.jsx
//
// ¿POR QUÉ CAMBIÓ? (Figma EVJ2KvVCrY0oVSowfboymQ, 329-624). Una fila por causa
// del cambio del capital —las categorías del movimiento físico por su origen
// real, la revalorización y la reexpresión—, de mayor a menor, que juntas suman
// final − inicial. Cada una con su barra divergente desde el cero: a la derecha
// lo que sumó, a la izquierda lo que restó. Sin rojo ni verde: vender no es malo.
//
// ── INFORMA; EL DETALLE ES DEL MÓDULO ────────────────────────────────────
//
// Ninguna fila abre productos ni movimientos. Una causa con módulo dueño lleva
// el enlace a él —si el usuario puede abrirlo—. Transferencias se abre y muestra
// las transferencias que formaron su importe, cada una con su enlace.

import { useEffect, useState } from "react";

import SunmiAviso from "@/components/sunmi/SunmiAviso";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import DiaConBanda from "@/components/periodo/DiaConBanda";
import { usePermisos } from "@/hooks/usePermisos";
import {
  ALTO_DE_BARRA_PX,
  BARRA_MINIMA_PX,
  TEXTO_CUANDO_CUENTA,
  TEXTO_IMPACTO_TRANSFERENCIA,
  causasDelCambio,
  consultaDeTransferencias,
  enlaceDeCategoria,
  enlaceDeTransferencia,
  renglonDeTransferencia,
} from "@/lib/stock/libro/stockDiarioPantalla";

import EnlaceAlModulo from "./EnlaceAlModulo";

export default function PorQueCambio({ respuesta, ctx }) {
  const [abierta, setAbierta] = useState(false);
  const { perfil } = usePermisos();
  const c = causasDelCambio(respuesta);
  if (!c) return null;
  return (
    <DiaConBanda titulo="¿Por qué cambió?" dato="a costo" importe={c.total}>
      {c.filas.length === 0 && <div className="text-center py-6 sunmi-text-muted text-xs">El capital no cambió en el período.</div>}
      {c.filas.map((f) => {
        const enlace = f.abreTransferencias ? null : enlaceDeCategoria(f.clave, respuesta, perfil);
        const accion = f.abreTransferencias ? (
          <SunmiButton color="ghost" className="shrink-0 min-h-0 p-0 text-sm2 font-medium sunmi-text-accent" onClick={() => setAbierta((x) => !x)} aria-expanded={abierta}>
            {abierta ? "Ocultar" : "Ver"}
          </SunmiButton>
        ) : (
          enlace && <EnlaceAlModulo {...enlace} />
        );
        return (
          <div key={f.clave}>
            <div className="px-4 py-2.5 border-t sunmi-divider" data-causa={f.clave}>
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0 text-sm3 font-medium sunmi-text-strong">{f.rotulo}</div>
                <div className="shrink-0 text-sm3 font-semibold sunmi-text-strong tabular-nums">{f.texto}</div>
              </div>
              <div className="my-1.5 flex items-center gap-3">
                <BarraDivergente barra={f.barra} />
                {/* El lugar de la acción mide lo mismo en TODAS las filas, haya
                    acción o no: si no, la pista de una fila con enlace es más
                    corta y sus barras no se comparan con las de las demás. */}
                <div className="w-16 shrink-0 flex justify-end">{accion}</div>
              </div>
              <div className="text-sm2 sunmi-text-muted">{f.detalle}</div>
            </div>
            {f.abreTransferencias && abierta && <TransferenciasDeLaCategoria ctx={ctx} respuesta={respuesta} perfil={perfil} />}
          </div>
        );
      })}
      <div className="px-4 py-2.5 border-t sunmi-divider text-xs2 sunmi-text-muted">{TEXTO_CUANDO_CUENTA}</div>
    </DiaConBanda>
  );
}

/**
 * LA BARRA DIVERGENTE: una pista en dos mitades con la raya del cero en el
 * medio; la barra sale del cero hacia el lado de su signo, con el largo que
 * calculó `barraDeCausa` —en % del ancho, así no hay que medir—. El mínimo de
 * 2 px es un segundo rectángulo pegado al cero: la unión de los dos mide lo que
 * sea más largo. SVG con atributos y colores del tema: la pantalla no escribe
 * estilos en línea.
 */
function BarraDivergente({ barra }) {
  const mitad = (barra.fraccion * 50).toFixed(3);
  const izquierda = barra.lado === "izquierda";
  return (
    <svg className="min-w-0 flex-1 block" height={ALTO_DE_BARRA_PX} aria-hidden="true" data-barra={barra.lado ?? "cero"}>
      <rect x="0" y="0" width="100%" height="100%" fill="var(--pos-control-bg)" />
      {barra.lado && (
        <g className={izquierda ? "sunmi-text-muted" : "sunmi-text-accent"} fill="currentColor">
          <rect x={izquierda ? `${(50 - Number(mitad)).toFixed(3)}%` : "50%"} y="0" width={`${mitad}%`} height="100%" />
          <rect x="50%" y="0" width={BARRA_MINIMA_PX} height="100%" transform={izquierda ? `translate(-${BARRA_MINIMA_PX} 0)` : undefined} />
        </g>
      )}
      <g className="sunmi-text-muted" fill="currentColor">
        <rect x="50%" y="0" width="1" height="100%" transform="translate(-0.5 0)" />
      </g>
    </svg>
  );
}

/** Las transferencias que formaron la categoría: una fila cada una, con su impacto a costo. */
function TransferenciasDeLaCategoria({ ctx, respuesta, perfil }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const consulta = consultaDeTransferencias(ctx);

  useEffect(() => {
    if (!consulta) return undefined;
    let vigente = true;
    setDatos(null);
    setError("");
    fetch(`/api/stock_locales/diario/transferencias?${consulta}`, { cache: "no-store", credentials: "include" })
      .then(async (res) => {
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.ok) throw new Error(j?.error || "No se pudieron leer las transferencias.");
        return j;
      })
      .then((j) => vigente && setDatos(j))
      .catch((e) => vigente && setError(e.message));
    return () => {
      vigente = false;
    };
  }, [consulta]);

  if (error) {
    return (
      <div className="px-4 pb-3.5">
        <SunmiAviso tono="danger" titulo="No se pudo cargar">
          {error}
        </SunmiAviso>
      </div>
    );
  }
  if (!datos) {
    return (
      <div className="py-4">
        <SunmiLoader />
      </div>
    );
  }
  return (
    <div className="sunmi-bg border-t sunmi-divider" data-transferencias-del-valor>
      <div className="px-4 py-2 text-xs2 sunmi-text-muted">{TEXTO_IMPACTO_TRANSFERENCIA}</div>
      {datos.transferencias.map((t) => {
        const r = renglonDeTransferencia(t, respuesta);
        const enlace = enlaceDeTransferencia(t, perfil);
        return (
          <div key={t.id ?? "sin-documento"} className="px-4 py-2.5 flex items-start justify-between gap-3 border-t sunmi-divider">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm3 font-semibold sunmi-text-strong">{r.titulo}</span>
                {r.contraparte && <span className="text-sm2 sunmi-text-muted">{r.contraparte}</span>}
              </div>
              <div className="text-sm2 sunmi-text-muted">{r.linea}</div>
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1">
              <div className="text-sm3 font-semibold sunmi-text-strong tabular-nums">{r.importe}</div>
              {enlace && <EnlaceAlModulo {...enlace} />}
            </div>
          </div>
        );
      })}
      {datos.cuadra === false && <div className="px-4 py-3 border-t sunmi-divider text-sm2 font-medium sunmi-text-warning">Las transferencias no suman el total de la categoría: avisar</div>}
    </div>
  );
}
