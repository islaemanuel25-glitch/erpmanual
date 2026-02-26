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

  // Pedido pendiente (Solicitado)
  const [pendiente, setPendiente] = useState(null);
  const [verDetallePendiente, setVerDetallePendiente] = useState(false);
  const [cancelandoPendiente, setCancelandoPendiente] = useState(false);

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
          if (json.needsContexto) {
            router.push("/inicio");
            return;
          }
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
        setPendiente(json.pendiente || null);

        // Reconstruir mapa de cantidades (siempre en unidades)
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
  const setCantidad = async (productoLocalId, cantidad, unidad = "UNIDAD") => {
    if (pendiente) {
      setError("Hay un pedido solicitado pendiente. Esperá a que el depósito lo procese o cancelalo.");
      return;
    }

    // Optimistic update (siempre en total unidades)
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
  // CANCELAR PEDIDO PENDIENTE
  // ====================================================
  const cancelarPendiente = async () => {
    if (!pendiente) return;
    if (!confirm("¿Cancelar el pedido solicitado? Se eliminarán todos los items.")) return;

    setCancelandoPendiente(true);
    try {
      const res = await fetch("/api/pos-transferencias/cancelar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posId: pendiente.posId }),
      });
      const json = await res.json();
      if (json.ok) {
        setPendiente(null);
        setVerDetallePendiente(false);
      } else {
        setError(json.error || "Error al cancelar pedido");
      }
    } catch (err) {
      console.error(err);
      setError("Error de conexión al cancelar");
    }
    setCancelandoPendiente(false);
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

            {pendiente && (
              <BannerPendiente
                pendiente={pendiente}
                verDetalle={verDetallePendiente}
                onToggleDetalle={() => setVerDetallePendiente((v) => !v)}
                onCancelar={cancelarPendiente}
                cancelando={cancelandoPendiente}
              />
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
                    <CarritoItemCard
                      key={item.detalleId}
                      item={item}
                      totalActual={carrito[item.productoLocalId] || item.sugerido}
                      onSetCantidad={(cant, uni) => setCantidad(item.productoLocalId, cant, uni)}
                    />
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

          {/* BANNER PEDIDO PENDIENTE */}
          {pendiente && (
            <BannerPendiente
              pendiente={pendiente}
              verDetalle={verDetallePendiente}
              onToggleDetalle={() => setVerDetallePendiente((v) => !v)}
              onCancelar={cancelarPendiente}
              cancelando={cancelandoPendiente}
            />
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
    categoriaNombre,
    unidadMedida,
    modoEnvio,
  } = producto;

  const bultoMode = modoEnvio === "SOLO_BULTO" && factorPack > 1;

  const labelBulto =
    unidadMedida === "cajon" ? "Cajón" :
    unidadMedida === "pack" ? "Pack" :
    unidadMedida === "caja" ? "Caja" :
    unidadMedida === "carton" ? "Cartón" :
    "Bulto";

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
              Stock dep.: {stockDeposito} u.
            </span>
            {bultoMode && (
              <span className="text-[10px] text-slate-500">
                {labelBulto} x{factorPack}
              </span>
            )}
          </div>
        </div>

        {/* Control +/- */}
        <div className="flex-shrink-0 flex items-center">
          <InputCantidad
            totalActual={cantidadActual}
            factorPack={factorPack}
            unidadMedida={unidadMedida}
            modoEnvio={modoEnvio}
            onChange={onSetCantidad}
          />
        </div>
      </div>

      {/* Info de bultos debajo */}
      {bultoMode && cantidadActual > 0 && (
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[10px] text-slate-500">
            = {cantidadActual} uds ({Math.floor(cantidadActual / factorPack)} {labelBulto.toLowerCase()}{cantidadActual / factorPack !== Math.floor(cantidadActual / factorPack) ? ` + ${cantidadActual % factorPack} sueltas` : ""})
          </span>
          <button
            type="button"
            onClick={() => onSetCantidad(0, "UNIDAD")}
            className="text-[10px] text-red-400 hover:text-red-300 flex-shrink-0"
          >
            Quitar
          </button>
        </div>
      )}
    </div>
  );
}

// ====================================================
// COMPONENTE: Input cantidad (mixto o simple)
// ====================================================
function InputCantidad({ totalActual, factorPack, onChange, mostrarAgregar = true, unidadMedida, modoEnvio }) {
  const bultoMode = modoEnvio === "SOLO_BULTO" && factorPack > 1;

  const labelBulto =
    unidadMedida === "cajon" ? "caj." :
    unidadMedida === "pack" ? "packs" :
    unidadMedida === "caja" ? "cajas" :
    unidadMedida === "carton" ? "cart." :
    "bultos";

  // Botón agregar
  if (totalActual === 0 && mostrarAgregar) {
    return (
      <button
        type="button"
        onClick={() => onChange(bultoMode ? factorPack : 1, "UNIDAD")}
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

  // BULTO mode: +/- en bultos completos
  if (bultoMode) {
    const bultos = Math.floor(totalActual / factorPack);
    return (
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-0 bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
          <button
            type="button"
            onClick={() => onChange(Math.max(0, (bultos - 1)) * factorPack, "UNIDAD")}
            className="h-[32px] w-[32px] flex items-center justify-center text-[16px] text-slate-300 hover:bg-slate-700 transition"
          >
            -
          </button>
          <div className="h-[32px] px-2 flex items-center justify-center min-w-[36px] text-[13px] font-bold text-amber-300">
            {bultos}
          </div>
          <button
            type="button"
            onClick={() => onChange((bultos + 1) * factorPack, "UNIDAD")}
            className="h-[32px] w-[32px] flex items-center justify-center text-[16px] text-slate-300 hover:bg-slate-700 transition"
          >
            +
          </button>
        </div>
        <span className="text-[11px] text-slate-400">{labelBulto}</span>
      </div>
    );
  }

  // UNIDAD mode: +/- en unidades
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-0 bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, totalActual - 1), "UNIDAD")}
          className="h-[32px] w-[32px] flex items-center justify-center text-[16px] text-slate-300 hover:bg-slate-700 transition"
        >
          -
        </button>
        <div className="h-[32px] px-2 flex items-center justify-center min-w-[36px] text-[13px] font-bold text-amber-300">
          {totalActual}
        </div>
        <button
          type="button"
          onClick={() => onChange(totalActual + 1, "UNIDAD")}
          className="h-[32px] w-[32px] flex items-center justify-center text-[16px] text-slate-300 hover:bg-slate-700 transition"
        >
          +
        </button>
      </div>
      <span className="text-[11px] text-slate-400">uds</span>
    </div>
  );
}

