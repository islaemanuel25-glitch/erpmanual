"use client";

import { useEffect, useState, useCallback, useReducer, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiButton from "@/components/sunmi/SunmiButton";
import useContextoActivo from "@/hooks/useContextoActivo";
import { showError, showSuccess } from "@/components/sunmi/SunmiToast";
import { posVentaReducer, initialState, ActionTypes } from "./reducer/posVentaReducer";
import { loadQueue, saveQueue, enqueue, dequeueById, getQueueLength, clearQueue } from "./helpers/offlineQueue";

import BuscadorProductos from "@/components/pos-ventas/BuscadorProductos";
import CarritoVenta from "@/components/pos-ventas/CarritoVenta";
import FormaPago from "@/components/pos-ventas/FormaPago";
import ModalPagoEfectivo from "@/components/pos-ventas/ModalPagoEfectivo";
import ModalTicket from "@/components/pos-ventas/ModalTicket";
import ModalTicketOffline from "@/components/pos-ventas/ModalTicketOffline";
import ModalDescuento from "@/components/pos-ventas/ModalDescuento";
import ModalCanjePuntos from "@/components/pos-ventas/ModalCanjePuntos";
import ClientePickerFullscreen from "@/components/pos-ventas/ClientePickerFullscreen";
import ModalAperturaTurno from "@/components/pos-ventas/ModalAperturaTurno";
import ModalCierreTurno from "@/components/pos-ventas/ModalCierreTurno";
import ModalConfirmacion from "@/components/pos-ventas/ModalConfirmacion";
import ModalPendientesOffline from "@/components/pos-ventas/ModalPendientesOffline";
import StatsDelDia from "@/components/pos-ventas/StatsDelDia";
import HistorialDia from "@/components/pos-ventas/HistorialDia";
import { ClipboardList } from "lucide-react";

export default function PosVentasPage() {
  const router = useRouter();
  const { perfil: perfilCtx, cargando: cargandoCtx } = useUser();

  // Contexto global (local activo)
  const { loading: cargandoContexto, contexto, needsContexto } = useContextoActivo();

  // Estado del POS con reducer
  const [state, dispatch] = useReducer(posVentaReducer, initialState);

  // Estados que NO van al reducer (UI, loading, datos externos)
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [mostrarPickerCliente, setMostrarPickerCliente] = useState(false);
  const [turnoActual, setTurnoActual] = useState(undefined); // undefined=cargando, null=sin turno, object=turno
  const [mostrarCierre, setMostrarCierre] = useState(false);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);
  const [creditoInfo, setCreditoInfo] = useState(null); // { limiteCredito, saldoActual }
  const [ultimoBreakdown, setUltimoBreakdown] = useState(null);
  const [datosPagoEfectivo, setDatosPagoEfectivo] = useState(null); // { pagaCon, vuelto }
  const [puntosActivo, setPuntosActivo] = useState(false);
  const [puntosConfig, setPuntosConfig] = useState(null);
  
  // Estado offline
  const [offlineMode, setOfflineMode] = useState(false);
  const [queueLength, setQueueLength] = useState(0);
  const [procesandoCola, setProcesandoCola] = useState(false);
  const [ultimoTicketOffline, setUltimoTicketOffline] = useState(null);
  const [mostrarPendientesOffline, setMostrarPendientesOffline] = useState(false);
  const [offlineQueueSnapshot, setOfflineQueueSnapshot] = useState([]);
  const prevOfflineModeRef = useRef(false);

  // Desestructurar estado del reducer
  const {
    carrito,
    formaPago,
    clienteSeleccionado,
    descuento,
    descuentoInfo,
    puntosCanje,
    descuentoPorPuntos,
    saldoPuntos,
    modalDescuento,
    modalCanjePuntos,
    modalEfectivo,
    modalTicket,
    modalConfirmacion,
    cobrando,
  } = state;

  // Local activo efectivo (del contexto global)
  const localActual = contexto?.localId || null;
  const localNombre = contexto?.nombre || "";
  
  // Obtener grupoId del contexto (necesario para cola offline)
  const [grupoId, setGrupoId] = useState(null);
  useEffect(() => {
    if (localActual) {
      fetch(`/api/locales/${localActual}`, { credentials: "include" })
        .then((res) => res.json())
        .then((data) => {
          if (data.ok && data.item?.grupoId) {
            setGrupoId(data.item.grupoId);
          }
        })
        .catch(() => {});
    }
  }, [localActual]);

  // ---------------------------------------------------------------------------
  // Detector de conectividad
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let heartbeatInterval = null;
    let isMounted = true;

    const checkConnectivity = async () => {
      // Primera verificación: navigator.onLine
      if (!navigator.onLine) {
        if (isMounted) setOfflineMode(true);
        return;
      }

      // Segunda verificación: heartbeat al servidor
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        
        const res = await fetch("/api/test", {
          method: "GET",
          credentials: "include",
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (isMounted) {
          setOfflineMode(!res.ok);
        }
      } catch (err) {
        // Error de red o timeout
        if (isMounted) setOfflineMode(true);
      }
    };

    // Verificación inicial
    checkConnectivity();

    // Heartbeat cada 10 segundos
    heartbeatInterval = setInterval(checkConnectivity, 10000);

    // Listeners de eventos de navegador
    const handleOnline = () => {
      checkConnectivity();
    };
    const handleOffline = () => {
      if (isMounted) setOfflineMode(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      isMounted = false;
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Cargar longitud de cola al montar y cuando cambia offlineMode
  // ---------------------------------------------------------------------------
  useEffect(() => {
    setQueueLength(getQueueLength());
  }, [offlineMode]);

  // ---------------------------------------------------------------------------
  // Forzar efectivo cuando se detecta offline y cerrar modales peligrosos
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (offlineMode) {
      // Forzar forma de pago a efectivo
      if (state.formaPago !== "efectivo") {
        dispatch({ type: ActionTypes.SET_FORMA_PAGO, payload: "efectivo" });
      }
      
      // Cerrar modales peligrosos
      if (state.modalCanjePuntos) {
        dispatch({ type: ActionTypes.CLOSE_MODAL, payload: { modal: "modalCanjePuntos" } });
      }
      
      // Limpiar puntos canjeados si había
      if (state.puntosCanje > 0) {
        dispatch({ type: ActionTypes.REMOVE_PUNTOS });
      }
    }
  }, [offlineMode]);

  // ---------------------------------------------------------------------------
  // Toasts cuando cambia el estado de conectividad
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const prevOffline = prevOfflineModeRef.current;
    
    if (prevOffline !== offlineMode) {
      if (offlineMode) {
        // Cambió de online → offline
        showError("Sin conexión: ventas en efectivo se guardan como pendientes.");
      } else {
        // Cambió de offline → online
        showSuccess("Conexión restaurada: podés procesar pendientes.");
      }
      prevOfflineModeRef.current = offlineMode;
    }
  }, [offlineMode]);

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
          const msg = "No se pudo obtener el usuario actual.";
          setErrorMsg(msg);
          showError(msg);
        }
      } catch (err) {
        console.error("Error cargando usuario:", err);
        const msg = "Error de conexion.";
        setErrorMsg(msg);
        showError(msg);
      } finally {
        setLoading(false);
      }
    };
    cargar();
  }, [router]);

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
    if (state.formaPago !== "fiado" || !state.clienteSeleccionado || !localActual) {
      setCreditoInfo(null);
      return;
    }
    let cancelado = false;
    const cargar = async () => {
      try {
        const [resCliente, resCC] = await Promise.all([
          fetch(`/api/clientes/${state.clienteSeleccionado.id}?localId=${localActual}`, { credentials: "include" }),
          fetch(`/api/clientes/${state.clienteSeleccionado.id}/cuenta-corriente?localId=${localActual}`, { credentials: "include" }),
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
  }, [state.formaPago, state.clienteSeleccionado, localActual]);

  // ---------------------------------------------------------------------------
  // Cargar puntos cuando hay cliente seleccionado
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!state.clienteSeleccionado || !localActual) {
      dispatch({ type: ActionTypes.SET_SALDO_PUNTOS, payload: 0 });
      setPuntosActivo(false);
      setPuntosConfig(null);
      return;
    }
    let cancelado = false;
    const cargar = async () => {
      try {
        const res = await fetch(
          `/api/clientes/${state.clienteSeleccionado.id}/puntos?localId=${localActual}`,
          { credentials: "include" }
        );
        const data = await res.json();
        if (cancelado) return;
        if (data.ok) {
          dispatch({ type: ActionTypes.SET_SALDO_PUNTOS, payload: data.saldo || 0 });
          setPuntosActivo(!!data.activo);
          setPuntosConfig(data.config || null);
        } else {
          dispatch({ type: ActionTypes.SET_SALDO_PUNTOS, payload: 0 });
          setPuntosActivo(false);
          setPuntosConfig(null);
        }
      } catch (err) {
        console.error("Error cargando puntos:", err);
        if (!cancelado) {
          dispatch({ type: ActionTypes.SET_SALDO_PUNTOS, payload: 0 });
          setPuntosActivo(false);
          setPuntosConfig(null);
        }
      }
    };
    cargar();
    return () => { cancelado = true; };
  }, [state.clienteSeleccionado, localActual]);

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
          dispatch({ type: ActionTypes.SET_FORMA_PAGO, payload: "efectivo" });
          break;
        case "F3":
          e.preventDefault();
          dispatch({ type: ActionTypes.SET_FORMA_PAGO, payload: "mercadopago" });
          break;
        case "F4":
          e.preventDefault();
          dispatch({ type: ActionTypes.SET_FORMA_PAGO, payload: "debito" });
          break;
        case "F5":
          e.preventDefault();
          dispatch({ type: ActionTypes.SET_FORMA_PAGO, payload: "credito" });
          break;
        case "F6":
          e.preventDefault();
          dispatch({ type: ActionTypes.SET_FORMA_PAGO, payload: "fiado" });
          break;
        case "F10":
          e.preventDefault();
          if (state.carrito.length > 0 && !state.cobrando) {
            iniciarCobro();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [state.carrito, state.cobrando, state.formaPago, state.modalEfectivo, state.modalTicket, state.modalDescuento, mostrarPickerCliente, mostrarHistorial]);

  // ---------------------------------------------------------------------------
  // Agregar producto al carrito
  // ---------------------------------------------------------------------------
  const handleAgregar = useCallback((producto) => {
    setErrorMsg("");
    setSuccessMsg("");
    dispatch({ type: ActionTypes.ADD_ITEM, payload: { producto } });
  }, []);

  // ---------------------------------------------------------------------------
  // Editar cantidad
  // ---------------------------------------------------------------------------
  const handleCantidadChange = useCallback((idx, nuevaCantidad) => {
    dispatch({ type: ActionTypes.UPDATE_CANTIDAD, payload: { idx, nuevaCantidad } });
  }, []);

  // ---------------------------------------------------------------------------
  // Eliminar item
  // ---------------------------------------------------------------------------
  const handleEliminar = useCallback((idx) => {
    dispatch({ type: ActionTypes.REMOVE_ITEM, payload: { idx } });
  }, []);

  // ---------------------------------------------------------------------------
  // Limpiar carrito
  // ---------------------------------------------------------------------------
  const handleLimpiar = useCallback(() => {
    dispatch({ type: ActionTypes.CLEAR_CART });
    setCreditoInfo(null);
    setUltimoBreakdown(null);
    setPuntosActivo(false);
    setPuntosConfig(null);
    setErrorMsg("");
    setSuccessMsg("");
  }, []);

  // ---------------------------------------------------------------------------
  // Subtotal y totales
  // ---------------------------------------------------------------------------
  const subtotal = state.carrito.reduce(
    (acc, item) => acc + item.precio * (Number(item.cantidad) || 0),
    0
  );

  const total = subtotal - state.descuento - state.descuentoPorPuntos;

  // ---------------------------------------------------------------------------
  // Descuento
  // ---------------------------------------------------------------------------
  const handleAplicarDescuento = (montoDescuento, tipo, valor) => {
    dispatch({ type: ActionTypes.SET_DESCUENTO, payload: { montoDescuento, tipo, valor } });
  };

  const handleQuitarDescuento = () => {
    dispatch({ type: ActionTypes.REMOVE_DESCUENTO });
  };

  const handleAbrirDescuento = useCallback(() => {
    dispatch({ type: ActionTypes.OPEN_MODAL, payload: { modal: "modalDescuento" } });
  }, []);

  const handleAbrirPickerCliente = useCallback(() => {
    if (!localActual) {
      const msg = "No hay contexto operativo activo.";
      setErrorMsg(msg);
      showError(msg);
      return;
    }
    setErrorMsg("");
    setMostrarPickerCliente(true);
  }, [localActual]);

  const handleSeleccionarCliente = useCallback((cliente) => {
    dispatch({ type: ActionTypes.SET_CLIENTE, payload: cliente });
    setMostrarPickerCliente(false);
  }, []);

  const handleFormaPagoChange = useCallback((fp) => {
    // Bloquear cambio a formas de pago no efectivo cuando offline
    if (offlineMode && fp !== "efectivo") {
      showError("Sin internet: solo efectivo disponible");
      return;
    }
    dispatch({ type: ActionTypes.SET_FORMA_PAGO, payload: fp });
  }, [offlineMode]);

  // ---------------------------------------------------------------------------
  // Guardar venta en cola offline
  // ---------------------------------------------------------------------------
  const guardarVentaPendiente = useCallback((datos, pagoEfectivo = null) => {
    // Validación crítica: solo efectivo en modo offline
    if (datos.formaPago !== "efectivo") {
      const msg = "Sin internet: solo se puede guardar ventas en efectivo";
      setErrorMsg(msg);
      showError(msg);
      return;
    }

    if (!localActual || !grupoId || !me?.id) {
      const msg = "Faltan datos para guardar venta pendiente.";
      setErrorMsg(msg);
      showError(msg);
      return;
    }

    if (state.carrito.length === 0) {
      const msg = "El carrito esta vacio.";
      setErrorMsg(msg);
      showError(msg);
      return;
    }

    // Validar cantidades antes de guardar
    const itemInvalidoOffline = state.carrito.find(
      (item) => item.cantidad === "" || item.cantidad === null || isNaN(Number(item.cantidad)) || Number(item.cantidad) <= 0
    );
    if (itemInvalidoOffline) {
      const msg = `Cantidad invalida en "${itemInvalidoOffline.nombre}". Revisa el carrito.`;
      setErrorMsg(msg);
      showError(msg);
      return;
    }

    // Generar clientVentaId único
    const clientVentaId = typeof crypto !== "undefined" && crypto.randomUUID 
      ? crypto.randomUUID() 
      : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const ventaPendiente = {
      clientVentaId,
      createdAt: Date.now(),
      localId: localActual,
      grupoId,
      userId: me.id,
      formaPago: datos.formaPago,
      subtotal: subtotal,
      descuento: state.descuento,
      descuentoPorPuntos: state.descuentoPorPuntos,
      total: datos.total,
      clienteId: state.clienteSeleccionado?.id || null,
      items: state.carrito.map((item) => ({
        productoBaseId: item.productoBaseId,
        nombre: item.nombre,
        precio: item.precio,
        cantidad: item.cantidad,
      })),
    };

    enqueue(ventaPendiente);
    const nuevaLongitud = getQueueLength();
    setQueueLength(nuevaLongitud);

    // Preparar datos del ticket offline
    const ticketOffline = {
      clientVentaId: clientVentaId,
      clientVentaIdCorto: clientVentaId.slice(-8).toUpperCase(),
      createdAt: Date.now(),
      localId: localActual,
      localNombre: localNombre || `Local ${localActual}`,
      vendedor: me?.nombre || me?.email || "-",
      formaPago: datos.formaPago,
      cliente: state.clienteSeleccionado?.nombre || "Consumidor Final",
      items: state.carrito.map((item) => ({
        nombre: item.nombre,
        precio: item.precio,
        cantidad: item.cantidad,
      })),
      subtotal: subtotal,
      descuento: state.descuento,
      descuentoPorPuntos: state.descuentoPorPuntos,
      total: datos.total,
      pagaCon: pagoEfectivo?.pagaCon || null,
      vuelto: pagoEfectivo?.vuelto || null,
    };

    // Guardar ticket offline y mostrarlo
    setUltimoTicketOffline(ticketOffline);

    // Limpiar carrito
    dispatch({ type: ActionTypes.CLEAR_CART });
    dispatch({ type: ActionTypes.SET_FORMA_PAGO, payload: "efectivo" });
    setDatosPagoEfectivo(null);
    dispatch({ type: ActionTypes.SET_SALDO_PUNTOS, payload: 0 });

    showSuccess("Venta guardada offline. Ticket generado.");
    setSuccessMsg(`Venta guardada pendiente. Total en cola: ${nuevaLongitud}`);
  }, [localActual, grupoId, me, state.carrito, state.descuento, state.descuentoPorPuntos, state.clienteSeleccionado, subtotal, localNombre]);

  // ---------------------------------------------------------------------------
  // Procesar cola offline
  // ---------------------------------------------------------------------------
  const procesarCola = useCallback(async () => {
    if (offlineMode || procesandoCola) return;

    if (!turnoActual?.id) {
      showError("Abrí turno para procesar ventas pendientes");
      return;
    }

    const queue = loadQueue();
    if (queue.length === 0) {
      showSuccess("No hay ventas pendientes para procesar");
      return;
    }

    setProcesandoCola(true);
    setErrorMsg("");
    setSuccessMsg("");

    let procesadas = 0;
    let errores = 0;

    for (const ventaPendiente of queue) {
      try {
        const res = await fetch("/api/pos-ventas/crear", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientTxnId: ventaPendiente.clientVentaId,
            localId: ventaPendiente.localId,
            clienteId: ventaPendiente.clienteId,
            turnoId: turnoActual?.id || null,
            formaPago: ventaPendiente.formaPago,
            esFiado: ventaPendiente.formaPago === "fiado",
            descuento: ventaPendiente.descuento,
            descuentoPorPuntos: ventaPendiente.descuentoPorPuntos,
            puntosCanje: 0, // No guardamos puntos en cola offline
            items: ventaPendiente.items,
          }),
        });

        const data = await res.json();

        if (data.ok || data.isDuplicate) {
          // Éxito o duplicado (ya procesada) → eliminar de cola
          dequeueById(ventaPendiente.clientVentaId);
          procesadas++;
          showSuccess(`Venta procesada #${data.numero || "N/A"}`);
          if (data.allowNegativeStockUsed) {
            setSuccessMsg((prev) => (prev ? `${prev} — ` : "") + "Advertencia: venta con stock negativo (carga inicial).");
          }
        } else {
          // Error → cortar procesamiento
          errores++;
          const msg = data.error || "Error al procesar venta pendiente";
          showError(msg);
          setErrorMsg(`Error procesando cola: ${msg}`);
          break; // Cortar y dejar el resto
        }
      } catch (err) {
        console.error("Error procesando venta pendiente:", err);
        errores++;
        showError("Error de conexión al procesar cola");
        setErrorMsg("Error de conexión. Reintenta más tarde.");
        break; // Cortar y dejar el resto
      }
    }

    const nuevaLongitud = getQueueLength();
    setQueueLength(nuevaLongitud);
    setProcesandoCola(false);

    if (procesadas > 0) {
      showSuccess(`${procesadas} venta(s) procesada(s) correctamente`);
      setSuccessMsg(`${procesadas} venta(s) procesada(s). ${nuevaLongitud} pendiente(s)`);
    }
  }, [offlineMode, procesandoCola, turnoActual]);

  // ---------------------------------------------------------------------------
  // Gestión de pendientes offline (modal)
  // ---------------------------------------------------------------------------
  const refrescarPendientesOffline = useCallback(() => {
    const q = loadQueue();
    setOfflineQueueSnapshot(q);
    setQueueLength(q.length);
  }, []);

  const handleAbrirPendientes = useCallback(() => {
    refrescarPendientesOffline();
    setMostrarPendientesOffline(true);
  }, [refrescarPendientesOffline]);

  const handleEliminarPendiente = useCallback((clientVentaId) => {
    dequeueById(clientVentaId);
    refrescarPendientesOffline();
  }, [refrescarPendientesOffline]);

  const handleVaciarPendientes = useCallback(() => {
    clearQueue();
    refrescarPendientesOffline();
  }, [refrescarPendientesOffline]);

  const handleImprimirPendiente = useCallback((item) => {
    const ticket = {
      clientVentaId: item.clientVentaId,
      clientVentaIdCorto: (item.clientVentaId || "").slice(-8).toUpperCase(),
      createdAt: item.createdAt,
      localId: item.localId,
      localNombre: item.localNombre || `Local ${item.localId}`,
      vendedor: item.vendedor || item.userNombre || item.userEmail || me?.nombre || me?.email || "-",
      formaPago: item.formaPago,
      cliente: item.clienteNombre || "Consumidor Final",
      items: (item.items || []).map((it) => ({
        nombre: it.nombre ?? it.productoNombre ?? it.descripcion ?? "-",
        cantidad: Number(it.cantidad ?? it.qty ?? 0),
        precio: Number(it.precio ?? it.precioUnitario ?? it.unitPrice ?? 0),
      })),
      subtotal: item.subtotal,
      descuento: item.descuento,
      descuentoPorPuntos: item.descuentoPorPuntos,
      total: item.total,
      pagaCon: item.pagaCon ?? null,
      vuelto: item.vuelto ?? null,
    };
    setUltimoTicketOffline(ticket);
  }, [me]);

  const handleProcesarColaDesdeModal = useCallback(async () => {
    await procesarCola();
    refrescarPendientesOffline();
  }, [procesarCola, refrescarPendientesOffline]);

  // ---------------------------------------------------------------------------
  // Verificar límite de crédito para fiado
  // ---------------------------------------------------------------------------
  const verificarLimiteCredito = async (fp, tot) => {
    if (fp !== "fiado" || !state.clienteSeleccionado) return true;

    try {
      const [resCliente, resCC, resLocal] = await Promise.all([
        fetch(`/api/clientes/${state.clienteSeleccionado.id}?localId=${localActual}`, { credentials: "include" }),
        fetch(`/api/clientes/${state.clienteSeleccionado.id}/cuenta-corriente?localId=${localActual}`, { credentials: "include" }),
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
          const msg = `Límite de crédito excedido. Saldo actual: $${saldo.toFixed(2)}, límite: $${limite.toFixed(2)}`;
          setErrorMsg(msg);
          showError(msg);
          return false;
        }

        // ADVERTIR - usar modal de confirmación
        return new Promise((resolve) => {
          dispatch({
            type: ActionTypes.OPEN_MODAL,
            payload: {
              modal: "modalConfirmacion",
              data: {
                mensaje: `El cliente excede su límite de crédito ($${limite.toFixed(2)}). Saldo actual: $${saldo.toFixed(2)}. ¿Confirmar igual?`,
                onConfirmar: () => {
                  dispatch({ type: ActionTypes.CLOSE_MODAL, payload: { modal: "modalConfirmacion" } });
                  resolve(true);
                },
                onCancelar: () => {
                  dispatch({ type: ActionTypes.CLOSE_MODAL, payload: { modal: "modalConfirmacion" } });
                  resolve(false);
                },
              },
            },
          });
        });
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
    // Bloquear cobro con formas de pago no efectivo cuando offline
    if (offlineMode && state.formaPago !== "efectivo") {
      showError("Sin internet: solo se puede guardar ventas en efectivo");
      return;
    }

    if (state.formaPago === "fiado" && !state.clienteSeleccionado) {
      const msg = "Para venta fiado debés seleccionar un cliente.";
      setErrorMsg(msg);
      showError(msg);
      return;
    }
    if (state.formaPago === "fiado") {
      const ok = await verificarLimiteCredito(state.formaPago, total);
      if (!ok) return;
    }
    if (state.formaPago === "efectivo") {
      dispatch({ type: ActionTypes.OPEN_MODAL, payload: { modal: "modalEfectivo", data: { total, formaPago: state.formaPago } } });
    } else {
      ejecutarCobro({ formaPago: state.formaPago, total });
    }
  };

  // ---------------------------------------------------------------------------
  // Cobrar desde FormaPago (redirige a iniciarCobro)
  // ---------------------------------------------------------------------------
  const handleCobrar = async ({ formaPago: fp, total: tot }) => {
    // Bloquear cobro sin turno abierto (excepto offline que guarda pendiente)
    if (!turnoActual?.id && !offlineMode) {
      showError("Abrí turno para registrar ventas");
      return;
    }

    // Bloquear cobro con formas de pago no efectivo cuando offline
    if (offlineMode && fp !== "efectivo") {
      showError("Sin internet: solo se puede guardar ventas en efectivo");
      return;
    }

    if (fp === "fiado" && !state.clienteSeleccionado) {
      const msg = "Para venta fiado debés seleccionar un cliente.";
      setErrorMsg(msg);
      showError(msg);
      return;
    }
    if (fp === "fiado") {
      const ok = await verificarLimiteCredito(fp, tot);
      if (!ok) return;
    }
    if (fp === "efectivo") {
      dispatch({ type: ActionTypes.OPEN_MODAL, payload: { modal: "modalEfectivo", data: { total: tot, formaPago: fp } } });
    } else {
      ejecutarCobro({ formaPago: fp, total: tot });
    }
  };

  // Ref estable para handleCobrar (evita re-render de FormaPago por closure)
  const handleCobrarRef = useRef(handleCobrar);
  handleCobrarRef.current = handleCobrar;
  const stableHandleCobrar = useCallback((args) => handleCobrarRef.current(args), []);

  // ---------------------------------------------------------------------------
  // Confirmar pago efectivo desde modal
  // ---------------------------------------------------------------------------
  const handleConfirmarEfectivo = ({ pagaCon, vuelto }) => {
    const datos = { ...(state.modalEfectivo || {}) };

    if (datos.formaPago !== "efectivo") datos.formaPago = "efectivo";

    setDatosPagoEfectivo({ pagaCon, vuelto });
    dispatch({ type: ActionTypes.CLOSE_MODAL, payload: { modal: "modalEfectivo" } });
    
    const estaOffline =
      offlineMode || (typeof navigator !== "undefined" && !navigator.onLine);

    if (estaOffline) {
      guardarVentaPendiente(datos, { pagaCon, vuelto });
    } else {
      ejecutarCobro(datos, { pagaCon, vuelto });
    }
  };

  // ---------------------------------------------------------------------------
  // Ejecutar cobro real (API)
  // ---------------------------------------------------------------------------
  const ejecutarCobro = async (datos, pagoEfectivo = null) => {
    if (!localActual) {
      const msg = "No se detecto un local para operar.";
      setErrorMsg(msg);
      showError(msg);
      return;
    }

    if (state.carrito.length === 0) {
      const msg = "El carrito esta vacio.";
      setErrorMsg(msg);
      showError(msg);
      return;
    }

    // Validar cantidades antes de enviar
    const itemInvalido = state.carrito.find(
      (item) => item.cantidad === "" || item.cantidad === null || isNaN(Number(item.cantidad)) || Number(item.cantidad) <= 0
    );
    if (itemInvalido) {
      const msg = `Cantidad invalida en "${itemInvalido.nombre}". Revisa el carrito.`;
      setErrorMsg(msg);
      showError(msg);
      return;
    }

    setErrorMsg("");
    setSuccessMsg("");
    setUltimoBreakdown(null);
    dispatch({ type: ActionTypes.SET_COBRANDO, payload: true });

    // Generar clientTxnId para idempotencia
    const clientTxnId = typeof crypto !== "undefined" && crypto.randomUUID 
      ? crypto.randomUUID() 
      : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const res = await fetch("/api/pos-ventas/crear", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientTxnId,
          localId: localActual,
          clienteId: state.clienteSeleccionado?.id || null,
          turnoId: turnoActual?.id || null,
          formaPago: datos.formaPago,
          esFiado: datos.formaPago === "fiado",
          descuento: state.descuento,
          descuentoPorPuntos: state.descuentoPorPuntos,
          puntosCanje: state.puntosCanje,
          items: state.carrito.map((item) => ({
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
        // Manejar respuesta de idempotencia
        if (data.isDuplicate) {
          const msg = `Venta #${data.numero} ya estaba registrada.`;
          setSuccessMsg(msg);
          showSuccess(msg);
        }
        
        // Guardar breakdown del backend (si existe)
        const bd = data.breakdown || null;
        setUltimoBreakdown(bd);

        // Preparar datos del ticket
        const ventaTicket = {
          numero: data.numero,
          items: state.carrito.map((item) => ({
            nombre: item.nombre,
            precio: item.precio,
            cantidad: item.cantidad,
          })),
          subtotal: bd ? bd.subtotal : subtotal,
          descuento: bd ? bd.descuentoTotal : state.descuento,
          descuentoAutomatico: bd ? bd.descuentoAutomatico : 0,
          descuentoManual: bd ? bd.descuentoManual : state.descuento,
          total: bd ? bd.total : datos.total,
          formaPago: datos.formaPago,
          vendedor: me?.nombre || "-",
          cliente: state.clienteSeleccionado?.nombre || "Consumidor Final",
          localNombre,
          pagaCon: pagoEfectivo?.pagaCon || null,
          vuelto: pagoEfectivo?.vuelto || null,
        };

        // Mostrar modal de ticket
        dispatch({ type: ActionTypes.OPEN_MODAL, payload: { modal: "modalTicket", data: ventaTicket } });

        if (data.allowNegativeStockUsed) {
          setSuccessMsg("Advertencia: esta venta se registró con stock negativo (carga inicial).");
        }

        // Limpiar carrito
        dispatch({ type: ActionTypes.CLEAR_CART });
        dispatch({ type: ActionTypes.SET_FORMA_PAGO, payload: "efectivo" });
        setDatosPagoEfectivo(null);
        dispatch({ type: ActionTypes.SET_SALDO_PUNTOS, payload: 0 });
      } else {
        // Manejar errores específicos
        if (res.status === 409) {
          // Stock insuficiente o concurrencia
          const msg = data.error || "Error de concurrencia. Intenta nuevamente.";
          setErrorMsg(msg);
          showError(msg);
        } else {
          const msg = data.error || "Error al registrar la venta.";
          setErrorMsg(msg);
          showError(msg);
        }
      }
    } catch (err) {
      console.error("Error cobrando:", err);
      const msg = "Error de conexion al cobrar.";
      setErrorMsg(msg);
      showError(msg);
    } finally {
      dispatch({ type: ActionTypes.SET_COBRANDO, payload: false });
    }
  };

  // ---------------------------------------------------------------------------
  // Manejar opcion de ticket post-venta
  // ---------------------------------------------------------------------------
  const handleOpcionTicket = async (opcion) => {
    if (!state.modalTicket) return;

    if (opcion === "termica") {
      const { default: imprimirTicketTermico } = await import(
        "@/lib/pos-ventas/imprimirTicketTermico"
      );
      imprimirTicketTermico(state.modalTicket);
    } else if (opcion === "pdf") {
      const { default: generarTicketPDF } = await import(
        "@/lib/pos-ventas/generarTicketPDF"
      );
      generarTicketPDF(state.modalTicket);
    }

    const numero = state.modalTicket.numero;
    dispatch({ type: ActionTypes.CLOSE_MODAL, payload: { modal: "modalTicket" } });
    const msg = `Venta #${numero} registrada correctamente.`;
    setSuccessMsg(msg);
    showSuccess(msg);
  };

  const handleCerrarTicket = () => {
    const numero = state.modalTicket?.numero;
    dispatch({ type: ActionTypes.CLOSE_MODAL, payload: { modal: "modalTicket" } });
    const msg = `Venta #${numero} registrada correctamente.`;
    setSuccessMsg(msg);
    showSuccess(msg);
  };

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------
  // Guard de permisos
  if (cargandoCtx || loading || cargandoContexto) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--app-bg)' }}>
        <span className="text-sm sunmi-pos-muted">Cargando...</span>
      </div>
    );
  }

  const permisosPos = perfilCtx?.permisos || [];
  const esAdminPos = Array.isArray(permisosPos) && permisosPos.includes("*");
  if (!esAdminPos && !permisosPos.includes("pos.usar")) return <SinPermisos />;

  // Sin contexto → redirigir a /inicio
  if (needsContexto) {
    router.push("/inicio");
    return null;
  }

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
  // Render principal
  // ---------------------------------------------------------------------------
  return (
    <div className="sunmi-bg w-full min-h-full lg:h-full flex flex-col p-2 lg:p-3 pb-24 lg:pb-3 lg:overflow-hidden">
      <div className="w-full flex flex-col flex-1 min-h-0 gap-2 lg:gap-3">
        {/* Header compacto con stats inline */}
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm sunmi-pos-text-accent font-medium truncate">
              {localNombre || "Sin local"}
            </span>
            <div className="hidden sm:block border-l pl-3 ml-1" style={{ borderColor: 'var(--pos-panel-border)' }}>
              <StatsDelDia localId={localActual} />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {me && (
              <span className="text-xs sunmi-pos-muted hidden lg:inline">{me.nombre}</span>
            )}
            {/* Badge de estado de conectividad */}
            <div className={`text-[10px] px-2 py-1 rounded font-semibold ${
              offlineMode
                ? "sunmi-pos-panel sunmi-pos-text-accent"
                : "sunmi-pos-panel sunmi-pos-text-success"
            }`}>
              {offlineMode ? "OFFLINE" : "ONLINE"}
            </div>
            {queueLength > 0 && (
              <div className="text-[10px] sunmi-pos-muted px-2 py-1">
                Pendientes: {queueLength}
              </div>
            )}
            <button
              onClick={() => setMostrarHistorial(true)}
              className="text-[11px] sunmi-pos-btn-secondary px-2 py-1 rounded transition-colors flex items-center gap-1"
              title="Historial de ventas"
            >
              <ClipboardList size={14} />
              <span className="hidden sm:inline">Historial</span>
            </button>
            {queueLength > 0 && (
              <button
                onClick={handleAbrirPendientes}
                className="text-[11px] sunmi-pos-btn-secondary px-2 py-1 rounded transition-colors sunmi-pos-text-accent"
              >
                Pendientes ({queueLength})
              </button>
            )}
            <button
              onClick={handleAbrirPickerCliente}
              className="text-[11px] sunmi-pos-btn-secondary px-2 py-1 rounded transition-colors sunmi-pos-text-accent"
            >
              {state.clienteSeleccionado ? `Cliente: ${state.clienteSeleccionado.nombre}` : "Elegir cliente"}
            </button>
            {state.clienteSeleccionado && puntosActivo && state.saldoPuntos > 0 && !offlineMode && (
              <button
                onClick={() => {
                  if (offlineMode) {
                    showError("Sin internet: canje de puntos no disponible");
                    return;
                  }
                  dispatch({ type: ActionTypes.OPEN_MODAL, payload: { modal: "modalCanjePuntos" } });
                }}
                className={`text-[11px] px-2 py-1 rounded transition-colors sunmi-pos-muted ${
                  state.puntosCanje > 0
                    ? "sunmi-pos-panel font-medium"
                    : "sunmi-pos-panel"
                }`}
              >
                {state.puntosCanje > 0 ? `Puntos: -${state.puntosCanje}` : `Puntos: ${state.saldoPuntos}`}
              </button>
            )}
            {turnoActual && (
              <button
                onClick={() => setMostrarCierre(true)}
                className="text-[11px] sunmi-pos-btn-danger px-2 py-1 rounded transition-colors"
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
        {state.formaPago === "fiado" && state.clienteSeleccionado && creditoInfo && (
          <div className="rounded-md sunmi-pos-panel px-3 py-2 text-xs sunmi-pos-text-accent">
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
                    {disp < 0 && <span className="sunmi-pos-text-danger">Excedido por: <strong>${fmt(Math.abs(disp))}</strong></span>}
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
          <div className="rounded-md px-3 py-2 text-xs sunmi-pos-text-danger" style={{ background: 'color-mix(in srgb, var(--pos-danger) 12%, transparent)', border: '1px solid var(--pos-danger)' }}>
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="rounded-md px-3 py-2 text-xs sunmi-pos-text-success sunmi-pos-panel">
            {successMsg}
          </div>
        )}
        {ultimoBreakdown && (
          <div className="rounded-md sunmi-pos-panel px-3 py-2 text-xs sunmi-pos-muted space-y-1">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-mono">${Number(ultimoBreakdown.subtotal).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            {ultimoBreakdown.descuentoAutomatico > 0 && (
              <div className="flex justify-between sunmi-pos-text-success">
                <span>Descuento automatico</span>
                <span className="font-mono">-${Number(ultimoBreakdown.descuentoAutomatico).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}
            {ultimoBreakdown.descuentoManual > 0 && (
              <div className="flex justify-between sunmi-pos-text-success">
                <span>Descuento manual</span>
                <span className="font-mono">-${Number(ultimoBreakdown.descuentoManual).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="flex justify-between font-bold sunmi-pos-text-accent border-t pt-1" style={{ borderColor: 'var(--pos-panel-border)' }}>
              <span>Total</span>
              <span className="font-mono">${Number(ultimoBreakdown.total).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        )}

        {/* Layout POS: izquierda ~60% (buscador+carrito) | derecha ~40% (pago) */}
        <div className="flex-1 flex flex-col lg:flex-row gap-2 lg:gap-3 min-h-0">
          {/* Izquierda: Buscador + Carrito */}
          <div className="flex flex-col gap-2 lg:gap-3 lg:flex-[3] min-h-0">
            <BuscadorProductos
              localId={localActual}
              onAgregar={handleAgregar}
            />
            <div className="flex-1 min-h-0 lg:overflow-auto">
              <CarritoVenta
                items={state.carrito}
                onCantidadChange={handleCantidadChange}
                onEliminar={handleEliminar}
                onLimpiar={handleLimpiar}
                subtotal={subtotal}
                descuento={state.descuento}
                descuentoInfo={state.descuentoInfo}
                onAbrirDescuento={handleAbrirDescuento}
                clienteSeleccionado={state.clienteSeleccionado}
                onAbrirCliente={handleAbrirPickerCliente}
              />
            </div>
          </div>

          {/* Derecha: Panel de pago */}
          <div className="lg:flex-[2] lg:min-w-[360px] lg:max-w-[520px] shrink-0">
            <FormaPago
              subtotal={subtotal}
              descuento={state.descuento}
              descuentoPorPuntos={state.descuentoPorPuntos}
              formaPago={state.formaPago}
              onFormaPagoChange={handleFormaPagoChange}
              onCobrar={stableHandleCobrar}
              cobrando={state.cobrando}
              disabled={state.carrito.length === 0}
              offlineMode={offlineMode}
              queueLength={queueLength}
              onProcesarCola={procesarCola}
              procesandoCola={procesandoCola}
            />
            {/* Mensaje offline */}
            {offlineMode && (
              <div className="mt-2 text-[10px] sunmi-pos-text-accent text-center px-2 py-1 sunmi-pos-panel rounded">
                OFFLINE: solo efectivo. Se guarda pendiente y se sincroniza al volver internet.
              </div>
            )}
          </div>
        </div>

        {/* Shortcuts ayuda - solo desktop */}
        <div className="hidden lg:block text-[10px] sunmi-pos-muted text-center shrink-0">
          F1: Buscar | F2: Efectivo | F3: MP | F4: Debito | F5: Credito | F6: Fiado | F10: Cobrar
        </div>
      </div>

      {/* Picker cliente full-screen */}
      {mostrarPickerCliente && (
        <ClientePickerFullscreen
          localId={localActual}
          onSeleccionar={handleSeleccionarCliente}
          onCerrar={() => setMostrarPickerCliente(false)}
        />
      )}

      {/* Modal descuento */}
      {state.modalDescuento && (
        <ModalDescuento
          subtotal={subtotal}
          descuentoActual={state.descuentoInfo}
          onAplicar={handleAplicarDescuento}
          onQuitar={handleQuitarDescuento}
          onCancelar={() => dispatch({ type: ActionTypes.CLOSE_MODAL, payload: { modal: "modalDescuento" } })}
        />
      )}

      {/* Modal canje puntos */}
      {state.modalCanjePuntos && state.clienteSeleccionado && (
        <ModalCanjePuntos
          saldo={state.saldoPuntos}
          pesoPorPunto={puntosConfig?.redencionJson?.pesoPorPunto || 0}
          canjeActual={state.puntosCanje}
          onCanjear={(pts) => {
            // Solo actualizar estado local, el canje se hará dentro de la transacción de venta
            const pesoPorPunto = puntosConfig?.redencionJson?.pesoPorPunto || 0;
            const descuentoCalc = pts * pesoPorPunto;
            // Estimar saldo nuevo (sin confirmar, se validará en backend)
            const nuevoSaldo = Math.max(0, state.saldoPuntos - pts);
            dispatch({
              type: ActionTypes.SET_PUNTOS,
              payload: {
                puntosCanje: pts,
                descuentoPorPuntos: descuentoCalc,
                saldoPuntos: nuevoSaldo,
              },
            });
          }}
          onQuitar={() => {
            dispatch({ type: ActionTypes.REMOVE_PUNTOS });
          }}
          onCancelar={() => dispatch({ type: ActionTypes.CLOSE_MODAL, payload: { modal: "modalCanjePuntos" } })}
        />
      )}

      {/* Modal pago efectivo */}
      {state.modalEfectivo && (
        <ModalPagoEfectivo
          total={state.modalEfectivo.total}
          onConfirmar={handleConfirmarEfectivo}
          onCancelar={() => dispatch({ type: ActionTypes.CLOSE_MODAL, payload: { modal: "modalEfectivo" } })}
        />
      )}

      {/* Modal ticket post-venta */}
      {state.modalTicket && (
        <ModalTicket
          venta={state.modalTicket}
          onOpcion={handleOpcionTicket}
          onCerrar={handleCerrarTicket}
        />
      )}

      {/* Modal ticket offline */}
      {ultimoTicketOffline && (
        <ModalTicketOffline
          ticket={ultimoTicketOffline}
          onCerrar={() => setUltimoTicketOffline(null)}
        />
      )}

      {/* Modal pendientes offline */}
      <ModalPendientesOffline
        open={mostrarPendientesOffline}
        onClose={() => setMostrarPendientesOffline(false)}
        queue={offlineQueueSnapshot}
        onImprimir={handleImprimirPendiente}
        onEliminar={handleEliminarPendiente}
        onVaciar={handleVaciarPendientes}
        onProcesarCola={handleProcesarColaDesdeModal}
        puedeProcesar={!offlineMode && offlineQueueSnapshot.length > 0}
        procesandoCola={procesandoCola}
      />

      {/* Modal historial */}
      {mostrarHistorial && (
        <HistorialDia
          localId={localActual}
          puedeVerTodosCajeros={esAdminPos || permisosPos.includes("turnos.ver_todos")}
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

      {/* Modal confirmación (reemplazo de confirm()) */}
      {state.modalConfirmacion && (
        <ModalConfirmacion
          open={true}
          mensaje={state.modalConfirmacion.mensaje}
          onConfirmar={state.modalConfirmacion.onConfirmar}
          onCancelar={state.modalConfirmacion.onCancelar}
        />
      )}
    </div>
  );
}
