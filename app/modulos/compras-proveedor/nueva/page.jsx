"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiPanel from "@/components/sunmi/SunmiPanel";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiPill from "@/components/sunmi/SunmiPill";
import { Search } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";
import ModalVincularCodigo from "@/components/compras-proveedor/ModalVincularCodigo";
import { subtotalLinea, unidadDisplay, naturalezaLinea } from "@/lib/compras-proveedor/calculoPedido";
import {
  recibeHoy,
  formatDiaLabel,
  diaActualEnum,
} from "@/lib/proveedores/diasPedido";

// Columnas opcionales de "Agregar productos" (Nombre y acción + siempre visibles).
const COLUMNAS_AGREGAR = [
  { key: "sku", label: "SKU" },
  { key: "actual", label: "Actual" },
  { key: "min", label: "Min" },
  { key: "max", label: "Max" },
  { key: "faltante", label: "Faltante" },
  { key: "sugerido", label: "Sugerido" },
  { key: "costo", label: "Costo" },
];

export default function NuevaCompraProveedorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { perfil } = useUser();
  const { loading: loadingCtx, needsContexto } = useContextoActivo();

  const proveedorIdParam = searchParams.get("proveedorId") || "";
  const pedidoIdParam = searchParams.get("pedidoId") || "";
  const esContinuar = Boolean(pedidoIdParam);

  // Proveedores
  const [proveedores, setProveedores] = useState([]);
  const [proveedorId, setProveedorId] = useState(proveedorIdParam);
  const [notas, setNotas] = useState("");

  // En modo continuar: nombre del proveedor cargado para mostrar como readonly.
  const [proveedorNombre, setProveedorNombre] = useState("");

  // Productos del proveedor (ProductoLocal del depósito)
  const [productos, setProductos] = useState([]);
  const [search, setSearch] = useState("");
  const [loadingProds, setLoadingProds] = useState(false);

  // Códigos internos encontrados sin ProductoLocal habilitado en el depósito (Etapa 4)
  const [avisoSinDeposito, setAvisoSinDeposito] = useState([]);

  // Vincular al vuelo (Etapa 5)
  const [vincularOpen, setVincularOpen] = useState(false);
  const [postVinculoMsg, setPostVinculoMsg] = useState("");
  const justLinkedRef = useRef(null);

  // Items del pedido
  const [items, setItems] = useState([]);
  const [soloFaltantes, setSoloFaltantes] = useState(true);

  // Columnas visibles en "Agregar productos" (solo UI, no persiste).
  const [colsVisibles, setColsVisibles] = useState({
    sku: true, actual: true, min: true, max: true,
    faltante: true, sugerido: true, costo: true,
  });
  const [colsMenuOpen, setColsMenuOpen] = useState(false);

  const [saving, setSaving] = useState(false);

  // Detección de pedido BORRADOR existente para el proveedor seleccionado.
  // null = no hay / no chequeado. Objeto = hay borrador y se ofrece continuar.
  const [borradorExistente, setBorradorExistente] = useState(null);

  // Proveedor seleccionado (objeto completo) para mostrar info de dias_pedido.
  const proveedorSel = useMemo(
    () =>
      proveedores.find((p) => String(p.id) === String(proveedorId)) || null,
    [proveedores, proveedorId]
  );

  // Mostrar warning solo si el proveedor tiene dias_pedido configurados
  // y hoy NO es uno de esos días. Si dias_pedido está vacío, no inferimos nada.
  const mostrarWarningDia =
    proveedorSel &&
    Array.isArray(proveedorSel.dias_pedido) &&
    proveedorSel.dias_pedido.length > 0 &&
    !recibeHoy(proveedorSel.dias_pedido);

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

  // Modo continuar: cargar el pedido BORRADOR y reconstruir items con detalleId
  useEffect(() => {
    if (!esContinuar) return;
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/compras-proveedor/obtener?id=${pedidoIdParam}`,
          { credentials: "include" }
        );
        const data = await res.json();
        if (cancelado || !data.ok || !data.item) return;
        const p = data.item;
        if (p.estado !== "BORRADOR") {
          alert(`Este pedido no es un borrador (estado: ${p.estado}). Volviendo al detalle.`);
          router.replace(`/modulos/compras-proveedor/${p.id}`);
          return;
        }
        setProveedorId(String(p.proveedor?.id || ""));
        setProveedorNombre(p.proveedor?.nombre || "");
        setNotas(p.notas || "");
        const itemsFromDetalles = (p.detalles || []).map((d) => {
          const base = d.producto?.base || {};
          const modoCompra = base.modoCompraProveedor || "BULTO";
          const factorPack = Number(base.factor_pack) || 1;
          const pesoRefKg = Number(base.pesoReferenciaKg) || 0;
          return {
            detalleId: d.id,
            productoLocalId: d.productoLocalId,
            nombre: base.nombre || "",
            sku: base.sku || "",
            modoCompra,
            cantidad: Number(d.cantidad) || 1,
            precioCosto: Number(d.precioCosto) || 0,
            factorPack,
            sugerido: 0,
            sinParametros: false,
            pesoRefKg,
          };
        });
        setItems(itemsFromDetalles);
      } catch {
        alert("No se pudo cargar el pedido. Volvé al listado e intentá de nuevo.");
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [esContinuar, pedidoIdParam, router]);

  // Al cambiar el proveedor, chequear si ya hay BORRADOR pendiente para él.
  // Reusa /api/compras-proveedor/listar (ya soporta filtros estado + proveedorId).
  // En modo continuar no aplica: ya estamos editando ese borrador.
  useEffect(() => {
    setBorradorExistente(null); // reset en cada cambio de proveedor
    if (esContinuar) return;
    if (!proveedorId) return;

    let cancelado = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/compras-proveedor/listar?estado=BORRADOR&proveedorId=${proveedorId}&pageSize=1`,
          { credentials: "include" }
        );
        const data = await res.json();
        if (cancelado) return;
        if (data.ok && Array.isArray(data.items) && data.items.length > 0) {
          setBorradorExistente(data.items[0]);
        }
      } catch {
        // Silenciar: si falla, no se muestra el aviso y el usuario sigue normalmente.
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [proveedorId, esContinuar]);

  // Cargar productos del proveedor seleccionado
  const cargarProductos = useCallback(async () => {
    if (!proveedorId) {
      setProductos([]);
      setAvisoSinDeposito([]);
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
      if (data.ok) {
        setProductos(data.items || []);
        setAvisoSinDeposito(data.codigosSinDeposito || []);

        // Mensaje específico tras vincular al vuelo (Etapa 5)
        if (justLinkedRef.current && justLinkedRef.current === search) {
          const sinDep = (data.codigosSinDeposito || []).some(
            (c) => c.codigoInterno === justLinkedRef.current
          );
          setPostVinculoMsg(
            sinDep
              ? "Producto vinculado, pero no está habilitado en el depósito."
              : "Producto vinculado. Ya podés agregarlo."
          );
          justLinkedRef.current = null;
        }
      }
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
  // En modo continuar, persiste inmediatamente vía /agregar-item.
  const agregarItem = async (prod) => {
    if (items.find((i) => i.productoLocalId === prod.productoLocalId)) return;

    const cantidadInicial = prod.sugerido > 0 ? prod.sugerido : 1;
    const nuevoItemBase = {
      productoLocalId: prod.productoLocalId,
      nombre: prod.nombre,
      sku: prod.sku,
      modoCompra: prod.modoCompra || "BULTO",
      unidad_medida: prod.unidad_medida,
      cantidad: cantidadInicial,
      precioCosto: Number(prod.precio_costo || 0),
      factorPack: Number(prod.factor_pack) || 1,
      sugerido: prod.sugerido,
      sinParametros: prod.sinParametros,
      pesoRefKg: prod.pesoRefKg,
    };

    if (esContinuar) {
      try {
        const res = await fetch(
          `/api/compras-proveedor/agregar-item/${pedidoIdParam}`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              productoLocalId: prod.productoLocalId,
              cantidad: cantidadInicial,
              precioCosto: prod.precio_costo || null,
              unidad: prod.modoCompra || "BULTO",
            }),
          }
        );
        const data = await res.json();
        if (!data.ok) {
          alert(data.error || "No se pudo agregar el producto al borrador");
          return;
        }
        setItems((prev) => [{ ...nuevoItemBase, detalleId: data.detalle.id }, ...prev]);
      } catch {
        alert("Error de conexión al agregar el producto");
      }
      return;
    }

    setItems((prev) => [nuevoItemBase, ...prev]);
  };

  const quitarItem = async (productoLocalId) => {
    const item = items.find((i) => i.productoLocalId === productoLocalId);

    if (esContinuar && item?.detalleId) {
      try {
        const res = await fetch(
          `/api/compras-proveedor/eliminar-item/${pedidoIdParam}`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ detalleId: item.detalleId }),
          }
        );
        const data = await res.json();
        if (!data.ok) {
          alert(data.error || "No se pudo quitar el producto");
          return;
        }
      } catch {
        alert("Error de conexión al quitar el producto");
        return;
      }
    }

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

  const handleBlurCantidad = async (productoLocalId) => {
    const item = items.find((i) => i.productoLocalId === productoLocalId);
    if (!item) return;

    const val = parseInt(item.cantidad, 10);
    const final = isNaN(val) || val < 1 ? 1 : val;

    setItems((prev) =>
      prev.map((i) =>
        i.productoLocalId === productoLocalId ? { ...i, cantidad: final } : i
      )
    );

    if (esContinuar && item.detalleId) {
      try {
        const res = await fetch(
          `/api/compras-proveedor/editar-item/${pedidoIdParam}`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ detalleId: item.detalleId, cantidad: final }),
          }
        );
        const data = await res.json();
        if (!data.ok) {
          alert(data.error || "No se pudo guardar la cantidad");
        }
      } catch {
        alert("Error de conexión al guardar la cantidad");
      }
    }
  };

  // Editar costo de línea (en modo continuar persiste vía editar-item).
  const updateItemCosto = (productoLocalId, rawValue) => {
    const raw = String(rawValue).replace(",", ".");
    setItems((prev) =>
      prev.map((i) =>
        i.productoLocalId === productoLocalId ? { ...i, precioCosto: raw } : i
      )
    );
  };

  const handleBlurCosto = async (productoLocalId) => {
    const item = items.find((i) => i.productoLocalId === productoLocalId);
    if (!item) return;
    const v = Number(item.precioCosto);
    const final = !Number.isFinite(v) || v < 0 ? 0 : v;
    setItems((prev) =>
      prev.map((i) =>
        i.productoLocalId === productoLocalId ? { ...i, precioCosto: final } : i
      )
    );
    if (esContinuar && item.detalleId) {
      try {
        const res = await fetch(
          `/api/compras-proveedor/editar-item/${pedidoIdParam}`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              detalleId: item.detalleId,
              precioCosto: final > 0 ? final : null,
            }),
          }
        );
        const data = await res.json();
        if (!data.ok) alert(data.error || "No se pudo guardar el costo");
      } catch {
        alert("Error de conexión al guardar el costo");
      }
    }
  };

  // Editar el costo POR UNIDAD (productos PACK): persiste precioCosto por bulto = unidad × factor_pack.
  // Mantiene la convención del detalle (precioCosto en la unidad de la línea, que para PACK es BULTO).
  const updateItemCostoUnidad = (productoLocalId, rawValue) => {
    const raw = String(rawValue).replace(",", ".");
    setItems((prev) =>
      prev.map((i) => {
        if (i.productoLocalId !== productoLocalId) return i;
        if (raw === "") return { ...i, precioCosto: "" };
        const u = Number(raw);
        if (!Number.isFinite(u)) return i;
        const f = Math.max(1, Number(i.factorPack) || 1);
        return { ...i, precioCosto: f > 1 ? u * f : u };
      })
    );
  };

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
            precioCosto: Number(i.precioCosto) || null,
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
          <SunmiHeader
            title={
              esContinuar
                ? `Continuar pedido${pedidoIdParam ? ` #${pedidoIdParam}` : ""}`
                : "Nuevo pedido a proveedor"
            }
          />
          <SunmiBackButton href="/modulos/compras-proveedor" />
        </div>

        {/* Selección de proveedor */}
        <SunmiPanel className="sunmi-surface ring-2 ring-inset sunmi-ring shadow-sm mb-4">
          <div className="flex items-center pb-2 mb-3 border-b sunmi-divider">
            <h3 className="text-[13px] font-semibold sunmi-text-strong">
              Proveedor y notas
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs sunmi-text-muted mb-1">Proveedor</label>
              {esContinuar ? (
                <div className="px-3 py-1.5 rounded-md sunmi-control text-[13px] sunmi-text-strong">
                  {proveedorNombre || "—"}
                </div>
              ) : (
                <SunmiSelectAdv
                  value={proveedorId}
                  onChange={setProveedorId}
                  searchable
                >
                  <SunmiSelectOption value="">-- Seleccionar --</SunmiSelectOption>
                  {proveedores.map((p) => (
                    <SunmiSelectOption key={p.id} value={String(p.id)}>
                      {p.nombre}
                    </SunmiSelectOption>
                  ))}
                </SunmiSelectAdv>
              )}
            </div>

            <div>
              <label className="block text-xs sunmi-text-muted mb-1">Notas</label>
              {esContinuar ? (
                <div className="px-3 py-1.5 rounded-md sunmi-control text-[13px] sunmi-text-muted">
                  {notas || "—"}
                </div>
              ) : (
                <SunmiInput
                  placeholder="Notas opcionales..."
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                />
              )}
            </div>
          </div>
        </SunmiPanel>

        {/* Aviso: ya hay BORRADOR pendiente para este proveedor */}
        {borradorExistente && (
          <div
            className="rounded-2xl border p-3 mb-4"
            style={{ borderColor: "var(--pos-warning, #f59e0b)" }}
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div
                  className="text-[13px] font-semibold mb-1"
                  style={{ color: "var(--pos-warning, #f59e0b)" }}
                >
                  Ya hay un pedido en curso para este proveedor.
                </div>
                <div className="text-[12px] sunmi-text-muted">
                  Pedido #{borradorExistente.id} ·{" "}
                  {borradorExistente.cantItems}{" "}
                  {borradorExistente.cantItems === 1 ? "ítem" : "ítems"} · creado el{" "}
                  {new Date(borradorExistente.createdAt).toLocaleDateString("es-AR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <SunmiButton
                  color="cyan"
                  onClick={() =>
                    router.push(`/modulos/compras-proveedor/nueva?pedidoId=${borradorExistente.id}`)
                  }
                >
                  Continuar pedido
                </SunmiButton>
                <SunmiButton
                  color="slate"
                  onClick={() => setBorradorExistente(null)}
                >
                  Crear pedido nuevo
                </SunmiButton>
              </div>
            </div>
          </div>
        )}

        {/* Warning informativo: hoy no es día válido para este proveedor */}
        {mostrarWarningDia && (
          <div
            className="rounded-2xl border p-3 mb-4 text-[12px]"
            style={{
              borderColor: "var(--pos-warning, #f59e0b)",
              color: "var(--pos-warning, #f59e0b)",
            }}
          >
            <div className="font-semibold mb-1">
              Hoy es {formatDiaLabel(diaActualEnum())}.
            </div>
            <div className="flex flex-wrap items-center gap-1.5 sunmi-text-muted">
              <span>{proveedorSel.nombre} recibe pedidos:</span>
              {proveedorSel.dias_pedido.map((d, i) => (
                <SunmiPill key={i}>{formatDiaLabel(d)}</SunmiPill>
              ))}
            </div>
            <div className="mt-1 sunmi-text-muted">
              Podés crear la compra igual.
            </div>
          </div>
        )}

        {/* Buscador de productos */}
        {proveedorId && (
          <SunmiPanel className="sunmi-surface ring-2 ring-inset sunmi-ring shadow-sm mb-4">
            <div className="flex items-center pb-2 mb-3 border-b sunmi-divider">
              <h3 className="text-[13px] font-semibold sunmi-text-strong">
                Agregar productos
              </h3>
            </div>

            <div className="flex items-center gap-3 mb-3">
              <div className="relative flex-1">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10"
                  style={{ color: "var(--pos-link)" }}
                />
                <SunmiInput
                  placeholder="Buscar por código interno, nombre, SKU o código de barra..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPostVinculoMsg("");
                  }}
                  className="!pl-9 !border-2 pulse-neon"
                  style={{ borderColor: "var(--pos-link)" }}
                />
              </div>
              <label className="flex items-center gap-1.5 text-xs sunmi-text-muted whitespace-nowrap cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={soloFaltantes}
                  onChange={(e) => setSoloFaltantes(e.target.checked)}
                  className="accent-[var(--pos-accent)]"
                />
                Solo faltantes
              </label>
              <div className="relative">
                <SunmiButton color="slate" type="button" onClick={() => setColsMenuOpen((o) => !o)}>
                  Columnas
                </SunmiButton>
                {colsMenuOpen && (
                  <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border sunmi-border sunmi-surface shadow-lg p-1.5 flex flex-col gap-0.5">
                    {COLUMNAS_AGREGAR.map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => setColsVisibles((v) => ({ ...v, [c.key]: !v[c.key] }))}
                        className={`flex items-center justify-between gap-2 px-2 py-1 rounded text-xs text-left hover:bg-[var(--table-row-hover)] ${colsVisibles[c.key] ? "sunmi-text-strong" : "sunmi-text-muted"}`}
                      >
                        <span>{c.label}</span>
                        <span className="sunmi-text-accent">{colsVisibles[c.key] ? "✓" : ""}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {postVinculoMsg ? (
              <div className="mb-3 rounded-md px-3 py-2 sunmi-surface ring-1 ring-inset sunmi-ring text-xs sunmi-text-accent">
                {postVinculoMsg}
              </div>
            ) : avisoSinDeposito.length > 0 ? (
              <div className="mb-3 rounded-md px-3 py-2 sunmi-surface ring-1 ring-inset sunmi-ring text-xs sunmi-text-accent">
                {avisoSinDeposito.map((c) => (
                  <div key={c.codigoInterno}>
                    Producto encontrado por código interno, pero no está habilitado en el depósito.
                    <span className="sunmi-text-muted">
                      {" "}(Código {c.codigoInterno}
                      {c.nombre ? ` · ${c.nombre}` : ""})
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Vincular al vuelo: el código buscado no existe para este proveedor */}
            {proveedorId &&
              search.trim() &&
              !loadingProds &&
              productos.length === 0 &&
              avisoSinDeposito.length === 0 &&
              !postVinculoMsg && (
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="sunmi-text-muted">
                    No se encontró “{search.trim()}” para este proveedor.
                  </span>
                  <SunmiButton color="slate" type="button" onClick={() => setVincularOpen(true)}>
                    Vincular código interno a producto existente
                  </SunmiButton>
                </div>
              )}

            {vincularOpen && (
              <ModalVincularCodigo
                open={vincularOpen}
                onClose={() => setVincularOpen(false)}
                proveedorId={proveedorId}
                proveedorNombre={
                  proveedorNombre ||
                  proveedores.find((p) => String(p.id) === String(proveedorId))?.nombre ||
                  ""
                }
                codigoInicial={search.trim()}
                onVinculado={(cod) => {
                  justLinkedRef.current = cod;
                  setPostVinculoMsg("");
                  setSearch(cod);
                }}
              />
            )}

            {/* El contenedor scrollea; el thead queda fijo arriba (sticky). */}
            <div className="max-h-80 overflow-auto rounded border sunmi-border">
              <table className="w-full text-[12px] table-auto">
                <thead className="sunmi-thead sticky top-0 z-10">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">Nombre</th>
                    {COLUMNAS_AGREGAR.map((c) =>
                      colsVisibles[c.key] ? (
                        <th key={c.key} className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">{c.label}</th>
                      ) : null
                    )}
                    <th className="px-2 py-1.5 text-left font-semibold whitespace-nowrap" />
                  </tr>
                </thead>
                <tbody className="divide-y sunmi-divide">
                {loadingProds ? (
                  <SunmiTableEmpty label="Buscando..." colSpan={2 + COLUMNAS_AGREGAR.filter((c) => colsVisibles[c.key]).length} />
                ) : productos.length === 0 ? (
                  <SunmiTableEmpty label="Sin productos" colSpan={2 + COLUMNAS_AGREGAR.filter((c) => colsVisibles[c.key]).length} />
                ) : (
                  (() => {
                    const filtered = soloFaltantes
                      ? productos.filter((p) => p.faltante > 0 || p.sinParametros)
                      : productos;
                    const sorted = [...filtered].sort((a, b) => b.faltante - a.faltante);
                    if (sorted.length === 0) {
                      return <SunmiTableEmpty label="Sin productos faltantes" colSpan={2 + COLUMNAS_AGREGAR.filter((c) => colsVisibles[c.key]).length} />;
                    }
                    return sorted.map((p) => {
                      const yaAgregado = items.some(
                        (i) => i.productoLocalId === p.productoLocalId
                      );
                      const esFiambre = p.modoCompra === "UNIDAD";
                      const unidadSufijo = esFiambre ? "kg" : "";
                      const rowClass = p.bajoMin ? "sunmi-state-danger-soft" : "";
                      return (
                        <SunmiTableRow key={p.productoLocalId} className={rowClass}>
                          <td className="px-3 py-1.5 text-sm">
                            {p.nombre}
                            {esFiambre && (
                              <span className="ml-2 text-[10px] sunmi-text-link font-medium">FIAMBRE</span>
                            )}
                            {p.bajoMin && (
                              <span className="ml-2 text-[10px] sunmi-text-danger font-medium">BAJO MIN</span>
                            )}
                          </td>
                          {colsVisibles.sku && (
                            <td className="px-3 py-1.5 text-xs sunmi-text-muted">
                              {p.sku || "-"}
                            </td>
                          )}
                          {colsVisibles.actual && (
                            <td className={`px-3 py-1.5 text-xs text-center ${p.bajoMin ? "sunmi-text-danger font-medium" : ""}`}>
                              {p.stockActual}{unidadSufijo && <span className="text-[10px] sunmi-text-muted ml-0.5">{unidadSufijo}</span>}
                            </td>
                          )}
                          {colsVisibles.min && (
                            <td className="px-3 py-1.5 text-xs text-center">
                              {p.stockMin != null ? <>{p.stockMin}{unidadSufijo && <span className="text-[10px] sunmi-text-muted ml-0.5">{unidadSufijo}</span>}</> : <span className="sunmi-text-muted">—</span>}
                            </td>
                          )}
                          {colsVisibles.max && (
                            <td className="px-3 py-1.5 text-xs text-center">
                              {p.stockMax != null ? <>{p.stockMax}{unidadSufijo && <span className="text-[10px] sunmi-text-muted ml-0.5">{unidadSufijo}</span>}</> : <span className="sunmi-text-muted">—</span>}
                            </td>
                          )}
                          {colsVisibles.faltante && (
                            <td className="px-3 py-1.5 text-xs text-center">
                              {p.sinParametros ? (
                                <span className="sunmi-text-muted">—</span>
                              ) : p.faltante > 0 ? (
                                <span className="sunmi-text-danger">
                                  {esFiambre ? Number(p.faltante).toFixed(1) : p.faltante}
                                  {" "}<span className="text-[10px] sunmi-text-muted">{esFiambre ? "kg" : "bultos"}</span>
                                </span>
                              ) : (
                                <span className="sunmi-text-success">0</span>
                              )}
                            </td>
                          )}
                          {colsVisibles.sugerido && (
                            <td className="px-3 py-1.5 text-xs text-center">
                              {p.sinParametros ? (
                                <span className="sunmi-text-accent text-[10px]" title="Sin stockMin/stockMax configurados">
                                  Sin min/max
                                </span>
                              ) : p.sugerido > 0 ? (
                                <span className="sunmi-text-accent font-medium">
                                  {p.sugerido} <span className="text-[10px] sunmi-text-muted">{esFiambre ? "uds" : "bultos"}</span>
                                  {esFiambre && p.pesoRefKg > 0 && (
                                    <span className="text-[10px] sunmi-text-muted ml-1">
                                      (~{(p.sugerido * p.pesoRefKg).toFixed(1)}kg)
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="sunmi-text-success">OK</span>
                              )}
                            </td>
                          )}
                          {colsVisibles.costo && (
                            <td className="px-3 py-1.5 text-xs">
                              ${Number(p.precio_costo || 0).toFixed(2)}
                              {esFiambre && p.pesoRefKg > 0 && (
                                <div className="text-[10px] sunmi-text-muted">~{p.pesoRefKg.toFixed(1)}kg/u{p.pesoEsFijo ? "" : " (var)"}</div>
                              )}
                            </td>
                          )}
                          <td className="px-3 py-1.5 text-right">
                            <SunmiButton
                              type="button"
                              color={yaAgregado ? "slate" : "cyan"}
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
                </tbody>
              </table>
            </div>
          </SunmiPanel>
        )}

        {/* Items del pedido */}
        {items.length > 0 && (
          <SunmiPanel className="sunmi-surface ring-2 ring-inset sunmi-ring shadow-sm mb-4">
            <div className="flex items-center pb-2 mb-3 border-b sunmi-divider">
              <h3 className="text-[13px] font-semibold sunmi-text-strong">
                Detalle del pedido ({items.length} items)
              </h3>
            </div>

            {(() => {
              const itemBase = (i) => ({
                modoCompraProveedor: i.modoCompra,
                unidad_medida: i.unidad_medida,
                factor_pack: i.factorPack,
                pesoReferenciaKg: i.pesoRefKg,
              });
              const calc = (i) =>
                subtotalLinea({ base: itemBase(i), cantidad: i.cantidad, costo: i.precioCosto });
              const total = items.reduce((acc, i) => acc + (calc(i).subtotal || 0), 0);

              // Etiqueta de unidad: BULTO incluye el factor real ("BULTO x 6 uds").
              const unidadLabel = (i) => {
                const disp = unidadDisplay(itemBase(i), i.modoCompra);
                const factor = Math.max(1, Number(i.factorPack) || 1);
                return disp === "BULTO" && factor > 1 ? `BULTO x ${factor} uds` : disp;
              };

              // Producto PACK (factor > 1, no fiambre/kg) → costo editable por bulto Y por unidad.
              const esPackItem = (i) => naturalezaLinea(itemBase(i)) === "PACK";

              // Valor mostrado del input "por unidad" = precioCosto (por bulto) / factor_pack.
              const costoUnitarioVal = (i) => {
                if (i.precioCosto === "" || i.precioCosto == null) return "";
                const c = Number(i.precioCosto);
                if (!Number.isFinite(c)) return "";
                const f = Math.max(1, Number(i.factorPack) || 1);
                return Math.round((f > 1 ? c / f : c) * 100) / 100;
              };

              // Columnas del detalle: Producto | Cantidad | Unidad | Costo | Subtotal | Quitar.
              // Suma de mínimos ~960px → entra en desktop sin scroll horizontal
              // (en mobile el contenedor scrollea, como "Agregar productos").
              const gridCols = {
                gridTemplateColumns:
                  "minmax(180px,1.4fr) 160px 110px minmax(300px,1fr) 110px 92px",
              };

              return (
                <>
                  {/* Detalle: grid de columnas fijas (compacto). En mobile scrollea horizontal. */}
                  <div className="overflow-x-auto rounded border sunmi-border">
                    <div className="min-w-[952px]">
                      {/* Encabezado */}
                      <div
                        className="grid items-center gap-2 px-3 py-2 sunmi-thead text-[11px] font-semibold whitespace-nowrap"
                        style={gridCols}
                      >
                        <div>Producto</div>
                        <div className="text-center">Cantidad</div>
                        <div>Unidad</div>
                        <div>Costo</div>
                        <div className="text-right">Subtotal</div>
                        <div />
                      </div>

                      {/* Filas */}
                      {items.map((item, index) => {
                        const r = calc(item);
                        const esFiambre = item.modoCompra === "UNIDAD";
                        const esKgFiambre = esFiambre || item.unidad_medida === "kg";
                        return (
                          <div
                            key={item.detalleId ? `d-${item.detalleId}` : `p-${item.productoLocalId}-${index}`}
                            className="grid items-center gap-2 px-3 py-1.5 border-t sunmi-divider hover:bg-[var(--table-row-hover)]"
                            style={gridCols}
                          >
                            {/* Producto */}
                            <div className="min-w-0">
                              <div className="text-sm truncate" title={item.nombre}>{item.nombre}</div>
                              {item.sku && <div className="text-[11px] sunmi-text-muted truncate">{item.sku}</div>}
                            </div>

                            {/* Cantidad */}
                            <div>
                              <div className="flex items-center gap-1">
                                <SunmiButton color="slate" type="button" onClick={() => updateItemCantidad(item.productoLocalId, String(Math.max(1, (Number(item.cantidad) || 1) - 1)))}>−</SunmiButton>
                                <SunmiInput type="text" inputMode="numeric" value={item.cantidad}
                                  onChange={(e) => updateItemCantidad(item.productoLocalId, e.target.value)}
                                  onBlur={() => handleBlurCantidad(item.productoLocalId)}
                                  className="w-[56px] text-center" />
                                <SunmiButton color="slate" type="button" onClick={() => updateItemCantidad(item.productoLocalId, String((Number(item.cantidad) || 0) + 1))}>+</SunmiButton>
                              </div>
                              {esFiambre && Number(item.pesoRefKg) > 0 && (
                                <div className="text-[10px] sunmi-text-muted mt-0.5">~{((Number(item.cantidad) || 0) * Number(item.pesoRefKg)).toFixed(1)} kg</div>
                              )}
                            </div>

                            {/* Unidad */}
                            <div className="text-xs sunmi-text-muted">{unidadLabel(item)}</div>

                            {/* Costo */}
                            <div className="min-w-0">
                              {esPackItem(item) ? (
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                  <label className="flex items-center gap-1">
                                    <span className="sunmi-text-muted text-[10px]">Unidad</span>
                                    <span className="sunmi-text-muted text-xs">$</span>
                                    <SunmiInput type="text" inputMode="decimal" value={costoUnitarioVal(item)}
                                      onChange={(e) => updateItemCostoUnidad(item.productoLocalId, e.target.value)}
                                      onBlur={() => handleBlurCosto(item.productoLocalId)}
                                      className="w-[95px] text-center" />
                                  </label>
                                  <label className="flex items-center gap-1">
                                    <span className="sunmi-text-muted text-[10px]">Bulto</span>
                                    <span className="sunmi-text-muted text-xs">$</span>
                                    <SunmiInput type="text" inputMode="decimal" value={item.precioCosto}
                                      onChange={(e) => updateItemCosto(item.productoLocalId, e.target.value)}
                                      onBlur={() => handleBlurCosto(item.productoLocalId)}
                                      className="w-[95px] text-center" />
                                  </label>
                                </div>
                              ) : (
                                <label className="flex items-center gap-1 whitespace-nowrap">
                                  <span className="sunmi-text-muted text-[10px]">{esKgFiambre ? "kg" : "Unidad"}</span>
                                  <span className="sunmi-text-muted text-xs">$</span>
                                  <SunmiInput type="text" inputMode="decimal" value={item.precioCosto}
                                    onChange={(e) => updateItemCosto(item.productoLocalId, e.target.value)}
                                    onBlur={() => handleBlurCosto(item.productoLocalId)}
                                    className="w-[95px] text-center" />
                                </label>
                              )}
                            </div>

                            {/* Subtotal */}
                            <div className="text-xs text-right font-medium">
                              {r.subtotal != null ? `$${r.subtotal.toFixed(2)}` : (
                                <span className="sunmi-text-accent" title={r.advertencia || ""}>⚠ {r.advertencia}</span>
                              )}
                            </div>

                            {/* Quitar */}
                            <div className="text-right">
                              <SunmiButton color="red" type="button" onClick={() => quitarItem(item.productoLocalId)}>Quitar</SunmiButton>
                            </div>
                          </div>
                        );
                      })}

                      {/* Total */}
                      <div
                        className="grid items-center gap-2 px-3 py-2 border-t sunmi-divider"
                        style={gridCols}
                      >
                        <div />
                        <div />
                        <div />
                        <div className="text-sm font-semibold text-right sunmi-text-strong">TOTAL ESTIMADO</div>
                        <div className="text-sm font-bold text-right sunmi-text-accent">${total.toFixed(2)}</div>
                        <div />
                      </div>
                    </div>
                  </div>

                </>
              );
            })()}
          </SunmiPanel>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-3 mt-4">
          {esContinuar ? (
            <>
              <SunmiButton
                color="slate"
                onClick={() => router.push("/modulos/compras-proveedor")}
              >
                Volver al listado
              </SunmiButton>
              <SunmiButton
                color="cyan"
                onClick={() =>
                  router.push(`/modulos/compras-proveedor/${pedidoIdParam}`)
                }
              >
                Ir al detalle
              </SunmiButton>
            </>
          ) : (
            <>
              <SunmiButton
                color="slate"
                onClick={() => router.push("/modulos/compras-proveedor")}
              >
                Cancelar
              </SunmiButton>
              <SunmiButton
                color="cyan"
                disabled={saving || items.length === 0 || !proveedorId}
                onClick={crearPedido}
              >
                {saving ? "Guardando..." : "Guardar borrador"}
              </SunmiButton>
            </>
          )}
        </div>
      </SunmiCard>
    </div>
  );
}
