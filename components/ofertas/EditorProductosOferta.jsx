"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Trash2, Plus } from "lucide-react";

import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiButtonIcon from "@/components/sunmi/SunmiButtonIcon";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiPill from "@/components/sunmi/SunmiPill";

import { pesos, porcentaje } from "@/lib/ofertas/formato";
import { descuentoPctDesdePrecios, precioDesdeDescuentoPct, margenOferta } from "@/lib/ofertas/precio";

// EL EDITOR DE PRODUCTOS DE UNA OFERTA.
//
// ── LAS DOS FORMAS DE CARGAR, Y UNA SOLA VERDAD ────────────────────────────
//
// Se puede escribir el precio final ($900) o el descuento (10 %). Se escriba
// cual se escriba, lo que se guarda es el PRECIO: el porcentaje se recalcula
// para mostrarlo al lado. Por eso los dos campos usan las mismas funciones que
// el servidor —`precioDesdeDescuentoPct` y `descuentoPctDesdePrecios`— y no una
// cuenta escrita acá: si la pantalla calculara por su lado, mostraría un número
// y se guardaría otro el día que alguna de las dos cambie.
//
// El margen se muestra en vivo contra el costo de HOY porque es la información
// que decide: escribir $900 sobre un costo de $650 es una cosa y sobre uno de
// $880 es otra, y quien carga la oferta tiene que verlo mientras tipea, no
// enterarse después por un aviso.

