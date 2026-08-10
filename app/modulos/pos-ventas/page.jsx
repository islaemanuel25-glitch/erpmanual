"use client";

import { useEffect, useState, useCallback, useReducer, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiButton from "@/components/sunmi/SunmiButton";
import useContextoActivo from "@/hooks/useContextoActivo";
import { useOperadorContext } from "@/app/context/OperadorContext";
import { showError, showSuccess } from "@/components/sunmi/SunmiToast";
import { posVentaReducer, initialState, ActionTypes } from "./reducer/posVentaReducer";
import { loadQueue, saveQueue, enqueue, dequeueById, getQueueLength, clearQueue } from "./helpers/offlineQueue";

import BuscadorProductos from "@/components/pos-ventas/BuscadorProductos";
import CarritoVenta from "@/components/pos-ventas/CarritoVenta";
import FormaPago from "@/components/pos-ventas/FormaPago";
import ModalPagoEfectivo from "@/components/pos-ventas/ModalPagoEfectivo";
import ModalImporteServicio from "@/components/pos-ventas/ModalImporteServicio";
import { sumarTotalServicios, componerCobroSimple } from "@/lib/pos-ventas/servicios";
import { itemsCrearPayload } from "@/lib/pos-ventas/payloadVenta";
import { sumarSubtotales } from "@/lib/pos-ventas/lineaPorImporte";
import ModalTicket from "@/components/pos-ventas/ModalTicket";
import ModalTicketOffline from "@/components/pos-ventas/ModalTicketOffline";
import ModalDescuento from "@/components/pos-ventas/ModalDescuento";
import ModalCanjePuntos from "@/components/pos-ventas/ModalCanjePuntos";
import ClientePickerFullscreen from "@/components/pos-ventas/ClientePickerFullscreen";
import ModalCajaMovimiento from "@/components/pos-ventas/ModalCajaMovimiento";
import AvisoArqueo from "@/components/pos-ventas/AvisoArqueo";
import useArqueoEstado from "@/hooks/useArqueoEstado";
import useEsEscritorio, { nombreVentanaRetiro, nombreVentanaCierre } from "@/hooks/useEsEscritorio";
import {
  escucharCorteIniciado,
  leerSenalVigente,
  limpiarSenal,
} from "@/lib/caja/senalCierre";
import ModalPesoKg from "@/components/pos-ventas/ModalPesoKg";
import ModalConfirmacion from "@/components/pos-ventas/ModalConfirmacion";
import ModalPendientesOffline from "@/components/pos-ventas/ModalPendientesOffline";
import StatsDelDia from "@/components/pos-ventas/StatsDelDia";
import HistorialDia from "@/components/pos-ventas/HistorialDia";
import AvisoVentaInterna from "@/components/pos-ventas/AvisoVentaInterna";
import { ClipboardList, Printer, Undo2 } from "lucide-react";
import { descuentoPorPuntos } from "@/lib/pos-ventas/puntos";

export default function PosVentasPage() {
  const router = useRouter();
  const { perfil: perfilCtx, cargando: cargandoCtx } = useUser();

  // Contexto global (local activo)
  const { loading: cargandoContexto, contexto, needsContexto } = useContextoActivo();

  // Operador activo + su voucher firmado (adjuntados a las ventas encoladas
  // offline para conservar la atribución al sincronizar) y requerirOperador
  // (levanta el modal de PIN encima de la venta ante un 428, sin navegar).
  // `logout` se usa al cortar el turno: el mostrador vuelve al ingreso de
  // operario para que el relevo entre con su PIN. No cambia la autoría de nada
  // ya registrado — eso vive en el servidor.
  const {
    operador: operadorActivo,
    voucher: operadorVoucherActivo,
    requerirOperador,
    logout: logoutOperador,
  } = useOperadorContext();

  // Estado del POS con reducer
  const [state, dispatch] = useReducer(posVentaReducer, initialState);

  // Estados que NO van al reducer (UI, loading, datos externos)
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [mostrarPickerCliente, setMostrarPickerCliente] = useState(false);
  const [turnoActual, setTurnoActual] = useState(undefined); // undefined=cargando, null=sin turno, object=turno
  const [turnoVencido, setTurnoVencido] = useState(false);
  const [mensajeTurnoVencido, setMensajeTurnoVencido] = useState("");
  // Espejo del turno para el listener del corte. Sin la ref, el listener tendría
  // que resuscribirse en cada cambio de turno y podría perder un aviso que llega
  // justo entre la baja y el alta.
  const turnoActualRef = useRef(null);
  turnoActualRef.current = turnoActual;
  const [mostrarCajaMovimiento, setMostrarCajaMovimiento] = useState(false);
  const [productoKgPendiente, setProductoKgPendiente] = useState(null);
  // Servicio de importe variable pendiente de ingresar importe en el modal.
  const [servicioPendiente, setServicioPendiente] = useState(null);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);
  const [comisiones, setComisiones] = useState(null);
  const [creditoInfo, setCreditoInfo] = useState(null); // { limiteCredito, saldoActual }
  const [ultimoBreakdown, setUltimoBreakdown] = useState(null);
  const [datosPagoEfectivo, setDatosPagoEfectivo] = useState(null); // { pagaCon, vuelto }
  const [puntosActivo, setPuntosActivo] = useState(false);
  const [puntosConfig, setPuntosConfig] = useState(null);
  const [posVentasConfig, setPosVentasConfig] = useState({
    exigirClienteVentasDeposito: false,
    exigirClienteVentasLocal: false,
  });
  
  // Estado offline
  const [offlineMode, setOfflineMode] = useState(false);
  const [queueLength, setQueueLength] = useState(0);
  const [procesandoCola, setProcesandoCola] = useState(false);
  const [ultimoTicketOffline, setUltimoTicketOffline] = useState(null);
  const [mostrarPendientesOffline, setMostrarPendientesOffline] = useState(false);
  const [offlineQueueSnapshot, setOfflineQueueSnapshot] = useState([]);
  const prevOfflineModeRef = useRef(false);

  // Historial rápido
  const [historialRapido, setHistorialRapido] = useState([]);
  const [mostrarHistorialRapido, setMostrarHistorialRapido] = useState(false);
  const [busquedaMonto, setBusquedaMonto] = useState("");

  // Undo carrito (CTRL+Z)
  const [previousCarrito, setPreviousCarrito] = useState(null);

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

  // Estado de la alerta de arqueo de ESTA caja. Se consulta solo con turno
  // abierto y siempre acotado a turnoId + localId: la alerta de un local nunca
  // llega a otro.
  const arqueo = useArqueoEstado({
    turnoId: turnoActual?.id || null,
    localId: localActual,
    habilitado: !!turnoActual?.id && !turnoVencido,
  });

  // RETIRO DE RECAUDACIÓN: dónde se abre.
  //
  // En escritorio, en una PESTAÑA APARTE. Contar un cajón lleva minutos y el POS
  // no puede quedar inaccesible mientras tanto: acá el cajero atiende en esta
  // pestaña y cuenta en la otra, sin perder carrito ni cliente. El nombre de
  // ventana por turno hace que tocar el botón de nuevo reutilice la pestaña ya
  // abierta en vez de acumular varias contando la misma caja.
  //
  // En móvil, en la misma pestaña: no hay lugar para dos, y el borrador local
  // cubre la ida y vuelta.
  const esEscritorio = useEsEscritorio();

  /** Abre una pantalla de caja: pestaña aparte en escritorio, misma en móvil. */
  const abrirPantallaCaja = (ruta, nombreVentana) => {
    if (esEscritorio && typeof window !== "undefined") {
      const ventana = window.open(`${ruta}?pestana=nueva`, nombreVentana);
      // Si el navegador bloquea la ventana emergente, no se pierde la acción.
      if (ventana) {
        ventana.focus();
        return;
      }
    }
    router.push(ruta);
  };

  const abrirRetiro = (turnoId) =>
    abrirPantallaCaja("/modulos/pos-ventas/retiros/nuevo", nombreVentanaRetiro(turnoId));

  // CIERRE DE CAJA: misma lógica de pestañas que el retiro, y por el mismo
  // motivo —contar lleva minutos— más uno propio: acá el POS se libera de
  // verdad. Apenas el corte se confirma, esta pestaña suelta el turno y vuelve
  // al ingreso de operario para que el relevo pueda empezar.
  const abrirCierre = (turnoId) =>
    abrirPantallaCaja("/modulos/pos-ventas/cierres/iniciar", nombreVentanaCierre(turnoId));

  // ── El aviso de que el turno acaba de cortarse ───────────────────────────
  //
  // Llega desde la pestaña del cierre. Esta pestaña reacciona soltando el turno
  // y cerrando la sesión de operario: el mostrador queda listo para el
  // siguiente. NO se toca la autoría del cierre —eso vive en el servidor, en la
  // fila del corte— así que el login del operador B no cambia quién cerró.
  const soltarTurnoCortado = useCallback(
    (senal) => {
      // Solo si es EL turno que esta pestaña está mostrando. Un corte de otra
      // caja del mismo local no tiene por qué desloguear a nadie acá.
      if (!senal?.turnoId || senal.turnoId !== turnoActualRef.current?.id) return;
      limpiarSenal();
      setTurnoActual(null);
      setTurnoVencido(false);
      setMensajeTurnoVencido("");
      // Cierra la sesión de operario: el OperadorProvider muestra solo el PIN.
      logoutOperador?.();
    },
    [logoutOperador]
  );

  useEffect(() => {
    const dejarDeEscuchar = escucharCorteIniciado(soltarTurnoCortado);
    // Una pestaña que estuvo dormida no recibe mensajes de canal —no se
    // encolan—, así que al recuperar el foco se lee la marca escrita.
    const alVolver = () => {
      if (document.visibilityState !== "visible") return;
      const pendiente = leerSenalVigente();
      if (pendiente) soltarTurnoCortado(pendiente);
    };
    window.addEventListener("focus", alVolver);
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      dejarDeEscuchar();
      window.removeEventListener("focus", alVolver);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [soltarTurnoCortado]);


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
  // Cargar config de comisiones
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!localActual) return;
    fetch(`/api/pos-ventas/config-comisiones?localId=${localActual}`, { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) setComisiones(data.comisiones);
      })
      .catch(() => {});
  }, [localActual]);

  // ---------------------------------------------------------------------------
  // Cargar config "cliente obligatorio" del POS (feedback preventivo;
  // la autoridad final es el backend en /api/pos-ventas/crear).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!localActual) return;
    fetch("/api/config/pos-ventas-cliente", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setPosVentasConfig({
            exigirClienteVentasDeposito: data.exigirClienteVentasDeposito ?? false,
            exigirClienteVentasLocal: data.exigirClienteVentasLocal ?? false,
          });
        }
      })
      .catch(() => {});
  }, [localActual]);

  // ---------------------------------------------------------------------------
  // Cargar historial rapido (ultimos 20 tickets)
  // ---------------------------------------------------------------------------
  const cargarHistorialRapido = useCallback(async () => {
    if (!localActual) return;
    try {
      const res = await fetch(
        `/api/pos-ventas/historial-dia?limit=20`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (data.ok) setHistorialRapido(data.items || []);
    } catch {
      // silencioso
    }
  }, [localActual]);

  useEffect(() => {
    cargarHistorialRapido();
  }, [cargarHistorialRapido]);

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
  // Restaurar carrito persistido desde localStorage
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!localActual || !me) return;
    try {
      const raw = localStorage.getItem("posVentasCarritoEnCurso_v1");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.localId === localActual && parsed.userId === me.id) {
        dispatch({ type: ActionTypes.RESTORE_CART, payload: parsed });
      }
    } catch (e) {
      // Si el dato está corrupto, ignorar
    }
  }, [localActual, me]);

  // ---------------------------------------------------------------------------
  // Persistir carrito en localStorage
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!localActual || !me) return;
    const draft = {
      localId: localActual,
      userId: me.id,
      carrito: state.carrito,
      clienteSeleccionado: state.clienteSeleccionado,
      descuento: state.descuento,
      descuentoInfo: state.descuentoInfo,
      formaPago: state.formaPago,
      puntosCanje: state.puntosCanje,
      descuentoPorPuntos: state.descuentoPorPuntos,
    };
    localStorage.setItem("posVentasCarritoEnCurso_v1", JSON.stringify(draft));
  }, [
    localActual, me,
    state.carrito, state.clienteSeleccionado, state.descuento,
    state.formaPago, state.puntosCanje, state.descuentoPorPuntos,
  ]);

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
        setTurnoVencido(!!(data.ok && data.requiereCierre));
        setMensajeTurnoVencido(data.ok && data.mensaje ? data.mensaje : "");
      } catch {
        setTurnoActual(null);
        setTurnoVencido(false);
        setMensajeTurnoVencido("");
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
  // Agregar producto al carrito
  // ---------------------------------------------------------------------------
  const handleAgregar = useCallback((producto) => {
    setErrorMsg("");
    setSuccessMsg("");
    // Servicio de importe variable: no se agrega con precio fijo; se abre el modal
    // para ingresar el importe. Una línea única por carga (no fusiona).
    if (producto.esServicioImporteVariable || producto.modalidad === "IMPORTE_VARIABLE") {
      setServicioPendiente(producto);
      return;
    }
    if (producto.unidadMedida === "kg") {
      setProductoKgPendiente(producto);
      return;
    }
    setPreviousCarrito([...state.carrito]);
    dispatch({ type: ActionTypes.ADD_ITEM, payload: { producto } });

    // Alerta de stock bajo
    const enCarrito = state.carrito.find((i) => i.productoBaseId === producto.productoBaseId);
    const cantidadResultante = enCarrito ? enCarrito.cantidad + 1 : 1;
    const stockDisponible = producto.stock ?? Infinity;
    if (stockDisponible !== Infinity && cantidadResultante >= stockDisponible) {
      showError(`Stock bajo: "${producto.nombre}" tiene ${stockDisponible} en stock`);
    }
  }, [state.carrito]);

  // ---------------------------------------------------------------------------
  // Editar cantidad
  // ---------------------------------------------------------------------------
  const handleCantidadChange = useCallback((idx, nuevaCantidad) => {
    setPreviousCarrito([...state.carrito]);
    dispatch({ type: ActionTypes.UPDATE_CANTIDAD, payload: { idx, nuevaCantidad } });
  }, [state.carrito]);

  // ---------------------------------------------------------------------------
  // Cambiar modo de venta de una línea (formato pack ↔ unidad suelta).
  // Solo aplica en depósito; el backend valida factorPack y stock contra DB.
  // ---------------------------------------------------------------------------
  const handleModoVentaChange = useCallback((idx, modo) => {
    setPreviousCarrito([...state.carrito]);
    dispatch({ type: ActionTypes.SET_MODO_VENTA_LINEA, payload: { idx, modo } });
  }, [state.carrito]);

  // ---------------------------------------------------------------------------
  // Eliminar item
  // ---------------------------------------------------------------------------
  const handleEliminar = useCallback((idx) => {
    setPreviousCarrito([...state.carrito]);
    dispatch({ type: ActionTypes.REMOVE_ITEM, payload: { idx } });
  }, [state.carrito]);

  // Confirmar el importe de un servicio → agregar línea única al carrito.
  const handleConfirmarServicio = useCallback((servicio) => {
    setPreviousCarrito([...state.carrito]);
    dispatch({ type: ActionTypes.ADD_SERVICIO, payload: { servicio } });
    setServicioPendiente(null);
  }, [state.carrito]);

  // ---------------------------------------------------------------------------
  // Limpiar carrito
  // ---------------------------------------------------------------------------
  const handleLimpiar = useCallback(() => {
    dispatch({ type: ActionTypes.CLEAR_CART });
    localStorage.removeItem("posVentasCarritoEnCurso_v1");
    setCreditoInfo(null);
    setUltimoBreakdown(null);
    setPuntosActivo(false);
    setPuntosConfig(null);
    setErrorMsg("");
    setSuccessMsg("");
  }, []);

  // ---------------------------------------------------------------------------
  // Reimprimir ultimo ticket
  // ---------------------------------------------------------------------------
  const reimprimirUltimoTicket = useCallback(async () => {
    const raw = localStorage.getItem("posUltimoTicket_v1");
    if (!raw) {
      showError("No hay ticket reciente para reimprimir");
      return;
    }
    const { default: imprimirTicketTermico } = await import(
      "@/lib/pos-ventas/imprimirTicketTermico"
    );
    imprimirTicketTermico(JSON.parse(raw));
  }, []);

  // ---------------------------------------------------------------------------
  // Deshacer ultima accion del carrito
  // ---------------------------------------------------------------------------
  const handleUndo = useCallback(() => {
    if (!previousCarrito) {
      showError("No hay accion para deshacer");
      return;
    }
    dispatch({ type: ActionTypes.RESTORE_CART, payload: { carrito: previousCarrito } });
    setPreviousCarrito(null);
    showSuccess("Accion deshecha");
  }, [previousCarrito]);

  // ---------------------------------------------------------------------------
  // Atajos: F9 reimprimir / CTRL+Z deshacer
  // ---------------------------------------------------------------------------
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "F9") {
        e.preventDefault();
        reimprimirUltimoTicket();
      }
      if (e.key === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        // No interceptar si esta escribiendo en un input
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
        e.preventDefault();
        handleUndo();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [reimprimirUltimoTicket, handleUndo]);

  // ---------------------------------------------------------------------------
  // Subtotal y totales
  // ---------------------------------------------------------------------------
  // Suma en centavos enteros y respeta el importe fijado de las líneas de peso
  // cargadas por precio (no re-deriva su total desde el peso redondeado).
  const subtotal = sumarSubtotales(state.carrito);

  const total = subtotal - state.descuento - state.descuentoPorPuntos;

  // Mínimo a cubrir en efectivo por los servicios de importe variable del carrito.
  const minEfectivoServicios = sumarTotalServicios(state.carrito);

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

    // Gate "cliente obligatorio" también en offline (consistente con online).
    const exigirCliente = contexto?.esDeposito
      ? posVentasConfig.exigirClienteVentasDeposito
      : posVentasConfig.exigirClienteVentasLocal;
    if (exigirCliente && !state.clienteSeleccionado?.id) {
      const msg = contexto?.esDeposito
        ? "Este depósito exige cliente para cerrar la venta."
        : "Este local exige cliente para cerrar la venta.";
      setErrorMsg(msg);
      showError(msg);
      setMostrarPickerCliente(true);
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
      // Operador identificado al cobrar + su voucher firmado. El voucher es la
      // prueba infalsificable que el server usa al sincronizar (ver crear); el
      // operadorId queda solo para referencia/legibilidad de la cola.
      operadorId: operadorActivo?.operadorId ?? null,
      operadorVoucher: operadorVoucherActivo ?? null,
      // Payload canónico (mismo helper que el path online).
      items: itemsCrearPayload(state.carrito),
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
      cliente: state.clienteSeleccionado
        ? {
            nombre: state.clienteSeleccionado.nombre,
            documento: state.clienteSeleccionado.documento || null,
            telefono: state.clienteSeleccionado.telefono || null,
            direccion: state.clienteSeleccionado.direccion || null,
          }
        : null,
      items: state.carrito.map((item) => ({
        nombre: item.nombre,
        precio: item.precio,
        cantidad: item.cantidad,
        // El ticket muestra el importe tecleado, no peso × precio.
        subtotalFijado: item.subtotalFijado ?? null,
        // Desglose del servicio para el ticket (importe/recargo/total).
        esServicio: item.esServicio ?? false,
        importeBaseServicio: item.esServicio ? item.importeBaseServicio : null,
        recargoServicioPct: item.esServicio ? item.recargoServicioPct : null,
        recargoServicioImporte: item.esServicio ? item.recargoServicioImporte : null,
      })),
      subtotal: subtotal,
      descuento: state.descuento,
      descuentoPorPuntos: state.descuentoPorPuntos,
      total: datos.total,
      pagaCon: pagoEfectivo?.pagaCon || null,
      vuelto: pagoEfectivo?.vuelto || null,
    };

    // Guardar ticket offline y mostrarlo
    localStorage.setItem("posUltimoTicket_v1", JSON.stringify(ticketOffline));
    setUltimoTicketOffline(ticketOffline);

    // Limpiar carrito
    dispatch({ type: ActionTypes.CLEAR_CART });
    localStorage.removeItem("posVentasCarritoEnCurso_v1");
    dispatch({ type: ActionTypes.SET_FORMA_PAGO, payload: "efectivo" });
    setDatosPagoEfectivo(null);
    dispatch({ type: ActionTypes.SET_SALDO_PUNTOS, payload: 0 });

    showSuccess("Venta guardada offline. Ticket generado.");
    setSuccessMsg(`Venta guardada pendiente. Total en cola: ${nuevaLongitud}`);
  }, [localActual, grupoId, me, state.carrito, state.descuento, state.descuentoPorPuntos, state.clienteSeleccionado, subtotal, localNombre, operadorActivo, operadorVoucherActivo]);

  // ---------------------------------------------------------------------------
  // Procesar cola offline
  // ---------------------------------------------------------------------------
  const procesarCola = useCallback(async () => {
    if (offlineMode || procesandoCola) return;

    if (!turnoActual?.id) {
      showError("Abrí turno para procesar ventas pendientes");
      return;
    }

    if (turnoVencido) {
      showError("Caja vencida: cerrala antes de procesar ventas pendientes");
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
            // Replay offline: nunca se rechaza por operario vencido. La atribución
            // la resuelve el server con el voucher firmado (no con un id crudo).
            // Legacy sin voucher → el server graba con operador null.
            origenOffline: true,
            operadorVoucher: ventaPendiente.operadorVoucher ?? null,
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
  }, [offlineMode, procesandoCola, turnoActual, turnoVencido]);

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
      cliente: item.clienteNombre ? { nombre: item.clienteNombre } : null,
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
    // Fiado incompatible con servicios (atajo de teclado; la UI ya lo evita).
    if (minEfectivoServicios > 0 && state.formaPago === "fiado") {
      showError("No se puede fiar una venta que contiene servicios");
      return;
    }
    // Compone el payload igual que el cobro simple (incluye el mínimo de efectivo
    // por servicios cuando corresponde) y delega en handleCobrar (turno/fiado/modal).
    handleCobrar(
      componerCobroSimple({ medio: state.formaPago, total, minEfectivoServicios })
    );
  };

  // ---------------------------------------------------------------------------
  // Shortcuts de teclado
  // ---------------------------------------------------------------------------
  const CICLO_FORMAS_PAGO = ["efectivo", "debito", "credito", "mercadopago", "fiado"];

  useEffect(() => {
    const handleShortcut = (e) => {
      // ENTER: cobrar (funciona incluso desde inputs)
      if (e.key === "Enter") {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
        if (modalEfectivo || modalTicket || modalDescuento || mostrarPickerCliente || mostrarHistorial) return;
        if (state.carrito.length > 0 && !state.cobrando) {
          e.preventDefault();
          iniciarCobro();
        }
        return;
      }

      // No interceptar si esta escribiendo en un input (excepto ENTER arriba)
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      // No interceptar si hay modal abierto
      if (modalEfectivo || modalTicket || modalDescuento || mostrarPickerCliente || mostrarHistorial) return;

      switch (e.key) {
        case "F1":
          e.preventDefault();
          dispatch({ type: ActionTypes.SET_FORMA_PAGO, payload: "efectivo" });
          break;
        case "F2":
          e.preventDefault();
          document.getElementById("pos-buscador-producto")?.focus()
            || document.getElementById("buscar-producto")?.focus();
          break;
        case "F3":
          e.preventDefault();
          dispatch({ type: ActionTypes.SET_FORMA_PAGO, payload: "mercadopago" });
          break;
        case "F4":
          e.preventDefault();
          handleAbrirPickerCliente();
          break;
        case "F5":
          e.preventDefault();
          dispatch({ type: ActionTypes.SET_FORMA_PAGO, payload: "credito" });
          break;
        case "F6": {
          e.preventDefault();
          const idxActual = CICLO_FORMAS_PAGO.indexOf(state.formaPago);
          const siguiente = CICLO_FORMAS_PAGO[(idxActual + 1) % CICLO_FORMAS_PAGO.length];
          dispatch({ type: ActionTypes.SET_FORMA_PAGO, payload: siguiente });
          break;
        }
        case "F8":
          e.preventDefault();
          handleLimpiar();
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
  }, [state.carrito, state.cobrando, state.formaPago, state.modalEfectivo, state.modalTicket, state.modalDescuento, mostrarPickerCliente, mostrarHistorial, handleLimpiar, handleAbrirPickerCliente]);

  // ---------------------------------------------------------------------------
  // Cobrar desde FormaPago (redirige a iniciarCobro)
  // ---------------------------------------------------------------------------
  const handleCobrar = async ({ formaPago: fp, total: tot, pagos }) => {
    // Bloquear cobro sin turno abierto (excepto offline que guarda pendiente)
    if (!turnoActual?.id && !offlineMode) {
      showError("Abrí turno para registrar ventas");
      return;
    }

    // Bloquear cobro si la caja está vencida (turno de un día anterior).
    // El backend igual rechaza con 403, pero atajamos antes para mejor UX.
    if (turnoVencido) {
      showError(
        mensajeTurnoVencido ||
          "Caja vencida: cerrá la caja anterior antes de seguir vendiendo"
      );
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
    // Pago dividido: si hay tender efectivo, se abre el modal de efectivo para
    // "paga con"/vuelto SOBRE EL MONTO EFECTIVO APLICADO (no el total). Los otros
    // tenders y el restante ya están fijados; el vuelto es solo display.
    if (Array.isArray(pagos) && pagos.length > 0) {
      const efectivoTender = pagos.find((p) => p.medio === "efectivo");
      if (efectivoTender) {
        dispatch({ type: ActionTypes.OPEN_MODAL, payload: { modal: "modalEfectivo", data: { total: tot, montoEfectivo: Number(efectivoTender.monto), formaPago: fp, pagos } } });
      } else {
        ejecutarCobro({ formaPago: fp, total: tot, pagos });
      }
    } else if (fp === "efectivo") {
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

    // Pago dividido: preservar formaPago/pagos (el backend deriva y recalcula). Solo
    // el efectivo simple (sin tenders) fuerza formaPago="efectivo".
    if (!Array.isArray(datos.pagos) && datos.formaPago !== "efectivo") datos.formaPago = "efectivo";

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

    // Gate "cliente obligatorio" (preventivo; el backend valida igual).
    const exigirCliente = contexto?.esDeposito
      ? posVentasConfig.exigirClienteVentasDeposito
      : posVentasConfig.exigirClienteVentasLocal;
    if (exigirCliente && !state.clienteSeleccionado?.id) {
      const msg = contexto?.esDeposito
        ? "Este depósito exige cliente para cerrar la venta."
        : "Este local exige cliente para cerrar la venta.";
      setErrorMsg(msg);
      showError(msg);
      setMostrarPickerCliente(true);
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
          // Pago dividido: si el panel entrega tenders, el backend los usa y
          // recalcula todo. Sin `pagos`, cae al compat legacy (1 tender por formaPago).
          pagos: Array.isArray(datos.pagos) && datos.pagos.length > 0 ? datos.pagos : undefined,
          esFiado: datos.formaPago === "fiado",
          descuento: state.descuento,
          descuentoPorPuntos: state.descuentoPorPuntos,
          puntosCanje: state.puntosCanje,
          // Payload canónico (mismo helper que el path offline): incluye
          // esServicio + importeBaseServicio para los servicios de importe variable.
          items: itemsCrearPayload(state.carrito),
        }),
      });

      if (res.status === 401) {
        router.replace("/login");
        return;
      }

      // Sin operario activo (token vencido o "cambiar operador" sin elegir):
      // pedimos el PIN en un modal ENCIMA de la venta. El carrito queda intacto;
      // al identificarse el usuario vuelve a apretar Cobrar (sin auto-reintento).
      if (res.status === 428) {
        requerirOperador();
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

        // Una venta cambia el efectivo esperado y puede haber cruzado el
        // vencimiento del intervalo: se refresca el estado del arqueo.
        arqueo.refrescar();

        // Preparar datos del ticket
        const ventaTicket = {
          numero: data.numero,
          fecha: new Date().toISOString(),
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
          formaPago: data.formaPago ?? datos.formaPago,
          // Snapshot de pagos para el ticket (del backend; congelado).
          pagos: Array.isArray(data.pagos) ? data.pagos : (Array.isArray(datos.pagos) ? datos.pagos : null),
          comisionBancaria: data.comisionBancaria ?? 0,
          netoRecibido: data.netoRecibido ?? (bd ? bd.total : datos.total),
          vendedor: me?.nombre || "-",
          cliente: state.clienteSeleccionado
            ? {
                nombre: state.clienteSeleccionado.nombre,
                documento: state.clienteSeleccionado.documento || null,
                telefono: state.clienteSeleccionado.telefono || null,
                direccion: state.clienteSeleccionado.direccion || null,
              }
            : null,
          localNombre,
          pagaCon: pagoEfectivo?.pagaCon || null,
          vuelto: pagoEfectivo?.vuelto || null,
        };

        // Guardar último ticket para reimpresión
        localStorage.setItem("posUltimoTicket_v1", JSON.stringify(ventaTicket));

        // Mostrar modal de ticket
        dispatch({ type: ActionTypes.OPEN_MODAL, payload: { modal: "modalTicket", data: ventaTicket } });

        if (data.allowNegativeStockUsed) {
          setSuccessMsg("Advertencia: esta venta se registró con stock negativo (carga inicial).");
        }

        // Limpiar carrito
        dispatch({ type: ActionTypes.CLEAR_CART });
        localStorage.removeItem("posVentasCarritoEnCurso_v1");
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
    cargarHistorialRapido();
  };

  const handleCerrarTicket = () => {
    const numero = state.modalTicket?.numero;
    dispatch({ type: ActionTypes.CLOSE_MODAL, payload: { modal: "modalTicket" } });
    const msg = `Venta #${numero} registrada correctamente.`;
    setSuccessMsg(msg);
    showSuccess(msg);
    cargarHistorialRapido();
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
  // Caja vencida (turno abierto de un día anterior): pantalla bloqueante
  // ---------------------------------------------------------------------------
  if (localActual && me && turnoActual && turnoVencido) {
    const fechaAperturaTxt = turnoActual.apertura
      ? new Intl.DateTimeFormat("es-AR", {
          timeZone: "America/Argentina/Cordoba",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(turnoActual.apertura))
      : "—";
    return (
      <div className="sunmi-bg w-full min-h-full flex items-center justify-center p-4">
        <div className="max-w-md w-full sunmi-surface rounded-xl p-5 space-y-4">
          <h1 className="text-lg font-bold text-center">Caja vencida</h1>
          <div className="sunmi-state-warning sunmi-text-accent rounded-lg p-3 text-sm text-center">
            {mensajeTurnoVencido ||
              "Tenés una caja abierta de un día anterior. Cerrala antes de seguir vendiendo."}
          </div>
          <div className="text-xs sunmi-text-muted text-center">
            Caja abierta el {fechaAperturaTxt}
          </div>
          {/* Una caja de ayer también se cierra por el flujo nuevo. Es más:
              es donde más falta hace, porque el local ya está queriendo abrir
              y con el corte puede hacerlo sin esperar el conteo. */}
          <SunmiButton
            color="amber"
            onClick={() => abrirCierre(turnoActual.id)}
            className="w-full"
          >
            Cerrar caja
          </SunmiButton>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Sin turno abierto: apertura por CAMBIOS PENDIENTES.
  //
  // Ya no es un modal con un importe escrito a mano. El operador elige de qué
  // cierre recibe el cambio, lo cuenta por denominación y abre con lo que contó
  // de verdad. Es una pantalla propia porque contar lleva su tiempo y porque la
  // elección del sobre es un acto con consecuencias contables.
  //
  // `ModalAperturaTurno` y /api/pos-ventas/turnos/abrir siguen en el repositorio
  // como vía administrativa acotada. El clásico NO puede consumir un
  // CambioPendiente: ni lo lee ni lo marca, así que no hay forma de que un sobre
  // se pierda por ahí.
  // ---------------------------------------------------------------------------
  if (localActual && me && turnoActual === null) {
    return <RedirigirAApertura router={router} />;
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
              onClick={reimprimirUltimoTicket}
              className="text-[11px] sunmi-pos-btn-secondary px-2 py-1 rounded transition-colors flex items-center gap-1"
              title="Reimprimir ultimo ticket"
            >
              <Printer size={14} />
              <span className="hidden sm:inline">Reimprimir</span>
            </button>
            <button
              onClick={() => {
                setMostrarHistorialRapido((v) => !v);
                if (!mostrarHistorialRapido) cargarHistorialRapido();
              }}
              className={`text-[11px] sunmi-pos-btn-secondary px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                mostrarHistorialRapido ? "sunmi-pos-text-accent font-medium" : ""
              }`}
              title="Ultimos 20 tickets"
            >
              <ClipboardList size={14} />
              <span className="hidden sm:inline">Rapido</span>
            </button>
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
            {/* Egresos manuales: gastos y salidas extraordinarias. La
                recaudación NO se retira por acá — para eso está "Retirar
                recaudación", que además crea el movimiento solo. */}
            {turnoActual && (
              <button
                onClick={() => setMostrarCajaMovimiento(true)}
                className="text-[11px] sunmi-pos-btn-secondary px-2 py-1 rounded transition-colors sunmi-pos-text-accent"
                title="Ingreso o egreso puntual de caja (gastos, cambio)"
              >
                Caja +/-
              </button>
            )}
            {/* RETIRAR RECAUDACIÓN. Reemplaza al botón "Arqueo": el arqueo solo
                fotografiaba y el descuento dependía de que el cajero se acordara
                de crear el movimiento aparte. Acá es una sola operación y el
                movimiento lo crea el backend en la misma transacción.
                `arqueo.visible` exige que el backend haya respondido, así que el
                botón no parpadea mientras carga. El punto rojo sigue marcando la
                alerta vencida. */}
            {turnoActual && arqueo.visible && (
              <button
                onClick={() => abrirRetiro(turnoActual.id)}
                className={`text-[11px] px-2 py-1 rounded transition-colors inline-flex items-center gap-1 ${
                  arqueo.estado.vencido
                    ? "sunmi-pos-btn-danger font-bold"
                    : "sunmi-pos-btn-secondary sunmi-pos-text-accent"
                }`}
                title={
                  arqueo.estado.vencido
                    ? `Retiro pendiente hace ${arqueo.estado.minutosDemora} min`
                    : "Contar la caja y retirar la recaudación"
                }
              >
                {arqueo.estado.vencido && (
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                )}
                {/* Etiqueta corta en pantallas chicas: medido en navegador, con
                    el texto completo la barra de botones del POS se pasa del
                    ancho a 360px y "Salir" queda fuera de la pantalla. El título
                    entero está en el `title` y dentro del modal. */}
                <span className="sm:hidden">Retirar</span>
                <span className="hidden sm:inline">Retirar recaudación</span>
              </button>
            )}
            {turnoActual && (
              <button
                onClick={() => abrirCierre(turnoActual.id)}
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

        {/* Arqueo vencido: franja persistente, sin botón de cerrar. Recargar no
            la hace desaparecer porque el estado vive en el servidor. Solo se va
            registrando el arqueo o consiguiendo una postergación válida. */}
        {turnoActual && arqueo.visible && (
          <AvisoArqueo
            estado={arqueo.estado}
            ultimoArqueoEn={arqueo.ultimoArqueoEn}
            turnoId={turnoActual.id}
            localId={localActual}
            onArquear={() => abrirRetiro(turnoActual.id)}
            onPostergado={() => {
              showSuccess("Retiro postergado");
              arqueo.refrescar();
            }}
          />
        )}

        {/* Venta interna: el cliente representa a un local propio y la venta va a
            generar una transferencia. Depende del MISMO state.clienteSeleccionado,
            así que desaparece solo al cambiar o limpiar el cliente. Va acá —fuera
            del split lg: de abajo— para que se vea igual en móvil y en escritorio,
            antes de cobrar. */}
        <AvisoVentaInterna cliente={state.clienteSeleccionado} />

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

        {/* Panel historial rapido */}
        {mostrarHistorialRapido && (
          <div className="rounded-md sunmi-pos-panel px-3 py-2 text-xs space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-bold sunmi-pos-text-accent">Ultimos tickets</span>
              <button
                onClick={() => { setMostrarHistorialRapido(false); setBusquedaMonto(""); }}
                className="sunmi-pos-muted text-[10px]"
              >
                Cerrar
              </button>
            </div>
            <input
              type="number"
              placeholder="Buscar por monto..."
              autoComplete="off"
              value={busquedaMonto}
              onChange={(e) => setBusquedaMonto(e.target.value)}
              className="w-full px-2 py-1 rounded text-xs sunmi-pos-panel border"
              style={{ borderColor: 'var(--pos-panel-border)' }}
            />
            <div className="max-h-48 overflow-y-auto space-y-1">
              {(() => {
                const montoFiltro = busquedaMonto ? Number(busquedaMonto) : null;
                const filtrados = montoFiltro
                  ? historialRapido.filter((v) => Math.abs(Number(v.total) - montoFiltro) < 50)
                  : historialRapido;
                if (filtrados.length === 0) {
                  return <div className="text-center sunmi-pos-muted py-2">No hay resultados</div>;
                }
                return filtrados.map((v) => (
                  <div key={v.id} className="flex items-center justify-between gap-2 sunmi-surface-soft px-2 py-1 rounded">
                    <span className="sunmi-pos-muted">
                      {new Date(v.fecha).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="font-medium sunmi-pos-text-accent">
                      ${Number(v.total).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="sunmi-pos-muted">#{v.numero}</span>
                    <button
                      onClick={async () => {
                        const { default: imprimirTicketTermico } = await import(
                          "@/lib/pos-ventas/imprimirTicketTermico"
                        );
                        imprimirTicketTermico({
                          numero: v.numero,
                          fecha: v.fecha,
                          items: (v.detalles || []).map((d) => ({
                            nombre: d.nombre,
                            precio: Number(d.precio),
                            cantidad: d.cantidad,
                          })),
                          subtotal: Number(v.subtotal),
                          descuento: Number(v.descuento),
                          total: Number(v.total),
                          formaPago: v.formaPago,
                          vendedor: v.vendedor?.nombre || "-",
                          localNombre,
                        });
                      }}
                      className="text-[10px] sunmi-pos-btn-secondary px-2 py-0.5 rounded"
                    >
                      Reimprimir
                    </button>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

        {/* Layout POS: izquierda ~60% (buscador+carrito) | derecha ~40% (pago) */}
        <div className="flex-1 flex flex-col lg:flex-row gap-2 lg:gap-3 min-h-0">
          {/* Izquierda: Buscador + Carrito */}
          <div className="flex flex-col gap-2 lg:gap-3 lg:flex-[3] min-h-0">
            <BuscadorProductos
              localId={localActual}
              clienteId={state.clienteSeleccionado?.id ?? null}
              onAgregar={handleAgregar}
              esDeposito={contexto?.esDeposito === true}
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
                esDeposito={contexto?.esDeposito === true}
                onModoVentaChange={handleModoVentaChange}
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
              comisiones={comisiones}
              clienteSeleccionado={state.clienteSeleccionado}
              minEfectivoServicios={minEfectivoServicios}
            />
            {/* Mensaje offline */}
            {offlineMode && (
              <div className="mt-2 text-[10px] sunmi-pos-text-accent text-center px-2 py-1 sunmi-pos-panel rounded">
                OFFLINE — Las ventas se guardan en este dispositivo. Debe presionar "Procesar cola" cuando vuelva internet.
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
            // Solo actualizar estado local, el canje se hará dentro de la transacción de venta.
            // La fórmula es la MISMA que usa el servidor para verificar: si acá se
            // calculara distinto, el cobro se rechazaría. Ver lib/pos-ventas/puntos.js.
            const pesoPorPunto = puntosConfig?.redencionJson?.pesoPorPunto || 0;
            const descuentoCalc = descuentoPorPuntos(pts, pesoPorPunto);
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
          total={state.modalEfectivo.montoEfectivo ?? state.modalEfectivo.total}
          etiquetaMonto={state.modalEfectivo.montoEfectivo != null ? "Efectivo a cubrir" : "Total a cobrar"}
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

      {/* Modal movimiento de caja */}
      {/* Modal peso kg */}
      {productoKgPendiente && (
        <ModalPesoKg
          producto={productoKgPendiente}
          onConfirmar={({ cantidad: cantidadKg, subtotalFijado }) => {
            setPreviousCarrito([...state.carrito]);
            dispatch({
              type: ActionTypes.ADD_ITEM,
              payload: {
                producto: productoKgPendiente,
                cantidadInicial: cantidadKg,
                // Cargado POR PRECIO: el importe tecleado manda sobre el peso.
                subtotalFijado,
              },
            });
            // Alerta de stock bajo (kg)
            const enCarrito = state.carrito.find((i) => i.productoBaseId === productoKgPendiente.productoBaseId);
            const cantResultante = (enCarrito ? enCarrito.cantidad : 0) + cantidadKg;
            const stockKg = productoKgPendiente.stock ?? Infinity;
            if (stockKg !== Infinity && cantResultante >= stockKg) {
              showError(`Stock bajo: "${productoKgPendiente.nombre}" tiene ${stockKg} kg en stock`);
            }
            setProductoKgPendiente(null);
          }}
          onCancelar={() => setProductoKgPendiente(null)}
        />
      )}

      {/* Modal importe de servicio (carga de colectivo / carga virtual) */}
      {servicioPendiente && (
        <ModalImporteServicio
          producto={servicioPendiente}
          onConfirmar={handleConfirmarServicio}
          onCancelar={() => setServicioPendiente(null)}
        />
      )}

      {mostrarCajaMovimiento && turnoActual && (
        <ModalCajaMovimiento
          turnoId={turnoActual.id}
          onClose={() => setMostrarCajaMovimiento(false)}
          onSuccess={(item) => {
            showSuccess(`${item.tipo === "INGRESO" ? "Ingreso" : "Retiro"} de $${Number(item.monto).toLocaleString("es-AR", { minimumFractionDigits: 2 })} registrado`);
            // Un movimiento cambia el esperado: se refresca el estado.
            arqueo.refrescar();
          }}
        />
      )}

      {/* Ni el arqueo, ni el retiro, ni el cierre se abren ya como modal desde
          el POS.

          El retiro vive en /modulos/pos-ventas/retiros/nuevo y el cierre en
          /modulos/pos-ventas/cierres: contar un cajón lleva minutos y en un
          modal el cajero no podía salir a cobrar sin perder el conteo. El
          carrito persiste por local y usuario, así que ir y volver es seguro.

          El cierre agrega algo que el modal no podía dar: al cortar, ESTA
          pestaña suelta el turno y vuelve al ingreso de operario, así que el
          relevo empieza a vender mientras el saliente cuenta. Ver
          `soltarTurnoCortado` y lib/caja/senalCierre.js.

          ModalCierreTurno.jsx y /api/pos-ventas/turnos/cerrar siguen en el
          repositorio como vía administrativa acotada. El endpoint rechaza
          cualquier turno con corte tomado, así que no puede competir con este
          flujo ni cerrar por atrás una caja congelada. */}

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

/**
 * Manda a la apertura nueva.
 *
 * Se navega en vez de renderizar la pantalla acá adentro porque el POS ya tiene
 * mucho estado propio —carrito, cola offline, arqueo— y montar la apertura
 * dentro de este componente la ataría a todo eso. Con una ruta propia, la
 * apertura se puede abrir directo, recargar y volver, y el POS no tiene que
 * saber nada de cambios pendientes.
 *
 * El `replace` es deliberado: si fuera `push`, el botón Atrás devolvería a un POS
 * sin turno que volvería a redirigir, y el usuario quedaría preso del rebote.
 */
function RedirigirAApertura({ router }) {
  useEffect(() => {
    router.replace("/modulos/pos-ventas/aperturas");
  }, [router]);

  return (
    <div className="sunmi-bg w-full min-h-full flex items-center justify-center p-4">
      <p className="text-sm sunmi-text-muted">Abriendo caja…</p>
    </div>
  );
}
