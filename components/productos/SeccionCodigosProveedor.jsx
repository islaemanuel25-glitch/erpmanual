"use client";

import { useCallback, useEffect, useState } from "react";
import SunmiPanel from "@/components/sunmi/SunmiPanel";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";

/**
 * SeccionCodigosProveedor — gestión manual de códigos internos por proveedor
 * de un ProductoBase ya existente. Consume las APIs:
 *   GET    /api/productos/codigos-proveedor/listar?productoBaseId=ID
 *   POST   /api/productos/codigos-proveedor/crear
 *   PUT    /api/productos/codigos-proveedor/editar
 *   DELETE /api/productos/codigos-proveedor/eliminar
 *
 * No afecta el guardado del producto ni el buscador de compras.
 *
 * Props:
 *  - productoBaseId: id del ProductoBase (requerido; la sección no se monta sin él)
 *  - proveedores: catálogo [{ id, nombre }]
 *  - proveedoresSugeridos: ids de los proveedores del producto en orden
 *    [principal, segundo, tercero]. Se preselecciona el principal al agregar
 *    y se muestran como accesos rápidos. Igual se puede elegir cualquier otro.
 */
export default function SeccionCodigosProveedor({
  productoBaseId,
  proveedores = [],
  proveedoresSugeridos = [],
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  // Form de alta
  const [nuevoProv, setNuevoProv] = useState("");
  const [nuevoCodigo, setNuevoCodigo] = useState("");
  const [nuevaDesc, setNuevaDesc] = useState("");
  const [creando, setCreando] = useState(false);
  const [errorAlta, setErrorAlta] = useState("");

  // Edición inline
  const [editId, setEditId] = useState(null);
  const [editProv, setEditProv] = useState("");
  const [editCodigo, setEditCodigo] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [guardandoEdit, setGuardandoEdit] = useState(false);
  const [errorEdit, setErrorEdit] = useState("");

  const cargar = useCallback(async () => {
    if (!productoBaseId) return;
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(
        `/api/productos/codigos-proveedor/listar?productoBaseId=${productoBaseId}`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (data.ok) {
        setItems(data.items || []);
      } else {
        setLoadError(data.error || "No se pudieron cargar los códigos.");
      }
    } catch {
      setLoadError("Error de conexión al cargar los códigos.");
    } finally {
      setLoading(false);
    }
  }, [productoBaseId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Proveedores del producto (sugeridos): dedup + nombre, principal primero.
  const sugeridos = (() => {
    const seen = new Set();
    const out = [];
    for (const raw of proveedoresSugeridos) {
      const id = Number(raw);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const prov = proveedores.find((p) => Number(p.id) === id);
      out.push({ id, nombre: prov?.nombre ?? `#${id}` });
    }
    return out;
  })();
  const principalId = sugeridos[0]?.id ?? null;

  // Preseleccionar el proveedor principal al cambiar de producto (o al conocerlo).
  useEffect(() => {
    setNuevoProv(principalId ? String(principalId) : "");
  }, [productoBaseId, principalId]);

  const crear = async () => {
    setErrorAlta("");
    const codigo = nuevoCodigo.trim();
    if (!nuevoProv) {
      setErrorAlta("Seleccioná un proveedor.");
      return;
    }
    if (!codigo) {
      setErrorAlta("El código interno no puede estar vacío.");
      return;
    }

    setCreando(true);
    try {
      const res = await fetch("/api/productos/codigos-proveedor/crear", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productoBaseId,
          proveedorId: Number(nuevoProv),
          codigoInterno: codigo,
          descripcionProveedor: nuevaDesc.trim() || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setErrorAlta(data.error || "No se pudo crear el vínculo.");
        return;
      }
      setNuevoProv("");
      setNuevoCodigo("");
      setNuevaDesc("");
      await cargar();
    } catch {
      setErrorAlta("Error de conexión al crear el vínculo.");
    } finally {
      setCreando(false);
    }
  };

  const iniciarEdicion = (item) => {
    setErrorEdit("");
    setEditId(item.id);
    setEditProv(String(item.proveedorId ?? item.proveedor?.id ?? ""));
    setEditCodigo(item.codigoInterno ?? "");
    setEditDesc(item.descripcionProveedor ?? "");
  };

  const cancelarEdicion = () => {
    setEditId(null);
    setEditProv("");
    setEditCodigo("");
    setEditDesc("");
    setErrorEdit("");
  };

  const guardarEdicion = async () => {
    setErrorEdit("");
    const codigo = editCodigo.trim();
    if (!editProv) {
      setErrorEdit("Seleccioná un proveedor.");
      return;
    }
    if (!codigo) {
      setErrorEdit("El código interno no puede estar vacío.");
      return;
    }

    setGuardandoEdit(true);
    try {
      const res = await fetch("/api/productos/codigos-proveedor/editar", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editId,
          proveedorId: Number(editProv),
          codigoInterno: codigo,
          descripcionProveedor: editDesc.trim() || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setErrorEdit(data.error || "No se pudo guardar el cambio.");
        return;
      }
      cancelarEdicion();
      await cargar();
    } catch {
      setErrorEdit("Error de conexión al guardar el cambio.");
    } finally {
      setGuardandoEdit(false);
    }
  };

  const eliminar = async (item) => {
    if (!confirm(`¿Quitar el código interno "${item.codigoInterno}"?`)) return;
    try {
      const res = await fetch(
        `/api/productos/codigos-proveedor/eliminar?id=${item.id}`,
        { method: "DELETE", credentials: "include" }
      );
      const data = await res.json();
      if (!data.ok) {
        alert(data.error || "No se pudo quitar el vínculo.");
        return;
      }
      await cargar();
    } catch {
      alert("Error de conexión al quitar el vínculo.");
    }
  };

  const onKeyAlta = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      crear();
    }
  };

  return (
    <SunmiPanel className="sunmi-surface ring-2 ring-inset sunmi-ring shadow-sm">
      <div className="flex items-center pb-2 mb-3 border-b sunmi-divider">
        <h3 className="text-[13px] sunmi-section-title">Códigos internos por proveedor</h3>
      </div>

      <p className="text-xs text-slate-500 mb-3">
        Cada proveedor puede identificar este producto con su propio código interno.
        No duplica el producto ni su stock; solo lo asocia. (Por ahora es gestión manual.)
      </p>

      {/* Alta */}
      {sugeridos.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2 text-xs">
          <span className="sunmi-text-muted">Proveedores del producto:</span>
          {sugeridos.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setNuevoProv(String(s.id))}
              className={`px-2 py-0.5 rounded-full border text-[11px] transition-colors ${
                String(s.id) === nuevoProv
                  ? "bg-cyan-600 text-white border-cyan-600"
                  : "sunmi-text-muted border-slate-600 hover:border-cyan-500"
              }`}
            >
              {s.nombre}{i === 0 ? " · principal" : ""}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end mb-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] sunmi-label">Proveedor</label>
          <SunmiSelectAdv
            value={nuevoProv}
            onChange={(v) => setNuevoProv(v)}
            searchable
            placeholder="Seleccionar proveedor..."
          >
            {proveedores.map((p) => (
              <SunmiSelectOption key={p.id} value={String(p.id)}>
                {p.nombre}
              </SunmiSelectOption>
            ))}
          </SunmiSelectAdv>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] sunmi-label">Código interno</label>
          <SunmiInput
            value={nuevoCodigo}
            onChange={(e) => setNuevoCodigo(e.target.value)}
            onKeyDown={onKeyAlta}
            placeholder="ej: 10341"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] sunmi-label">Descripción proveedor</label>
          <SunmiInput
            value={nuevaDesc}
            onChange={(e) => setNuevaDesc(e.target.value)}
            onKeyDown={onKeyAlta}
            placeholder="Opcional"
          />
        </div>

        <SunmiButton color="green" type="button" onClick={crear} disabled={creando}>
          {creando ? "Agregando..." : "Agregar"}
        </SunmiButton>
      </div>

      {errorAlta && (
        <p className="text-xs text-red-500 mb-3">{errorAlta}</p>
      )}

      {/* Listado */}
      {loadError && (
        <p className="text-xs text-red-500 mb-2">{loadError}</p>
      )}

      <SunmiTable
        headers={[
          "Proveedor",
          "Código interno",
          "Descripción",
          { label: "Acciones", className: "text-right" },
        ]}
      >
        {loading ? (
          <SunmiTableEmpty message="Cargando..." colSpan={4} />
        ) : items.length === 0 ? (
          <SunmiTableEmpty message="Sin códigos internos cargados." colSpan={4} />
        ) : (
          items.map((item) => {
            const enEdicion = editId === item.id;
            if (enEdicion) {
              return (
                <SunmiTableRow key={item.id}>
                  <td className="px-2 py-1.5 align-top">
                    <SunmiSelectAdv
                      value={editProv}
                      onChange={(v) => setEditProv(v)}
                      searchable
                      placeholder="Proveedor..."
                    >
                      {proveedores.map((p) => (
                        <SunmiSelectOption key={p.id} value={String(p.id)}>
                          {p.nombre}
                        </SunmiSelectOption>
                      ))}
                    </SunmiSelectAdv>
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <SunmiInput
                      value={editCodigo}
                      onChange={(e) => setEditCodigo(e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <SunmiInput
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex gap-1">
                        <SunmiButton
                          color="green"
                          type="button"
                          onClick={guardarEdicion}
                          disabled={guardandoEdit}
                        >
                          {guardandoEdit ? "Guardando..." : "Guardar"}
                        </SunmiButton>
                        <SunmiButton color="slate" type="button" onClick={cancelarEdicion}>
                          Cancelar
                        </SunmiButton>
                      </div>
                      {errorEdit && (
                        <span className="text-xs text-red-500">{errorEdit}</span>
                      )}
                    </div>
                  </td>
                </SunmiTableRow>
              );
            }

            return (
              <SunmiTableRow key={item.id}>
                <td className="px-2 py-1.5">{item.proveedor?.nombre ?? "—"}</td>
                <td className="px-2 py-1.5 font-mono">{item.codigoInterno}</td>
                <td className="px-2 py-1.5">{item.descripcionProveedor || "—"}</td>
                <td className="px-2 py-1.5">
                  <div className="flex justify-end gap-1">
                    <SunmiButton color="cyan" type="button" onClick={() => iniciarEdicion(item)}>
                      Editar
                    </SunmiButton>
                    <SunmiButton color="red" type="button" onClick={() => eliminar(item)}>
                      Quitar
                    </SunmiButton>
                  </div>
                </td>
              </SunmiTableRow>
            );
          })
        )}
      </SunmiTable>
    </SunmiPanel>
  );
}
