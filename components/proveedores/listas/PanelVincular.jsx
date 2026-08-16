"use client";

// PANEL DE VINCULACIÓN, inline dentro de la conciliación.
//
// No es un modal: se despliega debajo de la fila, en la misma página, y se
// cierra sin perder el filtro ni la página en la que estaba el usuario. Un modal
// grande acá taparía justamente la fila que hay que mirar para decidir.
//
// ── LO QUE SE MUESTRA ANTES DE CONFIRMAR ────────────────────────────────────
//
// El código y la descripción que manda el proveedor, el producto elegido con su
// presentación y su factor, el código de barras que coincidió si lo hubo, y la
// advertencia de que esto crea un vínculo PERMANENTE. Sin esos datos a la vista
// la decisión se toma a ciegas, y el error recién se nota tres listas después.

import { useCallback, useEffect, useRef, useState } from "react";
import { Link2, Search, X } from "lucide-react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import { money } from "@/lib/proveedores/listas/presentacion";
import { MIN_BUSQUEDA, ORIGEN_VINCULO } from "@/lib/proveedores/listas/vinculacion";

export default function PanelVincular({ importacionId, fila, onVinculada, onCerrar }) {
  const [q, setQ] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [candidatos, setCandidatos] = useState([]);
  const [mensajeBusqueda, setMensajeBusqueda] = useState("");
  const [elegido, setElegido] = useState(null);
  const [origen, setOrigen] = useState(ORIGEN_VINCULO.BUSQUEDA_MANUAL);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState(null);

  const inputRef = useRef(null);
  useEffect(() => {
    inputRef.current?.focus?.();
  }, []);

  const buscar = useCallback(async () => {
    const termino = q.trim();
    if (termino.length < MIN_BUSQUEDA) {
      setCandidatos([]);
      setMensajeBusqueda(`Escribí al menos ${MIN_BUSQUEDA} caracteres.`);
      return;
    }
    setBuscando(true);
    setError(null);
    try {
      const url = new URL(
        `/api/proveedores/listas/${importacionId}/productos`,
        window.location.origin
      );
      url.searchParams.set("q", termino);
      const r = await fetch(url.toString(), { credentials: "include", cache: "no-store" });
      const json = await r.json();
      if (!r.ok || !json?.ok) {
        setError({ mensaje: json?.error || "No se pudo buscar." });
        return;
      }
      setCandidatos(json.items ?? []);
      setMensajeBusqueda(
        (json.items ?? []).length === 0
          ? "Ningún producto coincide."
          : json.truncado
            ? `Se muestran los primeros ${json.limite}. Afiná la búsqueda.`
            : ""
      );
    } catch {
      setError({ mensaje: "Error de conexión." });
    } finally {
      setBuscando(false);
    }
  }, [q, importacionId]);

  const elegirSugerido = () => {
    setElegido({
      productoBaseId: fila.sugerenciaProductoBaseId,
      nombre: fila.sugerenciaNombre ?? `Producto #${fila.sugerenciaProductoBaseId}`,
      presentacion: null,
      codigoBarraCoincidente: fila.sugerenciaCodigoBarra ?? null,
    });
    setOrigen(ORIGEN_VINCULO.SUGERENCIA_CODIGO_BARRAS);
    setError(null);
  };

  const elegirDeBusqueda = (c) => {
    setElegido({ ...c, codigoBarraCoincidente: null });
    setOrigen(ORIGEN_VINCULO.BUSQUEDA_MANUAL);
    setError(null);
  };

  const confirmar = async () => {
    if (!elegido || confirmando) return;
    setConfirmando(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/proveedores/listas/${importacionId}/filas/${fila.id}/vincular`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ productoBaseId: elegido.productoBaseId, origen }),
        }
      );
      const json = await r.json();
      if (!r.ok || !json?.ok) {
        setError({
          mensaje: json?.error || "No se pudo vincular.",
          vinculoActual: json?.vinculoActual ?? null,
        });
        return;
      }
      onVinculada?.(json);
    } catch {
      setError({ mensaje: "Error de conexión." });
    } finally {
      setConfirmando(false);
    }
  };

  return (
    <div className="sunmi-surface-soft sunmi-border border rounded-lg p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold sunmi-text-strong inline-flex items-center gap-1">
            <Link2 size={14} aria-hidden="true" />
            Vincular un producto
          </h3>
          <p className="text-[11px] sunmi-text-muted leading-snug">
            El proveedor lo llama{" "}
            <span className="font-semibold sunmi-text-strong break-all">{fila.codigoCrudo}</span> ·{" "}
            {fila.descripcionProveedor}
          </p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar el panel de vinculación"
          className="shrink-0 sunmi-text-muted"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {/* ── La sugerencia, destacada pero sin confirmar ─────────────────── */}
      {fila.sugerenciaProductoBaseId && !elegido && (
        <div className="sunmi-border border rounded-lg p-2.5 space-y-1.5">
          <div className="text-[11px] font-semibold sunmi-text-accent">
            Recomendado por código de barras
          </div>
          <div className="text-[12.5px] sunmi-text-strong">
            {fila.sugerenciaNombre ?? `Producto #${fila.sugerenciaProductoBaseId}`}
          </div>
          {fila.sugerenciaCodigoBarra && (
            <div className="text-[11px] sunmi-text-muted">
              Coincide el código de barras {fila.sugerenciaCodigoBarra}
            </div>
          )}
          {/* El texto NO repite el del botón de la fila. Dos botones con la
              misma etiqueta y distinto efecto —uno abre el panel, el otro elige
              el producto— es una trampa: el usuario cree que ya confirmó. */}
          <SunmiButton color="cyan" onClick={elegirSugerido} className="py-1.5 px-3 text-xs">
            Usar este producto
          </SunmiButton>
        </div>
      )}

      {/* ── Búsqueda manual ─────────────────────────────────────────────── */}
      {!elegido && (
        <div className="space-y-2">
          <label
            htmlFor={`buscar-${fila.id}`}
            className="text-[11px] sunmi-text-muted block"
          >
            Buscar por nombre, código de barras o código de otro proveedor
          </label>
          <div className="flex gap-2">
            <SunmiInput
              id={`buscar-${fila.id}`}
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && buscar()}
              placeholder="Ej: azúcar o 7790580127534"
              autoComplete="off"
              className="flex-1"
            />
            <SunmiButton
              color="cyan"
              onClick={buscar}
              disabled={buscando}
              className="py-2 px-3 text-xs"
            >
              <Search size={14} aria-hidden="true" />
            </SunmiButton>
          </div>
          {mensajeBusqueda && (
            <p className="text-[11px] sunmi-text-muted">{mensajeBusqueda}</p>
          )}

          {candidatos.length > 0 && (
            <ul className="space-y-1 max-h-[280px] overflow-y-auto">
              {candidatos.map((c) => (
                <li key={c.productoBaseId}>
                  <button
                    type="button"
                    onClick={() => elegirDeBusqueda(c)}
                    className="w-full text-left sunmi-border border rounded-md px-2.5 py-2 sunmi-row-hover"
                  >
                    <div className="text-[12.5px] sunmi-text-strong break-words">{c.nombre}</div>
                    <div className="text-[11px] sunmi-text-muted">
                      {c.presentacion}
                      {c.codigoBarra ? ` · ${c.codigoBarra}` : ""}
                      {c.codigosProveedor?.length ? ` · códigos: ${c.codigosProveedor.join(", ")}` : ""}
                    </div>
                    {c.advertencia && (
                      <div className="text-[10.5px] sunmi-text-warning mt-0.5">{c.advertencia}</div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Confirmación ────────────────────────────────────────────────── */}
      {elegido && (
        <div className="space-y-2">
          <div className="sunmi-border border rounded-lg p-2.5 space-y-1">
            <div className="text-[11px] sunmi-text-muted">Se va a vincular con</div>
            <div className="text-[13px] font-semibold sunmi-text-strong break-words">
              {elegido.nombre}
            </div>
            <div className="text-[11px] sunmi-text-muted">
              {elegido.presentacion ?? "—"}
              {elegido.factorPack ? ` · factor ${elegido.factorPack}` : ""}
            </div>
            {elegido.codigoBarraCoincidente && (
              <div className="text-[11px] sunmi-text-muted">
                Código de barras coincidente: {elegido.codigoBarraCoincidente}
              </div>
            )}
            {elegido.advertencia && (
              <div className="text-[11px] sunmi-text-warning">{elegido.advertencia}</div>
            )}
          </div>

          <p className="text-[11px] sunmi-text-warning leading-snug">
            Se va a crear un vínculo permanente: el código{" "}
            <span className="font-semibold">{fila.codigoCrudo}</span> va a machear con este producto
            en todas las listas futuras de este proveedor.
          </p>

          {error && (
            <div className="sunmi-border border rounded-lg p-2.5 space-y-1">
              <p className="text-[12px] sunmi-text-danger leading-snug">{error.mensaje}</p>
              {error.vinculoActual?.producto && (
                <p className="text-[11px] sunmi-text-muted">
                  Hoy apunta a: {error.vinculoActual.producto.nombre} (#
                  {error.vinculoActual.producto.id})
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-2">
            <SunmiButton
              color="slate"
              onClick={() => {
                setElegido(null);
                setError(null);
              }}
              disabled={confirmando}
              className="py-2 text-xs order-2 sm:order-1"
            >
              Elegir otro
            </SunmiButton>
            <SunmiButton
              color="cyan"
              onClick={confirmar}
              disabled={confirmando}
              className="py-2 font-bold text-xs order-1 sm:order-2"
            >
              {confirmando ? "Vinculando…" : "Confirmar vínculo"}
            </SunmiButton>
          </div>
        </div>
      )}

      {error && !elegido && (
        <p className="text-[12px] sunmi-text-danger leading-snug">{error.mensaje}</p>
      )}
    </div>
  );
}
