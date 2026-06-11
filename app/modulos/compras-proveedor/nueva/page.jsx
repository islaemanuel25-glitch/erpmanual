"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiPanel from "@/components/sunmi/SunmiPanel";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiPill from "@/components/sunmi/SunmiPill";
import SunmiPageSizer from "@/components/sunmi/SunmiPageSizer";
import ColumnManager from "@/components/productos/ColumnManager";
import { Search, Trash2, Plus } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";
import ModalVincularCodigo from "@/components/compras-proveedor/ModalVincularCodigo";
import ModalEnviarPedido from "@/components/compras-proveedor/ModalEnviarPedido";
import {
  subtotalLinea,
  unidadDisplay,
  naturalezaLinea,
  permiteToggleUnidad,
} from "@/lib/compras-proveedor/calculoPedido";
import {
  recibeHoy,
  formatDiaLabel,
  diaActualEnum,
} from "@/lib/proveedores/diasPedido";

// Definición de columnas del listado (estilo módulo Productos). `locked` = no ocultable.
const COLUMNAS = [
  { key: "producto", label: "Producto", th: "min-w-[200px]", td: "align-top", locked: true },
  { key: "codigo", label: "Código", th: "w-[116px]", td: "" },
  { key: "codInterno", label: "Cód. interno", th: "w-[108px]", td: "" },
  { key: "unidad", label: "Unidad", th: "w-[100px]", td: "" },
  { key: "pack", label: "Pack", th: "w-[48px] text-center", td: "text-center" },
  { key: "faltan", label: "Faltan", th: "w-[66px] text-right", td: "text-right" },
  { key: "sugerido", label: "Sug.", th: "w-[58px] text-right", td: "text-right" },
  { key: "cantidad", label: "Cantidad", th: "w-[104px] text-center", td: "", locked: true },
  { key: "costo", label: "Costo", th: "w-[144px] text-right", td: "", locked: true },
  { key: "subtotal", label: "Subtotal", th: "w-[120px] text-right", td: "text-right tabular-nums" },
  { key: "accion", label: "Acc.", th: "w-[44px] text-right", td: "text-right", locked: true },
];
const COLS_OPCIONALES = COLUMNAS.filter((c) => !c.locked).map((c) => c.key);
const COLS_LOCKED = COLUMNAS.filter((c) => c.locked).map((c) => c.key);
const PRESETS_VISTA = {
  compacta: ["subtotal"],
  rapida: ["unidad", "pack"],
  completa: [...COLS_OPCIONALES],
};
const COLS_DEFAULT = ["codigo", "unidad", "pack", "subtotal"];

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

  // Items del pedido (SOLO los agregados con el botón Agregar).
  const [items, setItems] = useState([]);
  // Cantidad de borrador por fila NO agregada (productoLocalId → valor). Default = sugerido.
  const [draftCant, setDraftCant] = useState({});
  // Vista del listado: "sugeridos" (sugerencia>0), "todos", "cargados" (cantidad>0).
  // Arranca en "sugeridos": el pedido aparece prácticamente armado al abrir el proveedor.
  const [vista, setVista] = useState("sugeridos");

  // Columnas opcionales visibles + tamaño de página (estilo módulo Productos).
  const [visibleCols, setVisibleCols] = useState(COLS_DEFAULT);
  const [pageSize, setPageSize] = useState(25);
  const [pageNum, setPageNum] = useState(1);

  // Cargar preferencias persistidas (cliente).
  useEffect(() => {
    try {
      const c = JSON.parse(localStorage.getItem("comprasNuevaCols") || "null");
      if (Array.isArray(c)) {
        setVisibleCols(c.filter((k) => COLS_OPCIONALES.includes(k)));
      }
      const ps = Number(localStorage.getItem("comprasNuevaPageSize"));
      if ([25, 50, 100].includes(ps)) setPageSize(ps);
    } catch {
      // sin preferencias guardadas → defaults
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("comprasNuevaCols", JSON.stringify(visibleCols));
    } catch {}
  }, [visibleCols]);
  useEffect(() => {
    try {
      localStorage.setItem("comprasNuevaPageSize", String(pageSize));
    } catch {}
  }, [pageSize]);

  // Modal de envío (Enviar pedido).
  const [modalEnvioOpen, setModalEnvioOpen] = useState(false);
  const [pedidoEnvio, setPedidoEnvio] = useState(null);

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
  // Reusa /api/compras-proveedor/listar (ya soporta filtros estado + proveedorId).
  // En modo continuar no aplica: ya estamos editando ese borrador.
  useEffect(() => {
    setBorradorExistente(null); // reset en cada cambio de proveedor
    setDraftCant({}); // limpiar borradores de cantidad al cambiar de proveedor
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

        // NOTA: ya no se auto-agrega el pedido. Las cantidades sugeridas se
        // muestran como BORRADOR editable en cada fila; el producto entra al
        // pedido recién al tocar "Agregar".

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
  }, [proveedorId, search, esContinuar]);

  useEffect(() => {
    const timer = setTimeout(cargarProductos, 300);
    return () => clearTimeout(timer);
  }, [cargarProductos]);

  // ── Carga de un producto al pedido ─────────────────────────────────────
  // modoCompra es la ÚNICA fuente de verdad: "BULTO" (depósito) o "UNIDAD" (fiambre)
  // En modo continuar, persiste inmediatamente vía /agregar-item.
  // cantidadParam / costoParam / unidadParam: valores ya editados en el borrador
  // de la fila (rediseño inline). Si no vienen, usa los del producto.
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
      nombre: prod.nombre,
      sku: prod.sku,
      modoCompra: prod.modoCompra || "BULTO",
      // Unidad de pedido de la línea (separada de la naturaleza del producto).
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

  // Stepper de un item YA agregado: clampa a >= 1. La baja del pedido es SOLO
  // por el botón Quitar (no por poner cantidad en 0).
  const fijarCantidadItem = async (prod, nuevoValor) => {
    const item = items.find((i) => i.productoLocalId === prod.productoLocalId);
    if (!item) return;
    const v = Math.max(1, Math.floor(Number(nuevoValor) || 1));
    setItems((prev) =>
      prev.map((i) =>
        i.productoLocalId === prod.productoLocalId ? { ...i, cantidad: v } : i
      )
    );
    await persistirCantidad(item.detalleId, v);
  };

  // ── Borrador de una fila NO agregada: { cant, costo, unidad } ───────────
  // Apenas cant > 0 la fila queda "en preparación": se puede editar costo y
  // unidad acá mismo. Editar el borrador NO agrega el producto al pedido.
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
  const stepDraftCant = (prod, delta) => {
    const cur = Number(getDraft(prod).cant) || 0;
    setDraftField(prod, "cant", Math.max(0, cur + delta));
  };
  // Toggle Bulto/Unidad en el borrador (reexpresa el costo por factor, como el item).
  const toggleUnidadDraft = (prod) => {
    const d = getDraft(prod);
    const f = Math.max(1, Number(prod.factor_pack) || 1);
    const nueva = d.unidad === "UNIDAD" ? "BULTO" : "UNIDAD";
    let costo = Number(d.costo) || 0;
    if (f > 1) costo = nueva === "UNIDAD" ? costo / f : costo * f;
    setDraftCant((prev) => ({
      ...prev,
      [prod.productoLocalId]: {
        ...prev[prod.productoLocalId],
        unidad: nueva,
        costo: Math.round(costo * 100) / 100,
      },
    }));
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

  // Alternar la UNIDAD DE PEDIDO (Bulto ↔ Unidad) de una línea PACK. NO toca
  // `modoCompra` (la naturaleza del producto), así no se confunde con fiambre.
  // El costo se reexpresa por factor para mantener el dinero coherente.
  const toggleUnidadFila = (prod) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.productoLocalId !== prod.productoLocalId) return i;
        const f = Math.max(1, Number(i.factorPack) || 1);
        const nuevaUnidad = i.unidadPedido === "UNIDAD" ? "BULTO" : "UNIDAD";
        let costo = Number(i.precioCosto) || 0;
        if (f > 1) costo = nuevaUnidad === "UNIDAD" ? costo / f : costo * f;
        return { ...i, unidadPedido: nuevaUnidad, precioCosto: Math.round(costo * 100) / 100 };
      })
    );
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

  // Tras guardar/enviar, el usuario arma pedidos uno atrás de otro: dejamos la
  // pantalla Nuevo pedido lista y vacía. Reseteamos el estado del pedido actual
  // y limpiamos los params de la URL (sale de modo "continuar" sin recargar:
  // los effects guardan con !esContinuar / !proveedorId, así que no repueblan).
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
    setItems([]);
    setDraftCant({});
    setVista("sugeridos");
    setModalEnvioOpen(false);
    setPedidoEnvio(null);
    setBorradorExistente(null);
    router.replace("/modulos/compras-proveedor/nueva");
  }, [router]);

  // Guardar pendiente: deja el pedido guardado (PENDIENTE) y vuelve a Nuevo pedido
  // listo para cargar otro. Después el pendiente se encuentra desde Compras → Pendientes.
  const guardarPendiente = async () => {
    if (!window.confirm("¿Guardar el pedido como pendiente?")) return;
    if (esContinuar) {
      resetParaNuevoPedido();
      return;
    }
    const item = await crearBorrador();
    if (item) resetParaNuevoPedido();
  };

  // Enviar pedido: asegura que exista (crea si es nuevo), trae el pedido completo
  // (teléfono + detalles) y abre el modal de envío.
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
  // Map de items por productoLocalId para enlazar cada fila del catálogo.
  const itemsMap = useMemo(() => {
    const m = new Map();
    for (const i of items) m.set(i.productoLocalId, i);
    return m;
  }, [items]);

  // Orden de AGREGADO (índice en items). Para ordenar los cargados.
  const itemOrder = useMemo(() => {
    const m = new Map();
    items.forEach((i, idx) => m.set(i.productoLocalId, idx));
    return m;
  }, [items]);

  // Base "lógica" para cálculos (naturaleza/unidad/subtotal) desde catálogo + item.
  const baseDe = (prod, item) => ({
    modoCompraProveedor: (item?.modoCompra ?? prod.modoCompra) || "BULTO",
    unidad_medida: prod.unidad_medida,
    factor_pack: prod.factor_pack ?? item?.factorPack,
    pesoReferenciaKg: prod.pesoRefKg ?? item?.pesoRefKg,
  });

  // Total y cantidad de ítems del pedido (barra inferior).
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

  // ¿Hay búsqueda activa? Con búsqueda, el buscador MANDA.
  const buscando = search.trim().length > 0;

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
    // Con búsqueda activa: SOLO los productos que matchean (la API ya filtró por
    // search). No se agregan huérfanos ni se fuerzan los cargados arriba.
    if (buscando) {
      return [...productos].sort(ordenarUrgencia);
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

    if (vista === "sugeridos") {
      lista = lista.filter((p) => p.sugerido > 0 || itemsMap.has(p.productoLocalId));
    } else if (vista === "cargados") {
      // Filtro REAL del array (no CSS): solo cantidad > 0 → quedan compactos.
      lista = lista.filter((p) => itemsMap.has(p.productoLocalId));
    }

    // Orden sin búsqueda: 1) cargados (por orden de agregado), 2) sugeridos/
    // faltantes, 3) resto.
    const cargado = (p) => itemsMap.has(p.productoLocalId);
    const tier = (p) => (cargado(p) ? 2 : p.sugerido > 0 || p.faltante > 0 ? 1 : 0);
    return lista.sort((a, b) => {
      const t = tier(b) - tier(a);
      if (t !== 0) return t;
      if (cargado(a) && cargado(b)) {
        return (
          (itemOrder.get(a.productoLocalId) ?? 0) -
          (itemOrder.get(b.productoLocalId) ?? 0)
        );
      }
      return ordenarUrgencia(a, b);
    });
  }, [productos, items, vista, itemsMap, itemOrder, buscando]);

  // Columnas a renderizar (locked + opcionales visibles), en orden.
  const colsVisibles = useMemo(
    () => COLUMNAS.filter((c) => c.locked || visibleCols.includes(c.key)),
    [visibleCols]
  );

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
  }, [search, vista, proveedorId, pageSize]);

  // Aplicar un preset de vista (cambia qué columnas opcionales se ven).
  const aplicarPreset = (preset) => setVisibleCols([...(PRESETS_VISTA[preset] || [])]);

  if (!perfil || loadingCtx) return null;
  if (needsContexto) {
    router.push("/inicio");
    return null;
  }

  const permisosP = perfil?.permisos || [];
  const esAdminP = Array.isArray(permisosP) && permisosP.includes("*");
  if (!esAdminP && !permisosP.includes("compras.crear")) return <SinPermisos />;

  const sinProveedorBtns = saving || items.length === 0 || !proveedorId;

  return (
    <div className="sunmi-bg w-full min-h-full p-4 pb-24">
      <SunmiCard>
        <div className="flex items-center justify-between mb-4">
          <SunmiHeader
            title={
              esContinuar
                ? `Continuar pedido${pedidoIdParam ? ` #${pedidoIdParam}` : ""}`
                : "Nuevo pedido a proveedor"
            }
          />
          <SunmiBackButton href="/modulos/inicio" />
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

        {/* Aviso compacto: ya hay BORRADOR pendiente para este proveedor */}
        {borradorExistente && (
          <div
            className="rounded-lg border px-3 py-2 mb-3 flex items-center justify-between gap-3 flex-wrap"
            style={{ borderColor: "var(--pos-warning, #f59e0b)" }}
          >
            <div className="text-[12px] min-w-0">
              <span className="font-semibold" style={{ color: "var(--pos-warning, #f59e0b)" }}>
                Ya hay un pedido en curso
              </span>
              <span className="sunmi-text-muted">
                {" "}· #{borradorExistente.id} · {borradorExistente.cantItems}{" "}
                {borradorExistente.cantItems === 1 ? "ítem" : "ítems"}
              </span>
            </div>
            <div className="flex gap-2 shrink-0">
              <SunmiButton
                color="cyan"
                onClick={() =>
                  router.push(`/modulos/compras-proveedor/nueva?pedidoId=${borradorExistente.id}`)
                }
              >
                Continuar
              </SunmiButton>
              <SunmiButton color="slate" onClick={() => setBorradorExistente(null)}>
                Nuevo
              </SunmiButton>
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

        {/* Lista única: el pedido se arma desde acá (cantidad > 0 = en el pedido). */}
        {proveedorId && (
          <SunmiPanel className="sunmi-surface ring-2 ring-inset sunmi-ring shadow-sm mb-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2 mb-2">
              <div className="relative flex-1">
                <Search
                  size={15}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none z-10"
                  style={{ color: "var(--pos-link)" }}
                />
                <SunmiInput
                  placeholder="Buscar por código interno, nombre, SKU o código de barra..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPostVinculoMsg("");
                  }}
                  className="!pl-8 !py-1 !border-2 pulse-neon"
                  style={{ borderColor: "var(--pos-link)" }}
                />
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {[
                  ["sugeridos", "Sugeridos"],
                  ["todos", "Todos"],
                  ["cargados", "Cargados"],
                ].map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVista(v)}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                      vista === v ? "sunmi-btn sunmi-btn-primary" : "sunmi-control"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Presets de vista + selector de columnas + tamaño de página */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1">
                <span className="text-[10px] sunmi-text-muted mr-0.5">Vista:</span>
                {[
                  ["compacta", "Compacta"],
                  ["rapida", "Carga rápida"],
                  ["completa", "Completa"],
                ].map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => aplicarPreset(k)}
                    className="px-2 py-0.5 rounded text-[11px] font-medium sunmi-control"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <SunmiPageSizer value={pageSize} onChange={setPageSize} />
                <ColumnManager
                  allColumns={COLUMNAS.map((c) => ({ key: c.key, label: c.label }))}
                  visibleKeys={[...COLS_LOCKED, ...visibleCols]}
                  lockedKeys={COLS_LOCKED}
                  onChange={(next) =>
                    setVisibleCols(next.filter((k) => COLS_OPCIONALES.includes(k)))
                  }
                />
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

            {/* Una sola tabla editable, densidad estilo módulo Productos. */}
            <SunmiTable
              stickyHeader
              maxHeightClass="max-h-[56dvh]"
              scrollId="nueva-compra-scroll"
              headers={colsVisibles.map((c) => ({ label: c.label, className: c.th }))}
            >
              {loadingProds && productos.length === 0 ? (
                <tr>
                  <td colSpan={colsVisibles.length} className="px-3 py-6 text-center text-xs sunmi-text-muted">
                    Buscando...
                  </td>
                </tr>
              ) : listaRender.length === 0 ? (
                <tr>
                  <td colSpan={colsVisibles.length} className="px-3 py-6 text-center text-xs sunmi-text-muted">
                    {vista === "cargados"
                      ? "No hay productos cargados."
                      : vista === "sugeridos"
                      ? "Sin sugeridos. Cambiá a “Todos”."
                      : "Sin productos."}
                  </td>
                </tr>
              ) : (
                pageRows.map((p) => {
                  const item = itemsMap.get(p.productoLocalId);
                  const enPedido = !!item;
                  const base = baseDe(p, item);
                  const esFiambre = naturalezaLinea(base) === "FIAMBRE";
                  const puedeToggle = permiteToggleUnidad(base) && !esContinuar;
                  const factor = Math.max(1, Number(p.factor_pack ?? item?.factorPack) || 1);
                  // Borrador (solo si no está agregado): { cant, costo, unidad }.
                  const d = enPedido ? null : getDraft(p);
                  const cantidadVal = enPedido ? item.cantidad : d.cant;
                  const cantNum = Number(cantidadVal) || 0;
                  // "En preparación": no agregado pero con cantidad > 0 → edición habilitada.
                  const enPreparacion = !enPedido && cantNum > 0;
                  const activa = enPedido || enPreparacion;
                  const costoActual = enPedido ? item.precioCosto : d.costo;
                  const unidadActual = enPedido ? item.unidadPedido : d.unidad;
                  const r = activa
                    ? subtotalLinea({ base, cantidad: cantNum, costo: costoActual })
                    : null;
                  const pesoRef = Number(p.pesoRefKg ?? item?.pesoRefKg) || 0;
                  const codigo = p.codigo_barra || p.sku || "—";

                  // "Unidad" usa la unidad de pedido (item o borrador), no la naturaleza.
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

                  return (
                    <SunmiTableRow key={p.productoLocalId} selected={enPedido}>
                      {/* Producto */}
                      <td className="px-2 py-1 align-top">
                        <div className="flex items-center gap-1.5 leading-tight">
                          <span
                            className="text-[12px] sunmi-text-strong truncate max-w-[280px]"
                            title={p.nombre}
                          >
                            {p.nombre}
                          </span>
                          {esFiambre && (
                            <span className="px-1 py-0.5 text-[9px] font-bold uppercase rounded bg-red-600 text-white leading-none">
                              Fiambre
                            </span>
                          )}
                          {p.bajoMin && (
                            <span className="px-1 py-0.5 text-[9px] font-bold uppercase rounded bg-amber-500 text-black leading-none">
                              Bajo min
                            </span>
                          )}
                        </div>
                        {!visibleCols.includes("faltan") &&
                          !visibleCols.includes("sugerido") &&
                          !p.sinParametros &&
                          (p.faltante > 0 || p.sugerido > 0) && (
                            <div className="text-[10px] sunmi-text-muted leading-tight">
                              {p.faltante > 0
                                ? `Faltan ${esFiambre ? Number(p.faltante).toFixed(1) : p.faltante}`
                                : ""}
                              {p.sugerido > 0
                                ? `${p.faltante > 0 ? " · " : ""}Sug. ${p.sugerido}`
                                : ""}
                            </div>
                          )}
                      </td>

                      {/* Código */}
                      {visibleCols.includes("codigo") && (
                        <td
                          className="px-2 py-1 text-[11px] sunmi-text-muted truncate"
                          title={String(codigo)}
                        >
                          {codigo}
                        </td>
                      )}

                      {/* Cód. interno */}
                      {visibleCols.includes("codInterno") && (
                        <td
                          className="px-2 py-1 text-[11px] sunmi-text-muted truncate"
                          title={p.codigoInterno || ""}
                        >
                          {p.codigoInterno || "—"}
                        </td>
                      )}

                      {/* Unidad */}
                      {visibleCols.includes("unidad") && (
                      <td className="px-2 py-1">
                        {puedeToggle ? (
                          <button
                            type="button"
                            onClick={() => (enPedido ? toggleUnidadFila(p) : toggleUnidadDraft(p))}
                            disabled={!activa}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              activa ? "sunmi-control" : "sunmi-text-muted opacity-60 cursor-default"
                            }`}
                            title={activa ? "Cambiar Bulto / Unidad" : "Poné una cantidad para elegir la unidad"}
                          >
                            {unidadLabel}
                          </button>
                        ) : (
                          <SunmiPill color="slate">{unidadLabel}</SunmiPill>
                        )}
                      </td>
                      )}

                      {/* Pack */}
                      {visibleCols.includes("pack") && (
                        <td className="px-2 py-1 text-center text-[11px] sunmi-text-muted">
                          {factor > 1 ? `×${factor}` : "—"}
                        </td>
                      )}

                      {/* Faltan */}
                      {visibleCols.includes("faltan") && (
                        <td className="px-2 py-1 text-right text-[11px]">
                          {p.sinParametros ? (
                            <span className="sunmi-text-muted">—</span>
                          ) : p.faltante > 0 ? (
                            <span className="sunmi-text-danger">
                              {esFiambre ? Number(p.faltante).toFixed(1) : p.faltante}
                            </span>
                          ) : (
                            <span className="sunmi-text-success">0</span>
                          )}
                        </td>
                      )}

                      {/* Sugerido */}
                      {visibleCols.includes("sugerido") && (
                        <td className="px-2 py-1 text-right text-[11px]">
                          {p.sinParametros ? (
                            <span className="sunmi-text-muted">—</span>
                          ) : p.sugerido > 0 ? (
                            <span className="sunmi-text-accent font-medium">{p.sugerido}</span>
                          ) : (
                            <span className="sunmi-text-success">OK</span>
                          )}
                        </td>
                      )}

                      {/* Cantidad (borrador editable; no implica estar agregado) */}
                      <td className="px-2 py-1">
                        <div className="flex items-center justify-center gap-0.5">
                          <button
                            type="button"
                            onClick={() =>
                              enPedido
                                ? fijarCantidadItem(p, (Number(item.cantidad) || 1) - 1)
                                : stepDraftCant(p, -1)
                            }
                            className="w-[22px] h-[22px] flex items-center justify-center rounded sunmi-control text-[14px] leading-none"
                          >
                            −
                          </button>
                          <SunmiInput
                            type="text"
                            inputMode="numeric"
                            value={cantidadVal}
                            placeholder="0"
                            onChange={(e) =>
                              enPedido
                                ? updateItemCantidad(p.productoLocalId, e.target.value)
                                : setDraftField(p, "cant", e.target.value.replace(/[^\d]/g, ""))
                            }
                            onBlur={enPedido ? () => handleBlurCantidad(p.productoLocalId) : undefined}
                            className="w-[42px] !py-0.5 text-center text-[12px] tabular-nums"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              enPedido
                                ? fijarCantidadItem(p, (Number(item.cantidad) || 0) + 1)
                                : stepDraftCant(p, 1)
                            }
                            className="w-[22px] h-[22px] flex items-center justify-center rounded sunmi-control text-[14px] leading-none"
                          >
                            +
                          </button>
                        </div>
                        {esFiambre && pesoRef > 0 && (Number(cantidadVal) || 0) > 0 && (
                          <div className="text-[10px] sunmi-text-muted text-center mt-0.5">
                            ~{((Number(cantidadVal) || 0) * pesoRef).toFixed(1)} kg
                          </div>
                        )}
                      </td>

                      {/* Costo: mismo layout en todas las filas (prefijo + input). */}
                      <td className="px-2 py-1">
                        <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                          <span className="w-[40px] shrink-0 text-right text-[9px] leading-none sunmi-text-muted">
                            {costoUnidad} $
                          </span>
                          <SunmiInput
                            type="text"
                            inputMode="decimal"
                            value={
                              enPedido
                                ? item.precioCosto
                                : enPreparacion
                                ? d.costo
                                : Number(d.costo) > 0
                                ? Number(d.costo).toFixed(2)
                                : ""
                            }
                            disabled={!activa}
                            onChange={
                              !activa
                                ? undefined
                                : enPedido
                                ? (e) => updateItemCosto(p.productoLocalId, e.target.value)
                                : (e) => setDraftField(p, "costo", e.target.value.replace(",", "."))
                            }
                            onBlur={enPedido ? () => handleBlurCosto(p.productoLocalId) : undefined}
                            className="w-[84px] !py-0.5 text-right tabular-nums text-[12px]"
                          />
                        </div>
                      </td>

                      {/* Subtotal */}
                      {visibleCols.includes("subtotal") && (
                        <td className="px-2 py-1 text-right text-[12px] font-medium tabular-nums">
                          {!activa ? (
                            <span className="sunmi-text-muted">—</span>
                          ) : r.subtotal != null ? (
                            `$${r.subtotal.toFixed(2)}`
                          ) : (
                            <span className="sunmi-text-accent" title={r.advertencia || ""}>
                              ⚠
                            </span>
                          )}
                        </td>
                      )}

                      {/* Acción: Agregar (no agregado) / Quitar (agregado) */}
                      <td className="px-2 py-1 text-right">
                        {enPedido ? (
                          <button
                            type="button"
                            onClick={() => quitarItem(p.productoLocalId)}
                            aria-label="Quitar del pedido"
                            title="Quitar del pedido"
                            className="w-[26px] h-[26px] inline-flex items-center justify-center rounded-md sunmi-btn-red transition"
                          >
                            <Trash2 size={14} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => agregarDesdeFila(p)}
                            disabled={!enPreparacion}
                            aria-label="Agregar al pedido"
                            title={enPreparacion ? "Agregar al pedido" : "Poné una cantidad para agregar"}
                            className="w-[26px] h-[26px] inline-flex items-center justify-center rounded-md sunmi-btn-secondary transition disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Plus size={15} />
                          </button>
                        )}
                      </td>
                    </SunmiTableRow>
                  );
                })
              )}
            </SunmiTable>

            {/* Paginación del listado (Mostrar 25/50/100). */}
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
        )}
      </SunmiCard>

      {/* Barra inferior fija: resumen + acciones del pedido */}
      <div className="sticky bottom-0 z-40 -mx-4 -mb-24 mt-3 border-t sunmi-divider sunmi-surface px-4 py-1.5 shadow-[0_-4px_12px_rgba(0,0,0,0.18)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-[13px]">
            <span className="sunmi-text-strong">
              <b>{items.length}</b> {items.length === 1 ? "ítem" : "ítems"}
            </span>
            <span className="sunmi-text-strong">
              Total: <b className="sunmi-text-accent">${total.toFixed(2)}</b>
            </span>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <SunmiButton color="slate" onClick={() => router.push("/modulos/inicio")}>
              Cancelar
            </SunmiButton>
            <SunmiButton color="cyan" disabled={sinProveedorBtns} onClick={guardarPendiente}>
              {saving ? "Guardando..." : "Guardar pendiente"}
            </SunmiButton>
            <SunmiButton color="amber" disabled={sinProveedorBtns} onClick={enviarPedido}>
              Enviar pedido
            </SunmiButton>
          </div>
        </div>
      </div>

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
