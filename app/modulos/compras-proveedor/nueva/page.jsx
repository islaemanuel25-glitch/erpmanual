"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiPanel from "@/components/sunmi/SunmiPanel";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiPill from "@/components/sunmi/SunmiPill";
import SunmiPageSizer from "@/components/sunmi/SunmiPageSizer";
import { Search, Trash2, ShoppingCart, ChevronUp } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";
import ModalVincularCodigo from "@/components/compras-proveedor/ModalVincularCodigo";
import ModalEnviarPedido from "@/components/compras-proveedor/ModalEnviarPedido";
import CarritoPedido from "@/components/compras-proveedor/CarritoPedido";
import {
  ORIGENES,
  CLAVE_PEDIDO_EN_CURSO,
  linkEditarProducto,
  debeReabrirPedido,
  serializarPedidoEnCurso,
  deserializarPedidoEnCurso,
} from "@/lib/compras-proveedor/retornoPedido";
import {
  subtotalLinea,
  unidadDisplay,
  naturalezaLinea,
  permiteToggleUnidad,
  convertirUnidadPedido,
} from "@/lib/compras-proveedor/calculoPedido";
import {
  recibeHoy,
  formatDiaLabel,
  diaActualEnum,
} from "@/lib/proveedores/diasPedido";

// Trío de vistas del catálogo. El tercer pill "Cargados (N)" es el filtro del
// pedido (soloPedido), que se renderiza aparte con su contador.
const FILTROS_VISTA = [
  ["sugeridos", "Sugeridos"],
  ["todos", "Todos"],
];

// Moneda es-AR: punto de miles, SIN centavos. Para subtotales y totales (montos
// agregados). El costo unitario editable conserva sus decimales aparte.
const NF_ARS = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const fmtPesos = (n) => `$${NF_ARS.format(Math.round(Number(n) || 0))}`;