// ====================================================
// COMPONENTE: Item del carrito (vista pedido)
// ====================================================
function CarritoItemCard({ item, totalActual, onSetCantidad }) {
  const bultoMode = item.modoEnvio === "SOLO_BULTO" && item.factorPack > 1;
  const labelBulto =
    item.unidadMedida === "cajon" ? "caj." :
    item.unidadMedida === "pack" ? "packs" :
    item.unidadMedida === "caja" ? "cajas" :
    item.unidadMedida === "carton" ? "cart." :
    "bultos";

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl px-4 py-3">
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
        <button
          type="button"
          onClick={() => onSetCantidad(0, "UNIDAD")}
          className="text-[10px] text-red-400 hover:text-red-300 ml-3 flex-shrink-0"
        >
          Quitar
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <InputCantidad
          totalActual={totalActual}
          factorPack={item.factorPack}
          unidadMedida={item.unidadMedida}
          modoEnvio={item.modoEnvio}
          onChange={onSetCantidad}
          mostrarAgregar={false}
        />
        {bultoMode && totalActual > 0 && (
          <span className="text-[10px] text-slate-500 ml-2">
            = {totalActual} uds
          </span>
        )}
      </div>
    </div>
  );
}

// ====================================================
// COMPONENTE: Banner pedido pendiente (Solicitado)
// ====================================================
function BannerPendiente({ pendiente, verDetalle, onToggleDetalle, onCancelar, cancelando }) {
  const fecha = pendiente.solicitadoAt
    ? new Date(pendiente.solicitadoAt).toLocaleString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="mb-3 bg-amber-500/10 border border-amber-400/40 rounded-xl px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-amber-300">
            Pedido solicitado pendiente
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            POS #{pendiente.posId}
            {fecha && <> &middot; {fecha}</>}
            {" "}&middot; {pendiente.itemCount} producto{pendiente.itemCount !== 1 ? "s" : ""}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Esperá a que el depósito lo procese o cancelalo para hacer un pedido nuevo.
          </div>
        </div>
      </div>

      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={onToggleDetalle}
          className="text-[11px] text-cyan-400 hover:text-cyan-300 underline transition"
        >
          {verDetalle ? "Ocultar detalle" : "Ver detalle"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={cancelando}
          className="text-[11px] text-red-400 hover:text-red-300 underline transition disabled:opacity-50"
        >
          {cancelando ? "Cancelando..." : "Cancelar pedido"}
        </button>
      </div>

      {verDetalle && pendiente.items?.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-amber-400/20 pt-2">
          {pendiente.items.map((item, i) => {
            const isBulto = item.modoEnvio === "SOLO_BULTO" && item.factorPack > 1;
            const bultos = isBulto ? Math.floor(item.sugerido / item.factorPack) : 0;
            return (
              <div
                key={i}
                className="flex items-center justify-between text-[11px] text-slate-300"
              >
                <span className="truncate flex-1 min-w-0">{item.nombre}</span>
                <span className="ml-2 text-amber-300 font-medium whitespace-nowrap">
                  {isBulto
                    ? `${bultos} bulto${bultos !== 1 ? "s" : ""} (${item.sugerido} uds)`
                    : `${item.sugerido} unidad${item.sugerido !== 1 ? "es" : ""}`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