export default function EditorProductosOferta({ lineas, onChange, deshabilitado = false }) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState(null);

  const buscar = useCallback(async (texto) => {
    if (!texto.trim()) {
      setResultados([]);
      setErrorBusqueda(null);
      return;
    }
    setBuscando(true);
    setErrorBusqueda(null);
    try {
      const res = await fetch(`/api/ofertas/buscar-producto?q=${encodeURIComponent(texto)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setResultados([]);
        setErrorBusqueda(json?.error || `No se pudo buscar (HTTP ${res.status}).`);
        return;
      }
      setResultados(json.items || []);
    } catch (e) {
      setResultados([]);
      setErrorBusqueda(`No se pudo hablar con el servidor: ${e.message}`);
    } finally {
      setBuscando(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => buscar(q), 250);
    return () => clearTimeout(t);
  }, [q, buscar]);

  const yaEsta = (productoLocalId) => lineas.some((l) => l.productoLocalId === productoLocalId);

  const agregar = (p) => {
    if (yaEsta(p.productoLocalId)) return;
    // Arranca con un 10 % sugerido, que es el ejemplo más común, y con el precio
    // ya calculado: nadie tiene que hacer la cuenta para empezar.
    const precioOferta = precioDesdeDescuentoPct(p.precioNormal, 10);
    onChange([
      ...lineas,
      {
        productoLocalId: p.productoLocalId,
        nombre: p.nombre,
        precioNormal: p.precioNormal,
        costo: p.costo,
        precioOferta,
      },
    ]);
    setQ("");
    setResultados([]);
  };

  const quitar = (productoLocalId) => {
    onChange(lineas.filter((l) => l.productoLocalId !== productoLocalId));
  };

  const cambiarPrecio = (productoLocalId, valor) => {
    onChange(
      lineas.map((l) =>
        l.productoLocalId === productoLocalId ? { ...l, precioOferta: valor === "" ? "" : Number(valor) } : l
      )
    );
  };

  const cambiarPct = (productoLocalId, valor) => {
    onChange(
      lineas.map((l) => {
        if (l.productoLocalId !== productoLocalId) return l;
        if (valor === "") return { ...l, precioOferta: "" };
        const precio = precioDesdeDescuentoPct(l.precioNormal, Number(valor));
        return { ...l, precioOferta: precio == null ? "" : precio };
      })
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <SunmiSeparator label="Agregar productos" />

      {!deshabilitado && (
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--pos-link)" }}
            aria-hidden="true"
          />
          <SunmiInput
            placeholder="Buscar producto por nombre o código..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="!pl-9"
          />
        </div>
      )}

      {errorBusqueda && <div className="text-xs sunmi-text-danger">{errorBusqueda}</div>}
      {buscando && <div className="text-xs sunmi-text-muted">Buscando…</div>}

      {resultados.length > 0 && (
        <div className="flex flex-col gap-1 max-h-64 overflow-auto">
          {resultados.map((p) => {
            const puesto = yaEsta(p.productoLocalId);
            return (
              <div key={p.productoLocalId} className="sunmi-panel rounded-md p-2 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm sunmi-text-strong truncate">{p.nombre}</div>
                  <div className="text-sm2 sunmi-text-muted">
                    Precio {pesos(p.precioNormal)} · Costo {pesos(p.costo)} · Margen {pesos(p.margenNormal)}
                  </div>
                </div>
                {!p.ofertable ? (
                  <SunmiPill color="slate">Sin precio</SunmiPill>
                ) : puesto ? (
                  <SunmiPill color="cyan">Ya está</SunmiPill>
                ) : (
                  <SunmiButtonIcon
                    icon={Plus}
                    size={16}
                    onClick={() => agregar(p)}
                    title={`Agregar ${p.nombre} a la oferta`}
                    aria-label={`Agregar ${p.nombre} a la oferta`}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      <SunmiSeparator label={`Productos de la oferta (${lineas.length})`} />

      {lineas.length === 0 && (
        <div className="sunmi-panel rounded-lg p-3 text-sm sunmi-text-muted text-center">
          Todavía no hay productos. Buscá uno arriba y agregalo.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {lineas.map((l) => {
          const pct = descuentoPctDesdePrecios(l.precioNormal, l.precioOferta);
          const margen = margenOferta(l.precioOferta, l.costo);
          const invalida =
            l.precioOferta === "" || !(Number(l.precioOferta) > 0) || Number(l.precioOferta) >= l.precioNormal;

          return (
            <div key={l.productoLocalId} className="sunmi-panel rounded-lg p-2.5 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium sunmi-text-strong truncate">{l.nombre}</div>
                  <div className="text-sm2 sunmi-text-muted">
                    Precio normal {pesos(l.precioNormal)} · Costo {pesos(l.costo)}
                  </div>
                </div>
                {!deshabilitado && (
                  <SunmiButtonIcon
                    icon={Trash2}
                    color="red"
                    size={16}
                    onClick={() => quitar(l.productoLocalId)}
                    title={`Sacar ${l.nombre} de la oferta`}
                    aria-label={`Sacar ${l.nombre} de la oferta`}
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-sm2 sunmi-text-muted">Precio de oferta</span>
                  <SunmiInput
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    disabled={deshabilitado}
                    value={l.precioOferta === "" ? "" : l.precioOferta}
                    onChange={(e) => cambiarPrecio(l.productoLocalId, e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sm2 sunmi-text-muted">Descuento %</span>
                  <SunmiInput
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="100"
                    step="0.01"
                    disabled={deshabilitado}
                    value={pct == null ? "" : pct}
                    onChange={(e) => cambiarPct(l.productoLocalId, e.target.value)}
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-sm2">
                {invalida ? (
                  <span className="sunmi-text-danger">
                    El precio de oferta tiene que ser mayor a 0 y menor al precio normal.
                  </span>
                ) : (
                  <>
                    <span className="sunmi-text-muted">Descuento {porcentaje(pct)}</span>
                    <span className="sunmi-text-muted">·</span>
                    <span className={margen.importe < 0 ? "sunmi-text-danger" : "sunmi-text-muted"}>
                      Margen {pesos(margen.importe)} ({porcentaje(margen.pct)})
                    </span>
                    {margen.importe < 0 && <SunmiPill color="amber">Bajo costo</SunmiPill>}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {lineas.length > 0 && !deshabilitado && (
        <div className="text-sm2 sunmi-text-muted">
          Vender bajo costo no está bloqueado: puede ser una decisión comercial. Se avisa, nada más.
        </div>
      )}
    </div>
  );
}
