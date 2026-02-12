"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";

import BuscadorProductos from "@/components/pos-ventas/BuscadorProductos";
import CarritoVenta from "@/components/pos-ventas/CarritoVenta";
import FormaPago from "@/components/pos-ventas/FormaPago";

export default function PosVentasPage() {
  const router = useRouter();

  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Carrito
  const [carrito, setCarrito] = useState([]);
  const [formaPago, setFormaPago] = useState("efectivo");
  const [cobrando, setCobrando] = useState(false);

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
  // Agregar producto al carrito
  // ---------------------------------------------------------------------------
  const handleAgregar = useCallback((producto) => {
    setErrorMsg("");
    setSuccessMsg("");

    setCarrito((prev) => {
      // Si ya existe, incrementar cantidad
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

      // Nuevo item
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
  // Cobrar y finalizar
  // ---------------------------------------------------------------------------
  const handleCobrar = async ({ formaPago: fp, comision, total }) => {
    if (!me?.localId) {
      setErrorMsg("No se detecto un local asignado al usuario.");
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
          localId: me.localId,
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
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="sunmi-bg w-full min-h-full p-2">
      <div className="max-w-7xl mx-auto space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-sm md:text-base font-semibold">
            POS Ventas
          </h1>
          <div className="flex items-center gap-2">
            {me && (
              <span className="text-xs text-slate-400">
                {me.nombre}
              </span>
            )}
            <SunmiButton
              color="slate"
              onClick={() => router.push("/modulos")}
              className="!text-xs"
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

        {/* Layout 2 columnas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* COLUMNA IZQUIERDA - Buscador */}
          <BuscadorProductos
            localId={me?.localId}
            onAgregar={handleAgregar}
          />

          {/* COLUMNA DERECHA - Carrito + Pago */}
          <div className="flex flex-col gap-3">
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
