"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";

export default function PedidosCatalogoPage() {
  const router = useRouter();
  const { perfil: perfilPed, cargando: cargandoPed } = useUser();

  // Estado general
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [opciones, setOpciones] = useState(null);

  // Filtros
  const [busqueda, setBusqueda] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [areaId, setAreaId] = useState("");

  // Catálogo
  const [productos, setProductos] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadingCat, setLoadingCat] = useState(false);

  // Carrito (cantidades locales)
  const [carrito, setCarrito] = useState({});
  const [carritoCount, setCarritoCount] = useState(0);
  const [posId, setPosId] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [vista, setVista] = useState("catalogo"); // "catalogo" | "carrito"
  const [carritoItems, setCarritoItems] = useState([]);
  const [loadingCarrito, setLoadingCarrito] = useState(false);

  // Debounce busqueda
  const debounceRef = useRef(null);

  // ====================================================
  // CARGAR OPCIONES
  // ====================================================
  useEffect(() => {
    const cargar = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/pedidos/opciones", { cache: "no-store" });
        const json = await res.json();

        if (!json.ok) {
          setError(json.error || "Error cargando opciones");
          setLoading(false);
          return;
        }

        setOpciones(json);
        setLoading(false);

        // Cargar carrito existente
        cargarCarrito();
      } catch (err) {
        console.error(err);
        setError("Error de conexión");
        setLoading(false);
      }
    };

    cargar();
  }, []);

  // ====================================================
  // CARGAR CATÁLOGO
  // ====================================================
  const cargarCatalogo = useCallback(
    async (p = 1) => {
      setLoadingCat(true);
      try {
        const params = new URLSearchParams({ page: p, pageSize: 50 });
        if (busqueda.trim()) params.set("q", busqueda.trim());
        if (categoriaId) params.set("categoriaId", categoriaId);
        if (proveedorId) params.set("proveedorId", proveedorId);
        if (areaId) params.set("areaId", areaId);

        const res = await fetch(`/api/pedidos/catalogo?${params}`, {
          cache: "no-store",
        });
        const json = await res.json();

        if (json.ok) {
          setProductos(json.items || []);
          setPage(json.page || 1);
          setTotalPages(json.totalPages || 1);
          setTotal(json.total || 0);
        }
      } catch (err) {
        console.error(err);
      }
      setLoadingCat(false);
    },
    [busqueda, categoriaId, proveedorId, areaId]
  );

  // Cargar al montar y cuando cambian filtros
  useEffect(() => {
    if (!opciones) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      cargarCatalogo(1);
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [opciones, busqueda, categoriaId, proveedorId, areaId]);

  // ====================================================
  // CARGAR CARRITO
  // ====================================================
  const cargarCarrito = async () => {
    try {
      const res = await fetch("/api/pedidos/carrito", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) {
        setPosId(json.posId || null);
        setCarritoCount(json.itemCount || 0);
        setCarritoItems(json.items || []);

        // Reconstruir mapa de cantidades
        const mapa = {};
        (json.items || []).forEach((it) => {
          mapa[it.productoLocalId] = it.sugerido;
        });
        setCarrito(mapa);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // ====================================================
  // SET CANTIDAD
  // ====================================================
  const setCantidad = async (productoLocalId, cantidad, unidad) => {
    // Optimistic update
    setCarrito((prev) => {
      const next = { ...prev };
      if (cantidad === 0) {
        delete next[productoLocalId];
      } else {
        next[productoLocalId] = cantidad;
      }
      return next;
    });

    try {
      const res = await fetch("/api/pedidos/set-cantidad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productoLocalId, cantidad, unidad }),
      });
      const json = await res.json();
      if (json.ok) {
        setPosId(json.posId);
        setCarritoCount(json.itemCount);
      } else {
        setError(json.error || "Error al actualizar cantidad");
        // Revert
        cargarCarrito();
      }
    } catch (err) {
      console.error(err);
      setError("Error de conexión");
      cargarCarrito();
    }
  };

  // ====================================================
  // ENVIAR PEDIDO (solicitar)
  // ====================================================
  const enviarPedido = async () => {
    if (!posId) {
      setError("No hay pedido para enviar");
      return;
    }

    setEnviando(true);
    setError("");

    try {
      const res = await fetch("/api/pos-transferencias/solicitar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posId }),
      });
      const json = await res.json();

      if (json.ok) {
        setCarrito({});
        setCarritoCount(0);
        setCarritoItems([]);
        setPosId(null);
        setVista("catalogo");
        alert("Pedido enviado al depósito correctamente");
      } else {
        setError(json.error || "Error al solicitar pedido");
      }
    } catch (err) {
      console.error(err);
      setError("Error de conexión al solicitar");
    }
    setEnviando(false);
  };

  // ====================================================
  // VER CARRITO
  // ====================================================
  const abrirCarrito = async () => {
    setVista("carrito");
    setLoadingCarrito(true);
    await cargarCarrito();
    setLoadingCarrito(false);
  };

  // ====================================================
  // PERMISOS + LOADING
  // ====================================================
  const permisosPed = perfilPed?.permisos || [];
  const esAdminPed = Array.isArray(permisosPed) && permisosPed.includes("*");
  const puedePed = esAdminPed || permisosPed.includes("pedidos.ver");

  if (cargandoPed || loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <span className="text-sm text-slate-300">Cargando...</span>
      </div>
    );
  }

  if (!puedePed) return <SinPermisos />;

  if (!opciones) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <span className="text-sm text-red-400">{error || "Sin opciones"}</span>
      </div>
    );
  }

  // ====================================================
  // VISTA CARRITO
  // ====================================================
  if (vista === "carrito") {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100">
        <div className="max-w-4xl mx-auto p-3 sm:p-5 space-y-3">
          <button
            type="button"
            onClick={() => setVista("catalogo")}
            className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition"
          >
            ← Volver al catálogo
          </button>

          <SunmiCard>
            <SunmiHeader title="Mi Pedido" color="amber">
              <div className="text-[11px] text-slate-900/80 mt-1">
                {opciones.local.nombre} → {opciones.deposito.nombre}
              </div>
            </SunmiHeader>

            {error && (
              <div className="mb-3 text-[11px] text-red-400 bg-red-900/20 border border-red-500/40 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            {loadingCarrito ? (
              <div className="text-[12px] text-slate-400 py-4 text-center">
                Cargando carrito...
              </div>
            ) : carritoItems.length === 0 ? (
              <div className="text-[12px] text-slate-400 py-4 text-center">
                El carrito está vacío. Volvé al catálogo para agregar productos.
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {carritoItems.map((item) => (
                    <div
                      key={item.detalleId}
                      className="bg-slate-900/80 border border-slate-800 rounded-xl px-4 py-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium truncate">
                            {item.nombre}
                          </div>
                          {item.codigoBarra && (
                            <div className="text-[10px] text-slate-500">
                              {item.codigoBarra}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 ml-3">
                          <CantidadControl
                            value={carrito[item.productoLocalId] || item.sugerido}
                            factorPack={item.factorPack}
                            unidad={item.unidadSugerida}
                            onChange={(cant, uni) =>
                              setCantidad(item.productoLocalId, cant, uni)
                            }
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[10px] text-slate-500">
                          {item.unidadSugerida === "BULTO"
                            ? `Bulto (x${item.factorPack})`
                            : "Unidad"}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setCantidad(item.productoLocalId, 0, null)
                          }
                          className="text-[10px] text-red-400 hover:text-red-300"
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-4">
                  <SunmiButton
                    color="amber"
                    disabled={enviando || carritoItems.length === 0}
                    onClick={enviarPedido}
                  >
                    {enviando
                      ? "Enviando..."
                      : `Enviar pedido al depósito (${carritoItems.length} productos)`}
                  </SunmiButton>
                </div>
              </>
            )}
          </SunmiCard>
        </div>
      </div>
    );
  }

  // ====================================================
  // VISTA CATÁLOGO
  // ====================================================
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <div className="max-w-4xl mx-auto p-3 sm:p-5 space-y-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition"
        >
          ← Volver
        </button>

        <SunmiCard>
          <SunmiHeader title="Catálogo de Pedido" color="cyan">
            <div className="text-[11px] text-slate-900/80 mt-1">
              {opciones.local.nombre} → {opciones.deposito.nombre}
            </div>
          </SunmiHeader>

          {error && (
            <div className="mb-3 text-[11px] text-red-400 bg-red-900/20 border border-red-500/40 rounded-lg px-3 py-2">
              {error}
              <button
                type="button"
                className="ml-2 underline"
                onClick={() => setError("")}
              >
                cerrar
              </button>
            </div>
          )}

          {/* CARRITO FLOTANTE */}
          {carritoCount > 0 && (
            <div className="mb-3">
              <button
                type="button"
                onClick={abrirCarrito}
                className="
                  w-full
                  bg-amber-500/20 border border-amber-400/40
                  rounded-xl px-4 py-2.5
                  flex items-center justify-between
                  hover:border-amber-400/60 transition
                "
              >
                <span className="text-[13px] font-medium text-amber-300">
                  Ver mi pedido
                </span>
                <span className="text-[12px] bg-amber-500 text-slate-900 font-bold px-2.5 py-0.5 rounded-full">
                  {carritoCount}
                </span>
              </button>
            </div>
          )}

          {/* FILTROS */}
          <SunmiSeparator label="Buscar productos" />

          <div className="space-y-2">
            <SunmiInput
              placeholder="Buscar por nombre, código de barras, SKU..."
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <SunmiSelectAdv
                value={categoriaId}
                placeholder="Categoría"
                onChange={(v) => setCategoriaId(v)}
              >
                <div value="">Todas</div>
                {(opciones.categorias || []).map((c) => (
                  <div key={c.id} value={String(c.id)}>
                    {c.nombre}
                  </div>
                ))}
              </SunmiSelectAdv>

              <SunmiSelectAdv
                value={proveedorId}
                placeholder="Proveedor"
                onChange={(v) => setProveedorId(v)}
              >
                <div value="">Todos</div>
                {(opciones.proveedores || []).map((p) => (
                  <div key={p.id} value={String(p.id)}>
                    {p.nombre}
                  </div>
                ))}
              </SunmiSelectAdv>

              <SunmiSelectAdv
                value={areaId}
                placeholder="Área"
                onChange={(v) => setAreaId(v)}
              >
                <div value="">Todas</div>
                {(opciones.areas || []).map((a) => (
                  <div key={a.id} value={String(a.id)}>
                    {a.nombre}
                  </div>
                ))}
              </SunmiSelectAdv>
            </div>
          </div>

          {/* RESULTADOS */}
          <SunmiSeparator
            label={`Productos (${total})`}
          />

          {loadingCat ? (
            <div className="text-[12px] text-slate-400 py-4 text-center">
              Cargando productos...
            </div>
          ) : productos.length === 0 ? (
            <div className="text-[12px] text-slate-400 py-4 text-center">
              No se encontraron productos.
            </div>
          ) : (
            <div className="space-y-2">
              {productos.map((prod) => (
                <ProductoCard
                  key={prod.productoLocalId}
                  producto={prod}
                  cantidadActual={carrito[prod.productoLocalId] || 0}
                  onSetCantidad={(cant, uni) =>
                    setCantidad(prod.productoLocalId, cant, uni)
                  }
                />
              ))}
            </div>
          )}

          {/* PAGINACIÓN */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <SunmiButton
                color="slate"
                disabled={page <= 1 || loadingCat}
                onClick={() => cargarCatalogo(page - 1)}
              >
                ← Anterior
              </SunmiButton>
              <span className="text-[12px] text-slate-400">
                Página {page} de {totalPages}
              </span>
              <SunmiButton
                color="slate"
                disabled={page >= totalPages || loadingCat}
                onClick={() => cargarCatalogo(page + 1)}
              >
                Siguiente →
              </SunmiButton>
            </div>
          )}
        </SunmiCard>
      </div>
    </div>
  );
}

