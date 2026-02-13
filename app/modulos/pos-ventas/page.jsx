"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";

import BuscadorProductos from "@/components/pos-ventas/BuscadorProductos";
import CarritoVenta from "@/components/pos-ventas/CarritoVenta";
import FormaPago from "@/components/pos-ventas/FormaPago";

export default function PosVentasPage() {
  const router = useRouter();

  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Selector de local (para admin padre)
  const [locales, setLocales] = useState([]);
  const [localSeleccionado, setLocalSeleccionado] = useState(null);

  // Carrito
  const [carrito, setCarrito] = useState([]);
  const [formaPago, setFormaPago] = useState("efectivo");
  const [cobrando, setCobrando] = useState(false);

  // Local activo efectivo
  const localActual = localSeleccionado || me?.localId || null;
  const localNombre =
    locales.find((l) => l.id === localActual)?.nombre || "";

  // Admin sin local asignado
  const esAdmin = me?.esAdmin && !me?.localId;

  // ---------------------------------------------------------------------------
  // Cargar datos del usuario
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const cargar = async () => {
      try {
        const res = await fetch("/api/me", { credentials: "include" });
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        const data = await res.json();
        if (data.ok && data.user) {
          setMe(data.user);
          if (data.user.localId) {
            setLocalSeleccionado(data.user.localId);
          }
        } else {
          setErrorMsg("No se pudo obtener el usuario actual.");
        }
      } catch (err) {
        console.error("Error cargando usuario:", err);
        setErrorMsg("Error de conexion.");
      } finally {
        setLoading(false);
      }
    };
    cargar();
  }, [router]);

  // ---------------------------------------------------------------------------
  // Cargar locales disponibles (solo admin sin local)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!me) return;
    const cargarLocales = async () => {
      try {
        const res = await fetch("/api/locales/opciones", {
          credentials: "include",
        });
        const data = await res.json();
        if (data.ok) {
          setLocales(data.items || []);
        }
      } catch (err) {
        console.error("Error cargando locales:", err);
      }
    };
    cargarLocales();
  }, [me]);

  // ---------------------------------------------------------------------------
  // Agregar producto al carrito
  // ---------------------------------------------------------------------------
  const handleAgregar = useCallback((producto) => {
    setErrorMsg("");
    setSuccessMsg("");

    setCarrito((prev) => {
      const idx = prev.findIndex(
        (item) => item.productoBaseId === producto.productoBaseId
      );
      if (idx >= 0) {
        const next = [...prev];
        const nuevo = { ...next[idx] };
        if (nuevo.cantidad < producto.stock) {
          nuevo.cantidad += 1;
        }
        next[idx] = nuevo;
        return next;
      }

      return [
        ...prev,
        {
          productoBaseId: producto.productoBaseId,
          nombre: producto.nombre,
          precio: producto.precioVenta,
          cantidad: 1,
          stockMax: producto.stock,
        },
      ];
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Editar cantidad
  // ---------------------------------------------------------------------------
  const handleCantidadChange = useCallback((idx, nuevaCantidad) => {
    setCarrito((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], cantidad: nuevaCantidad };
      return next;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Eliminar item
  // ---------------------------------------------------------------------------
  const handleEliminar = useCallback((idx) => {
    setCarrito((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  // ---------------------------------------------------------------------------
  // Limpiar carrito
  // ---------------------------------------------------------------------------
  const handleLimpiar = useCallback(() => {
    setCarrito([]);
    setErrorMsg("");
    setSuccessMsg("");
  }, []);

  // ---------------------------------------------------------------------------
  // Subtotal
  // ---------------------------------------------------------------------------
  const subtotal = carrito.reduce(
    (acc, item) => acc + item.precio * item.cantidad,
    0
  );

  // ---------------------------------------------------------------------------
  // Cambiar local (admin) - limpiar carrito al cambiar
  // ---------------------------------------------------------------------------
  const handleCambiarLocal = (val) => {
    const id = Number(val);
    if (id && id !== localSeleccionado) {
      setLocalSeleccionado(id);
      setCarrito([]);
      setErrorMsg("");
      setSuccessMsg("");
    }
  };

  // ---------------------------------------------------------------------------
  // Cobrar y finalizar
  // ---------------------------------------------------------------------------
  const handleCobrar = async ({ formaPago: fp, comision, total }) => {
    if (!localActual) {
      setErrorMsg("No se detecto un local para operar.");
      return;
    }

    if (carrito.length === 0) {
      setErrorMsg("El carrito esta vacio.");
      return;
    }

    setErrorMsg("");
    setSuccessMsg("");
    setCobrando(true);

    try {
      const res = await fetch("/api/pos-ventas/crear", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localId: localActual,
          formaPago: fp,
          descuento: 0,
          comision,
          items: carrito.map((item) => ({
            productoBaseId: item.productoBaseId,
            nombre: item.nombre,
            precio: item.precio,
            cantidad: item.cantidad,
          })),
        }),
      });

      if (res.status === 401) {
        router.replace("/login");
        return;
      }

      const data = await res.json();
      if (data.ok) {
        setSuccessMsg(data.message || "Venta registrada correctamente.");
        setCarrito([]);
        setFormaPago("efectivo");
      } else {
        setErrorMsg(data.error || "Error al registrar la venta.");
      }
    } catch (err) {
      console.error("Error cobrando:", err);
      setErrorMsg("Error de conexion al cobrar.");
    } finally {
      setCobrando(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <span className="text-sm text-slate-300">Cargando...</span>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Admin padre sin local seleccionado: pantalla de seleccion
  // ---------------------------------------------------------------------------
  if (esAdmin && !localSeleccionado) {
    return (
      <div className="sunmi-bg w-full min-h-full flex items-center justify-center p-4">
        <SunmiCard className="w-full max-w-md p-4">
          <div className="text-center mb-4">
            <p className="text-sm text-slate-400 mt-1">
              Selecciona el local donde vas a operar
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-slate-400 mb-1 block">
                Local
              </label>
              <SunmiSelectAdv
                value=""
                placeholder="Seleccionar local..."
                onChange={handleCambiarLocal}
                className="w-full"
              >
                {locales.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nombre} {l.esDeposito ? "(Deposito)" : "(Local)"}
                  </option>
                ))}
              </SunmiSelectAdv>
            </div>
            <SunmiButton
              color="slate"
              onClick={() => router.push("/modulos")}
              className="w-full"
            >
              Volver
            </SunmiButton>
          </div>
        </SunmiCard>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render principal
  // ---------------------------------------------------------------------------
  return (
    <div className="sunmi-bg w-full min-h-full p-2 lg:p-3 pb-24 lg:pb-3">
      <div className="max-w-7xl mx-auto space-y-2 lg:space-y-3">
        {/* Header compacto - sin duplicar titulo del layout */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm text-amber-400 font-medium truncate">
              {localNombre || "Sin local"}
            </span>
            {/* Selector de local para admin */}
            {esAdmin && (
              <SunmiSelectAdv
                value={String(localSeleccionado || "")}
                onChange={handleCambiarLocal}
                className="!w-36 lg:!w-44"
              >
                {locales.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nombre}
                  </option>
                ))}
              </SunmiSelectAdv>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {me && (
              <span className="text-xs text-slate-400 hidden sm:inline">{me.nombre}</span>
            )}
            <SunmiButton
              color="slate"
              onClick={() => router.push("/modulos")}
              className="!text-xs !py-1"
            >
              Salir
            </SunmiButton>
          </div>
        </div>

        {/* Mensajes */}
        {errorMsg && (
          <div className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
            {successMsg}
          </div>
        )}

        {/* Layout responsive: 1 col mobile, 2 col desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 lg:gap-3">
          {/* COLUMNA IZQUIERDA - Buscador */}
          <BuscadorProductos
            localId={localActual}
            onAgregar={handleAgregar}
          />

          {/* COLUMNA DERECHA - Carrito + Pago */}
          <div className="flex flex-col gap-2 lg:gap-3">
            <CarritoVenta
              items={carrito}
              onCantidadChange={handleCantidadChange}
              onEliminar={handleEliminar}
              onLimpiar={handleLimpiar}
              subtotal={subtotal}
            />

            <FormaPago
              subtotal={subtotal}
              formaPago={formaPago}
              onFormaPagoChange={setFormaPago}
              onCobrar={handleCobrar}
              cobrando={cobrando}
              disabled={carrito.length === 0}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
