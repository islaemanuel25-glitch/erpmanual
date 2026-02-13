"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";

import BuscadorProductos from "@/components/pos-ventas/BuscadorProductos";
import CarritoVenta from "@/components/pos-ventas/CarritoVenta";
import FormaPago, { COMISION_PCT } from "@/components/pos-ventas/FormaPago";
import ModalPagoEfectivo from "@/components/pos-ventas/ModalPagoEfectivo";
import ModalTicket from "@/components/pos-ventas/ModalTicket";
import ModalDescuento from "@/components/pos-ventas/ModalDescuento";
import StatsDelDia from "@/components/pos-ventas/StatsDelDia";
import HistorialDia from "@/components/pos-ventas/HistorialDia";

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

  // Descuento
  const [descuento, setDescuento] = useState(0);
  const [descuentoInfo, setDescuentoInfo] = useState(null); // { tipo, valor }
  const [modalDescuento, setModalDescuento] = useState(false);

  // Modales
  const [modalEfectivo, setModalEfectivo] = useState(null); // { total, comision, formaPago }
  const [modalTicket, setModalTicket] = useState(null); // venta data para ticket
  const [datosPagoEfectivo, setDatosPagoEfectivo] = useState(null); // { pagaCon, vuelto }

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
  // Shortcuts de teclado
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleShortcut = (e) => {
      // No interceptar si esta escribiendo en un input
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      // No interceptar si hay modal abierto
      if (modalEfectivo || modalTicket || modalDescuento) return;

      switch (e.key) {
        case "F1":
          e.preventDefault();
          document.getElementById("buscar-producto")?.focus();
          break;
        case "F2":
          e.preventDefault();
          setFormaPago("efectivo");
          break;
        case "F3":
          e.preventDefault();
          setFormaPago("mercadopago");
          break;
        case "F4":
          e.preventDefault();
          setFormaPago("debito");
          break;
        case "F5":
          e.preventDefault();
          setFormaPago("credito");
          break;
        case "F10":
          e.preventDefault();
          if (carrito.length > 0 && !cobrando) {
            iniciarCobro();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [carrito, cobrando, formaPago, modalEfectivo, modalTicket, modalDescuento]);

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
    setDescuento(0);
    setDescuentoInfo(null);
    setErrorMsg("");
    setSuccessMsg("");
  }, []);

  // ---------------------------------------------------------------------------
  // Subtotal y totales
  // ---------------------------------------------------------------------------
  const subtotal = carrito.reduce(
    (acc, item) => acc + item.precio * item.cantidad,
    0
  );

  const tieneComision = ["mercadopago", "debito", "credito"].includes(formaPago);
  const comision = tieneComision ? (subtotal - descuento) * (COMISION_PCT / 100) : 0;
  const total = subtotal - descuento + comision;

  // ---------------------------------------------------------------------------
  // Descuento
  // ---------------------------------------------------------------------------
  const handleAplicarDescuento = (montoDescuento, tipo, valor) => {
    setDescuento(montoDescuento);
    setDescuentoInfo({ tipo, valor });
    setModalDescuento(false);
  };

  const handleQuitarDescuento = () => {
    setDescuento(0);
    setDescuentoInfo(null);
    setModalDescuento(false);
  };

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
  // Iniciar cobro: si es efectivo → mostrar modal, sino → cobrar directo
  // ---------------------------------------------------------------------------
  const iniciarCobro = () => {
    if (formaPago === "efectivo") {
      setModalEfectivo({ total, comision, formaPago });
    } else {
      ejecutarCobro({ formaPago, comision, total });
    }
  };

  // ---------------------------------------------------------------------------
  // Cobrar desde FormaPago (redirige a iniciarCobro)
  // ---------------------------------------------------------------------------
  const handleCobrar = ({ formaPago: fp, comision: com, total: tot }) => {
    if (fp === "efectivo") {
      setModalEfectivo({ total: tot, comision: com, formaPago: fp });
    } else {
      ejecutarCobro({ formaPago: fp, comision: com, total: tot });
    }
  };

  // ---------------------------------------------------------------------------
  // Confirmar pago efectivo desde modal
  // ---------------------------------------------------------------------------
  const handleConfirmarEfectivo = ({ pagaCon, vuelto }) => {
    setDatosPagoEfectivo({ pagaCon, vuelto });
    const datos = modalEfectivo;
    setModalEfectivo(null);
    ejecutarCobro(datos, { pagaCon, vuelto });
  };

  // ---------------------------------------------------------------------------
  // Ejecutar cobro real (API)
  // ---------------------------------------------------------------------------
  const ejecutarCobro = async (datos, pagoEfectivo = null) => {
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
          formaPago: datos.formaPago,
          descuento,
          comision: datos.comision,
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
        // Preparar datos del ticket
        const ventaTicket = {
          numero: data.numero,
          items: carrito.map((item) => ({
            nombre: item.nombre,
            precio: item.precio,
            cantidad: item.cantidad,
          })),
          subtotal,
          comision: datos.comision,
          descuento,
          total: datos.total,
          formaPago: datos.formaPago,
          vendedor: me?.nombre || "-",
          localNombre,
          pagaCon: pagoEfectivo?.pagaCon || null,
          vuelto: pagoEfectivo?.vuelto || null,
        };

        // Mostrar modal de ticket
        setModalTicket(ventaTicket);

        // Limpiar carrito
        setCarrito([]);
        setFormaPago("efectivo");
        setDescuento(0);
        setDescuentoInfo(null);
        setDatosPagoEfectivo(null);
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
  // Manejar opcion de ticket post-venta
  // ---------------------------------------------------------------------------
  const handleOpcionTicket = async (opcion) => {
    if (!modalTicket) return;

    if (opcion === "termica") {
      const { default: imprimirTicketTermico } = await import(
        "@/lib/pos-ventas/imprimirTicketTermico"
      );
      imprimirTicketTermico(modalTicket);
    } else if (opcion === "pdf") {
      const { default: generarTicketPDF } = await import(
        "@/lib/pos-ventas/generarTicketPDF"
      );
      generarTicketPDF(modalTicket);
    }

    setModalTicket(null);
    setSuccessMsg(`Venta #${modalTicket.numero} registrada correctamente.`);
  };

  const handleCerrarTicket = () => {
    const numero = modalTicket?.numero;
    setModalTicket(null);
    setSuccessMsg(`Venta #${numero} registrada correctamente.`);
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
        {/* Header compacto */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm text-amber-400 font-medium truncate">
              {localNombre || "Sin local"}
            </span>
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

        {/* Stats del dia */}
        <StatsDelDia localId={localActual} />

        {/* Layout responsive */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 lg:gap-3">
          <div className="flex flex-col gap-2 lg:gap-3">
            <BuscadorProductos
              localId={localActual}
              onAgregar={handleAgregar}
            />
            {/* Historial del dia */}
            <HistorialDia
              localId={localActual}
              onReimprimir={async (venta) => {
                const { default: imprimirTicketTermico } = await import(
                  "@/lib/pos-ventas/imprimirTicketTermico"
                );
                imprimirTicketTermico({
                  ...venta,
                  vendedor: me?.nombre || "-",
                  localNombre,
                });
              }}
            />
          </div>

          <div className="flex flex-col gap-2 lg:gap-3">
            <CarritoVenta
              items={carrito}
              onCantidadChange={handleCantidadChange}
              onEliminar={handleEliminar}
              onLimpiar={handleLimpiar}
              subtotal={subtotal}
              descuento={descuento}
              descuentoInfo={descuentoInfo}
              onAbrirDescuento={() => setModalDescuento(true)}
            />

            <FormaPago
              subtotal={subtotal}
              descuento={descuento}
              formaPago={formaPago}
              onFormaPagoChange={setFormaPago}
              onCobrar={handleCobrar}
              cobrando={cobrando}
              disabled={carrito.length === 0}
            />
          </div>
        </div>

        {/* Shortcuts ayuda - solo desktop */}
        <div className="hidden lg:block text-[10px] text-slate-500 text-center">
          F1: Buscar | F2: Efectivo | F3: MP | F4: Debito | F5: Credito | F10: Cobrar
        </div>
      </div>

      {/* Modal descuento */}
      {modalDescuento && (
        <ModalDescuento
          subtotal={subtotal}
          descuentoActual={descuentoInfo}
          onAplicar={handleAplicarDescuento}
          onQuitar={handleQuitarDescuento}
          onCancelar={() => setModalDescuento(false)}
        />
      )}

      {/* Modal pago efectivo */}
      {modalEfectivo && (
        <ModalPagoEfectivo
          total={modalEfectivo.total}
          onConfirmar={handleConfirmarEfectivo}
          onCancelar={() => setModalEfectivo(null)}
        />
      )}

      {/* Modal ticket post-venta */}
      {modalTicket && (
        <ModalTicket
          venta={modalTicket}
          onOpcion={handleOpcionTicket}
          onCerrar={handleCerrarTicket}
        />
      )}
    </div>
  );
}
