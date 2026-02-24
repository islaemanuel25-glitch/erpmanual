"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiPanel from "@/components/sunmi/SunmiPanel";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

export default function NuevaCompraProveedorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { perfil } = useUser();
  const { loading: loadingCtx, needsContexto } = useContextoActivo();

  const proveedorIdParam = searchParams.get("proveedorId") || "";

  // Proveedores
  const [proveedores, setProveedores] = useState([]);
  const [proveedorId, setProveedorId] = useState(proveedorIdParam);
  const [notas, setNotas] = useState("");

  // Productos del proveedor (ProductoLocal del depósito)
  const [productos, setProductos] = useState([]);
  const [search, setSearch] = useState("");
  const [loadingProds, setLoadingProds] = useState(false);

  // Items del pedido
  const [items, setItems] = useState([]);
  const [soloFaltantes, setSoloFaltantes] = useState(true);

  const [saving, setSaving] = useState(false);

  // Cargar proveedores
  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/proveedores/listar?estado=activos&pageSize=200", {
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok) setProveedores(data.items || []);
    };
    load();
  }, []);

  // Cargar productos del proveedor seleccionado
  const cargarProductos = useCallback(async () => {
    if (!proveedorId) {
      setProductos([]);
      return;
    }

    setLoadingProds(true);
    try {
      const qs = new URLSearchParams({ proveedorId });
      if (search) qs.set("search", search);

      const res = await fetch(`/api/compras-proveedor/productos?${qs}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok) setProductos(data.items || []);
    } finally {
      setLoadingProds(false);
    }
  }, [proveedorId, search]);

  useEffect(() => {
    const timer = setTimeout(cargarProductos, 300);
    return () => clearTimeout(timer);
  }, [cargarProductos]);

  // Agregar producto al pedido
  // modoCompra es la ÚNICA fuente de verdad: "BULTO" (depósito) o "UNIDAD" (fiambre)
  const agregarItem = (prod) => {
    if (items.find((i) => i.productoLocalId === prod.productoLocalId)) return;
    setItems((prev) => [
      ...prev,
      {
        productoLocalId: prod.productoLocalId,
        nombre: prod.nombre,
        sku: prod.sku,
        modoCompra: prod.modoCompra || "BULTO",
        cantidad: prod.sugerido > 0 ? prod.sugerido : 1,
        precioCosto: Number(prod.precio_costo || 0),
        factorPack: Number(prod.factor_pack) || 1,
        sugerido: prod.sugerido,
        sinParametros: prod.sinParametros,
        pesoRefKg: prod.pesoRefKg,
      },
    ]);
  };

  const quitarItem = (productoLocalId) => {
    setItems((prev) => prev.filter((i) => i.productoLocalId !== productoLocalId));
  };

  const updateItemCantidad = (productoLocalId, rawValue) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.productoLocalId !== productoLocalId) return i;
        if (rawValue === "") return { ...i, cantidad: "" };
        const val = parseInt(rawValue, 10);
        return { ...i, cantidad: isNaN(val) ? "" : val };
      })
    );
  };

  const handleBlurCantidad = (productoLocalId) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.productoLocalId !== productoLocalId) return i;
        const val = parseInt(i.cantidad, 10);
        return { ...i, cantidad: isNaN(val) || val < 1 ? 1 : val };
      })
    );
  };

  // Unidad fija BULTO para compras a proveedor (depósito)

  // Crear pedido
  const crearPedido = async () => {
    if (!proveedorId) return alert("Selecciona un proveedor");
    if (items.length === 0) return alert("Agrega al menos un producto");

    const itemInvalido = items.find((i) => {
      const c = Number(i.cantidad);
      return !Number.isFinite(c) || !Number.isInteger(c) || c < 1;
    });
    if (itemInvalido) {
      return alert(`Cantidad invalida en "${itemInvalido.nombre}". Debe ser un entero >= 1.`);
    }

    setSaving(true);
    try {
      const res = await fetch("/api/compras-proveedor/crear", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proveedorId: Number(proveedorId),
          notas: notas || null,
          items: items.map((i) => ({
            productoLocalId: i.productoLocalId,
            cantidad: i.cantidad,
            unidad: i.modoCompra || "BULTO",
            precioCosto: i.precioCosto || null,
          })),
        }),
      });

      const data = await res.json();
      if (data.ok) {
        router.push(`/modulos/compras-proveedor/${data.item.id}`);
      } else {
        alert(data.error || "Error al crear pedido");
      }
    } finally {
      setSaving(false);
    }
  };

  if (!perfil || loadingCtx) return null;
  if (needsContexto) {
    router.push("/inicio");
    return null;
  }

  const permisosP = perfil?.permisos || [];
  const esAdminP = Array.isArray(permisosP) && permisosP.includes("*");
  if (!esAdminP && !permisosP.includes("compras.crear")) return <SinPermisos />;

  return (
    <div className="sunmi-bg w-full min-h-full p-4">
      <SunmiCard>
        <div className="flex items-center justify-between mb-4">
          <SunmiHeader title="Nuevo pedido a proveedor" />
          <SunmiButton
            color="slate"
            onClick={() => router.push("/modulos/compras-proveedor")}
          >
            ← Volver
          </SunmiButton>
        </div>

        {/* Selección de proveedor */}
        <SunmiPanel className="bg-slate-900/40 ring-2 ring-inset ring-slate-500/70 shadow-sm mb-4">
          <div className="flex items-center pb-2 mb-3 border-b border-slate-600/40">
            <h3 className="text-[13px] font-semibold text-slate-200">
              Proveedor y notas
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Proveedor</label>
              <SunmiSelectAdv value={proveedorId} onChange={setProveedorId}>
                <SunmiSelectOption value="">-- Seleccionar --</SunmiSelectOption>
                {proveedores.map((p) => (
                  <SunmiSelectOption key={p.id} value={String(p.id)}>
                    {p.nombre}
                  </SunmiSelectOption>
                ))}
              </SunmiSelectAdv>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Notas</label>
              <SunmiInput
                placeholder="Notas opcionales..."
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
              />
            </div>
          </div>
        </SunmiPanel>

        {/* Buscador de productos */}
        {proveedorId && (
          <SunmiPanel className="bg-slate-900/40 ring-2 ring-inset ring-slate-500/70 shadow-sm mb-4">
            <div className="flex items-center pb-2 mb-3 border-b border-slate-600/40">
              <h3 className="text-[13px] font-semibold text-slate-200">
                Agregar productos
              </h3>
            </div>

            <div className="flex items-center gap-3 mb-3">
              <SunmiInput
                placeholder="Buscar por nombre, SKU o código de barra..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1"
              />
              <label className="flex items-center gap-1.5 text-xs text-slate-400 whitespace-nowrap cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={soloFaltantes}
                  onChange={(e) => setSoloFaltantes(e.target.checked)}
                  className="accent-amber-400"
                />
                Solo faltantes
              </label>
            </div>

            <div className="max-h-80 overflow-y-auto rounded border border-slate-700">
              <SunmiTable headers={["Nombre", "SKU", "Actual", "Min", "Max", "Faltante", "Sugerido", "Costo", ""]}>
                {loadingProds ? (
                  <SunmiTableEmpty label="Buscando..." colSpan={9} />
                ) : productos.length === 0 ? (
                  <SunmiTableEmpty label="Sin productos" colSpan={9} />
                ) : (
                  (() => {
                    const filtered = soloFaltantes
                      ? productos.filter((p) => p.faltante > 0 || p.sinParametros)
                      : productos;
                    const sorted = [...filtered].sort((a, b) => b.faltante - a.faltante);
                    if (sorted.length === 0) {
                      return <SunmiTableEmpty label="Sin productos faltantes" colSpan={9} />;
                    }
                    return sorted.map((p) => {
                      const yaAgregado = items.some(
                        (i) => i.productoLocalId === p.productoLocalId
                      );
                      const esFiambre = p.modoCompra === "UNIDAD";
                      const unidadSufijo = esFiambre ? "kg" : "";
                      const rowClass = p.bajoMin ? "bg-red-500/10" : "";
                      return (
                        <SunmiTableRow key={p.productoLocalId} className={rowClass}>
                          <td className="px-3 py-1.5 text-sm">
                            {p.nombre}
                            {esFiambre && (
                              <span className="ml-2 text-[10px] text-cyan-400 font-medium">FIAMBRE</span>
                            )}
                            {p.bajoMin && (
                              <span className="ml-2 text-[10px] text-red-400 font-medium">BAJO MIN</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-slate-400">
                            {p.sku || "-"}
                          </td>
                          <td className={`px-3 py-1.5 text-xs text-center ${p.bajoMin ? "text-red-400 font-medium" : ""}`}>
                            {p.stockActual}{unidadSufijo && <span className="text-[10px] text-slate-500 ml-0.5">{unidadSufijo}</span>}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-center">
                            {p.stockMin != null ? <>{p.stockMin}{unidadSufijo && <span className="text-[10px] text-slate-500 ml-0.5">{unidadSufijo}</span>}</> : <span className="text-slate-600">—</span>}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-center">
                            {p.stockMax != null ? <>{p.stockMax}{unidadSufijo && <span className="text-[10px] text-slate-500 ml-0.5">{unidadSufijo}</span>}</> : <span className="text-slate-600">—</span>}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-center">
                            {p.sinParametros ? (
                              <span className="text-slate-600">—</span>
                            ) : p.faltante > 0 ? (
                              <span className="text-red-400">
                                {esFiambre ? Number(p.faltante).toFixed(1) : p.faltante}
                                {" "}<span className="text-[10px] text-slate-500">{esFiambre ? "kg" : "bultos"}</span>
                              </span>
                            ) : (
                              <span className="text-green-400">0</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-center">
                            {p.sinParametros ? (
                              <span className="text-amber-500/80 text-[10px]" title="Sin stockMin/stockMax configurados">
                                Sin min/max
                              </span>
                            ) : p.sugerido > 0 ? (
                              <span className="text-amber-400 font-medium">
                                {p.sugerido} <span className="text-[10px] text-slate-400">{esFiambre ? "uds" : "bultos"}</span>
                                {esFiambre && p.pesoRefKg > 0 && (
                                  <span className="text-[10px] text-slate-500 ml-1">
                                    (~{(p.sugerido * p.pesoRefKg).toFixed(1)}kg)
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-green-400">OK</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-xs">
                            ${Number(p.precio_costo || 0).toFixed(2)}
                            {esFiambre && p.pesoRefKg > 0 && (
                              <div className="text-[10px] text-slate-500">~{p.pesoRefKg.toFixed(1)}kg/u{p.pesoEsFijo ? "" : " (var)"}</div>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <SunmiButton
                              color={yaAgregado ? "slate" : "green"}
                              disabled={yaAgregado}
                              onClick={() => agregarItem(p)}
                            >
                              {yaAgregado ? "Agregado" : "+"}
                            </SunmiButton>
                          </td>
                        </SunmiTableRow>
                      );
                    });
                  })()
                )}
              </SunmiTable>
            </div>
          </SunmiPanel>
        )}

        {/* Items del pedido */}
        {items.length > 0 && (
          <SunmiPanel className="bg-slate-900/40 ring-2 ring-inset ring-slate-500/70 shadow-sm mb-4">
            <div className="flex items-center pb-2 mb-3 border-b border-slate-600/40">
              <h3 className="text-[13px] font-semibold text-slate-200">
                Detalle del pedido ({items.length} items)
              </h3>
            </div>

            <div className="overflow-x-auto rounded border border-slate-700">
              <SunmiTable headers={["Producto", "Cant.", "Costo (por bulto)", "Subtotal", ""]}>
                {items.map((item) => {
                  const subtotalItem = (Number(item.cantidad) || 0) * item.precioCosto;
                  const esFiambre = item.modoCompra === "UNIDAD";
                  const unidadLabel = esFiambre ? "uds" : "bultos";
                  const costoLabel = esFiambre ? "unidad" : "bulto";
                  return (
                    <SunmiTableRow key={item.productoLocalId}>
                      <td className="px-3 py-1.5 text-sm">
                        {item.nombre}
                        {item.sku && (
                          <span className="text-xs text-slate-500 ml-2">
                            {item.sku}
                          </span>
                        )}
                        {esFiambre && (
                          <span className="ml-2 text-[10px] text-cyan-400 font-medium">FIAMBRE</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              const cur = Number(item.cantidad) || 1;
                              updateItemCantidad(item.productoLocalId, String(Math.max(1, cur - 1)));
                            }}
                            className="w-6 h-6 rounded-md bg-slate-700 text-slate-200 text-[13px] font-bold hover:bg-slate-600 active:scale-95 transition flex items-center justify-center"
                          >−</button>
                          <SunmiInput
                            type="text"
                            inputMode="numeric"
                            value={item.cantidad}
                            onChange={(e) =>
                              updateItemCantidad(item.productoLocalId, e.target.value)
                            }
                            onBlur={() => handleBlurCantidad(item.productoLocalId)}
                            className="w-[46px] text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const cur = Number(item.cantidad) || 0;
                              updateItemCantidad(item.productoLocalId, String(cur + 1));
                            }}
                            className="w-6 h-6 rounded-md bg-slate-700 text-slate-200 text-[13px] font-bold hover:bg-slate-600 active:scale-95 transition flex items-center justify-center"
                          >+</button>
                          <span className="text-[10px] text-slate-400">{unidadLabel}</span>
                        </div>
                        {esFiambre && item.pesoRefKg > 0 && (
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            ~{((Number(item.cantidad) || 0) * item.pesoRefKg).toFixed(1)} kg
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-right">
                        ${item.precioCosto.toFixed(2)}
                        <span className="text-[10px] text-slate-500 ml-0.5">/{costoLabel}</span>
                      </td>
                      <td className="px-3 py-1.5 text-xs text-right font-medium">
                        ${subtotalItem.toFixed(2)}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <button
                          onClick={() => quitarItem(item.productoLocalId)}
                          className="text-red-400 hover:text-red-300 text-sm"
                        >
                          Quitar
                        </button>
                      </td>
                    </SunmiTableRow>
                  );
                })}
                <tr className="border-t border-slate-600">
                  <td colSpan={3} className="px-3 py-2 text-sm font-semibold text-right text-slate-300">
                    TOTAL ESTIMADO
                  </td>
                  <td className="px-3 py-2 text-sm font-bold text-right text-amber-400">
                    ${items.reduce((acc, i) => acc + (Number(i.cantidad) || 0) * i.precioCosto, 0).toFixed(2)}
                  </td>
                  <td />
                </tr>
              </SunmiTable>
            </div>
          </SunmiPanel>
        )}

        {/* Botón crear */}
        <div className="flex justify-end gap-3 mt-4">
          <SunmiButton
            color="slate"
            onClick={() => router.push("/modulos/compras-proveedor")}
          >
            Cancelar
          </SunmiButton>
          <SunmiButton
            color="green"
            disabled={saving || items.length === 0 || !proveedorId}
            onClick={crearPedido}
          >
            {saving ? "Guardando..." : "Crear pedido"}
          </SunmiButton>
        </div>
      </SunmiCard>
    </div>
  );
}
