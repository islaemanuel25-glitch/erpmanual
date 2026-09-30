"use client";

// components/stock_diario/PorQueCambio.jsx
//
// ¿POR QUÉ CAMBIÓ? El movimiento físico del Valor del Stock partido por el
// origen real de cada movimiento: compras, ventas, transferencias, ajustes,
// altas y bajas, otros y lo que no tiene origen registrado. La suma es el
// movimiento físico, al centavo; lo garantiza la API y lo repite el total de la
// banda.
//
// Es la misma caja que la evolución —`DiaConBanda` con `FilaConImporte`— y cada
// categoría se abre DEBAJO con sus movimientos, pedidos a
// `/api/stock_locales/diario/movimientos?categoria=` de a una página. No
// navega: el período y la ubicación son los de la pantalla.
//
// Habla del capital en mercadería. Una compra recibida lo aumenta aunque no se
// haya pagado: los textos no dicen "gastado" ni "cobrado".

import { useEffect, useState } from "react";

import SunmiAviso from "@/components/sunmi/SunmiAviso";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiPaginador from "@/components/sunmi/SunmiPaginador";
import DiaConBanda from "@/components/periodo/DiaConBanda";
import FilaConImporte from "@/components/periodo/FilaConImporte";
import { consultaDeCategoria, renglonDeMovimiento, textosDePorQueCambio } from "@/lib/stock/libro/stockDiarioPantalla";

export default function PorQueCambio({ respuesta, ctx }) {
  const [abierta, setAbierta] = useState(null);
  const t = textosDePorQueCambio(respuesta);
  if (!t) return null;
  return (
    <DiaConBanda titulo="¿Por qué cambió?" dato="movimiento físico" importe={t.total}>
      {t.filas.length === 0 && <div className="text-center py-6 sunmi-text-muted text-xs">Ningún movimiento de mercadería en el período.</div>}
      {t.filas.map((f) => (
        <div key={f.clave}>
          <FilaConImporte importe={f.importe} onAbrir={() => setAbierta((x) => (x === f.clave ? null : f.clave))} etiqueta={`Ver los movimientos de ${f.rotulo}`}>
            <div className="text-sm3 font-semibold sunmi-text-strong">{f.rotulo}</div>
            <div className="text-sm2 sunmi-text-muted">{f.detalle}</div>
          </FilaConImporte>
          {abierta === f.clave && <DetalleDeCategoria categoria={f.clave} ctx={ctx} respuesta={respuesta} />}
        </div>
      ))}
      {t.aviso && <div className="px-4 py-3 border-t sunmi-divider text-sm2 font-medium sunmi-text-warning">{t.aviso}</div>}
    </DiaConBanda>
  );
}

/** Los movimientos de una categoría, de a una página, con su efecto. */
function DetalleDeCategoria({ categoria, ctx, respuesta }) {
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const consulta = consultaDeCategoria(ctx, categoria, { page: pagina });

  useEffect(() => {
    if (!consulta) return undefined;
    let vigente = true;
    setDatos(null);
    setError("");
    fetch(`/api/stock_locales/diario/movimientos?${consulta}`, { cache: "no-store", credentials: "include" })
      .then(async (res) => {
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.ok) throw new Error(j?.error || "No se pudieron leer los movimientos.");
        return j;
      })
      .then((j) => vigente && setDatos(j.movimientos))
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
    <div className="pb-2" data-detalle-categoria={categoria}>
      {datos.items.map((m) => {
        const r = renglonDeMovimiento(m, respuesta);
        return (
          <div key={m.id} className="px-4 py-2.5 flex items-start justify-between gap-3 border-t sunmi-divider">
            <div className="min-w-0 flex-1">
              <div className="text-sm3 sunmi-text-strong">{r.nombre}</div>
              <div className="text-sm2 sunmi-text-muted">{r.linea}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-sm3 font-semibold sunmi-text-strong tabular-nums">{r.importe}</div>
              <div className="text-sm2 sunmi-text-muted">{r.cantidad}</div>
            </div>
          </div>
        );
      })}
      {datos.totalPages > 1 && (
        <SunmiPaginador
          page={datos.page}
          pageSize={datos.pageSize}
          totalPages={datos.totalPages}
          totalItems={datos.total}
          onPrev={() => setPagina((p) => Math.max(1, p - 1))}
          onNext={() => setPagina((p) => Math.min(datos.totalPages, p + 1))}
          onGoToPage={(p) => setPagina(p)}
        />
      )}
    </div>
  );
}
