"use client";

// EditorVentaCorreccion — corrección COMPLETA de una venta (Fase B) con el MISMO
// sistema responsive que Compras → Ver compra → Recibir mercadería. Se copia la
// estructura/clases/breakpoints de esa pantalla y solo se adaptan los datos de
// ventas:
//   · Contenido de PÁGINA (sin overlay/portal): SunmiCard → SunmiPanels, scroll
//     normal del documento (<main>). Se monta en /[ventaId]/corregir.
//   · Encabezado: flex justify-between (SunmiHeader "Corregir venta" + badge estado
//     / botón Volver a la venta) + panel de metadatos grid-cols-2 md:grid-cols-4.
//   · Detalle: DESKTOP tabla (hidden md:block) · MÓVIL cards (md:hidden), con el
//     control de cantidad − [n] + idéntico a "Recibir mercadería".
//   · "Agregar producto": SunmiPanel inline (SunmiInput + tabla de resultados).
//   · Pagos: SunmiPanel con SunmiSelectAdv + SunmiInput.
//   · Resumen (Total original / corregido / Diferencia) + barra de acciones sticky.
//   · Revisión de cambios: etapa in-page (RevisionVentaCorreccion) que reemplaza al
//     editor en la misma URL (sin modal).
// Solo habilitado si el turno ORIGINAL sigue abierto (lo decide el backend).

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiPanel from "@/components/sunmi/SunmiPanel";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import LineaEditableCard from "@/components/reportes-ventas/LineaEditableCard";
import {
  aCent, desdeCent, totalCentDeLineas, crearPago, esFiado, normalizarAjustador,
  recomputar, setMontoCent, setAjustador, agregarPago, quitarPago, cambiarMedio,
  payloadPagos, payloadValido,
} from "@/lib/pos-ventas/pagosAjuste";
import {
  MODO_PACK, MODO_UNIDAD, permiteToggleDeposito, inferirModo,
  escalasDeLineaExistente, rescalarLinea, cantidadStockLinea, costoResoluble,
} from "@/lib/pos-ventas/lineaModoDeposito";
import { firmaCorreccion } from "@/lib/reportes-ventas/correccionDirty";

