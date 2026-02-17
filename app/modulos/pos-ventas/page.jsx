"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";

import BuscadorProductos from "@/components/pos-ventas/BuscadorProductos";
import CarritoVenta from "@/components/pos-ventas/CarritoVenta";
import FormaPago from "@/components/pos-ventas/FormaPago";
import ModalPagoEfectivo from "@/components/pos-ventas/ModalPagoEfectivo";
import ModalTicket from "@/components/pos-ventas/ModalTicket";
import ModalDescuento from "@/components/pos-ventas/ModalDescuento";
import ModalCanjePuntos from "@/components/pos-ventas/ModalCanjePuntos";
import ClientePickerFullscreen from "@/components/pos-ventas/ClientePickerFullscreen";
import ModalAperturaTurno from "@/components/pos-ventas/ModalAperturaTurno";
import ModalCierreTurno from "@/components/pos-ventas/ModalCierreTurno";
import StatsDelDia from "@/components/pos-ventas/StatsDelDia";
import HistorialDia from "@/components/pos-ventas/HistorialDia";
import { ClipboardList } from "lucide-react";

export default function PosVentasPage() {
  const router = useRouter();
  const { perfil: perfilCtx, cargando: cargandoCtx } = useUser();

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

  // Cliente
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [mostrarPickerCliente, setMostrarPickerCliente] = useState(false);

  // Descuento
  const [descuento, setDescuento] = useState(0);
  const [descuentoInfo, setDescuentoInfo] = useState(null); // { tipo, valor }
  const [modalDescuento, setModalDescuento] = useState(false);

  // Puntos de fidelidad
  const [saldoPuntos, setSaldoPuntos] = useState(0);
  const [puntosActivo, setPuntosActivo] = useState(false);
  const [puntosConfig, setPuntosConfig] = useState(null);
  const [puntosCanje, setPuntosCanje] = useState(0);
  const [descuentoPorPuntos, setDescuentoPorPuntos] = useState(0);
  const [modalCanjePuntos, setModalCanjePuntos] = useState(false);

  // Turno de caja
  const [turnoActual, setTurnoActual] = useState(undefined); // undefined=cargando, null=sin turno, object=turno
  const [mostrarCierre, setMostrarCierre] = useState(false);

  // Historial
  const [mostrarHistorial, setMostrarHistorial] = useState(false);

  // Info crédito cliente (fiado)
  const [creditoInfo, setCreditoInfo] = useState(null); // { limiteCredito, saldoActual }

  // Breakdown de última venta
  const [ultimoBreakdown, setUltimoBreakdown] = useState(null);

  // Modales
  const [modalEfectivo, setModalEfectivo] = useState(null); // { total, formaPago }
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
  // Verificar turno abierto
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!localActual || !me) return;
    const verificarTurno = async () => {
      try {
        const res = await fetch(
          `/api/pos-ventas/turnos/actual?localId=${localActual}`,
          { credentials: "include" }
        );
        const data = await res.json();
        setTurnoActual(data.ok && data.turno ? data.turno : null);
      } catch {
        setTurnoActual(null);
      }
    };
    verificarTurno();
  }, [localActual, me]);

  // ---------------------------------------------------------------------------
  // Cargar info crédito cuando hay cliente + fiado
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (formaPago !== "fiado" || !clienteSeleccionado || !localActual) {
      setCreditoInfo(null);
      return;
    }
    let cancelado = false;
    const cargar = async () => {
      try {
        const [resCliente, resCC] = await Promise.all([
          fetch(`/api/clientes/${clienteSeleccionado.id}?localId=${localActual}`, { credentials: "include" }),
          fetch(`/api/clientes/${clienteSeleccionado.id}/cuenta-corriente?localId=${localActual}`, { credentials: "include" }),
        ]);
        const dataCliente = await resCliente.json();
        const dataCC = await resCC.json();
        if (cancelado) return;
        setCreditoInfo({
          limiteCredito: dataCliente.ok ? dataCliente.cliente?.limiteCredito ?? null : null,
          saldoActual: dataCC.ok ? dataCC.saldo || 0 : 0,
        });
      } catch (err) {
        console.error("Error cargando info crédito:", err);
        if (!cancelado) setCreditoInfo(null);
      }
    };
    cargar();
    return () => { cancelado = true; };
  }, [formaPago, clienteSeleccionado, localActual]);

  // ---------------------------------------------------------------------------
  // Cargar puntos cuando hay cliente seleccionado
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!clienteSeleccionado || !localActual) {
      setSaldoPuntos(0);
      setPuntosActivo(false);
      setPuntosConfig(null);
      return;
    }
    let cancelado = false;
    const cargar = async () => {
      try {
        const res = await fetch(
          `/api/clientes/${clienteSeleccionado.id}/puntos?localId=${localActual}`,
          { credentials: "include" }
        );
        const data = await res.json();
        if (cancelado) return;
        if (data.ok) {
          setSaldoPuntos(data.saldo || 0);
          setPuntosActivo(!!data.activo);
          setPuntosConfig(data.config || null);
        } else {
          setSaldoPuntos(0);
          setPuntosActivo(false);
          setPuntosConfig(null);
        }
      } catch (err) {
        console.error("Error cargando puntos:", err);
        if (!cancelado) {
          setSaldoPuntos(0);
          setPuntosActivo(false);
          setPuntosConfig(null);
        }
      }
    };
    cargar();
    return () => { cancelado = true; };
  }, [clienteSeleccionado, localActual]);

  // ---------------------------------------------------------------------------
  // Shortcuts de teclado
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleShortcut = (e) => {
      // No interceptar si esta escribiendo en un input
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      // No interceptar si hay modal abierto
      if (modalEfectivo || modalTicket || modalDescuento || mostrarPickerCliente || mostrarHistorial) return;

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
        case "F6":
          e.preventDefault();
          setFormaPago("fiado");
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
  }, [carrito, cobrando, formaPago, modalEfectivo, modalTicket, modalDescuento, mostrarPickerCliente, mostrarHistorial]);

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
    setClienteSeleccionado(null);
    setCreditoInfo(null);
    setUltimoBreakdown(null);
    setPuntosCanje(0);
    setDescuentoPorPuntos(0);
    setSaldoPuntos(0);
    setPuntosActivo(false);
    setPuntosConfig(null);
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

  const total = subtotal - descuento - descuentoPorPuntos;

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
      setClienteSeleccionado(null);
      setErrorMsg("");
      setSuccessMsg("");
    }
  };

  const handleAbrirPickerCliente = () => {
    if (!localActual) {
      setErrorMsg("Seleccioná un local para elegir cliente.");
      return;
    }
    setErrorMsg("");
    setMostrarPickerCliente(true);
  };

  // ---------------------------------------------------------------------------
  // Verificar límite de crédito para fiado
  // ---------------------------------------------------------------------------
  const verificarLimiteCredito = async (fp, tot) => {
    if (fp !== "fiado" || !clienteSeleccionado) return true;

    try {
      const [resCliente, resCC, resLocal] = await Promise.all([
        fetch(`/api/clientes/${clienteSeleccionado.id}?localId=${localActual}`, { credentials: "include" }),
        fetch(`/api/clientes/${clienteSeleccionado.id}/cuenta-corriente?localId=${localActual}`, { credentials: "include" }),
        fetch(`/api/locales/${localActual}`, { credentials: "include" }),
      ]);

      const dataCliente = await resCliente.json();
      const dataCC = await resCC.json();
      const dataLocal = await resLocal.json();

      const limiteCredito = dataCliente.ok ? dataCliente.cliente?.limiteCredito : null;
      if (limiteCredito == null) return true;

      const saldo = dataCC.ok ? dataCC.saldo || 0 : 0;
      const nuevoTotal = saldo + tot;
      const limite = Number(limiteCredito);

      if (nuevoTotal > limite) {
        const politica = dataLocal.ok ? dataLocal.item?.politicaLimiteCredito : "ADVERTIR";

        if (politica === "BLOQUEAR") {
          setErrorMsg(`Límite de crédito excedido. Saldo actual: $${saldo.toFixed(2)}, límite: $${limite.toFixed(2)}`);
          return false;
        }

        // ADVERTIR
        return confirm(`El cliente excede su límite de crédito ($${limite.toFixed(2)}). Saldo actual: $${saldo.toFixed(2)}. ¿Confirmar igual?`);
      }
    } catch (err) {
      console.error("Error verificando límite de crédito:", err);
    }

    return true;
  };

  // ---------------------------------------------------------------------------
  // Iniciar cobro: si es efectivo → mostrar modal, sino → cobrar directo
  // ---------------------------------------------------------------------------
  const iniciarCobro = async () => {
    if (formaPago === "fiado" && !clienteSeleccionado) {
      setErrorMsg("Para venta fiado debés seleccionar un cliente.");
      return;
    }
    if (formaPago === "fiado") {
      const ok = await verificarLimiteCredito(formaPago, total);
      if (!ok) return;
    }
    if (formaPago === "efectivo") {
      setModalEfectivo({ total, formaPago });
    } else {
      ejecutarCobro({ formaPago, total });
    }
  };

  // ---------------------------------------------------------------------------
  // Cobrar desde FormaPago (redirige a iniciarCobro)
  // ---------------------------------------------------------------------------
  const handleCobrar = async ({ formaPago: fp, total: tot }) => {
    if (fp === "fiado" && !clienteSeleccionado) {
      setErrorMsg("Para venta fiado debés seleccionar un cliente.");
      return;
    }
    if (fp === "fiado") {
      const ok = await verificarLimiteCredito(fp, tot);
      if (!ok) return;
    }
    if (fp === "efectivo") {
      setModalEfectivo({ total: tot, formaPago: fp });
    } else {
      ejecutarCobro({ formaPago: fp, total: tot });
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
    setUltimoBreakdown(null);
    setCobrando(true);

    try {
      const res = await fetch("/api/pos-ventas/crear", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localId: localActual,
          clienteId: clienteSeleccionado?.id || null,
          turnoId: turnoActual?.id || null,
          formaPago: datos.formaPago,
          esFiado: datos.formaPago === "fiado",
          descuento,
          descuentoPorPuntos,
          puntosCanje,
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
        // Guardar breakdown del backend (si existe)
        const bd = data.breakdown || null;
        setUltimoBreakdown(bd);

        // Preparar datos del ticket
        const ventaTicket = {
          numero: data.numero,
          items: carrito.map((item) => ({
            nombre: item.nombre,
            precio: item.precio,
            cantidad: item.cantidad,
          })),
          subtotal: bd ? bd.subtotal : subtotal,
          descuento: bd ? bd.descuentoTotal : descuento,
          descuentoAutomatico: bd ? bd.descuentoAutomatico : 0,
          descuentoManual: bd ? bd.descuentoManual : descuento,
          total: bd ? bd.total : datos.total,
          formaPago: datos.formaPago,
          vendedor: me?.nombre || "-",
          cliente: clienteSeleccionado?.nombre || "Consumidor Final",
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
        setClienteSeleccionado(null);
        setDatosPagoEfectivo(null);
        setPuntosCanje(0);
        setDescuentoPorPuntos(0);
        setSaldoPuntos(0);
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
  // Guard de permisos
  if (cargandoCtx || loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <span className="text-sm text-slate-300">Cargando...</span>
      </div>
    );
  }

  const permisosPos = perfilCtx?.permisos || [];
  const esAdminPos = Array.isArray(permisosPos) && permisosPos.includes("*");
  if (!esAdminPos && !permisosPos.includes("pos.usar")) return <SinPermisos />;

  // ---------------------------------------------------------------------------
  // Sin turno abierto: modal apertura de caja
  // ---------------------------------------------------------------------------
  if (localActual && me && turnoActual === null) {
    return (
      <ModalAperturaTurno
        localId={localActual}
        vendedorNombre={me?.nombre || "-"}
        onApertura={(turno) => setTurnoActual(turno)}
      />
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
        {/* Header compacto con stats inline */}
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
            <div className="hidden sm:block border-l border-slate-700 pl-3 ml-1">
              <StatsDelDia localId={localActual} />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {me && (
              <span className="text-xs text-slate-400 hidden lg:inline">{me.nombre}</span>
            )}
            <button
              onClick={() => setMostrarHistorial(true)}
              className="text-[11px] bg-slate-700/60 hover:bg-slate-600/60 text-slate-300 px-2 py-1 rounded transition-colors flex items-center gap-1"
              title="Historial de ventas"
            >
              <ClipboardList size={14} />
              <span className="hidden sm:inline">Historial</span>
            </button>
            <button
              onClick={handleAbrirPickerCliente}
              className="text-[11px] bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 px-2 py-1 rounded transition-colors"
            >
              {clienteSeleccionado ? `Cliente: ${clienteSeleccionado.nombre}` : "Elegir cliente"}
            </button>
            {clienteSeleccionado && puntosActivo && saldoPuntos > 0 && (
              <button
                onClick={() => setModalCanjePuntos(true)}
                className={`text-[11px] px-2 py-1 rounded transition-colors ${
                  puntosCanje > 0
                    ? "bg-purple-500/30 text-purple-300 font-medium"
                    : "bg-purple-500/20 hover:bg-purple-500/30 text-purple-300"
                }`}
              >
                {puntosCanje > 0 ? `Puntos: -${puntosCanje}` : `Puntos: ${saldoPuntos}`}
              </button>
            )}
            {turnoActual && (
              <button
                onClick={() => setMostrarCierre(true)}
                className="text-[11px] bg-red-500/20 hover:bg-red-500/30 text-red-400 px-2 py-1 rounded transition-colors"
              >
                Cerrar Turno
              </button>
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

        {/* Info crédito cliente (fiado) */}
        {formaPago === "fiado" && clienteSeleccionado && creditoInfo && (
          <div className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200">
            {creditoInfo.limiteCredito == null ? (
              <span>Cliente sin límite de crédito</span>
            ) : (
              (() => {
                const disp = Number(creditoInfo.limiteCredito) - Number(creditoInfo.saldoActual);
                const fmt = (v) => v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                return (
                  <span className="flex flex-wrap gap-x-4 gap-y-1">
                    <span>Saldo: <strong>${fmt(Number(creditoInfo.saldoActual))}</strong></span>
                    <span>Límite: <strong>${fmt(Number(creditoInfo.limiteCredito))}</strong></span>
                    <span>Disponible: <strong>${fmt(Math.max(0, disp))}</strong></span>
                    {disp < 0 && <span className="text-red-400">Excedido por: <strong>${fmt(Math.abs(disp))}</strong></span>}
                  </span>
                );
              })()
            )}
          </div>
        )}

        {/* Stats mobile - solo visible en pantalla chica */}
        <div className="sm:hidden">
          <StatsDelDia localId={localActual} />
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
        {ultimoBreakdown && (
          <div className="rounded-md border border-slate-600/50 bg-slate-800/50 px-3 py-2 text-xs text-slate-300 space-y-1">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-mono">${Number(ultimoBreakdown.subtotal).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            {ultimoBreakdown.descuentoAutomatico > 0 && (
              <div className="flex justify-between text-emerald-400">
                <span>Descuento automatico</span>
                <span className="font-mono">-${Number(ultimoBreakdown.descuentoAutomatico).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}
            {ultimoBreakdown.descuentoManual > 0 && (
              <div className="flex justify-between text-emerald-400">
                <span>Descuento manual</span>
                <span className="font-mono">-${Number(ultimoBreakdown.descuentoManual).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-amber-400 border-t border-slate-600/50 pt-1">
              <span>Total</span>
              <span className="font-mono">${Number(ultimoBreakdown.total).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        )}

        {/* Layout responsive - sin historial inline */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 lg:gap-3">
          <div className="flex flex-col gap-2 lg:gap-3">
            <BuscadorProductos
              localId={localActual}
              onAgregar={handleAgregar}
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
              clienteSeleccionado={clienteSeleccionado}
              onAbrirCliente={handleAbrirPickerCliente}
            />

            <FormaPago
              subtotal={subtotal}
              descuento={descuento}
              descuentoPorPuntos={descuentoPorPuntos}
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
          F1: Buscar | F2: Efectivo | F3: MP | F4: Debito | F5: Credito | F6: Fiado | F10: Cobrar
        </div>
      </div>

      {/* Picker cliente full-screen */}
      {mostrarPickerCliente && (
        <ClientePickerFullscreen
          localId={localActual}
          onSeleccionar={(cliente) => {
            setClienteSeleccionado(cliente);
            setMostrarPickerCliente(false);
          }}
          onCerrar={() => setMostrarPickerCliente(false)}
        />
      )}

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

      {/* Modal canje puntos */}
      {modalCanjePuntos && clienteSeleccionado && (
        <ModalCanjePuntos
          saldo={saldoPuntos}
          pesoPorPunto={puntosConfig?.redencionJson?.pesoPorPunto || 0}
          canjeActual={puntosCanje}
          onCanjear={async (pts) => {
            try {
              const res = await fetch(`/api/clientes/${clienteSeleccionado.id}/puntos`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ puntos: pts, localId: localActual }),
              });
              const data = await res.json();
              if (data.ok) {
                setPuntosCanje(data.puntosUsados);
                setDescuentoPorPuntos(data.descuento);
                setSaldoPuntos(data.saldoNuevoEstimado);
                setModalCanjePuntos(false);
              } else {
                setErrorMsg(data.error || "Error canjeando puntos");
                setModalCanjePuntos(false);
              }
            } catch (err) {
              console.error("Error canjeando puntos:", err);
              setErrorMsg("Error de conexión al canjear puntos");
              setModalCanjePuntos(false);
            }
          }}
          onQuitar={() => {
            setPuntosCanje(0);
            setDescuentoPorPuntos(0);
            setModalCanjePuntos(false);
          }}
          onCancelar={() => setModalCanjePuntos(false)}
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

      {/* Modal historial */}
      {mostrarHistorial && (
        <HistorialDia
          localId={localActual}
          onCerrar={() => setMostrarHistorial(false)}
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
      )}

      {/* Modal cierre de turno */}
      {mostrarCierre && turnoActual && (
        <ModalCierreTurno
          turno={turnoActual}
          onCerrar={() => setMostrarCierre(false)}
          onCerrado={() => {
            setMostrarCierre(false);
            setTurnoActual(null);
          }}
        />
      )}
    </div>
  );
}
