"use client";

// components/stock_diario/PorQueCambio.jsx
//
// ¿POR QUÉ CAMBIÓ? El movimiento físico del Valor del Stock partido por el
// origen real de cada movimiento. La suma es el movimiento físico, al centavo;
// lo garantiza la API y lo repite el total de la banda.
//
// ── EXPLICA EL CAPITAL, NO COPIA LOS MÓDULOS ─────────────────────────────
//
// Cada importe es el cambio del valor de la mercadería A COSTO, y lo dice
// arriba de todo. El detalle de cada operación es de su módulo: esta caja no
// lista productos ni movimientos. Una categoría con módulo propio lleva el
// enlace a él —si el usuario puede abrirlo—; Transferencias se abre y muestra
// las transferencias que formaron su importe, cada una con el enlace a su
// detalle real. Los movimientos sin origen se explican y no se abren.

import { useEffect, useState } from "react";
import Link from "next/link";

import SunmiAviso from "@/components/sunmi/SunmiAviso";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import DiaConBanda from "@/components/periodo/DiaConBanda";
import FilaConImporte from "@/components/periodo/FilaConImporte";
import { usePermisos } from "@/hooks/usePermisos";
import {
  TEXTO_A_COSTO,
  TEXTO_CUANDO_CUENTA,
  TEXTO_IMPACTO_TRANSFERENCIA,
  consultaDeTransferencias,
  enlaceDeCategoria,
  enlaceDeTransferencia,
  renglonDeTransferencia,
  textosDePorQueCambio,
} from "@/lib/stock/libro/stockDiarioPantalla";

export default function PorQueCambio({ respuesta, ctx }) {
  const [abierta, setAbierta] = useState(false);
  const { perfil } = usePermisos();
  const t = textosDePorQueCambio(respuesta);
  if (!t) return null;
  return (
    <DiaConBanda titulo="¿Por qué cambió?" dato="movimiento físico" importe={t.total}>
      <div className="px-4 py-3 border-t sunmi-divider text-sm2" data-texto-a-costo>
        <div className="font-medium sunmi-text-strong">{TEXTO_A_COSTO}</div>
        <div className="sunmi-text-muted">{TEXTO_CUANDO_CUENTA}</div>
      </div>
      {t.filas.length === 0 && <div className="text-center py-6 sunmi-text-muted text-xs">Ningún movimiento de mercadería en el período.</div>}
      {t.filas.map((f) => {
        const izquierda = (
          <>
            <div className="text-sm3 font-semibold sunmi-text-strong">{f.rotulo}</div>
            <div className="text-sm2 sunmi-text-muted">{f.detalle}</div>
            {f.explicacion && <div className="text-sm2 sunmi-text-muted">{f.explicacion}</div>}
          </>
        );
        if (f.abreTransferencias) {
          return (
            <div key={f.clave}>
              <FilaConImporte importe={f.importe} onAbrir={() => setAbierta((x) => !x)} etiqueta="Ver las transferencias">
                {izquierda}
              </FilaConImporte>
              {abierta && <TransferenciasDeLaCategoria ctx={ctx} respuesta={respuesta} perfil={perfil} />}
            </div>
          );
        }
        const enlace = enlaceDeCategoria(f.clave, respuesta, perfil);
        return (
          <FilaConImporte
            key={f.clave}
            importe={f.importe}
            accion={enlace && <Enlace {...enlace} />}
          >
            {izquierda}
          </FilaConImporte>
        );
      })}
      {t.aviso && <div className="px-4 py-3 border-t sunmi-divider text-sm2 font-medium sunmi-text-warning">{t.aviso}</div>}
    </DiaConBanda>
  );
}

/**
 * EL ENLACE AL MÓDULO DUEÑO: un `<a>` de verdad —navega, se abre en otra
 * pestaña—, con la misma letra y el mismo color que el "Ver ›" de
 * `FilaConImporte`, que es la otra acción de estas filas.
 */
function Enlace({ href, texto }) {
  return (
    <Link href={href} className="text-sm2 font-medium sunmi-text-accent">
      {texto} ›
    </Link>
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
    <div className="pb-2" data-transferencias-del-valor>
      <div className="px-4 pb-2 text-sm2 sunmi-text-muted">{TEXTO_IMPACTO_TRANSFERENCIA}</div>
      {datos.transferencias.map((t) => {
        const r = renglonDeTransferencia(t, respuesta);
        const enlace = enlaceDeTransferencia(t, perfil);
        return (
          <div key={t.id ?? "sin-documento"} className="px-4 py-2.5 flex items-start justify-between gap-3 border-t sunmi-divider">
            <div className="min-w-0 flex-1">
              <div className="text-sm3 font-semibold sunmi-text-strong">{r.titulo}</div>
              {r.contraparte && <div className="text-sm2 sunmi-text-muted">{r.contraparte}</div>}
              <div className="text-sm2 sunmi-text-muted">{r.linea}</div>
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1">
              <div className="text-sm3 font-semibold sunmi-text-strong tabular-nums">{r.importe}</div>
              {enlace && <Enlace {...enlace} />}
            </div>
          </div>
        );
      })}
      {datos.cuadra === false && <div className="px-4 py-3 border-t sunmi-divider text-sm2 font-medium sunmi-text-warning">Las transferencias no suman el total de la categoría: avisar</div>}
    </div>
  );
}