// ====================================================
// COMPONENTE: Tarjeta de producto
// ====================================================
function ProductoCard({ producto, cantidadActual, onSetCantidad }) {
  const {
    nombre,
    codigoBarra,
    imagenUrl,
    stockDeposito,
    factorPack,
    modoPedido,
    categoriaNombre,
    unidadMedida,
  } = producto;

  const unidadDefault = factorPack > 1 ? "BULTO" : "UNIDAD";

  return (
    <div
      className={`
        bg-slate-900/80 border rounded-xl px-4 py-3
        ${cantidadActual > 0 ? "border-amber-500/50" : "border-slate-800"}
        transition-colors
      `}
    >
      <div className="flex gap-3">
        {/* Imagen */}
        {imagenUrl ? (
          <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-slate-800">
            <img
              src={imagenUrl}
              alt={nombre}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="w-14 h-14 rounded-lg flex-shrink-0 bg-slate-800 flex items-center justify-center">
            <span className="text-[18px] text-slate-600">
              {nombre?.[0]?.toUpperCase() || "?"}
            </span>
          </div>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium truncate">{nombre}</div>

          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
            {codigoBarra && (
              <span className="text-[10px] text-slate-500">{codigoBarra}</span>
            )}
            {categoriaNombre && (
              <span className="text-[10px] text-cyan-400/70">
                {categoriaNombre}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1">
            <span className="text-[10px] text-slate-500">
              Stock dep.: {stockDeposito}{" "}
              {unidadMedida === "pack" ? "packs" : "u."}
            </span>
            {factorPack > 1 && (
              <span className="text-[10px] text-slate-500">
                Bulto x{factorPack}
              </span>
            )}
          </div>
        </div>

        {/* Control cantidad */}
        <div className="flex-shrink-0 flex items-center">
          <CantidadControl
            value={cantidadActual}
            factorPack={factorPack}
            unidad={unidadDefault}
            onChange={onSetCantidad}
          />
        </div>
      </div>
    </div>
  );
}

// ====================================================
// COMPONENTE: Control +/- cantidad
// ====================================================
function CantidadControl({ value, factorPack, unidad, onChange }) {
  const step = 1;

  const incrementar = () => {
    onChange(value + step, unidad);
  };

  const decrementar = () => {
    const next = value - step;
    onChange(next < 0 ? 0 : next, unidad);
  };

  if (value === 0) {
    return (
      <button
        type="button"
        onClick={() => onChange(1, unidad)}
        className="
          h-[32px] px-3
          rounded-lg
          bg-cyan-500/20 border border-cyan-400/40
          text-[12px] text-cyan-300 font-medium
          hover:bg-cyan-500/30 transition
        "
      >
        + Agregar
      </button>
    );
  }

  return (
    <div className="flex items-center gap-0 bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
      <button
        type="button"
        onClick={decrementar}
        className="h-[32px] w-[32px] flex items-center justify-center text-[16px] text-slate-300 hover:bg-slate-700 transition"
      >
        -
      </button>
      <div className="h-[32px] px-2 flex items-center justify-center min-w-[36px] text-[13px] font-bold text-amber-300">
        {value}
      </div>
      <button
        type="button"
        onClick={incrementar}
        className="h-[32px] w-[32px] flex items-center justify-center text-[16px] text-slate-300 hover:bg-slate-700 transition"
      >
        +
      </button>
    </div>
  );
}