const TZ_AR = "America/Argentina/Cordoba";
const money = (n) => `$ ${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtCant = (n) => { const x = Number(n); return Number.isInteger(x) ? String(x) : x.toLocaleString("es-AR", { maximumFractionDigits: 3 }); };
const MEDIOS = ["EFECTIVO", "DEBITO", "CREDITO", "MERCADOPAGO", "FIADO"];
const MEDIO_LABEL = { EFECTIVO: "Efectivo", DEBITO: "Débito", CREDITO: "Crédito", MERCADOPAGO: "Mercado Pago", FIADO: "Fiado" };
const ESTADO_BADGE = { cobrado: "sunmi-badge-success", fiado: "sunmi-badge-accent" };
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
/** El color de una diferencia: rojo si baja, acento si sube, apagado si no cambia. */
function tonoDeDiferencia(dif) {
  if (dif < 0) return "sunmi-text-danger";
  if (dif > 0) return "sunmi-text-accent";
  return "sunmi-text-muted";
}

function fmtFecha(iso) {
  if (!iso) return "—";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-AR", { timeZone: TZ_AR, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}
let _k = 0;
const nextKey = () => `l${++_k}`;

// Contenedor scrolleable de la página (el <main> del layout, como Productos).
function getEditorScrollEl() {
  if (typeof document === "undefined") return null;
  return document.querySelector("main");
}

export default function EditorVentaCorreccion({ ventaId, onVolver, onCorregido }) {
  const editorScrollRef = useRef(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [lineas, setLineas] = useState([]);
  const [clienteSel, setClienteSel] = useState(null);
  const [pagos, setPagos] = useState([]);
  const [buscaCli, setBuscaCli] = useState("");
  const [resCli, setResCli] = useState([]);
  const [revision, setRevision] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [revisando, setRevisando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  // code del último error de confirmar (conflicto_version, fuera_de_ventana, …) para
  // ofrecer "Recargar venta" cuando corresponde. reloadKey re-dispara la carga /editar.
  const [errorCode, setErrorCode] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Guard SÍNCRONO anti-doble-submit (el estado `confirmando` es async y queda stale
  // ante dos clicks síncronos; el ref evita disparar /corregir dos veces).
  const confirmandoRef = useRef(false);

  // Advertencia de cambios sin guardar (dirty guard). firmaInicial = firma del
  // payload tomada tras cargar /editar (null = aún sin cargar). confirmSalida =
  // panel inline de confirmación al intentar salir con cambios.
  const [firmaInicial, setFirmaInicial] = useState(null);
  const [confirmSalida, setConfirmSalida] = useState(false);
  const bypassSalidaRef = useRef(false); // salida ya autorizada (no re-preguntar)
  const sentinelRef = useRef(false); // centinela de history ya insertado (botón atrás)

  // Buscar producto (bloque "Agregar producto" inline)
  const [extraSearch, setExtraSearch] = useState("");
  const [extraResults, setExtraResults] = useState([]);
  const [extraLoading, setExtraLoading] = useState(false);
  const [extraAdding, setExtraAdding] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/pos-ventas/venta/${ventaId}/editar`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (!vivo) return;
        if (!d.ok) { setError(d.error || "No se pudo cargar."); setCargando(false); return; }
        setData(d);
        const esDepositoVenta = d.venta.local?.esDeposito === true;
        setLineas((d.venta.lineas || []).map((l) => {
          const factorPack = Math.max(1, Number(l.baseStock?.factorPack) || 1);
          const modoEnvio = l.baseStock?.modo_envio || null;
          const puedeToggle = permiteToggleDeposito({ esDeposito: esDepositoVenta, factorPack, modoEnvio }) && !l.esServicio && !l.esCombo;
          // Modo con el que se persistió la línea (inferido de cantidadStock físico).
          const modoActual = puedeToggle
            ? inferirModo({ cantidad: num(l.cantidad), cantidadStock: l.cantidadStock, factorPack })
            : MODO_PACK;
          // Escalas bulto/unidad DERIVADAS del precio/costo congelado (sin re-consultar maestro).
          const escalas = escalasDeLineaExistente({ precio: num(l.precio), precioCosto: num(l.precioCosto), modoActual, factorPack });
          return {
            key: nextKey(), origenDetalleId: l.detalleId, productoBaseId: l.productoBaseId, nombre: l.nombre,
            codigo: l.codigo || null, presentacion: l.unidad || null,
            cantidad: num(l.cantidad), precio: num(l.precio), precioCosto: num(l.precioCosto),
            cantidadOriginal: num(l.cantidad), precioOriginal: num(l.precio),
            esServicio: l.esServicio, esCombo: l.esCombo, reconstruccion: l.reconstruccion || null,
            modalidadConfirmada: null, removed: false,
            // Depósito pack/unidad (Opción A): un modo por línea + escalas congeladas.
            esDeposito: esDepositoVenta, factorPack, modoEnvio, puedeToggle,
            modoVentaLinea: modoActual, ...escalas, costoResoluble: true,
          };
        }));
        setClienteSel(d.venta.cliente ? { id: d.venta.cliente.id, nombre: d.venta.cliente.nombre } : null);
        setPagos(normalizarAjustador((d.venta.pagos || []).map((p) => crearPago(String(p.medio).toUpperCase(), aCent(num(p.monto)), false))));
      })
      .catch(() => { if (vivo) setError("Error de conexión."); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
    // reloadKey permite "Recargar venta" ante conflicto de versión (re-fetch /editar).
  }, [ventaId, reloadKey]);



  const c = data?.correccion || {};
  const bloqueado = data && !c.puedeCorregirCompleta;
  const activas = lineas.filter((l) => !l.removed);
  // Total corregido en CENTAVOS (fuente de verdad; redondeo por línea = backend).
  const totalCent = useMemo(() => totalCentDeLineas(lineas), [lineas]);
  const total = desdeCent(totalCent);
  const sumSubOrig = activas.reduce((a, l) => a + num(l.precioOriginal) * num(l.cantidadOriginal), 0);
  const totalOriginalVenta = num(data?.venta?.total);
  const difVsVenta = total - totalOriginalVenta;
  // Pagos SIEMPRE == total: el tender "Saldo automático" (ajustador) absorbe la
  // diferencia. Se recalcula al cambiar líneas o pagos. Todo en centavos.
  const pagosCalc = useMemo(() => recomputar(pagos, totalCent), [pagos, totalCent]);
  const permiteEditarPrecio = !!data?.permisos?.editarPrecioManual;

  // Líneas legacy ambiguas TOCADAS (modificadas/eliminadas) sin modalidad resuelta → bloquean Revisar.
  const ambiguasSinResolver = lineas.filter((l) =>
    l.reconstruccion?.estado === "ambiguo" &&
    (l.removed || num(l.cantidad) !== num(l.cantidadOriginal) || num(l.precio) !== num(l.precioOriginal)) &&
    !l.modalidadConfirmada
  );
  // Líneas agregadas sin costo resoluble → bloquean Revisar (no guardar costo 0 silencioso).
  const agregadasSinCosto = lineas.filter((l) => !l.removed && l.origenDetalleId == null && !l.esServicio && l.costoResoluble === false);
  // La UI impide pagos != total; este guard defensivo evita enviar un estado inválido.
  const pagosOk = payloadValido(pagosCalc.pagos, totalCent) && !pagosCalc.negativo;
  const puedeRevisar = activas.length > 0 && ambiguasSinResolver.length === 0 && pagosOk && agregadasSinCosto.length === 0;

  const setLinea = (key, patch) => setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // ── LAS NUEVE COLUMNAS DEL DETALLE ────────────────────────────────────────
  //
  // Migradas a modo por columnas tal como estaban, celda por celda. Dos cosas
  // que parecen detalles y no lo son:
  //
  // 1. NINGUNA declara `align`. En esta tabla los ENCABEZADOS van a la
  //    izquierda y los valores centrados o a la derecha, y `align` mueve los
  //    dos. La alineación va en `tdClassName`, que es solo la celda.
  //
  // 2. Todas declaran `px-3 py-1.5`, que no lo cubre ninguna densidad. La tabla
  //    cede el suyo por eje —ver `lib/sunmi/claseNegociada.js`— así que no
  //    quedan dos paddings peleando. Antes de que cediera, esto habría quedado
  //    bien de casualidad: `px-3` le gana a `px-2` por el orden en que Tailwind
  //    escribe la hoja de estilos, no porque alguien lo haya decidido.
  const columnasDetalle = useMemo(
    () => [
      {
        clave: "producto",
        titulo: "Producto",
        tdClassName: "px-3 py-1.5 text-sm",
        render: (l) => {
          const rec = l.reconstruccion || null;
          const esNuevo = l.origenDetalleId == null;
          return (
            <>
              <div className="font-medium sunmi-text-strong">
                {l.nombre}
                {l.esCombo && <span className="ml-2 text-[10px] sunmi-text-link font-medium">COMBO</span>}
                {l.esServicio && <span className="ml-2 text-[10px] sunmi-text-link font-medium">SERVICIO</span>}
                {esNuevo && <span className="ml-2 text-[10px] sunmi-text-success font-medium">NUEVO</span>}
              </div>
              {l.puedeToggle && (
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <div className="inline-flex rounded-lg overflow-hidden border sunmi-border">
                    <button type="button" onClick={() => setLinea(l.key, rescalarLinea(l, MODO_PACK))}
                      className={`px-2 py-0.5 text-[11px] font-medium ${(l.modoVentaLinea || MODO_PACK) === MODO_PACK ? "sunmi-state-success sunmi-text-success" : "sunmi-text-muted"}`}>Pack</button>
                    <button type="button" onClick={() => setLinea(l.key, rescalarLinea(l, MODO_UNIDAD))}
                      className={`px-2 py-0.5 text-[11px] font-medium ${l.modoVentaLinea === MODO_UNIDAD ? "sunmi-state-success sunmi-text-success" : "sunmi-text-muted"}`}>Unidad</button>
                  </div>
                  <span className="text-[10px] sunmi-text-muted">1 pack = {Math.max(1, Number(l.factorPack) || 1)} u</span>
                </div>
              )}
              {l.costoResoluble === false && (
                <div className="text-[10px] sunmi-text-danger mt-0.5">⚠ Sin costo resoluble — no se puede revisar</div>
              )}
              {rec?.estado === "reconstruido" && (
                <div className="text-[10px] sunmi-text-success mt-0.5">✓ Consumo reconstruido — {rec.modalidad} · {fmtCant(rec.cantidadFisica)} u</div>
              )}
              {rec?.estado === "ambiguo" && (
                <div className="mt-1 max-w-[240px] space-y-1">
                  <div className="text-[10px] sunmi-text-accent">⚠ Consumo original no registrado</div>
                  <SunmiSelectAdv value={l.modalidadConfirmada || ""} onChange={(v) => setLinea(l.key, { modalidadConfirmada: v || null })}>
                    <SunmiSelectOption value="">Elegí la modalidad…</SunmiSelectOption>
                    {(rec.modalidadesPosibles || []).map((m) => (
                      <SunmiSelectOption key={m.modalidad} value={m.modalidad}>{m.label}{rec.recomendada === m.modalidad ? " — recomendado" : ""}</SunmiSelectOption>
                    ))}
                  </SunmiSelectAdv>
                </div>
              )}
            </>
          );
        },
      },
      {
        clave: "cantOriginal",
        titulo: "Cant. original",
        tdClassName: "px-3 py-1.5 text-center sunmi-text-muted line-through tabular-nums",
        render: (l) => (l.origenDetalleId == null ? "—" : fmtCant(l.cantidadOriginal)),
      },
      {
        clave: "cantCorregida",
        titulo: "Cant. corregida",
        tdClassName: "px-3 py-1.5",
        render: (l) => (
          <div className="flex items-center gap-1 justify-center">
            <SunmiButton color="slate" type="button" onClick={() => setLinea(l.key, { cantidad: Math.max(0, num(l.cantidad) - 1) })}>−</SunmiButton>
            <SunmiInput
              type="text" inputMode="decimal" value={l.cantidad}
              onChange={(e) => { const raw = e.target.value; if (raw === "") { setLinea(l.key, { cantidad: "" }); return; } const v = Number(raw.replace(",", ".")); setLinea(l.key, { cantidad: Number.isFinite(v) ? Math.max(0, v) : 0 }); }}
              onBlur={() => { const cur = Number(l.cantidad); if (!Number.isFinite(cur) || cur < 0) setLinea(l.key, { cantidad: 0 }); }}
              className="w-[56px] text-center"
            />
            <SunmiButton color="slate" type="button" onClick={() => setLinea(l.key, { cantidad: num(l.cantidad) + 1 })}>+</SunmiButton>
          </div>
        ),
      },
      {
        clave: "precioOriginal",
        titulo: "Precio original",
        tdClassName: "px-3 py-1.5 text-center sunmi-text-muted line-through tabular-nums",
        render: (l) => (l.origenDetalleId == null ? "—" : money(l.precioOriginal)),
      },
      {
        clave: "precioCorregido",
        titulo: "Precio corregido",
        tdClassName: "px-3 py-1.5",
        render: (l) => (
          <div className="flex items-center gap-0.5 justify-center">
            <span className="sunmi-text-muted text-xs">$</span>
            <SunmiInput
              type="text" inputMode="decimal" value={l.precio}
              disabled={l.esCombo || l.esServicio || !permiteEditarPrecio}
              onChange={(e) => setLinea(l.key, { precio: e.target.value === "" ? 0 : Number(e.target.value.replace(",", ".")) })}
              className="w-[90px] text-center"
            />
          </div>
        ),
      },
      {
        clave: "subOrig",
        titulo: "Subtotal orig.",
        tdClassName: "px-3 py-1.5 text-right tabular-nums sunmi-text-muted",
        render: (l) => money(num(l.precioOriginal) * num(l.cantidadOriginal)),
      },
      {
        clave: "subCorr",
        titulo: "Subtotal corr.",
        tdClassName: "px-3 py-1.5 text-right tabular-nums font-medium",
        render: (l) => money(num(l.precio) * num(l.cantidad)),
      },
      {
        clave: "diferencia",
        titulo: "Diferencia",
        tdClassName: "px-3 py-1.5 text-right tabular-nums font-medium",
        // El tono depende de la fila, así que va en un `span` adentro: la clase
        // de la columna es una sola para todas.
        render: (l) => {
          const dif = num(l.precio) * num(l.cantidad) - num(l.precioOriginal) * num(l.cantidadOriginal);
          return <span className={tonoDeDiferencia(dif)}>{dif > 0 ? "+" : ""}{money(dif)}</span>;
        },
      },
      {
        clave: "acciones",
        titulo: "",
        tdClassName: "px-3 py-1.5 text-center",
        render: (l) => (
          <SunmiButton color="red" type="button" onClick={() => setLinea(l.key, { removed: true })}>Quitar</SunmiButton>
        ),
      },
    ],
    [permiteEditarPrecio]
  );

  // --- Handlers de pagos (operan sobre la lista YA sincronizada) ---
  const onPagoMonto = (id, valueStr) => {
    const cents = valueStr === "" ? 0 : aCent(Number(String(valueStr).replace(",", ".")));
    setPagos(setMontoCent(pagosCalc.pagos, id, cents, totalCent));
  };
  const onPagoAjustar = (id) => setPagos(setAjustador(pagosCalc.pagos, id));
  const onPagoQuitar = (id) => setPagos(quitarPago(pagosCalc.pagos, id));
  const onPagoAgregar = () => {
    const usados = new Set(pagos.map((p) => p.medio));
    const medio = MEDIOS.find((m) => m !== "FIADO" && !usados.has(m)) || "EFECTIVO";
    setPagos(agregarPago(pagosCalc.pagos, medio));
  };
  const onPagoMedio = (id, medio) => {
    if (medio === "FIADO" && pagos.length > 1) {
      if (!window.confirm("FIADO debe ser el único medio de pago. Se reemplazará la distribución actual por FIADO = total corregido. ¿Continuar?")) return;
    }
    setPagos(cambiarMedio(pagosCalc.pagos, id, medio, totalCent));
  };

  async function buscarCliente(q) {
    setBuscaCli(q);
    if (!q || q.length < 2) { setResCli([]); return; }
    try { const r = await fetch(`/api/clientes/buscar?q=${encodeURIComponent(q)}`, { credentials: "include" }); const d = await r.json(); setResCli((d.items || []).slice(0, 6)); } catch { setResCli([]); }
  }

  // --- Buscar producto extra (debounced) — mismo patrón que Recibir mercadería ---
  const buscarExtra = useCallback((text) => {
    setExtraSearch(text);
    setExtraResults([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim() || !data?.venta?.local?.id) { setExtraLoading(false); return; }
    setExtraLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/pos-ventas/buscar-producto?q=${encodeURIComponent(text.trim())}&localId=${data.venta.local.id}`, { credentials: "include" });
        const d = await r.json();
        const items = (d.items || d.productos || []);
        setExtraResults(items.slice(0, 10));
      } catch { /* silenciar */ }
      finally { setExtraLoading(false); }
    }, 350);
  }, [data]);

  // Cambia el modo Pack/Unidad de una línea de depósito, reescalando precio/costo
  // con las escalas ya congeladas en la línea (no divide/multiplica a mano).
  const onModoVenta = (key, modo) => setLinea(key, rescalarLinea(lineas.find((l) => l.key === key) || {}, modo));

  function agregarProducto(item) {
    setExtraAdding(item.key);
    const esDeposito = data?.venta?.local?.esDeposito === true;
    const factorPack = Math.max(1, Number(item.factorPack) || 1);
    const modoEnvio = item.modoEnvio || null;
    const puedeToggle = permiteToggleDeposito({ esDeposito, factorPack, modoEnvio }) && !item.esServicio && !item.esCombo;
    // Modo inicial = el de salida por defecto del POS (BULTO en depósito, UNIDAD en local/solo_unidad).
    const modoInicial = String(item.modoSalidaDefault || "").toUpperCase() === "UNIDAD" ? MODO_UNIDAD : MODO_PACK;
    // Congelar escalas capturadas de buscar-producto (precio/costo de pack y unidad).
    const precioBulto = num(item.precioVentaBulto ?? item.precio);
    const precioUnitario = num(item.precioVentaUnitario ?? item.precio);
    const costoBulto = item.precioCostoBulto != null ? num(item.precioCostoBulto) : null;
    const costoUnitario = item.precioCostoUnitario != null ? num(item.precioCostoUnitario) : null;
    const resoluble = item.esServicio ? true : costoResoluble({ precioCostoBulto: costoBulto, precioCostoUnitario: costoUnitario });
    const precio = modoInicial === MODO_UNIDAD ? precioUnitario : precioBulto;
    const precioCosto = item.esServicio ? undefined : (modoInicial === MODO_UNIDAD ? costoUnitario : costoBulto);
    setLineas((ls) => [...ls, {
      key: nextKey(), origenDetalleId: null, productoBaseId: item.productoBaseId, nombre: item.nombre,
      codigo: null, presentacion: null, cantidad: 1, precio, precioCosto: precioCosto ?? undefined,
      cantidadOriginal: 0, precioOriginal: precio, esServicio: !!item.esServicio, esCombo: !!item.esCombo,
      reconstruccion: null, modalidadConfirmada: null, removed: false,
      esDeposito, factorPack, modoEnvio, puedeToggle, modoVentaLinea: modoInicial,
      precioBulto, precioUnitario, costoBulto, costoUnitario, costoResoluble: resoluble,
    }]);
    setExtraSearch(""); setExtraResults([]); setExtraAdding(null);
  }

  function payloadLineas() {
    return activas.map((l) => {
      const cantidad = num(l.cantidad);
      const base = {
        origenDetalleId: l.origenDetalleId, productoBaseId: l.productoBaseId,
        cantidad, precio: num(l.precio),
        // Modo explícito (Pack/Unidad) — el backend recalcula cantidadStock, no confía en el front.
        modoVentaLinea: l.modoVentaLinea || MODO_PACK,
        factorPack: Math.max(1, Number(l.factorPack) || 1),
        cantidadStock: l.esServicio || l.esCombo ? null : cantidadStockLinea({ cantidad, modoVentaLinea: l.modoVentaLinea, factorPack: l.factorPack, modoEnvio: l.modoEnvio, esDeposito: l.esDeposito }),
      };
      if (l.precioCosto != null && Number.isFinite(l.precioCosto)) base.precioCosto = l.precioCosto;
      if (l.esServicio) base.importeServicio = num(l.precio);
      return base;
    });
  }
  function payloadConfirmaciones() {
    return lineas.filter((l) => l.origenDetalleId != null && l.modalidadConfirmada).map((l) => ({ origenDetalleId: l.origenDetalleId, modalidad: l.modalidadConfirmada }));
  }

  // ── Dirty guard ─────────────────────────────────────────────────────────────
  // Firma del PAYLOAD funcional actual (mismo que se enviaría a /revisar y /corregir).
  // Se recalcula ante cambios de líneas, pagos, cliente o motivo (incluye la edición
  // del motivo dentro de la etapa de revisión).
  const firmaActual = useMemo(
    () => firmaCorreccion({ lineas: payloadLineas(), pagos: payloadPagos(pagosCalc.pagos), cliente: clienteSel, motivo }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lineas, pagosCalc, clienteSel, motivo]
  );
  // dirty = el payload actual difiere del snapshot inicial (post-/editar). Antes de
  // tener snapshot (firmaInicial===null) nunca es dirty.
  const dirty = firmaInicial !== null && firmaActual !== firmaInicial;

  // Snapshot inicial: se toma UNA vez tras la primera carga exitosa (o tras recargar,
  // cuando firmaInicial se reseteó a null). No comparamos contra un snapshot anterior.
  useEffect(() => {
    if (data && !cargando && firmaInicial === null) setFirmaInicial(firmaActual);
  }, [data, cargando, firmaActual, firmaInicial]);

  // beforeunload: advertencia nativa SOLO mientras hay cambios (recarga/cerrar pestaña
  // o navegador). El mensaje no se personaliza (los navegadores modernos lo ignoran).
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ""; return ""; };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Botón atrás (App Router no ofrece bloqueador): centinela de history + popstate.
  // Al entrar en dirty insertamos UNA entrada centinela; el primer "atrás" la consume
  // y, en vez de salir, mostramos la confirmación inline y reponemos el centinela.
  useEffect(() => {
    if (!dirty || typeof window === "undefined") return;
    if (!sentinelRef.current) { window.history.pushState({ correccionSalida: true }, ""); sentinelRef.current = true; }
    const onPop = () => {
      if (bypassSalidaRef.current) return; // salida ya autorizada → no interferir
      window.history.pushState({ correccionSalida: true }, ""); // reponer centinela
      setConfirmSalida(true);
      const el = getEditorScrollEl();
      if (el) el.scrollTop = 0; else window.scrollTo(0, 0);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [dirty]);

  // Handlers de salida controlada (botón "Volver a la venta" + confirmación inline).
  const salirAhora = useCallback(() => {
    bypassSalidaRef.current = true;
    setConfirmSalida(false);
    onVolver && onVolver();
  }, [onVolver]);
  const solicitarSalida = useCallback(() => {
    if (!dirty) { onVolver && onVolver(); return; }
    setConfirmSalida(true);
    const el = getEditorScrollEl();
    if (el) el.scrollTop = 0; else if (typeof window !== "undefined") window.scrollTo(0, 0);
  }, [dirty, onVolver]);

  async function revisar() {
    if (revisando) return;
    // Guardar la posición del editor para restaurarla al "Volver a editar".
    { const el = getEditorScrollEl(); editorScrollRef.current = el ? el.scrollTop : 0; }
    setRevisando(true); setError("");
    try {
      const r = await fetch(`/api/pos-ventas/venta/${ventaId}/revisar`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ version: data.venta.version, cliente: clienteSel ? { id: clienteSel.id } : null, lineas: payloadLineas(), pagos: payloadPagos(pagosCalc.pagos), confirmaciones: payloadConfirmaciones() }),
      });
      const d = await r.json();
      if (!d.ok) { setError(d.error || "No se pudo revisar."); setRevisando(false); return; }
      setRevision(d);
    } catch { setError("Error de conexión."); }
    finally { setRevisando(false); }
  }
  async function confirmar() {
    if (confirmandoRef.current) return; // anti doble-submit síncrono (además del disabled)
    if (!motivo.trim()) { setError("El motivo es obligatorio."); return; }
    confirmandoRef.current = true;
    setConfirmando(true); setError(""); setErrorCode(null);
    try {
      const idempotencyKey = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `idem-${ventaId}-${Math.round(performance.now())}`;
      const r = await fetch(`/api/pos-ventas/venta/${ventaId}/corregir`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ motivo: motivo.trim(), idempotencyKey, version: data.venta.version, cliente: clienteSel ? { id: clienteSel.id } : null, lineas: payloadLineas(), pagos: payloadPagos(pagosCalc.pagos), confirmaciones: payloadConfirmaciones() }),
      });
      const d = await r.json();
      // Error (409/403/…): NO abandonar la revisión; mostrar mensaje + code, sin
      // limpiar el formulario. El code habilita "Recargar venta" ante conflicto.
      if (!d.ok) { setError(d.error || "No se pudo aplicar la corrección."); setErrorCode(d.code || null); setConfirmando(false); return; }
      // Éxito: autorizar la salida (sin advertencia espuria) y navegar al detalle.
      bypassSalidaRef.current = true;
      onCorregido && onCorregido(d); onVolver && onVolver();
    } catch { setError("Error de conexión."); }
    finally { setConfirmando(false); confirmandoRef.current = false; }
  }

  // "Recargar venta": re-carga /editar (re-dispara el effect). Explícito — solo se
  // usa ante conflicto de versión; el usuario decide (no se recarga automáticamente).
  // Resetea el snapshot inicial (firmaInicial=null): tras la nueva carga exitosa se
  // toma un baseline limpio → dirty=false (no comparamos contra el snapshot anterior).
  const recargarVenta = useCallback(() => {
    setRevision(null); setError(""); setErrorCode(null); setCargando(true);
    setConfirmSalida(false); setFirmaInicial(null);
    setReloadKey((k) => k + 1);
  }, []);

  const idsEnLineas = new Set(activas.map((l) => l.productoBaseId));

  // "Volver a editar" (etapa in-page): oculta la revisión SIN recargar /editar ni
  // perder líneas/pagos/cliente/motivo (mismo componente, estado intacto). No cambia
  // el idempotencyKey. Restaura una posición razonable del editor.
  const volverAEditar = useCallback(() => {
    setRevision(null);
    setError("");
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = getEditorScrollEl();
        if (el) el.scrollTop = editorScrollRef.current || 0;
      })
    );
  }, []);

  // Al ENTRAR en revisión: llevar al inicio (encabezado de revisión). Sin contenedor
  // overflow propio: usamos el scroll del documento/<main>.
  useEffect(() => {
    if (!revision) return;
    const el = getEditorScrollEl();
    if (el) el.scrollTop = 0; else if (typeof window !== "undefined") window.scrollTo(0, 0);
  }, [revision]);

  // Contenido del editor (contenido de página, scroll normal del documento).
  const contenido = (
    <div className="w-full">
      <SunmiCard>
          {/* Encabezado — patrón Ver / Recibir compra */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <SunmiHeader title="Corregir venta" />
              {data?.venta && (
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${ESTADO_BADGE[data.venta.estado] || ""}`}>
                  {String(data.venta.estado || "").toUpperCase()}
                </span>
              )}
            </div>
            <button type="button" onClick={solicitarSalida} className="sunmi-btn-base sunmi-btn-slate inline-flex items-center gap-1.5">
              <ArrowLeft size={15} /> Volver a la venta
            </button>
          </div>

          {cargando && <SunmiLoader />}
          {!cargando && error && !revision && (
            <div className="text-[13px] sunmi-state-danger sunmi-text-danger rounded px-2 py-1.5">{error}</div>
          )}

          {!cargando && data && bloqueado && (
            <SunmiPanel className="ring-2 ring-inset sunmi-ring shadow-sm">
              <div className="sunmi-state-warning sunmi-text-accent rounded p-3 text-sm">
                No se puede corregir esta venta.{" "}
                {c.motivoBloqueo === "turno_cerrado_no_corregible" ? "El turno original ya está cerrado."
                  : c.motivoBloqueo === "fuera_de_ventana" ? "Pasó la ventana de 30 días."
                  : c.motivoBloqueo === "flag_no_habilitado" ? "Función en beta: no habilitada para tu usuario."
                  : c.motivoBloqueo === "sin_permiso" ? "No tenés permiso." : "Turno no disponible."}
              </div>
            </SunmiPanel>
          )}

          {!cargando && data && !bloqueado && (
            <>
              {/* Metadatos del ticket */}
              <SunmiPanel className="ring-2 ring-inset sunmi-ring shadow-sm mb-4">
                {/* 7 campos: en pantallas anchas entran en una sola fila. */}
                <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4 text-sm">
                  <div>
                    <span className="sunmi-text-muted text-xs">Ticket</span>
                    <p className="sunmi-text-strong font-mono">#{data.venta.numero}</p>
                  </div>
                  <div>
                    <span className="sunmi-text-muted text-xs">Cliente</span>
                    <p className="sunmi-text-strong">{clienteSel?.nombre || "Consumidor final"}</p>
                  </div>
                  <div>
                    <span className="sunmi-text-muted text-xs">Local</span>
                    <p className="sunmi-text-strong">{data.venta.local?.nombre || "—"}</p>
                  </div>
                  <div>
                    <span className="sunmi-text-muted text-xs">Fecha</span>
                    <p className="sunmi-text-strong">{fmtFecha(data.venta.fecha)}</p>
                  </div>
                  <div>
                    <span className="sunmi-text-muted text-xs">Estado</span>
                    <p className="sunmi-text-strong capitalize">{data.venta.estado}</p>
                  </div>
                  <div>
                    <span className="sunmi-text-muted text-xs">Versión</span>
                    <p className="sunmi-text-strong">{data.venta.version}</p>
                  </div>
                  <div>
                    <span className="sunmi-text-muted text-xs">Turno</span>
                    <p className={data.turno?.turnoAbierto ? "sunmi-text-success font-medium" : "sunmi-text-danger font-medium"}>
                      {data.turno?.turnoAbierto ? "● Abierto" : "Cerrado"}
                    </p>
                  </div>
                </div>
              </SunmiPanel>

              {/* Cliente */}
              <SunmiPanel className="ring-2 ring-inset sunmi-ring shadow-sm mb-4">
                <div className="flex items-center justify-between pb-2 mb-3 border-b sunmi-divider">
                  <h3 className="text-[13px] font-semibold sunmi-text-strong">Cliente</h3>
                  <span className="text-xs sunmi-text-muted">{clienteSel ? clienteSel.nombre : "Consumidor final"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <SunmiInput value={buscaCli} onChange={(e) => buscarCliente(e.target.value)} placeholder="Buscar cliente…" />
                  {clienteSel && <SunmiButton color="slate" type="button" onClick={() => setClienteSel(null)}>Quitar</SunmiButton>}
                </div>
                {resCli.length > 0 && (
                  <div className="mt-2 overflow-x-auto rounded border sunmi-border">
                    <SunmiTable headers={["Cliente", "Documento", ""]}>
                      {resCli.map((cl) => (
                        <SunmiTableRow key={cl.id}>
                          <td className="px-3 py-1.5 text-sm">{cl.nombre}</td>
                          <td className="px-3 py-1.5 text-xs sunmi-text-muted">{cl.documento || "-"}</td>
                          <td className="px-3 py-1.5">
                            <SunmiButton color="cyan" size="xs" onClick={() => { setClienteSel({ id: cl.id, nombre: cl.nombre }); setResCli([]); setBuscaCli(""); }}>Elegir</SunmiButton>
                          </td>
                        </SunmiTableRow>
                      ))}
                    </SunmiTable>
                  </div>
                )}
              </SunmiPanel>

              {/* Detalle de productos */}
              <SunmiPanel className="ring-2 ring-inset sunmi-ring shadow-sm mb-4">
                <div className="flex items-center pb-2 mb-3 border-b sunmi-divider">
                  <h3 className="text-[13px] font-semibold sunmi-text-strong">Detalle ({activas.length} items)</h3>
                </div>

                {/* DESKTOP: tabla */}
                <div className="hidden md:block overflow-x-auto rounded border sunmi-border">
                  <SunmiTable
                    columnas={columnasDetalle}
                    filas={activas}
                    claveFila={(l) => l.key}
                    vacio="Sin items"
                    // EL PIE LO ARMA LA TABLA, y por eso acá no hay ningún
                    // colSpan. Era un 5 escrito a mano sobre nueve columnas: el
                    // día que se agregue o se saque una, el pie queda corrido y
                    // nada avisa. Ahora se dice qué número va en qué columna.
                    pie={
                      activas.length > 0
                        ? {
                            etiqueta: "TOTAL CORREGIDO",
                            className: "px-3 py-2 text-sm",
                            valores: {
                              subOrig: <span className="tabular-nums sunmi-text-muted">{money(sumSubOrig)}</span>,
                              subCorr: <span className="font-bold sunmi-text-accent">{money(total)}</span>,
                              diferencia: (
                                <span className={`font-bold tabular-nums ${tonoDeDiferencia(total - sumSubOrig)}`}>
                                  {total - sumSubOrig > 0 ? "+" : ""}
                                  {money(total - sumSubOrig)}
                                </span>
                              ),
                            },
                          }
                        : undefined
                    }
                  />
                </div>

                {/* MÓVIL: cards */}
                <div className="md:hidden flex flex-col gap-2">
                  {activas.length === 0 ? (
                    <p className="text-xs sunmi-text-muted italic px-1">Sin items</p>
                  ) : (
                    activas.map((l) => (
                      <LineaEditableCard
                        key={l.key} linea={l} permiteEditarPrecio={permiteEditarPrecio}
                        onChange={(patch) => setLinea(l.key, patch)} onRemove={() => setLinea(l.key, { removed: true })}
                        onModoVenta={(modo) => onModoVenta(l.key, modo)}
                      />
                    ))
                  )}
                  {activas.length > 0 && (
                    <div className="flex items-center justify-between rounded-xl border sunmi-border p-3 sunmi-surface">
                      <span className="text-sm font-semibold sunmi-text-strong">TOTAL CORREGIDO</span>
                      <span className="text-base font-bold sunmi-text-accent">{money(total)}</span>
                    </div>
                  )}
                </div>

                {ambiguasSinResolver.length > 0 && (
                  <div className="text-[11px] sunmi-text-danger mt-2">Resolvé el consumo original de las líneas marcadas para poder revisar.</div>
                )}
              </SunmiPanel>

              {/* Agregar producto — bloque inline (patrón "Agregar producto extra") */}
              <SunmiPanel className="ring-2 ring-inset sunmi-ring shadow-sm mb-4">
                <div className="flex items-center pb-2 mb-3 border-b sunmi-divider">
                  <h3 className="text-[13px] font-semibold sunmi-text-strong">Agregar producto</h3>
                </div>

                <SunmiInput
                  type="text" placeholder="Buscar producto (nombre / código de barra)"
                  autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
                  value={extraSearch} onChange={(e) => buscarExtra(e.target.value)} className="mb-3"
                />

                {extraLoading && <p className="text-xs sunmi-text-muted">Buscando...</p>}
                {!extraLoading && extraSearch.trim() && extraResults.length === 0 && <p className="text-xs sunmi-text-muted">Sin resultados</p>}

                {extraResults.length > 0 && (
                  <div className="overflow-x-auto rounded border sunmi-border">
                    <SunmiTable headers={["Producto", "Cód. barra", "Presentación", "Precio", ""]}>
                      {extraResults.map((p) => {
                        const baseId = p.productoBaseId ?? p.baseId;
                        const precio = Number(p.precioVenta ?? p.precio ?? p.precio_venta ?? 0);
                        const presentacion = p.esServicioImporteVariable ? "Servicio" : (p.modoSalidaDefault === "BULTO" ? "Bulto" : "Unidad");
                        const rowKey = p.productoLocalId ?? baseId;
                        // Se permiten productos repetidos (Pack y Unidad son líneas distintas).
                        const yaEsta = idsEnLineas.has(baseId);
                        return (
                          <SunmiTableRow key={rowKey}>
                            <td className="px-3 py-1.5 text-sm">{p.nombre}{yaEsta ? <span className="ml-1 text-[10px] sunmi-text-muted">(en carrito)</span> : null}</td>
                            <td className="px-3 py-1.5 text-xs sunmi-text-muted">{p.codigoBarra || "-"}</td>
                            <td className="px-3 py-1.5 text-xs">{presentacion}</td>
                            <td className="px-3 py-1.5 text-xs">{precio > 0 ? money(precio) : "-"}</td>
                            <td className="px-3 py-1.5">
                              <SunmiButton
                                color="cyan" size="xs" disabled={extraAdding === rowKey}
                                onClick={() => agregarProducto({
                                  productoBaseId: baseId, nombre: p.nombre, precio,
                                  esServicio: !!p.esServicioImporteVariable, esCombo: !!p.esCombo, key: rowKey,
                                  // Escalas para congelar precio/costo de pack y unidad + modo.
                                  factorPack: p.factorPack, modoEnvio: p.modoEnvio, modoSalidaDefault: p.modoSalidaDefault,
                                  precioVentaBulto: p.precioVentaBulto, precioVentaUnitario: p.precioVentaUnitario,
                                  precioCostoBulto: p.precioCostoBulto, precioCostoUnitario: p.precioCostoUnitario,
                                })}
                              >
                                {extraAdding === rowKey ? "..." : "Agregar"}
                              </SunmiButton>
                            </td>
                          </SunmiTableRow>
                        );
                      })}
                    </SunmiTable>
                  </div>
                )}
              </SunmiPanel>

              {/* Pagos */}
              <SunmiPanel className="ring-2 ring-inset sunmi-ring shadow-sm mb-4">
                <div className="flex items-center pb-2 mb-3 border-b sunmi-divider">
                  <h3 className="text-[13px] font-semibold sunmi-text-strong">Pagos</h3>
                </div>

                <div className="flex flex-col gap-3">
                  {pagosCalc.pagos.map((p) => {
                    const esAj = p.id === pagosCalc.ajustadorId;
                    const varios = pagosCalc.pagos.length > 1;
                    const esFiadoRow = p.medio === "FIADO";
                    return (
                      <div key={p.id} className="flex flex-wrap items-end gap-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] sunmi-text-muted">Medio</span>
                          <div className="w-40">
                            <SunmiSelectAdv value={p.medio} onChange={(v) => onPagoMedio(p.id, v)}>
                              {MEDIOS.map((m) => <SunmiSelectOption key={m} value={m}>{MEDIO_LABEL[m]}</SunmiSelectOption>)}
                            </SunmiSelectAdv>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] sunmi-text-muted">
                            Importe{esAj && varios ? <span className="sunmi-text-accent font-medium"> · Saldo automático</span> : null}
                          </span>
                          <div className="flex items-center gap-0.5">
                            <span className="sunmi-text-muted text-xs">$</span>
                            <SunmiInput
                              type="text" inputMode="decimal" value={desdeCent(p.montoCent)} disabled={esAj}
                              onChange={(e) => onPagoMonto(p.id, e.target.value)}
                              className="w-[110px] text-center"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-3 pb-1.5">
                          {!esAj && !esFiadoRow && (
                            <button type="button" className="text-[11px] sunmi-text-link underline" onClick={() => onPagoAjustar(p.id)}>Ajustar saldo aquí</button>
                          )}
                          <SunmiButton color="red" type="button" disabled={pagosCalc.pagos.length === 1} onClick={() => onPagoQuitar(p.id)}>Quitar</SunmiButton>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t sunmi-divider gap-2 flex-wrap">
                  <SunmiButton color="slate" type="button" disabled={esFiado(pagos)} onClick={onPagoAgregar}>+ Medio de pago</SunmiButton>
                  <span className={`text-sm ${pagosCalc.negativo ? "sunmi-text-danger font-bold" : "sunmi-text-muted"}`}>
                    Disponible para asignar: <span className="font-semibold tabular-nums">{money(desdeCent(pagosCalc.disponibleCent))}</span>
                  </span>
                </div>
              </SunmiPanel>

              {/* Resumen */}
              <SunmiPanel className="ring-2 ring-inset sunmi-ring shadow-sm mb-4">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="sunmi-text-muted text-xs">Total original</span>
                    <p className="sunmi-text-strong tabular-nums">{money(totalOriginalVenta)}</p>
                  </div>
                  <div>
                    <span className="sunmi-text-muted text-xs">Total corregido</span>
                    <p className="text-lg font-bold sunmi-text-accent tabular-nums">{money(total)}</p>
                  </div>
                  <div>
                    <span className="sunmi-text-muted text-xs">Diferencia</span>
                    <p className={`font-bold tabular-nums ${difVsVenta < 0 ? "sunmi-text-danger" : difVsVenta > 0 ? "sunmi-text-accent" : "sunmi-text-muted"}`}>{difVsVenta > 0 ? "+" : ""}{money(difVsVenta)}</p>
                  </div>
                </div>
              </SunmiPanel>

              {error && <div className="text-[13px] sunmi-state-danger sunmi-text-danger rounded px-2 py-1.5 mb-4">{error}</div>}

              {/* Acciones: barra inferior STICKY (Volver a la venta / Revisar). */}
              <div className="sticky bottom-0 z-10 mt-4 py-3 sunmi-bg border-t sunmi-divider flex justify-end gap-3">
                <SunmiButton color="slate" onClick={solicitarSalida}>
                  Volver a la venta
                </SunmiButton>
                <SunmiButton color="amber" onClick={revisar} disabled={revisando || !puedeRevisar}>
                  {revisando ? "Revisando..." : "Revisar cambios"}
                </SunmiButton>
              </div>
            </>
          )}
        </SunmiCard>
    </div>
  );

  // Confirmación INLINE de salida con cambios (no es un modal grande ni un overlay
  // fixed): se renderiza al tope del contenido, en ambas vistas (editor y revisión),
  // para cubrir el botón "Volver a la venta" y el botón atrás del navegador.
  const salidaBanner = confirmSalida ? (
    <ConfirmarSalida onSeguir={() => setConfirmSalida(false)} onSalir={salirAhora} />
  ) : null;

  // Contenido de página (scroll normal del documento, sin overlay ni modal).
  // revision !== null → la ETAPA de revisión REEMPLAZA al editor (misma URL/documento).
  if (revision) {
    return (
      <>
        {salidaBanner}
        <RevisionVentaCorreccion
          revision={revision}
          venta={data?.venta}
          motivo={motivo}
          setMotivo={setMotivo}
          confirmando={confirmando}
          error={error}
          errorCode={errorCode}
          onVolverEditar={volverAEditar}
          onConfirmar={confirmar}
          onRecargar={recargarVenta}
        />
      </>
    );
  }
  return (<>{salidaBanner}{contenido}</>);
}

// ---------------------------------------------------------------------------
// Confirmación de "cambios sin guardar" — panel INLINE accesible (no modal grande,
// sin overlay fixed ni fondo negro). role="alertdialog", foco inicial en "Seguir
// editando", Escape cancela. Botones grandes (mobile-friendly).
// ---------------------------------------------------------------------------
function ConfirmarSalida({ onSeguir, onSalir }) {
  // SunmiButton no reenvía ref → enfocamos "Seguir editando" por id. Escape cancela.
  useEffect(() => {
    if (typeof document !== "undefined") document.getElementById("salida-seguir")?.focus();
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); onSeguir(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSeguir]);
  return (
    <div
      role="alertdialog"
      aria-labelledby="salida-titulo"
      aria-describedby="salida-desc"
      className="mb-3 rounded-lg sunmi-state-warning border sunmi-divider p-3 sm:p-4"
    >
      <div id="salida-titulo" className="text-sm font-semibold sunmi-text-accent">
        Cambios sin guardar
      </div>
      <div id="salida-desc" className="mt-1 text-[13px] sunmi-text-strong">
        Hay cambios sin guardar. Si salís ahora, se perderán.
      </div>
      <div className="mt-3 flex flex-col sm:flex-row sm:justify-end gap-2">
        <SunmiButton id="salida-seguir" color="slate" onClick={onSeguir} className="w-full sm:w-auto">
          Seguir editando
        </SunmiButton>
        <SunmiButton color="red" onClick={onSalir} className="w-full sm:w-auto">
          Salir sin guardar
        </SunmiButton>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Etapa de REVISIÓN in-page. Reemplaza al editor en la misma URL; SIN overlay, portal,
// fondo negro, z-index ni scroll interno. Solo RENDERIZA el objeto `revision` que ya
// devolvió /revisar (no re-arma ni re-consulta). Los campos Pack/Unidad y cantidadStock
// por línea NO vienen hoy en la respuesta de revisar (ver informe).
// ---------------------------------------------------------------------------
function RevisionVentaCorreccion({ revision, venta, motivo, setMotivo, confirmando, error, errorCode, onVolverEditar, onConfirmar, onRecargar }) {
  const t = revision.totales || {};
  const dp = revision.diff?.productos || {};
  const pg = revision.pagos || {};
  const puede = revision.puedeConfirmar === true;
  const dif = Number(t.diferencia) || 0;
  const vOrig = revision.version;
  const vProp = revision.version != null ? Number(revision.version) + 1 : null;
  const unidadesMas = (dp.agregadas || []).reduce((a, l) => a + Number(l.cantidad || 0), 0) + (dp.modificadas || []).reduce((a, l) => a + Math.max(0, Number(l.cantidadDespues) - Number(l.cantidadAntes)), 0);
  const unidadesMenos = (dp.eliminadas || []).reduce((a, l) => a + Number(l.cantidad || 0), 0) + (dp.modificadas || []).reduce((a, l) => a + Math.max(0, Number(l.cantidadAntes) - Number(l.cantidadDespues)), 0);
  const sinProductos = (dp.agregadas || []).length === 0 && (dp.eliminadas || []).length === 0 && (dp.modificadas || []).length === 0;
  const necesitaRecargar = errorCode === "conflicto_version";
  const msgAdvertencia = (a) => a.tipo === "pagos_no_cuadran" ? "Los pagos no cuadran con el total." : a.tipo === "fiado_sin_cliente" ? "Una venta fiada requiere cliente." : a.tipo === "stock_insuficiente" ? "Stock insuficiente." : (a.detalle || a.tipo);

  return (
    <div className="w-full space-y-3" style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" }}>
      {/* 1. Encabezado */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <SunmiHeader title="Revisar corrección" />
        {venta?.estado && (
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${ESTADO_BADGE[venta.estado] || ""}`}>{String(venta.estado).toUpperCase()}</span>
        )}
      </div>
      <SunmiPanel className="">
        <div className="grid grid-cols-2 gap-y-1 gap-x-3 text-[13px]">
          <div><span className="sunmi-text-muted">Ticket </span><span className="font-mono font-semibold">#{venta?.numero ?? venta?.id ?? "—"}</span></div>
          <div className="text-right"><span className="sunmi-text-muted">Versión </span><span className="font-semibold">v{vOrig ?? "—"} → v{vProp ?? "—"}</span></div>
          <div><span className="sunmi-text-muted">Local </span><span className="font-medium">{venta?.local?.nombre || "—"}</span></div>
          <div className="text-right"><span className="sunmi-text-muted">Turno </span><span className={revision.turno?.turnoAbierto ? "sunmi-text-success" : "sunmi-text-danger"}>{revision.turno?.turnoAbierto ? "Abierto" : (revision.turno ? "Cerrado" : "—")}</span></div>
        </div>
      </SunmiPanel>

      {/* 2. Resumen económico */}
      <SunmiPanel className="">
        <div className="text-[13px] font-semibold mb-2">Resumen económico</div>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between"><span className="sunmi-text-muted">Total anterior</span><span className="tabular-nums">{money(t.totalAnterior)}</span></div>
          <div className="flex justify-between"><span className="sunmi-text-muted">Total nuevo</span><span className="tabular-nums font-semibold">{money(t.totalNuevo)}</span></div>
          <div className="flex justify-between"><span className="sunmi-text-muted">Diferencia</span>
            <span className={`tabular-nums font-semibold ${dif < 0 ? "sunmi-text-danger" : dif > 0 ? "sunmi-text-accent" : ""}`}>{dif > 0 ? "+" : ""}{money(dif)}{dif < 0 ? " · a devolver" : dif > 0 ? " · a cobrar" : ""}</span></div>
          <div className="text-[11px] sunmi-text-muted">Unidades + {unidadesMas} · − {unidadesMenos}</div>
        </div>
        <div className="mt-3 pt-2 border-t sunmi-divider">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium">Pagos</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${pg.cuadran ? "sunmi-state-success sunmi-text-success" : "sunmi-state-danger sunmi-text-danger"}`}>{pg.cuadran ? "Cuadran" : "No cuadran"}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-1 text-[12px]">
            <div>
              <div className="sunmi-text-muted mb-0.5">Anteriores</div>
              {(pg.anteriores || []).length === 0 ? <div className="sunmi-text-muted">—</div> : (pg.anteriores || []).map((p, i) => <div key={`pa${i}`} className="flex justify-between gap-2"><span className="capitalize truncate">{String(p.medio).toLowerCase()}</span><span className="tabular-nums">{money(p.monto)}</span></div>)}
            </div>
            <div>
              <div className="sunmi-text-muted mb-0.5">Nuevos</div>
              {(pg.nuevos || []).length === 0 ? <div className="sunmi-text-muted">—</div> : (pg.nuevos || []).map((p, i) => <div key={`pn${i}`} className="flex justify-between gap-2"><span className="capitalize truncate">{String(p.medio).toLowerCase()}</span><span className="tabular-nums">{money(p.monto)}</span></div>)}
            </div>
          </div>
        </div>
        {revision.diff?.cambioCliente && (
          <div className="mt-2 pt-2 border-t sunmi-divider text-[12px] sunmi-text-muted">
            Cliente: {revision.diff.cambioCliente.antes ?? "consumidor final"} → {revision.diff.cambioCliente.despues ?? "consumidor final"}
          </div>
        )}
      </SunmiPanel>

      {/* 3. Productos */}
      <SunmiPanel className="">
        <div className="text-[13px] font-semibold mb-2">Productos</div>
        {sinProductos && <div className="text-[12px] sunmi-text-muted">Sin cambios en los productos.</div>}
        {(dp.agregadas || []).length > 0 && (
          <div className="mb-2">
            <div className="text-[11px] sunmi-text-success font-medium mb-0.5">Agregados</div>
            {(dp.agregadas || []).map((l, i) => <div key={`a${i}`} className="flex justify-between gap-2 text-[12px]"><span className="truncate">+ {l.nombre} × {l.cantidad}</span><span className="tabular-nums sunmi-text-success shrink-0">{money(l.subtotal)}</span></div>)}
          </div>
        )}
        {(dp.eliminadas || []).length > 0 && (
          <div className="mb-2">
            <div className="text-[11px] sunmi-text-danger font-medium mb-0.5">Eliminados</div>
            {(dp.eliminadas || []).map((l, i) => <div key={`e${i}`} className="flex justify-between gap-2 text-[12px]"><span className="truncate">− {l.nombre} × {l.cantidad}</span><span className="tabular-nums sunmi-text-danger shrink-0">−{money(l.subtotal)}</span></div>)}
          </div>
        )}
        {(dp.modificadas || []).length > 0 && (
          <div>
            <div className="text-[11px] sunmi-text-accent font-medium mb-0.5">Modificados</div>
            {(dp.modificadas || []).map((l, i) => {
              const d = Number(l.subtotalDespues) - Number(l.subtotalAntes);
              return (
                <div key={`m${i}`} className="text-[12px] border-t sunmi-divider py-1.5 first:border-0 first:pt-0">
                  <div className="font-medium truncate">{l.nombre}</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 sunmi-text-muted tabular-nums">
                    <span>Cant. {l.cantidadAntes}→<span className="sunmi-text-strong">{l.cantidadDespues}</span></span>
                    <span>P. {money(l.precioAntes)}→<span className="sunmi-text-strong">{money(l.precioDespues)}</span></span>
                    <span>Subt. {money(l.subtotalAntes)}→<span className="sunmi-text-strong">{money(l.subtotalDespues)}</span></span>
                    <span className={d < 0 ? "sunmi-text-danger" : d > 0 ? "sunmi-text-accent" : ""}>Δ {d > 0 ? "+" : ""}{money(d)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SunmiPanel>

      {/* 4. Impacto de stock (delta NETO por ProductoLocal; el split vuelven/salen no
             viene separado en revisar — se interpreta por el signo del delta). */}
      {(revision.impactoStock || []).length > 0 && (
        <SunmiPanel className="">
          <div className="text-[13px] font-semibold mb-2">Impacto de stock</div>
          <div className="space-y-1">
            {(revision.impactoStock || []).map((s, i) => (
              <div key={`s${i}`} className="flex flex-wrap items-baseline justify-between gap-x-2 text-[12px]">
                <span className="sunmi-text-muted">Producto local #{s.productoLocalId}</span>
                <span className="tabular-nums">
                  {s.stockAntes}→<span className="sunmi-text-strong">{s.stockDespues}</span>
                  <span className={`ml-2 ${Number(s.delta) > 0 ? "sunmi-text-success" : Number(s.delta) < 0 ? "sunmi-text-danger" : ""}`}>
                    ({Number(s.delta) > 0 ? "+" : ""}{s.delta}{Number(s.delta) > 0 ? " vuelven" : Number(s.delta) < 0 ? " salen" : ""})
                  </span>
                  {s.insuficiente && <span className="ml-2 sunmi-text-danger">⚠ insuficiente</span>}
                </span>
              </div>
            ))}
          </div>
        </SunmiPanel>
      )}

      {/* 5. Motivo (visible antes de confirmar) */}
      <SunmiPanel className="">
        <div className="text-[11px] sunmi-text-muted mb-1">Motivo de la corrección *</div>
        <SunmiInput value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por qué se corrige (obligatorio)" className="text-sm" maxLength={300} />
        {!motivo.trim() && <div className="text-[11px] sunmi-text-danger mt-1">El motivo es obligatorio para confirmar.</div>}
      </SunmiPanel>

      {/* 6. Validaciones / bloqueos (de la respuesta de revisar; sin recalcular) */}
      {(revision.cuentaCorriente?.aplica || (revision.bloqueosLegacy || []).length > 0 || (revision.advertencias || []).length > 0 || !puede) && (
        <div className="space-y-1.5">
          {revision.cuentaCorriente?.aplica && <div className="text-[12px] sunmi-state-warning sunmi-text-accent rounded px-2 py-1.5">Cuenta corriente: {String(revision.cuentaCorriente.tipo).replaceAll("_", " ")}</div>}
          {(revision.bloqueosLegacy || []).length > 0 && <div className="text-[12px] sunmi-state-danger sunmi-text-danger rounded px-2 py-1.5">Hay líneas sin consumo resuelto: {revision.bloqueosLegacy.map((b) => b.nombre).join(", ")}</div>}
          {(revision.advertencias || []).map((a, i) => (
            <div key={`w${i}`} className="text-[12px] sunmi-state-danger sunmi-text-danger rounded px-2 py-1.5">{msgAdvertencia(a)}</div>
          ))}
          {!puede && <div className="text-[11px] sunmi-text-muted">No se puede confirmar hasta resolver las advertencias.</div>}
        </div>
      )}

      {/* Error de CONFIRMAR (409/403/…): permanece en revisión, muestra mensaje + code. */}
      {error && (
        <div className="text-[12px] sunmi-state-danger sunmi-text-danger rounded px-2 py-2 space-y-1.5">
          <div>{error}{errorCode ? <span className="sunmi-text-muted ml-1">(código: {errorCode})</span> : null}</div>
          {necesitaRecargar && (
            <div className="flex items-center gap-2">
              <span className="sunmi-text-muted">La venta cambió desde que la abriste.</span>
              <SunmiButton color="slate" onClick={onRecargar} className="text-[11px] px-2 py-1">Recargar venta</SunmiButton>
            </div>
          )}
        </div>
      )}

      {/* Barra sticky de acciones (respeta safe-area inferior). */}
      <div
        className="sticky bottom-0 z-10 -mx-1 px-1 pt-3 sunmi-bg border-t sunmi-divider flex justify-end gap-3"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <SunmiButton color="slate" onClick={onVolverEditar} disabled={confirmando}>Volver a editar</SunmiButton>
        <SunmiButton color="amber" onClick={onConfirmar} disabled={confirmando || !puede || !motivo.trim()}>
          {confirmando ? "Aplicando…" : "Confirmar corrección"}
        </SunmiButton>
      </div>
    </div>
  );
}