export default function NuevaCompraProveedorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { perfil } = useUser();
  // `contexto` hace falta para el link a editar producto: la edición se hace
  // parado en la ubicación activa, y el backend rechaza con 403 si esa ubicación
  // no es dueña del producto.
  const { loading: loadingCtx, needsContexto, contexto } = useContextoActivo();

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
  // Líneas que NO se pudieron restaurar al volver de editar un producto. Aparte
  // de postVinculoMsg: eso confirma una acción, esto avisa una pérdida.
  const [avisoRestauracion, setAvisoRestauracion] = useState("");
  const justLinkedRef = useRef(null);
  // Proveedor para el que ya se sembraron los sugeridos (evita re-sembrar y que
  // un sugerido quitado vuelva solo en la misma sesión).
  const autofillRef = useRef(null);
  // Se arma en el primer render: si venimos de editar un producto, la carga del
  // catálogo tiene que restaurar el pedido en vez de arrancar vacía.
  const restaurarRef = useRef(debeReabrirPedido(searchParams));

  // Items del pedido (sugeridos precargados + los agregados manualmente).
  const [items, setItems] = useState([]);
  // Cantidad de borrador por fila NO agregada (productoLocalId → valor). Default = sugerido.
  const [draftCant, setDraftCant] = useState({});
  // Vista del listado: "sugeridos" | "todos" | "bajoStock" | "cargados" (cantidad>0).
  // Arranca en "sugeridos": el pedido aparece prácticamente armado al abrir el proveedor.
  const [vista, setVista] = useState("sugeridos");
  // Filtro por categoría (id como string; "" = todas).
  const [categoriaFilter, setCategoriaFilter] = useState("");
  // Filtro "Pedido (N)": muestra SOLO las filas que están en el pedido (itemsMap).
  // Es un overlay, no toca `vista` ni el orden estable del catálogo. Se guarda la
  // página del catálogo para restaurarla al salir del filtro.
  const [soloPedido, setSoloPedido] = useState(false);
  const pageAntesPedido = useRef(1);

  // Modo de armado del pedido: "automatico" (sugeridos precargados por faltante)
  // o "manual" (arranca en cero, se arma buscando/filtrando). En continuar no
  // aplica: el borrador ya trae sus ítems.
  const [modo, setModo] = useState("automatico");
  // Modo pendiente de confirmar cuando el cambio destruiría ítems ya cargados.
  const [confirmModo, setConfirmModo] = useState(null);
  // Conversión Unidad→Pack no exacta pendiente de decisión del usuario.
  const [convModal, setConvModal] = useState(null);
  const modoManual = !esContinuar && modo === "manual";
  // "Auto" (muestra stock/faltante, tabs de sugeridos) = automático o continuar.
  const esAuto = !modoManual;

  // Tamaño de página del catálogo.
  const [pageSize, setPageSize] = useState(25);
  const [pageNum, setPageNum] = useState(1);

  // Resumen del pedido bajo demanda (drawer desktop / bottom-sheet mobile).
  const [resumenOpen, setResumenOpen] = useState(false);

  // Cargar preferencia persistida (cliente).
  useEffect(() => {
    try {
      const ps = Number(localStorage.getItem("comprasNuevaPageSize"));
      if ([25, 50, 100].includes(ps)) setPageSize(ps);
    } catch {
      // sin preferencias guardadas → defaults
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("comprasNuevaPageSize", String(pageSize));
    } catch {}
  }, [pageSize]);

  // Modal de envío (Confirmar pedido).
  const [modalEnvioOpen, setModalEnvioOpen] = useState(false);
  const [pedidoEnvio, setPedidoEnvio] = useState(null);

  const [saving, setSaving] = useState(false);

  // Detección de pedido BORRADOR existente para el proveedor seleccionado.
  const [borradorExistente, setBorradorExistente] = useState(null);

  // Proveedor seleccionado (objeto completo) para mostrar info de dias_pedido.
  const proveedorSel = useMemo(
    () =>
      proveedores.find((p) => String(p.id) === String(proveedorId)) || null,
    [proveedores, proveedorId]
  );

  const nombreProveedorActivo =
    proveedorNombre || proveedorSel?.nombre || "";

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
            baseId: base.id ?? null,
            costoCatalogo: Number(base.precio_costo) || 0,
            nombre: base.nombre || "",
            sku: base.sku || "",
            modoCompra,
            // Unidad de pedido de la línea (separada de la naturaleza del producto).
            unidadPedido: d.unidad || (modoCompra === "UNIDAD" ? "UNIDAD" : "BULTO"),
            unidad_medida: base.unidad_medida,
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
  useEffect(() => {
    setBorradorExistente(null); // reset en cada cambio de proveedor
    setDraftCant({}); // limpiar borradores de cantidad al cambiar de proveedor
    setCategoriaFilter("");
    setSoloPedido(false);
    if (esContinuar) return;
    // Cambiar de proveedor arranca un pedido limpio (los sugeridos se resiembran
    // luego en cargarProductos si el modo es automático).
    setItems([]);
    if (!proveedorId) return;

    let cancelado = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/compras-proveedor/listar?estado=BORRADOR&proveedorId=${proveedorId}&pageSize=10`,
          { credentials: "include" }
        );
        const data = await res.json();
        if (cancelado) return;
        if (data.ok && Array.isArray(data.items)) {
          // Ignorar borradores VACÍOS: no se puede "continuar" un pedido sin
          // productos. Se ofrece el borrador más reciente que tenga ítems.
          const conItems = data.items.find((it) => (it.cantItems || 0) > 0);
          if (conItems) setBorradorExistente(conItems);
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

        // Sugeridos por stock bajo/faltante = ítems PRECARGADOS del pedido (no
        // borradores). Se siembran UNA vez por proveedor; si el usuario quita un
        // sugerido, no vuelve solo (ref guard). Reset/Nuevo recalcula desde cero.
        // Solo en modo automático: el manual arranca siempre en cero.
        if (
          modo === "automatico" &&
          !esContinuar &&
          !search &&
          autofillRef.current !== String(proveedorId)
        ) {
          autofillRef.current = String(proveedorId);
          const sembrado = (data.items || [])
            .filter((pr) => pr.sugerido > 0)
            .map((pr) => ({
              productoLocalId: pr.productoLocalId,
              baseId: pr.baseId ?? null,
              costoCatalogo: Number(pr.precio_costo) || 0,
              nombre: pr.nombre,
              sku: pr.sku,
              codigo_barra: pr.codigo_barra,
              codigoInterno: pr.codigoInterno || null,
              modoCompra: pr.modoCompra || "BULTO",
              unidadPedido: pr.modoCompra === "UNIDAD" ? "UNIDAD" : "BULTO",
              unidad_medida: pr.unidad_medida,
              cantidad: pr.sugerido,
              precioCosto: Number(pr.precio_costo || 0),
              factorPack: Number(pr.factor_pack) || 1,
              sugerido: pr.sugerido,
              sinParametros: pr.sinParametros,
              pesoRefKg: pr.pesoRefKg,
            }));
          setItems(sembrado);
        }

        // VOLVIENDO DE EDITAR UN PRODUCTO: restaurar el pedido que estaba en curso.
        //
        // Se restauran las CANTIDADES guardadas, y el costo y los datos del
        // producto salen del catálogo recién traído. Por eso esto va acá dentro
        // y no en un efecto aparte: si se restaurara antes de la carga, la línea
        // mostraría el costo viejo, que es justo lo que se fue a cambiar.
        if (restaurarRef.current) {
          restaurarRef.current = false;
          let guardado = null;
          try {
            guardado = deserializarPedidoEnCurso(sessionStorage.getItem(CLAVE_PEDIDO_EN_CURSO));
            sessionStorage.removeItem(CLAVE_PEDIDO_EN_CURSO);
          } catch {
            guardado = null;
          }
          if (guardado && String(guardado.proveedorId) === String(proveedorId)) {
            const porId = new Map((data.items || []).map((pr) => [pr.productoLocalId, pr]));
            // Las que no se pudieron restaurar se AVISAN. Restaurar el resto está
            // bien; hacerlo callado no: alguien confirmaría el pedido creyendo
            // que está completo.
            const perdidas = [];
            const restaurado = guardado.lineas
              .map((l) => {
                const pr = porId.get(l.productoLocalId);
                if (!pr) {
                  // Ya no está en el universo del proveedor: le sacaron el
                  // proveedor, lo desactivaron o lo borraron mientras se editaba
                  // el producto.
                  perdidas.push(l.productoLocalId);
                  return null;
                }
                return {
                  productoLocalId: pr.productoLocalId,
                  baseId: pr.baseId ?? null,
                  costoCatalogo: Number(pr.precio_costo) || 0,
                  nombre: pr.nombre,
                  sku: pr.sku,
                  codigo_barra: pr.codigo_barra,
                  codigoInterno: pr.codigoInterno || null,
                  modoCompra: pr.modoCompra || "BULTO",
                  unidadPedido: l.unidadPedido || (pr.modoCompra === "UNIDAD" ? "UNIDAD" : "BULTO"),
                  unidad_medida: pr.unidad_medida,
                  cantidad: l.cantidad,
                  // Del catálogo, NO del guardado: es el costo nuevo.
                  precioCosto: Number(pr.precio_costo || 0),
                  factorPack: Number(pr.factor_pack) || 1,
                  sugerido: pr.sugerido,
                  sinParametros: pr.sinParametros,
                  pesoRefKg: pr.pesoRefKg,
                };
              })
              .filter(Boolean);
            if (restaurado.length > 0) {
              autofillRef.current = String(proveedorId); // no re-sembrar encima
              setItems(restaurado);
              setNotas(guardado.notas || "");
            }
            if (perdidas.length > 0) {
              // Se nombra CUÁL se perdió y POR QUÉ, no "hubo un problema". Sin el
              // dato, la persona no puede volver a agregarlo ni saber qué le falta.
              const cuales = perdidas.join(", ");
              setAvisoRestauracion(
                perdidas.length === 1
                  ? `Se recuperó el pedido, pero una línea quedó afuera (producto ${cuales}): ya no aparece entre los de este proveedor. Puede que le hayan sacado el proveedor, lo hayan desactivado o lo hayan borrado. Si lo necesitás, agregalo de nuevo.`
                  : `Se recuperó el pedido, pero ${perdidas.length} líneas quedaron afuera (productos ${cuales}): ya no aparecen entre los de este proveedor. Si las necesitás, agregalas de nuevo.`
              );
            }
          }
        }

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
  }, [proveedorId, search, esContinuar, modo]);

  useEffect(() => {
    const timer = setTimeout(cargarProductos, 300);
    return () => clearTimeout(timer);
  }, [cargarProductos]);

  // ── Carga de un producto al pedido ─────────────────────────────────────
  // modoCompra es la ÚNICA fuente de verdad: "BULTO" (depósito) o "UNIDAD" (fiambre)
  // En modo continuar, persiste inmediatamente vía /agregar-item.
  const agregarItem = async (prod, cantidadParam, costoParam, unidadParam) => {
    if (items.find((i) => i.productoLocalId === prod.productoLocalId)) return;

    const cantidadInicial =
      cantidadParam != null
        ? Math.max(1, Math.floor(Number(cantidadParam) || 1))
        : prod.sugerido > 0
        ? prod.sugerido
        : 1;
    const costoInicial =
      costoParam != null ? Number(costoParam) || 0 : Number(prod.precio_costo || 0);
    const unidadInicial =
      unidadParam || (prod.modoCompra === "UNIDAD" ? "UNIDAD" : "BULTO");
    const nuevoItemBase = {
      productoLocalId: prod.productoLocalId,
      baseId: prod.baseId ?? null,
      costoCatalogo: Number(prod.precio_costo) || 0,
      nombre: prod.nombre,
      sku: prod.sku,
      modoCompra: prod.modoCompra || "BULTO",
      unidadPedido: unidadInicial,
      unidad_medida: prod.unidad_medida,
      cantidad: cantidadInicial,
      precioCosto: costoInicial,
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
              precioCosto: costoInicial > 0 ? costoInicial : null,
              unidad: unidadInicial,
            }),
          }
        );
        const data = await res.json();
        if (!data.ok) {
          alert(data.error || "No se pudo agregar el producto al borrador");
          return;
        }
        setItems((prev) => [...prev, { ...nuevoItemBase, detalleId: data.detalle.id }]);
      } catch {
        alert("Error de conexión al agregar el producto");
      }
      return;
    }

    setItems((prev) => [...prev, nuevoItemBase]);
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
        // Se quitó el último ítem: el borrador se eliminó en la base. Ya no hay
        // pedido que continuar → volver a un pedido nuevo limpio.
        if (data.pedidoEliminado) {
          resetParaNuevoPedido();
          return;
        }
      } catch {
        alert("Error de conexión al quitar el producto");
        return;
      }
    }

    setItems((prev) => prev.filter((i) => i.productoLocalId !== productoLocalId));
    // La fila vuelve al catálogo con cantidad 0 (no re-defaultea al sugerido).
    setDraftCant((prev) => ({
      ...prev,
      [productoLocalId]: { ...prev[productoLocalId], cant: 0 },
    }));
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

    const raw = String(item.cantidad).trim();
    const val = parseInt(raw, 10);

    // Cantidad 0 explícita = no pedir este producto → sale del pedido.
    if (raw !== "" && !isNaN(val) && val <= 0) {
      await quitarItem(productoLocalId);
      return;
    }

    // Vacío / inválido: se repone 1 (no se borra la línea por accidente).
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

  // Persiste una cantidad concreta de un detalle (modo continuar). No lee state,
  // recibe el valor explícito para evitar closures stale en steppers.
  const persistirCantidad = async (detalleId, cantidad) => {
    if (!esContinuar || !detalleId) return;
    try {
      const res = await fetch(
        `/api/compras-proveedor/editar-item/${pedidoIdParam}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ detalleId, cantidad }),
        }
      );
      const data = await res.json();
      if (!data.ok) alert(data.error || "No se pudo guardar la cantidad");
    } catch {
      alert("Error de conexión al guardar la cantidad");
    }
  };

  // Stepper de un item YA agregado. Bajar a 0 = no pedir → quita la línea
  // (el resumen solo cuenta cantidad > 0).
  const fijarCantidadItem = async (prod, nuevoValor) => {
    const item = items.find((i) => i.productoLocalId === prod.productoLocalId);
    if (!item) return;
    const v = Math.floor(Number(nuevoValor) || 0);
    if (v <= 0) {
      await quitarItem(prod.productoLocalId);
      return;
    }
    setItems((prev) =>
      prev.map((i) =>
        i.productoLocalId === prod.productoLocalId ? { ...i, cantidad: v } : i
      )
    );
    await persistirCantidad(item.detalleId, v);
  };

  // ── Borrador de una fila NO agregada: { cant, costo, unidad } ───────────
  const unidadDefault = (prod) => (prod.modoCompra === "UNIDAD" ? "UNIDAD" : "BULTO");
  const getDraft = (prod) => {
    const d = draftCant[prod.productoLocalId] || {};
    return {
      cant: d.cant !== undefined ? d.cant : prod.sugerido > 0 ? prod.sugerido : "",
      costo: d.costo !== undefined ? d.costo : Number(prod.precio_costo || 0),
      unidad: d.unidad !== undefined ? d.unidad : unidadDefault(prod),
    };
  };
  const setDraftField = (prod, field, value) =>
    setDraftCant((prev) => ({
      ...prev,
      [prod.productoLocalId]: { ...prev[prod.productoLocalId], [field]: value },
    }));

  // Stepper de fila NO agregada: editar la cantidad la suma directo al pedido
  // (catálogo: el usuario edita cantidades, no aprieta "Agregar" fila por fila).
  const stepDraftCant = (prod, delta) => {
    const d = getDraft(prod);
    const cur = Number(d.cant) || 0;
    const next = Math.max(0, cur + delta);
    if (next >= 1) {
      agregarItem(prod, next, d.costo, d.unidad);
      setDraftCant((prev) => {
        const n = { ...prev };
        delete n[prod.productoLocalId];
        return n;
      });
    } else {
      setDraftField(prod, "cant", next);
    }
  };

  // Blur del input de cantidad de una fila NO agregada: si quedó > 0, se agrega.
  const handleBlurDraftCant = (prod) => {
    const d = getDraft(prod);
    const q = Math.floor(Number(d.cant) || 0);
    if (q >= 1) agregarDesdeFila(prod);
  };

  // Aplica una conversión ya resuelta ({ unidad, cantidad, costo }) a una fila.
  // El costo NO se redondea: se conserva a full precisión (fuente de verdad del
  // subtotal); solo el valor visible se redondea al renderizar.
  const aplicarConversion = (productoLocalId, enPedido, res) => {
    if (enPedido) {
      setItems((prev) =>
        prev.map((i) =>
          i.productoLocalId === productoLocalId
            ? { ...i, unidadPedido: res.unidad, cantidad: res.cantidad, precioCosto: res.costo }
            : i
        )
      );
    } else {
      setDraftCant((prev) => ({
        ...prev,
        [productoLocalId]: {
          ...prev[productoLocalId],
          unidad: res.unidad,
          cant: res.cantidad,
          costo: res.costo,
        },
      }));
    }
  };

  // Pedido de toggle Pack/Unidad. Convierte la cantidad a la nueva unidad
  // conservando el subtotal. Si Unidad→Pack no es exacto, abre confirmación.
  const solicitarToggle = (prod, rv) => {
    const unidad = rv.disp; // "BULTO" | "UNIDAD"
    const cantidad = Number(rv.cantidadVal) || 0;
    const costo = Number(rv.costoActual) || 0;
    const factor = rv.factor;

    // Sin cantidad cargada: solo cambia la unidad y reexpresa el costo (sin
    // convertir cantidades ni pedir confirmación).
    if (cantidad <= 0) {
      const f = Math.max(1, factor);
      const nueva = unidad === "BULTO" ? "UNIDAD" : "BULTO";
      const nuevoCosto = f > 1 ? (nueva === "UNIDAD" ? costo / f : costo * f) : costo;
      aplicarConversion(prod.productoLocalId, rv.enPedido, {
        unidad: nueva,
        cantidad: rv.enPedido ? Number(rv.item.cantidad) || 0 : rv.d.cant,
        costo: nuevoCosto,
      });
      return;
    }

    const res = convertirUnidadPedido({ unidad, cantidad, costo, factor });
    if (res.needsConfirm) {
      setConvModal({
        productoLocalId: prod.productoLocalId,
        enPedido: rv.enPedido,
        packs: res.packs,
        units: res.units,
        factor: res.factor,
        costo,
      });
      return;
    }
    aplicarConversion(prod.productoLocalId, rv.enPedido, res);
  };

  // Resuelve el diálogo de conversión no exacta.
  const resolverConversion = (accion) => {
    if (!convModal) return;
    if (accion === "redondear") {
      const { productoLocalId, enPedido, costo, factor } = convModal;
      const res = convertirUnidadPedido({
        unidad: "UNIDAD",
        cantidad: convModal.units,
        costo,
        factor,
        redondear: true,
      });
      aplicarConversion(productoLocalId, enPedido, res);
    }
    // "mantener" y "cancelar": la línea permanece en Unidad sin cambios.
    setConvModal(null);
  };

  // Agregar al pedido con los valores editados del borrador (requiere cant > 0).
  const agregarDesdeFila = (prod) => {
    const d = getDraft(prod);
    const q = Math.floor(Number(d.cant) || 0);
    if (q < 1) return;
    agregarItem(prod, q, d.costo, d.unidad);
    setDraftCant((prev) => {
      const next = { ...prev };
      delete next[prod.productoLocalId];
      return next;
    });
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

  // Crea el pedido como PENDIENTE (estado interno BORRADOR). Devuelve el item creado o null.
  const crearBorrador = async () => {
    if (!proveedorId) { alert("Selecciona un proveedor"); return null; }
    if (items.length === 0) { alert("Agrega al menos un producto"); return null; }

    const itemInvalido = items.find((i) => {
      const c = Number(i.cantidad);
      return !Number.isFinite(c) || !Number.isInteger(c) || c < 1;
    });
    if (itemInvalido) {
      alert(`Cantidad invalida en "${itemInvalido.nombre}". Debe ser un entero >= 1.`);
      return null;
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
            unidad: i.unidadPedido || i.modoCompra || "BULTO",
            precioCosto: Number(i.precioCosto) || null,
          })),
        }),
      });
      const data = await res.json();
      if (data.ok) return data.item;
      alert(data.error || "Error al crear pedido");
      return null;
    } finally {
      setSaving(false);
    }
  };

  // Tras guardar/enviar, dejar la pantalla lista para armar otro pedido.
  const resetParaNuevoPedido = useCallback(() => {
    setProveedorId("");
    setProveedorNombre("");
    setNotas("");
    setProductos([]);
    setSearch("");
    setAvisoSinDeposito([]);
    setVincularOpen(false);
    setPostVinculoMsg("");
    justLinkedRef.current = null;
    autofillRef.current = null;
    setItems([]);
    setDraftCant({});
    setVista("sugeridos");
    setCategoriaFilter("");
    setModo("automatico");
    setSoloPedido(false);
    setResumenOpen(false);
    setModalEnvioOpen(false);
    setPedidoEnvio(null);
    setBorradorExistente(null);
    router.replace("/modulos/compras-proveedor/nueva");
  }, [router]);

  // Aplica el cambio de modo (llamado tras confirmar, o directo si no hay ítems).
  const aplicarModo = (nuevoModo, vaciar) => {
    if (vaciar) {
      setItems([]);
      setDraftCant({});
      // Permite resembrar los sugeridos si vuelve a automático.
      autofillRef.current = null;
    }
    setVista(nuevoModo === "manual" ? "todos" : "sugeridos");
    setSoloPedido(false);
    setModo(nuevoModo);
    setConfirmModo(null);
  };

  // Cambiar de modo. Si hay ítems cargados, pedir confirmación clara antes de
  // decidir si se conservan o se empieza de cero.
  const cambiarModo = (nuevoModo) => {
    if (nuevoModo === modo || esContinuar) return;
    const hayItems = items.some((i) => Number(i.cantidad) > 0);
    if (hayItems) {
      setConfirmModo(nuevoModo);
      return;
    }
    aplicarModo(nuevoModo, false);
  };

  // Guardar borrador: deja el pedido guardado (PENDIENTE) y resetea la pantalla.
  const guardarPendiente = async () => {
    if (!window.confirm("¿Guardar el pedido como pendiente?")) return;
    if (esContinuar) {
      resetParaNuevoPedido();
      return;
    }
    const item = await crearBorrador();
    if (item) resetParaNuevoPedido();
  };

  // Confirmar pedido: asegura que exista (crea si es nuevo), trae el pedido
  // completo y abre el modal de envío (el flujo de estados no cambia).
  const enviarPedido = async () => {
    let pedidoId = pedidoIdParam;
    if (!esContinuar) {
      const item = await crearBorrador();
      if (!item) return;
      pedidoId = item.id;
    }
    try {
      const res = await fetch(`/api/compras-proveedor/obtener?id=${pedidoId}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok) {
        setPedidoEnvio(data.item);
        setModalEnvioOpen(true);
      } else {
        alert(data.error || "No se pudo cargar el pedido");
      }
    } catch {
      alert("Error de conexión al cargar el pedido");
    }
  };

  // ── Derivados de render ────────────────────────────────────────────────
  const itemsMap = useMemo(() => {
    const m = new Map();
    for (const i of items) m.set(i.productoLocalId, i);
    return m;
  }, [items]);

  // Base "lógica" para cálculos (naturaleza/unidad/subtotal) desde catálogo + item.
  const baseDe = (prod, item) => ({
    modoCompraProveedor: (item?.modoCompra ?? prod.modoCompra) || "BULTO",
    unidad_medida: prod.unidad_medida,
    factor_pack: prod.factor_pack ?? item?.factorPack,
    pesoReferenciaKg: prod.pesoRefKg ?? item?.pesoRefKg,
  });

  // Variables computadas de una fila (compartidas por tabla desktop y lista mobile).
  const rowVars = (p) => {
    const item = itemsMap.get(p.productoLocalId);
    const enPedido = !!item;
    const base = baseDe(p, item);
    const esFiambre = naturalezaLinea(base) === "FIAMBRE";
    const esPack = naturalezaLinea(base) === "PACK";
    const puedeToggle = permiteToggleUnidad(base) && !esContinuar;
    const factor = Math.max(1, Number(p.factor_pack ?? item?.factorPack) || 1);
    const d = enPedido ? null : getDraft(p);
    const cantidadVal = enPedido ? item.cantidad : d.cant;
    const cantNum = Number(cantidadVal) || 0;
    const enPreparacion = !enPedido && cantNum > 0;
    const activa = enPedido || enPreparacion;
    const costoActual = enPedido ? item.precioCosto : d.costo;
    const unidadActual = enPedido ? item.unidadPedido : d.unidad;
    const r = activa ? subtotalLinea({ base, cantidad: cantNum, costo: costoActual }) : null;
    const pesoRef = Number(p.pesoRefKg ?? item?.pesoRefKg) || 0;
    const codigo = p.codigo_barra || p.sku || "—";
    const disp = unidadDisplay(base, unidadActual);
    const bultoNombre =
      base.unidad_medida === "cajon" || base.unidad_medida === "caja"
        ? "Caja"
        : base.unidad_medida === "carton"
        ? "Cartón"
        : base.unidad_medida === "pack"
        ? "Pack"
        : "Bulto";
    const unidadLabel =
      disp === "BULTO" ? bultoNombre : disp === "PIEZA / por kg" ? "Pieza" : disp;
    const costoUnidad =
      esFiambre || base.unidad_medida === "kg"
        ? "kg"
        : disp === "BULTO"
        ? bultoNombre.toLowerCase()
        : "u";
    return {
      item, enPedido, base, esFiambre, esPack, puedeToggle, factor, d, cantidadVal,
      cantNum, enPreparacion, activa, costoActual, unidadActual, r, pesoRef,
      codigo, disp, bultoNombre, unidadLabel, costoUnidad,
    };
  };

  // Total estimado del pedido.
  const total = useMemo(
    () =>
      items.reduce((acc, i) => {
        const r = subtotalLinea({
          base: {
            modoCompraProveedor: i.modoCompra,
            unidad_medida: i.unidad_medida,
            factor_pack: i.factorPack,
            pesoReferenciaKg: i.pesoRefKg,
          },
          cantidad: i.cantidad,
          costo: i.precioCosto,
        });
        return acc + (r.subtotal || 0);
      }, 0),
    [items]
  );

  // El resumen solo cuenta líneas con cantidad > 0.
  const lineasCount = useMemo(
    () => items.filter((i) => Number(i.cantidad) > 0).length,
    [items]
  );

  // ¿Hay búsqueda activa? Con búsqueda, el buscador MANDA.
  const buscando = search.trim().length > 0;

  // Toggle del filtro "Pedido (N)". Al entrar guarda la página del catálogo y va
  // a la 1; al salir la restaura. No toca `vista` (overlay).
  const togglePedido = () => {
    if (soloPedido) {
      setSoloPedido(false);
      setPageNum(pageAntesPedido.current);
    } else {
      if (lineasCount === 0) return;
      pageAntesPedido.current = pageNum;
      setSoloPedido(true);
      setPageNum(1);
    }
  };

  // Si el pedido queda vacío estando en el filtro, salir solo (no dejarlo en una
  // vista vacía) y volver a la página del catálogo donde estaba.
  useEffect(() => {
    if (soloPedido && lineasCount === 0) {
      setSoloPedido(false);
      setPageNum(pageAntesPedido.current);
    }
  }, [soloPedido, lineasCount]);

  // Categorías presentes en el catálogo del proveedor (para el filtro).
  const categorias = useMemo(() => {
    const m = new Map();
    for (const p of productos) {
      if (p.categoriaId != null && !m.has(p.categoriaId)) {
        m.set(p.categoriaId, p.categoriaNombre || `Categoría ${p.categoriaId}`);
      }
    }
    return [...m.entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [productos]);

  // Orden por URGENCIA: mayor faltante primero, luego mayor sugerido, luego nombre.
  const ordenarUrgencia = (a, b) => {
    const fa = a.faltante || 0;
    const fb = b.faltante || 0;
    if (fb !== fa) return fb - fa;
    const sa = a.sugerido || 0;
    const sb = b.sugerido || 0;
    if (sb !== sa) return sb - sa;
    return String(a.nombre || "").localeCompare(String(b.nombre || ""));
  };

  // Lista a renderizar.
  const listaRender = useMemo(() => {
    const filtroCategoria = (arr) =>
      categoriaFilter
        ? arr.filter((p) => String(p.categoriaId ?? "") === String(categoriaFilter))
        : arr;

    // Con búsqueda activa: SOLO los productos que matchean (la API ya filtró).
    if (buscando) {
      return filtroCategoria([...productos]).sort(ordenarUrgencia);
    }

    // Sin búsqueda: catálogo + items "huérfanos" (cargados fuera del catálogo
    // visible, p. ej. en continuar), aplicando el filtro de vista.
    const enCatalogo = new Set(productos.map((p) => p.productoLocalId));
    const huerfanos = items
      .filter((i) => !enCatalogo.has(i.productoLocalId))
      .map((i) => ({
        productoLocalId: i.productoLocalId,
        nombre: i.nombre,
        sku: i.sku,
        codigo_barra: i.codigo_barra || null,
        codigoInterno: i.codigoInterno || null,
        categoriaId: null,
        categoriaNombre: null,
        modoCompra: i.modoCompra,
        unidad_medida: i.unidad_medida,
        factor_pack: i.factorPack,
        precio_costo: i.precioCosto,
        pesoRefKg: i.pesoRefKg,
        sugerido: 0,
        faltante: 0,
        sinParametros: true,
        bajoMin: false,
        stockActual: null,
        stockMin: null,
        stockMax: null,
      }));

    let lista = [...huerfanos, ...productos];

    // En manual no hay tabs de sugeridos/faltante: siempre catálogo completo.
    // Filtro "Pedido (N)": overridea la vista y muestra solo lo que está en el
    // pedido. No cambia el orden estable (se aplica el mismo sort de abajo).
    if (soloPedido) {
      lista = lista.filter((p) => itemsMap.has(p.productoLocalId));
    } else {
      const v = modoManual ? "todos" : vista;
      if (v === "sugeridos") {
        lista = lista.filter((p) => p.sugerido > 0 || itemsMap.has(p.productoLocalId));
      }
    }

    lista = filtroCategoria(lista);

    // Orden ESTABLE del catálogo: 1) sugeridos/faltantes arriba, 2) resto; dentro
    // de cada grupo por urgencia/nombre. No depende de si la fila está en el
    // pedido → agregar o cambiar cantidad NO mueve la fila de posición ni de
    // página (el "agregado" se marca con el resaltado; "ver lo cargado" es Ver
    // resumen). Que la fila esté cargada se refleja aparte, sin reordenar.
    const tier = (p) => (p.sugerido > 0 || p.faltante > 0 ? 1 : 0);
    return lista.sort((a, b) => {
      const t = tier(b) - tier(a);
      if (t !== 0) return t;
      return ordenarUrgencia(a, b);
    });
  }, [productos, items, vista, modoManual, soloPedido, itemsMap, buscando, categoriaFilter]);

  // Paginación cliente del listado (Mostrar 25/50/100).
  const totalPages = Math.max(1, Math.ceil(listaRender.length / pageSize));
  const pageEff = Math.min(pageNum, totalPages);
  const pageRows = useMemo(
    () => listaRender.slice((pageEff - 1) * pageSize, pageEff * pageSize),
    [listaRender, pageEff, pageSize]
  );

  // Resetear a la primera página cuando cambia el conjunto/orden.
  useEffect(() => {
    setPageNum(1);
  }, [search, vista, modo, proveedorId, pageSize, categoriaFilter]);

  if (!perfil || loadingCtx) return null;
  if (needsContexto) {
    router.push("/inicio");
    return null;
  }

  const permisosP = perfil?.permisos || [];
  const esAdminP = Array.isArray(permisosP) && permisosP.includes("*");
  if (!esAdminP && !permisosP.includes("compras.crear")) return <SinPermisos />;

  // Editar un producto y cargar un pedido son permisos DISTINTOS y separables:
  // hoy los cuatro roles que pueden pedir también pueden editar, pero el registro
  // los declara aparte, así que un rol nuevo podría tener uno y no el otro. Si no
  // tiene el permiso, el botón no aparece — en vez de aparecer y devolver 403 en
  // la cara de quien lo aprieta.
  const puedeEditarProductoP = esAdminP || permisosP.includes("productos.editar");

  // Ir a editar el producto de una línea, y volver acá con el pedido intacto.
  //
  // El pedido en curso se guarda en la pestaña ANTES de navegar. No se crea un
  // borrador en el servidor: eso haría aparecer un pedido en la lista de
  // pendientes que nadie pidió crear y habría que salir a limpiarlo.
  //
  // Al volver se restauran las CANTIDADES, no los costos: el costo se vuelve a
  // pedir al catálogo, porque el motivo de haber ido a editar el producto es
  // justamente que cambió. Restaurar el costo guardado mostraría el viejo.
  const irAEditarProducto = (item) => {
    if (!item?.baseId) return;
    const enCurso = serializarPedidoEnCurso({ proveedorId, items, notas });
    try {
      if (enCurso) {
        sessionStorage.setItem(CLAVE_PEDIDO_EN_CURSO, JSON.stringify(enCurso));
      } else {
        sessionStorage.removeItem(CLAVE_PEDIDO_EN_CURSO);
      }
    } catch {
      // Sin sessionStorage se pierde el carrito al volver, pero no se rompe la
      // navegación: es preferible a quedarse sin poder editar el producto.
    }
    const url = linkEditarProducto({
      baseId: item.baseId,
      localId: contexto?.localId,
      origen: ORIGENES.PEDIDO_NUEVO,
      proveedorId,
    });
    if (url) router.push(url);
  };

  const accionesDeshabilitadas = saving || lineasCount === 0 || !proveedorId;

  const tituloSeccion = buscando
    ? `Resultados de “${search.trim()}”`
    : soloPedido
    ? "Productos del pedido"
    : modoManual
    ? "Catálogo de productos"
    : vista === "sugeridos"
    ? "Sugeridos por faltante"
    : "Todos los productos";

  // ── Fragmentos compartidos ───────────────────────────────────────────────

  // `flex-wrap` en vez de `overflow-x-auto`: la fila no desbordaba, CORTABA. El
  // último chip quedaba partido contra el borde derecho —"Categorías" a medias—
  // sin ninguna señal de que había más a la derecha, así que se leía como algo
  // roto y no como algo desplazable.
  //
  // Bajar de línea solo ocurre cuando no entra: a 412 px sigue en una sola línea
  // y no cambia nada; a 360 el chip de categorías pasa al segundo renglón y se
  // lee completo.
  const chipsFiltros = (size = "md") => (
    <div className="flex items-center gap-1 flex-wrap">
      {/* En manual no se mezclan filtros de sugeridos/bajo stock: solo categoría. */}
      {esAuto &&
        FILTROS_VISTA.map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => {
              // Elegir una vista sale del filtro "Pedido" (navegación nueva).
              setSoloPedido(false);
              setVista(v);
            }}
            className={`${
              size === "md" ? "px-2.5 py-1 text-[11px]" : "px-2.5 py-1 text-[12px] rounded-full"
            } rounded font-medium transition whitespace-nowrap ${
              vista === v && !soloPedido ? "sunmi-btn sunmi-btn-primary" : "sunmi-control"
            }`}
          >
            {label}
          </button>
        ))}
      {/* Filtro "Pedido (N)": muestra solo lo que está en el pedido. Deshabilitado
          si el pedido está vacío. Convive con auto y manual. */}
      <button
        type="button"
        onClick={togglePedido}
        disabled={lineasCount === 0}
        title={
          lineasCount === 0
            ? "Todavía no cargaste productos"
            : soloPedido
            ? "Ver todo el catálogo"
            : "Ver solo lo que está en el pedido"
        }
        className={`${
          size === "md" ? "px-2.5 py-1 text-[11px]" : "px-2.5 py-1 text-[12px] rounded-full"
        } rounded font-medium transition whitespace-nowrap ${
          soloPedido ? "sunmi-btn sunmi-btn-primary" : "sunmi-control"
        } ${lineasCount === 0 ? "opacity-50 cursor-default" : ""}`}
      >
        Cargados ({lineasCount})
      </button>
      {categorias.length > 0 && (
        <div className="w-[148px] shrink-0">
          <SunmiSelectAdv value={categoriaFilter} onChange={setCategoriaFilter}>
            <SunmiSelectOption value="">Categorías: todas</SunmiSelectOption>
            {categorias.map((c) => (
              <SunmiSelectOption key={c.id} value={String(c.id)}>
                {c.nombre}
              </SunmiSelectOption>
            ))}
          </SunmiSelectAdv>
        </div>
      )}
    </div>
  );

  // Decisión inicial: si hay un borrador abierto para el proveedor, se muestra una
  // sola vez. Al elegir una opción la tarjeta desaparece (no ocupa espacio durante
  // toda la carga).
  // `compact` = va DENTRO del encabezado pegajoso de mobile, que ya mide 190 px.
  // Ahí el cartel entra en UNA sola línea —sin `flex-wrap`, con el texto
  // truncable y los botones abreviados— para no llevarse un tercio de la
  // pantalla. Sin `compact` es el de escritorio, que tiene lugar de sobra.
  const bannerBorrador = (compact = false) =>
    borradorExistente && (
      <div
        className={
          compact
            ? "rounded-lg border px-2 py-1 mb-1.5 flex items-center justify-between gap-1.5"
            : "rounded-lg border px-3 py-2 mb-3 flex items-center justify-between gap-2 flex-wrap"
        }
        style={{ borderColor: "var(--pos-warning, #f59e0b)" }}
      >
        <span className={compact ? "text-[11px] min-w-0 truncate" : "text-[12px] min-w-0"}>
          <b style={{ color: "var(--pos-warning, #f59e0b)" }}>
            {compact ? "Pedido en curso" : "Tenés un pedido en curso"}
          </b>{" "}
          <span className="sunmi-text-muted">
            #{borradorExistente.id} · {borradorExistente.cantItems}{" "}
            {borradorExistente.cantItems === 1 ? "ítem" : "ítems"}
          </span>
        </span>
        <div className={compact ? "flex gap-1 shrink-0" : "flex gap-1.5 shrink-0"}>
          <SunmiButton
            color="cyan"
            className={compact ? "!px-2 !py-0.5 text-[11px]" : "!px-2.5 !py-1 text-[12px]"}
            onClick={() =>
              router.push(`/modulos/compras-proveedor/nueva?pedidoId=${borradorExistente.id}`)
            }
          >
            {compact ? "Continuar" : "Continuar pedido"}
          </SunmiButton>
          <SunmiButton
            color="slate"
            className={compact ? "!px-2 !py-0.5 text-[11px]" : "!px-2.5 !py-1 text-[12px]"}
            onClick={() => setBorradorExistente(null)}
          >
            {compact ? "Nuevo" : "Crear pedido nuevo"}
          </SunmiButton>
        </div>
      </div>
    );

  // Selector de modo (segmentado). Solo para pedidos nuevos (en continuar el
  // borrador ya define sus ítems).
  const selectorModo = (compact = false) =>
    !esContinuar && (
      <div
        className={`flex items-center gap-2 ${compact ? "mb-2" : "mb-3"} flex-wrap`}
      >
        <span className="text-[11px] sunmi-text-muted">Tipo de pedido:</span>
        <div className="inline-flex rounded-lg overflow-hidden ring-1 ring-inset sunmi-ring">
          {[
            ["automatico", "Pedido automático"],
            ["manual", "Pedido manual"],
          ].map(([val, label]) => {
            const on = modo === val;
            return (
              <button
                key={val}
                type="button"
                onClick={() => cambiarModo(val)}
                className={`px-3 py-1.5 text-[12px] font-semibold leading-none transition ${
                  on ? "sunmi-btn-base sunmi-btn-primary" : "sunmi-control"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <span className="text-[11px] sunmi-text-muted hidden sm:inline">
          {modo === "manual"
            ? "Armás el pedido desde cero buscando productos."
            : "Precarga los productos con faltante o bajo stock."}
        </span>
      </div>
    );

  // Valor visible del costo: el costo se guarda a full precisión (para no perder
  // exactitud al alternar Pack/Unidad). Acá se redondea SOLO para mostrar/editar,
  // a ≤4 decimales sin ceros sobrantes (ej. 82.2222). Las cadenas (edición en
  // curso) pasan tal cual.
  const fmtCosto = (v) => {
    if (v === "" || v == null) return "";
    if (typeof v === "string") return v;
    if (!Number.isFinite(v)) return "";
    return String(Math.round(v * 10000) / 10000);
  };

  // Costo secundario (la otra unidad) para mostrar ambos costos en la fila.
  const costoSecundario = (rv) => {
    const costoNum = Number(rv.costoActual) || 0;
    const mostrar = rv.factor > 1 && rv.costoUnidad !== "kg" && costoNum > 0;
    if (!mostrar) return null;
    const val = rv.disp === "BULTO" ? costoNum / rv.factor : costoNum * rv.factor;
    const label = rv.disp === "BULTO" ? "u" : rv.bultoNombre.toLowerCase();
    return `≈ $${val.toFixed(2)}/${label}`;
  };

  // Subtítulo compacto de estado (stock / sugerido / faltante).
  // En manual no aplica: no se muestran faltantes ni sugeridos.
  const metaEstado = (p, rv) => {
    const parts = [];
    if (!esAuto) return parts;
    if (p.stockActual != null) {
      // Rojo (danger) SOLO en alerta real: stock bajo el mínimo.
      parts.push({
        txt: `Stock ${rv.esFiambre ? Number(p.stockActual).toFixed(1) : p.stockActual}`,
        danger: p.bajoMin,
      });
    }
    if (!p.sinParametros) {
      // Faltan y Sug. casi siempre coinciden → una sola cifra "Sug.". En fiambre
      // difieren (piezas vs kg): se muestra el sugerido con el faltante en kg.
      const sug = p.sugerido || 0;
      if (sug > 0) {
        const hint = rv.esFiambre && p.faltante > 0 ? ` · faltan ${Number(p.faltante).toFixed(1)} kg` : "";
        // Sin rojo por defecto: se resalta (ámbar) solo si está bajo el mínimo.
        parts.push({ txt: `Sug. ${sug}${hint}`, accent: p.bajoMin });
      } else parts.push({ txt: "OK", ok: true });
    }
    return parts;
  };

  // Badges: fiambre es informativo → neutro (rojo reservado a alertas reales).
  // Bajo mínimo es la ÚNICA alerta que se resalta (ámbar).
  const badges = (rv, p, short = false) => (
    <>
      {rv.esFiambre && (
        <span className="px-1 py-0.5 text-[8.5px] font-bold uppercase rounded sunmi-control sunmi-text-muted leading-none shrink-0">
          {short ? "F" : "Fiambre"}
        </span>
      )}
      {p.bajoMin && (
        <span className="px-1 py-0.5 text-[8.5px] font-bold uppercase rounded bg-amber-500 text-black leading-none shrink-0">
          {short ? "Min" : "Bajo min"}
        </span>
      )}
    </>
  );

  // Toggle segmentado Bulto/Unidad (o pill fija si no aplica).
  const toggleUnidad = (p, rv) =>
    rv.puedeToggle ? (
      <div className="inline-flex rounded-md overflow-hidden shrink-0 ring-1 ring-inset sunmi-ring">
        {[
          ["BULTO", rv.bultoNombre],
          ["UNIDAD", "Un"],
        ].map(([val, lab]) => {
          const on = rv.disp === val;
          return (
            <button
              key={val}
              type="button"
              disabled={!rv.activa}
              onClick={() => {
                if (on || !rv.activa) return;
                solicitarToggle(p, rv);
              }}
              className={`px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                on ? "sunmi-btn-base sunmi-btn-primary" : "sunmi-control"
              } ${!rv.activa ? "opacity-50 cursor-default" : ""}`}
              title={rv.activa ? "Cambiar Bulto / Unidad" : "Poné una cantidad para elegir la unidad"}
            >
              {lab}
            </button>
          );
        })}
      </div>
    ) : (
      <SunmiPill color="slate">{rv.unidadLabel}</SunmiPill>
    );

  // Input de costo (editable en catálogo; deshabilitado si la fila no está activa).
  const costoInput = (p, rv, w = "w-[80px]") => (
    <SunmiInput
      type="text"
      inputMode="decimal"
      value={
        rv.enPedido
          ? fmtCosto(rv.item.precioCosto)
          : rv.enPreparacion
          ? fmtCosto(rv.d.costo)
          : Number(rv.d.costo) > 0
          ? fmtCosto(Number(rv.d.costo))
          : ""
      }
      placeholder="0.00"
      disabled={!rv.activa}
      onChange={
        !rv.activa
          ? undefined
          : rv.enPedido
          ? (e) => updateItemCosto(p.productoLocalId, e.target.value)
          : (e) => setDraftField(p, "costo", e.target.value.replace(",", "."))
      }
      onBlur={rv.enPedido ? () => handleBlurCosto(p.productoLocalId) : undefined}
      className={`${w} !py-0.5 text-right tabular-nums text-[12px]`}
    />
  );

  // Stepper de cantidad (agrega/ajusta; bajar a 0 quita la línea).
  const stepper = (p, rv, big = false) => {
    const btn = big ? "w-[30px] h-[30px] text-[16px]" : "w-[22px] h-[22px] text-[14px]";
    // Los anchos NO son los originales. El código pedía 42/44 px, que nunca se
    // aplicaron porque `w-full` los tapaba; al empezar a aplicarse quedaban 26 px
    // útiles, y ahí "1870" ya no entra (mide 31). Cuatro y cinco cifras son
    // corrientes: la misma línea que sugiere 49 packs sugiere 2450 unidades si se
    // la pasa a "Un". Con `!px-1` y estos anchos entran cinco cifras holgadas.
    const inp = big ? "w-[54px] text-[13px]" : "w-[50px] text-[12px]";
    return (
      <div className="flex items-center justify-center gap-0.5">
        <button
          type="button"
          onClick={() =>
            rv.enPedido ? fijarCantidadItem(p, (Number(rv.item.cantidad) || 1) - 1) : stepDraftCant(p, -1)
          }
          aria-label="Restar cantidad"
          className={`${btn} flex items-center justify-center rounded sunmi-control leading-none`}
        >
          −
        </button>
        <SunmiInput
          type="text"
          inputMode="numeric"
          value={rv.cantidadVal}
          placeholder="0"
          onChange={(e) =>
            rv.enPedido
              ? updateItemCantidad(p.productoLocalId, e.target.value)
              : setDraftField(p, "cant", e.target.value.replace(/[^\d]/g, ""))
          }
          onBlur={() => (rv.enPedido ? handleBlurCantidad(p.productoLocalId) : handleBlurDraftCant(p))}
          className={`${inp} !py-0.5 !px-1 text-center tabular-nums`}
        />
        <button
          type="button"
          onClick={() =>
            rv.enPedido ? fijarCantidadItem(p, (Number(rv.item.cantidad) || 0) + 1) : stepDraftCant(p, 1)
          }
          aria-label="Sumar cantidad"
          className={`${btn} flex items-center justify-center rounded sunmi-control leading-none`}
        >
          +
        </button>
      </div>
    );
  };

  // ── Barra resumen fija (reemplaza la columna derecha) ──
  // Desktop: sticky al pie del contenido (no tapa el sidebar). Mobile: fixed.
  const barraResumen = (mobile = false) =>
    mobile ? (
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t sunmi-divider sunmi-surface px-3 py-2 shadow-[0_-2px_10px_rgba(0,0,0,0.25)]">
        <button
          type="button"
          onClick={() => lineasCount > 0 && setResumenOpen(true)}
          disabled={lineasCount === 0}
          className="w-full flex items-center gap-1.5 text-[12.5px] sunmi-text-strong mb-1.5 disabled:opacity-60"
          aria-label="Ver resumen del pedido"
        >
          <ShoppingCart size={15} className="shrink-0" />
          <span className="truncate whitespace-nowrap">
            <b>{lineasCount}</b> {lineasCount === 1 ? "producto" : "productos"}{" "}
            <span className="sunmi-text-muted">· Total</span>{" "}
            <b className="sunmi-text-accent tabular-nums">{fmtPesos(total)}</b>
          </span>
          {lineasCount > 0 && (
            <span className="ml-auto flex items-center gap-1 text-[11px] shrink-0" style={{ color: "var(--pos-link)" }}>
              Ver resumen <ChevronUp size={13} />
            </span>
          )}
        </button>
        <div className="flex gap-2">
          <SunmiButton
            color="cyan"
            className="flex-1 !py-1.5 text-[13px]"
            disabled={accionesDeshabilitadas}
            onClick={guardarPendiente}
          >
            {saving ? "Guardando..." : "Guardar"}
          </SunmiButton>
          <SunmiButton
            color="amber"
            className="flex-1 !py-1.5 text-[13px]"
            disabled={accionesDeshabilitadas}
            onClick={enviarPedido}
          >
            Enviar pedido
          </SunmiButton>
        </div>
      </div>
    ) : (
      <div className="sticky bottom-0 z-40 mt-3 rounded-xl border sunmi-divider sunmi-surface px-4 py-2.5 shadow-[0_-2px_12px_rgba(0,0,0,0.18)]">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-[13px] sunmi-text-strong min-w-0">
            <ShoppingCart size={17} className="shrink-0" />
            <span className="whitespace-nowrap">
              <b>{lineasCount}</b> {lineasCount === 1 ? "producto" : "productos"}
            </span>
            <span className="sunmi-text-muted">·</span>
            <span className="whitespace-nowrap">
              <span className="sunmi-text-muted text-[12px]">Total estimado </span>
              <b className="sunmi-text-accent tabular-nums text-[15px]">{fmtPesos(total)}</b>
            </span>
          </div>
          <div className="flex gap-2 shrink-0 ml-auto">
            <SunmiButton
              color="slate"
              className="!px-3 !py-1.5 text-[13px]"
              disabled={lineasCount === 0}
              onClick={() => setResumenOpen(true)}
            >
              Ver resumen
            </SunmiButton>
            <SunmiButton
              color="cyan"
              className="!px-3 !py-1.5 text-[13px]"
              disabled={accionesDeshabilitadas}
              onClick={guardarPendiente}
            >
              {saving ? "Guardando..." : "Guardar borrador"}
            </SunmiButton>
            <SunmiButton
              color="amber"
              className="!px-3 !py-1.5 text-[13px]"
              disabled={accionesDeshabilitadas}
              onClick={enviarPedido}
            >
              Enviar pedido
            </SunmiButton>
          </div>
        </div>
      </div>
    );

  // Modal de confirmación al cambiar de modo con ítems cargados.
  const modalConfirmModo = confirmModo && (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={() => setConfirmModo(null)}
        className="absolute inset-0 bg-black/60"
      />
      <div className="relative w-full max-w-[380px] rounded-2xl sunmi-surface ring-2 ring-inset sunmi-ring shadow-xl p-4">
        <h3 className="text-[14px] font-semibold sunmi-text-strong mb-1">
          Cambiar a {confirmModo === "manual" ? "pedido manual" : "pedido automático"}
        </h3>
        <p className="text-[12.5px] sunmi-text-muted mb-4">
          Ya tenés productos cargados en este pedido. ¿Querés conservarlos o
          empezar de cero?
        </p>
        <div className="flex flex-col gap-2">
          <SunmiButton color="cyan" className="w-full" onClick={() => aplicarModo(confirmModo, false)}>
            Conservar productos y cambiar de modo
          </SunmiButton>
          <SunmiButton color="red" className="w-full" onClick={() => aplicarModo(confirmModo, true)}>
            Empezar de nuevo (vaciar pedido)
          </SunmiButton>
          <SunmiButton color="slate" className="w-full" onClick={() => setConfirmModo(null)}>
            Cancelar
          </SunmiButton>
        </div>
      </div>
    </div>
  );

  // Modal de conversión Unidad→Pack no exacta (cantidad no múltiplo del factor).
  const modalConvUnidad = convModal && (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={() => setConvModal(null)}
        className="absolute inset-0 bg-black/60"
      />
      <div className="relative w-full max-w-[400px] rounded-2xl sunmi-surface ring-2 ring-inset sunmi-ring shadow-xl p-4">
        <h3 className="text-[14px] font-semibold sunmi-text-strong mb-1">
          No equivale a packs exactos
        </h3>
        <p className="text-[12.5px] sunmi-text-muted mb-4">
          Tenés <b className="sunmi-text-strong">{convModal.units} un</b> y 1 pack ={" "}
          <b className="sunmi-text-strong">{convModal.factor} un</b>. No da una cantidad
          exacta de packs. ¿Qué querés hacer?
        </p>
        <div className="flex flex-col gap-2">
          <SunmiButton color="slate" className="w-full" onClick={() => resolverConversion("mantener")}>
            Mantener en unidades ({convModal.units} un)
          </SunmiButton>
          <SunmiButton color="amber" className="w-full" onClick={() => resolverConversion("redondear")}>
            Redondear a {convModal.packs} {convModal.packs === 1 ? "pack" : "packs"} ({convModal.packs * convModal.factor} un)
          </SunmiButton>
          <SunmiButton color="slate" className="w-full" onClick={() => resolverConversion("cancelar")}>
            Cancelar
          </SunmiButton>
        </div>
      </div>
    </div>
  );

  // Celda "Sugerido" (fusión de Faltan + Sug.): una sola cifra cuando coinciden;
  // en fiambre, sugerido en piezas + hint chico del faltante en kg. Sin rojo por
  // defecto: se resalta (ámbar) solo si está bajo el mínimo (alerta real).
  const celdaSugerido = (p, rv) => {
    if (p.sinParametros) return <span className="sunmi-text-muted">—</span>;
    const sug = p.sugerido || 0;
    if (sug <= 0) return <span className="sunmi-text-muted text-[11px]">OK</span>;
    return (
      <div className="leading-tight">
        <span className={p.bajoMin ? "sunmi-text-accent font-semibold" : "sunmi-text-strong"}>
          {sug}
        </span>
        {rv.esFiambre && p.faltante > 0 && (
          <div className="text-[9.5px] sunmi-text-muted leading-none mt-0.5">
            faltan {Number(p.faltante).toFixed(1)} kg
          </div>
        )}
      </div>
    );
  };

  // Tacho neutro (gris) que se vuelve rojo al hover. Nada de tachos rojos
  // encendidos por defecto en cientos de filas.
  const botonQuitar = (p, size = 14) => (
    <button
      type="button"
      onClick={() => quitarItem(p.productoLocalId)}
      aria-label="Quitar del pedido"
      title="Quitar del pedido"
      className="w-[26px] h-[26px] inline-flex items-center justify-center rounded-md sunmi-text-muted hover:bg-red-600 hover:text-white transition"
    >
      <Trash2 size={size} />
    </button>
  );

  // ── Fila del catálogo (desktop, densa estilo módulo Productos) ──
  const filaDesktop = (p) => {
    const rv = rowVars(p);
    const seg = costoSecundario(rv);
    return (
      <div
        key={p.productoLocalId}
        className="flex items-center gap-2 px-3 py-1.5 border-b sunmi-divide text-[12px]"
        style={{
          borderLeft: rv.enPedido ? "3px solid var(--pos-accent, #f59e0b)" : "3px solid transparent",
          // Tinte SOLO en alerta real (bajo mínimo), muy sutil.
          backgroundColor: p.bajoMin
            ? "color-mix(in srgb, var(--pos-warning, #f59e0b) 7%, transparent)"
            : undefined,
        }}
      >
        {/* Producto */}
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-1.5 leading-tight">
            <span className="text-[12.5px] sunmi-text-strong truncate" title={p.nombre}>
              {p.nombre}
            </span>
            {badges(rv, p)}
          </div>
          {p.stockActual != null && esAuto && (
            <div className="text-[10px] leading-none mt-0.5">
              <span className={p.bajoMin ? "sunmi-text-danger" : "sunmi-text-muted"}>
                Stock {rv.esFiambre ? Number(p.stockActual).toFixed(1) : p.stockActual}
              </span>
            </div>
          )}
        </div>

        {/* Código */}
        <div className="w-[112px] shrink-0 text-[10.5px] sunmi-text-muted truncate" title={rv.codigo}>
          {rv.codigo}
        </div>

        {/* Cód. interno */}
        <div className="w-[96px] shrink-0 text-[10.5px] sunmi-text-muted truncate" title={p.codigoInterno || ""}>
          {p.codigoInterno || "—"}
        </div>

        {/* Unidad */}
        <div className="w-[104px] shrink-0">{toggleUnidad(p, rv)}</div>

        {/* Pack (equivale a "1 pack = N un") */}
        <div className="w-[48px] shrink-0 text-center text-[11px] sunmi-text-muted tabular-nums">
          {rv.esPack ? rv.factor : "—"}
        </div>

        {/* Sugerido (fusión Faltan/Sug.) */}
        <div className="w-[64px] shrink-0 text-right text-[12px] tabular-nums">
          {esAuto ? celdaSugerido(p, rv) : <span className="sunmi-text-muted">—</span>}
        </div>

        {/* Cantidad */}
        <div className="w-[104px] shrink-0">
          {stepper(p, rv)}
          {rv.esFiambre && rv.pesoRef > 0 && rv.cantNum > 0 && (
            <div className="text-[9.5px] sunmi-text-muted text-center mt-0.5 leading-none">
              ~{(rv.cantNum * rv.pesoRef).toFixed(1)} kg
            </div>
          )}
          {rv.esPack && rv.disp === "BULTO" && rv.cantNum > 0 && (
            <div className="text-[9.5px] sunmi-text-accent text-center mt-0.5 leading-none">
              = {rv.cantNum * rv.factor} un
            </div>
          )}
        </div>

        {/* Costo */}
        <div className="w-[112px] shrink-0">
          {costoInput(p, rv, "w-[104px] ml-auto")}
          {rv.activa && seg && (
            <div className="text-[9.5px] sunmi-text-muted text-right leading-none mt-0.5">{seg}</div>
          )}
        </div>

        {/* Subtotal */}
        <div className="w-[100px] shrink-0 text-right text-[12.5px] font-medium tabular-nums">
          {!rv.activa ? (
            <span className="sunmi-text-muted">—</span>
          ) : rv.r.subtotal != null ? (
            fmtPesos(rv.r.subtotal)
          ) : (
            <span className="sunmi-text-accent" title={rv.r.advertencia || ""}>
              ⚠
            </span>
          )}
        </div>

        {/* Acción */}
        <div className="w-[34px] shrink-0 flex justify-end">
          {rv.enPedido && botonQuitar(p)}
        </div>
      </div>
    );
  };

  // ── Fila del catálogo (mobile) ──
  const filaMobile = (p) => {
    const rv = rowVars(p);
    const seg = costoSecundario(rv);
    const meta = metaEstado(p, rv);
    const costoNum = Number(rv.costoActual) || 0;
    return (
      // BOCETO 2026-08-10 — fila mobile reorganizada.
      //
      // El problema: en 360 px el nombre quedaba en UNA letra ("C.", "B.") y el
      // precio unitario aparecía debajo del botón de restar. La fila era de dos
      // columnas —datos a la izquierda, controles a la derecha— y la columna de
      // controles se quedaba con casi todo el ancho.
      //
      // El criterio decidido: GANA EL NOMBRE. Así que deja de ser una fila de
      // dos columnas y pasa a ser un bloque apilado, donde el nombre ocupa el
      // ancho completo y los controles bajan a su propio renglón.
      <div
        key={p.productoLocalId}
        className="px-2.5 py-2"
        style={{ borderLeft: rv.enPedido ? "3px solid var(--pos-accent, #f59e0b)" : "3px solid transparent" }}
      >
        {/* 1) El nombre, con TODO el ancho. Hasta dos renglones: con uno solo,
               los nombres largos de verdad seguían cortándose. */}
        <div className="flex items-start gap-1 leading-tight">
          <span
            className="text-[12.5px] font-medium sunmi-text-strong flex-1 min-w-0 break-words"
            style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
            title={p.nombre}
          >
            {p.nombre}
          </span>
          <div className="shrink-0 flex items-center gap-1">
            {badges(rv, p, true)}
            {rv.enPedido && botonQuitar(p, 13)}
          </div>
        </div>

        {/* 2) Estado del producto: stock, sugerido. */}
        <div className="text-[10.5px] sunmi-text-muted leading-tight mt-0.5">
          {meta.map((m, idx) => (
            <span key={idx}>
              {idx > 0 && " · "}
              <span
                className={
                  m.danger ? "sunmi-text-danger" : m.accent ? "sunmi-text-accent" : m.ok ? "sunmi-text-success" : ""
                }
              >
                {m.txt}
              </span>
            </span>
          ))}
        </div>

        {/* 3) Unidad + precio unitario a la izquierda, stepper a la derecha.
               El precio ya no queda debajo de ningún botón: comparten renglón
               pero cada uno tiene su lugar, y el precio puede achicarse. */}
        <div className="flex items-center gap-2 mt-1.5">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {toggleUnidad(p, rv)}
            <span className="text-[10.5px] sunmi-text-muted truncate">
              ${costoNum.toFixed(2)}/{rv.costoUnidad}
              {rv.activa && seg && <span> · {seg.replace("≈ ", "")}</span>}
            </span>
          </div>
          <div className="shrink-0">{stepper(p, rv, true)}</div>
        </div>

        {/* 4) Equivalencia del pack y subtotal, en el mismo renglón: los dos son
               consecuencia de la cantidad y se leen juntos. */}
        {(rv.esPack || (rv.activa && rv.r.subtotal != null)) && (
          <div className="flex items-baseline justify-between gap-2 mt-1">
            <span className="text-[10px] sunmi-text-muted min-w-0 truncate">
              {rv.esPack && (
                <>
                  1 pack = {rv.factor} un
                  {rv.disp === "BULTO" && rv.cantNum > 0 && (
                    <span className="sunmi-text-accent"> · equivale a {rv.cantNum * rv.factor} un</span>
                  )}
                </>
              )}
            </span>
            <span className="text-[12px] font-semibold tabular-nums sunmi-text-strong shrink-0">
              {rv.activa && rv.r.subtotal != null ? fmtPesos(rv.r.subtotal) : ""}
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="sunmi-bg w-full min-h-full max-w-none">
      {/* ===================== DESKTOP ===================== */}
      <div className="hidden md:block p-4">
        {/* Header: título + selector/chip proveedor + volver */}
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <SunmiHeader
            title={
              esContinuar
                ? `Continuar pedido${pedidoIdParam ? ` #${pedidoIdParam}` : ""}`
                : "Nuevo pedido a proveedor"
            }
          />
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] sunmi-text-muted">Proveedor:</span>
            {esContinuar ? (
              <span className="px-2.5 py-1 rounded-md sunmi-control text-[12px] font-medium sunmi-text-strong">
                {proveedorNombre || "—"}
              </span>
            ) : (
              <div className="w-[260px]">
                <SunmiSelectAdv value={proveedorId} onChange={setProveedorId} searchable>
                  <SunmiSelectOption value="">-- Seleccionar --</SunmiSelectOption>
                  {proveedores.map((p) => (
                    <SunmiSelectOption key={p.id} value={String(p.id)}>
                      {p.nombre}
                    </SunmiSelectOption>
                  ))}
                </SunmiSelectAdv>
              </div>
            )}
          </div>
          <div className="ml-auto">
            <SunmiBackButton href="/modulos/inicio" />
          </div>
        </div>

        {bannerBorrador()}

        {/* Selector de modo (debajo del proveedor) */}
        {proveedorId && selectorModo()}

        {/* Warning informativo: hoy no es día válido para este proveedor */}
        {mostrarWarningDia && (
          <div
            className="rounded-lg border px-3 py-2 mb-3 text-[12px]"
            style={{
              borderColor: "var(--pos-warning, #f59e0b)",
              color: "var(--pos-warning, #f59e0b)",
            }}
          >
            <span className="font-semibold">Hoy es {formatDiaLabel(diaActualEnum())}.</span>{" "}
            <span className="sunmi-text-muted">
              {proveedorSel.nombre} recibe pedidos:{" "}
            </span>
            {proveedorSel.dias_pedido.map((d, i) => (
              <SunmiPill key={i}>{formatDiaLabel(d)}</SunmiPill>
            ))}
            <span className="sunmi-text-muted"> Podés crear la compra igual.</span>
          </div>
        )}

        {!proveedorId ? (
          <SunmiPanel className="ring-2 ring-inset sunmi-ring shadow-sm">
            <p className="text-[13px] sunmi-text-muted py-10 text-center">
              Seleccioná un proveedor para empezar a armar el pedido.
            </p>
          </SunmiPanel>
        ) : (
          <div>
            {/* ── Zona principal: catálogo a todo el ancho ── */}
            <div className="min-w-0">
              <SunmiPanel className="ring-2 ring-inset sunmi-ring shadow-sm">
                {/* Buscador protagonista: fila propia, ancho completo, borde visible */}
                <div className="relative mb-2">
                  <Search
                    size={17}
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
                    className="!pl-10 !py-2.5 text-[13px] ring-1 ring-inset sunmi-ring"
                  />
                </div>
                {/* Pills (trío) + categoría + tamaño de página */}
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {chipsFiltros("md")}
                  <div className="ml-auto">
                    <SunmiPageSizer value={pageSize} onChange={setPageSize} />
                  </div>
                </div>

                {avisoRestauracion ? (
                  <div className="mb-2 rounded-md px-3 py-2 sunmi-surface ring-1 ring-inset sunmi-ring text-xs sunmi-text-warning flex items-start gap-2">
                    <span className="flex-1">{avisoRestauracion}</span>
                    <button
                      type="button"
                      onClick={() => setAvisoRestauracion("")}
                      className="shrink-0 sunmi-text-muted"
                      aria-label="Cerrar aviso"
                    >
                      ✕
                    </button>
                  </div>
                ) : null}

                {postVinculoMsg ? (
                  <div className="mb-2 rounded-md px-3 py-2 sunmi-surface ring-1 ring-inset sunmi-ring text-xs sunmi-text-accent">
                    {postVinculoMsg}
                  </div>
                ) : avisoSinDeposito.length > 0 ? (
                  <div className="mb-2 rounded-md px-3 py-2 sunmi-surface ring-1 ring-inset sunmi-ring text-xs sunmi-text-accent">
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
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="sunmi-text-muted">
                        No se encontró “{search.trim()}” para este proveedor.
                      </span>
                      <SunmiButton color="slate" type="button" onClick={() => setVincularOpen(true)}>
                        Vincular código interno a producto existente
                      </SunmiButton>
                    </div>
                  )}

                {/* Encabezado de sección + contador */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="min-w-0">
                    <h4 className="text-[12px] font-semibold sunmi-text-strong leading-tight">
                      {tituloSeccion}
                    </h4>
                    {!buscando && !soloPedido && vista === "sugeridos" && (
                      <span className="text-[10px] sunmi-text-muted">
                        Precargados por bajo stock — ajustá cantidades y sumá lo que falte
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] sunmi-text-muted shrink-0">
                    {listaRender.length}{" "}
                    {listaRender.length === 1 ? "producto" : "productos"}
                  </span>
                </div>

                {/* Lista del catálogo (cabecera sticky + filas densas) */}
                <div className="max-h-[62dvh] overflow-auto" id="nueva-compra-scroll">
                  {/* Cabecera de columnas — sobria (muted sobre superficie), sticky */}
                  <div
                    className="sticky top-0 z-10 flex items-center gap-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide sunmi-text-muted border-b sunmi-divider sunmi-surface min-w-[860px]"
                    style={{ borderLeft: "3px solid transparent" }}
                  >
                    <div className="flex-1 min-w-[200px]">Producto</div>
                    <div className="w-[112px] shrink-0">Código</div>
                    <div className="w-[96px] shrink-0">Cód. interno</div>
                    <div className="w-[104px] shrink-0">Unidad</div>
                    <div className="w-[48px] shrink-0 text-center">Pack</div>
                    <div className="w-[64px] shrink-0 text-right">Sug.</div>
                    <div className="w-[104px] shrink-0 text-center">Cantidad</div>
                    <div className="w-[112px] shrink-0 text-right">Costo</div>
                    <div className="w-[100px] shrink-0 text-right">Subtotal</div>
                    <div className="w-[34px] shrink-0" />
                  </div>
                  <div className="min-w-[860px]">
                  {loadingProds && productos.length === 0 ? (
                    <div className="px-3 py-8 text-center text-xs sunmi-text-muted">Buscando...</div>
                  ) : listaRender.length === 0 ? (
                    <div className="px-3 py-8 text-center text-xs sunmi-text-muted">
                      {soloPedido
                        ? "El pedido está vacío."
                        : vista === "sugeridos"
                        ? "Sin sugeridos. Cambiá a “Todos”."
                        : "Sin productos."}
                    </div>
                  ) : (
                    pageRows.map(filaDesktop)
                  )}
                  </div>
                </div>

                {/* Paginación del listado */}
                {listaRender.length > pageSize && (
                  <div className="flex items-center justify-center gap-2 mt-2 text-[11px]">
                    <SunmiButton
                      color="slate"
                      disabled={pageEff <= 1}
                      onClick={() => setPageNum((n) => Math.max(1, n - 1))}
                    >
                      « Ant.
                    </SunmiButton>
                    <span className="sunmi-text-muted whitespace-nowrap">
                      Pág. {pageEff} / {totalPages} · {listaRender.length} prod.
                    </span>
                    <SunmiButton
                      color="slate"
                      disabled={pageEff >= totalPages}
                      onClick={() => setPageNum((n) => Math.min(totalPages, n + 1))}
                    >
                      Sig. »
                    </SunmiButton>
                  </div>
                )}
              </SunmiPanel>
            </div>

            {/* ── Barra resumen fija al pie (reemplaza la columna derecha) ── */}
            {barraResumen(false)}
          </div>
        )}
      </div>
      {/* ^ fin DESKTOP */}

      {/* ===================== MOBILE ===================== */}
      <div className="md:hidden">
        {/* Header sticky: volver + título + buscar + filtros */}
        <div className="sticky top-0 z-30 sunmi-surface border-b sunmi-divider px-2 pt-2 pb-1.5">
          <div className="flex items-center gap-2 mb-1.5">
            <SunmiBackButton href="/modulos/inicio" />
            <h1 className="text-[15px] font-semibold sunmi-text-strong truncate flex-1 min-w-0">
              {nombreProveedorActivo
                ? `Pedido ${nombreProveedorActivo}`
                : esContinuar
                ? `Continuar #${pedidoIdParam}`
                : "Nuevo pedido"}
            </h1>
            {!esContinuar && proveedorId && (
              <button
                type="button"
                onClick={() => setProveedorId("")}
                className="px-2 py-1 rounded text-[11px] font-medium sunmi-control shrink-0"
              >
                Cambiar
              </button>
            )}
          </div>

          {!esContinuar && !proveedorId && (
            <div className="mb-1.5">
              <SunmiSelectAdv value={proveedorId} onChange={setProveedorId} searchable>
                <SunmiSelectOption value="">-- Seleccionar proveedor --</SunmiSelectOption>
                {proveedores.map((pr) => (
                  <SunmiSelectOption key={pr.id} value={String(pr.id)}>
                    {pr.nombre}
                  </SunmiSelectOption>
                ))}
              </SunmiSelectAdv>
            </div>
          )}

          {proveedorId && (
            <>
              {selectorModo(true)}
              <div className="relative mb-1.5">
                <Search
                  size={15}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none z-10"
                  style={{ color: "var(--pos-link)" }}
                />
                <SunmiInput
                  placeholder="Buscar producto..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPostVinculoMsg("");
                  }}
                  className="!pl-8 !py-1.5 w-full"
                />
              </div>
              {chipsFiltros("sm")}
              {/* El cartel del pedido en curso vive ACÁ, dentro del encabezado
                  pegajoso, y no debajo en el contenido.
                  Antes se desplazaba con la lista y se metía por debajo del
                  encabezado: en reposo se veía entero y al bajar quedaba tapado,
                  primero por el buscador y después por el título. Un aviso que se
                  esconde justo cuando la persona está trabajando no sirve.
                  Va en su variante de UNA LÍNEA para no comerse media pantalla:
                  el encabezado ya mide 190 px y el cartel completo lo llevaba a
                  ~250 sobre un alto de 800. */}
              {bannerBorrador(true)}
            </>
          )}
        </div>

        <div className="px-2 pt-2 pb-[96px]">

          {mostrarWarningDia && (
            <div
              className="rounded-lg border px-2.5 py-1.5 mb-2 text-[11px]"
              style={{ borderColor: "var(--pos-warning, #f59e0b)" }}
            >
              <b style={{ color: "var(--pos-warning, #f59e0b)" }}>
                Hoy es {formatDiaLabel(diaActualEnum())}.
              </b>{" "}
              <span className="sunmi-text-muted">
                {proveedorSel.nombre} recibe:{" "}
                {proveedorSel.dias_pedido.map((dx) => formatDiaLabel(dx)).join(", ")}. Podés
                crear la compra igual.
              </span>
            </div>
          )}

          {proveedorId && (
            <>
              {/* Contador + sección */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] sunmi-text-muted truncate">
                  {tituloSeccion}
                </span>
                <span className="text-[11px] sunmi-text-muted shrink-0">
                  {listaRender.length} {listaRender.length === 1 ? "producto" : "productos"}
                </span>
              </div>

              {postVinculoMsg && (
                <div className="mb-2 text-[11px] sunmi-text-accent">{postVinculoMsg}</div>
              )}

              {/* Vincular al vuelo (código no encontrado) */}
              {search.trim() &&
                !loadingProds &&
                productos.length === 0 &&
                avisoSinDeposito.length === 0 &&
                !postVinculoMsg && (
                  <div className="mb-2 flex flex-col gap-1.5 text-[11px]">
                    <span className="sunmi-text-muted">
                      No se encontró “{search.trim()}” para este proveedor.
                    </span>
                    <SunmiButton color="slate" type="button" onClick={() => setVincularOpen(true)}>
                      Vincular código interno
                    </SunmiButton>
                  </div>
                )}

              {/* Lista compacta tipo app de pedidos */}
              <div className="rounded-lg border sunmi-border sunmi-surface divide-y sunmi-divide overflow-hidden">
                {loadingProds && productos.length === 0 ? (
                  <div className="px-3 py-8 text-center text-xs sunmi-text-muted">Buscando...</div>
                ) : listaRender.length === 0 ? (
                  <div className="px-3 py-8 text-center text-xs sunmi-text-muted">
                    {soloPedido
                      ? "El pedido está vacío."
                      : vista === "sugeridos"
                      ? "Sin sugeridos. Cambiá a “Todos”."
                      : "Sin productos."}
                  </div>
                ) : (
                  pageRows.map(filaMobile)
                )}
              </div>

              {/* Pager mobile */}
              {listaRender.length > pageSize && (
                <div className="flex items-center justify-center gap-2 mt-2 text-[11px]">
                  <SunmiButton
                    color="slate"
                    className="!px-2.5 !py-1"
                    disabled={pageEff <= 1}
                    onClick={() => setPageNum((n) => Math.max(1, n - 1))}
                  >
                    « Ant.
                  </SunmiButton>
                  <span className="sunmi-text-muted whitespace-nowrap">
                    Pág. {pageEff}/{totalPages}
                  </span>
                  <SunmiButton
                    color="slate"
                    className="!px-2.5 !py-1"
                    disabled={pageEff >= totalPages}
                    onClick={() => setPageNum((n) => Math.min(totalPages, n + 1))}
                  >
                    Sig. »
                  </SunmiButton>
                </div>
              )}
            </>
          )}
        </div>

        {/* Barra resumen fija inferior */}
        {proveedorId && barraResumen(true)}
      </div>
      {/* ^ fin MOBILE */}

      {/* ===================== MODALES (ambos layouts) ===================== */}
      {vincularOpen && (
        <ModalVincularCodigo
          open={vincularOpen}
          onClose={() => setVincularOpen(false)}
          proveedorId={proveedorId}
          proveedorNombre={nombreProveedorActivo}
          codigoInicial={search.trim()}
          onVinculado={(cod) => {
            justLinkedRef.current = cod;
            setPostVinculoMsg("");
            setSearch(cod);
          }}
        />
      )}

      {/* Confirmación al cambiar de modo con productos cargados */}
      {modalConfirmModo}

      {/* Confirmación de conversión Unidad→Pack no exacta */}
      {modalConvUnidad}

      {/* Resumen del pedido bajo demanda: bottom-sheet en mobile, drawer lateral
          en desktop. Reusa CarritoPedido (mismos handlers, editable). */}
      {resumenOpen &&
        (() => {
          const resumenProps = {
            proveedorNombre: nombreProveedorActivo,
            items,
            total,
            notas,
            setNotas,
            notasReadonly: esContinuar,
            onCantidad: updateItemCantidad,
            onBlurCantidad: handleBlurCantidad,
            onSetCantidad: (id, val) => fijarCantidadItem({ productoLocalId: id }, val),
            onCosto: updateItemCosto,
            onBlurCosto: handleBlurCosto,
            onQuitar: quitarItem,
            onEditarProducto: irAEditarProducto,
            puedeEditarProducto: puedeEditarProductoP,
            onClose: () => setResumenOpen(false),
            onGuardar: () => {
              setResumenOpen(false);
              guardarPendiente();
            },
            onConfirmar: () => {
              setResumenOpen(false);
              enviarPedido();
            },
            saving,
            accionesDeshabilitadas,
          };
          return (
            <>
              <div className="md:hidden">
                <CarritoPedido variant="sheet" {...resumenProps} />
              </div>
              <div className="hidden md:block">
                <CarritoPedido variant="drawer" {...resumenProps} />
              </div>
            </>
          );
        })()}

      {modalEnvioOpen && pedidoEnvio && (
        <ModalEnviarPedido
          pedido={pedidoEnvio}
          onClose={() => setModalEnvioOpen(false)}
          onEnviado={() => resetParaNuevoPedido()}
        />
      )}
    </div>
  );
}
