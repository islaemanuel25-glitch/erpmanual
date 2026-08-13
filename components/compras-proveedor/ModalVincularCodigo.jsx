"use client";

import { useEffect, useState } from "react";
import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";

/**
 * ModalVincularCodigo — vincula "al vuelo" un código interno (que no existe
 * todavía) a un ProductoBase EXISTENTE del grupo, desde Compras a Proveedor.
 *
 * Reutiliza:
 *   GET  /api/compras-proveedor/buscar-base?search=...   (solo lectura, por grupoId)
 *   POST /api/productos/codigos-proveedor/crear          (crea o reactiva el vínculo)
 *
 * No crea ProductoBase ni ProductoLocal.
 *
 * Props:
 *  - open, onClose
 *  - proveedorId, proveedorNombre
 *  - codigoInicial: string (el código que el usuario buscó)
 *  - onVinculado: (codigoInterno) => void   // se llama tras guardar OK
 */
export default function ModalVincularCodigo({
  open,
  onClose,
  proveedorId,
  proveedorNombre,
  codigoInicial = "",
  onVinculado,
}) {
  const [codigo, setCodigo] = useState(codigoInicial);
  const [descripcion, setDescripcion] = useState("");

  const [baseSearch, setBaseSearch] = useState("");
  const [baseResults, setBaseResults] = useState([]);
  const [baseLoading, setBaseLoading] = useState(false);
  const [selectedBase, setSelectedBase] = useState(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Reset al abrir
  useEffect(() => {
    if (!open) return;
    setCodigo(codigoInicial);
    setDescripcion("");
    setBaseSearch("");
    setBaseResults([]);
    setSelectedBase(null);
    setError("");
  }, [open, codigoInicial]);

  // Buscar ProductoBase (debounce)
  useEffect(() => {
    if (!open) return;
    const term = baseSearch.trim();
    if (!term || !proveedorId) {
      setBaseResults([]);
      return;
    }
    let cancelado = false;
    setBaseLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/compras-proveedor/buscar-base?proveedorId=${encodeURIComponent(
            proveedorId
          )}&search=${encodeURIComponent(term)}`,
          { credentials: "include" }
        );
        const data = await res.json();
        if (cancelado) return;
        setBaseResults(data.ok ? data.items || [] : []);
      } catch {
        if (!cancelado) setBaseResults([]);
      } finally {
        if (!cancelado) setBaseLoading(false);
      }
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [baseSearch, open, proveedorId]);

  if (!open) return null;

  const guardar = async () => {
    setError("");
    const cod = codigo.trim();
    if (!cod) {
      setError("El código interno no puede estar vacío.");
      return;
    }
    if (!selectedBase) {
      setError("Elegí un producto existente para vincular.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/productos/codigos-proveedor/crear", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proveedorId: Number(proveedorId),
          productoBaseId: selectedBase.id,
          codigoInterno: cod,
          descripcionProveedor: descripcion.trim() || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "No se pudo vincular el código.");
        return;
      }
      onVinculado?.(cod);
      onClose?.();
    } catch {
      setError("Error de conexión al vincular el código.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SunmiModalLayout
      open
      title="Vincular código interno a producto existente"
      // Conserva su cinta de título: el kit por defecto dibuja texto normal.
      encabezado="cinta"
      onClose={onClose}
      // Es un formulario: un toque al costado con los tres campos cargados
      // tiraría lo escrito, y en el teléfono ese toque pasa solo.
      destructivo
      maxWidth="max-w-2xl"
      // El cuerpo trae sus propios márgenes y no tiene separación entre bloques
      // que el kit deba poner.
      espacioCuerpo=""
      espacioPie=""
      footer={
        <>
          <SunmiButton color="slate" type="button" onClick={onClose}>
            Cancelar
          </SunmiButton>
          <SunmiButton type="button" onClick={guardar} disabled={saving}>
            {saving ? "Vinculando..." : "Vincular"}
          </SunmiButton>
        </>
      }
    >
      <>
        <p className="text-xs sunmi-text-muted mb-3">
          Proveedor: <span className="sunmi-text-strong">{proveedorNombre || "—"}</span>.
          El código se asocia a un producto existente; no se crea ningún producto nuevo.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] sunmi-label">Código interno</label>
            <SunmiInput
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="ej: 10341"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] sunmi-label">Descripción proveedor</label>
            <SunmiInput
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Opcional"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5 mb-2">
          <label className="text-[12px] sunmi-label">Producto existente</label>
          <SunmiInput
            value={baseSearch}
            onChange={(e) => {
              setBaseSearch(e.target.value);
              setSelectedBase(null);
            }}
            placeholder="Buscar por nombre, SKU o código de barras..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>

        <div className="max-h-64 overflow-y-auto divide-y sunmi-divide border-t sunmi-divider mb-3">
          {baseLoading ? (
            <p className="text-xs sunmi-text-muted italic py-2">Buscando...</p>
          ) : baseSearch.trim() && baseResults.length === 0 ? (
            <p className="text-xs sunmi-text-muted italic py-2">Sin resultados.</p>
          ) : (
            baseResults.map((b) => {
              const sel = selectedBase?.id === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSelectedBase(b)}
                  className={`w-full text-left py-2 px-2 text-[13px] ${
                    sel ? "sunmi-surface ring-1 ring-inset sunmi-ring rounded-md" : ""
                  }`}
                >
                  <span className={sel ? "sunmi-text-link font-medium" : "font-medium"}>
                    {b.nombre}
                  </span>
                  {(b.codigo_barra || b.sku) && (
                    <span className="sunmi-text-muted">
                      {" "}· {b.sku ? `SKU ${b.sku}` : `CB ${b.codigo_barra}`}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {error && <p className="text-xs sunmi-text-danger mb-2">{error}</p>}

      </>
    </SunmiModalLayout>
  );
}
