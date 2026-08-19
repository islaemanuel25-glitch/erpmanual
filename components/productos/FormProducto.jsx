"use client";

import { useEffect, useRef, useState } from "react";
import SunmiPanel from "@/components/sunmi/SunmiPanel";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiSelectConCrearRapido from "@/components/sunmi/SunmiSelectConCrearRapido";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiToggleEstado from "@/components/sunmi/SunmiToggleEstado";
import VoiceFieldButton from "@/components/productos/VoiceFieldButton";
import SeccionCodigosProveedor from "@/components/productos/SeccionCodigosProveedor";
import { defaultModoEnvio } from "@/lib/conversiones/stock";
import {
  precioDesdeMargen,
  margenEfectivoDe,
} from "@/lib/precios/precioDesdeMargen";
import { redondear100 } from "@/lib/precios/redondeo";
import { etiquetaEscalaPrecio } from "@/lib/precios/escalaPrecio";
import {
  MAX_CODIGO_BARRA,
  alEscribirCodigoBarra,
  paraMostrarCodigoBarra,
} from "@/lib/productos/codigoBarra";
import {
  REGLA_MARGEN,
  REGLA_RECARGO,
  precioDesdeRecargoUnidad,
  recargoDesdePrecio,
  costoUnitarioDesde,
} from "@/lib/precios/recargoFijoUnidad";
import useVersionGuard from "@/hooks/useVersionGuard";
import AvisoVersionNueva from "@/components/version/AvisoVersionNueva";
import AvisoCambioDeEscala from "@/components/productos/AvisoCambioDeEscala";
import { useUser } from "@/app/context/UserContext";

function parseVoiceNumber(text) {
  if (text === null || text === undefined) return null;
  const cleaned = String(text)
    .replace(/[^\d,.\-]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseVoiceCodigoBarra(text) {
  return String(text || "").replace(/\D+/g, "");
}

/**
 * Envuelve subárboles de campos MAESTROS. Cuando `locked`, los deshabilita:
 * combina fieldset[disabled] (inputs/botones nativos → teclado + mouse) con
 * pointer-events:none (toggles/selects basados en <div>, que el fieldset no
 * alcanza). Cuando NO está bloqueado, devuelve los hijos tal cual (sin envoltorio)
 * para no alterar el layout ni provocar remontes. Definido a nivel de módulo para
 * mantener identidad estable (no remontar los inputs en cada tecla).
 */
function MaestroLock({ locked, children }) {
  if (!locked) return <>{children}</>;
  return (
    <fieldset
      disabled
      aria-disabled="true"
      style={{ pointerEvents: "none", opacity: 0.55, minWidth: 0, border: 0, margin: 0, padding: 0 }}
    >
      {children}
    </fieldset>
  );
}

/* ============================================================
   FOCUS ORDER — Enter avanza al siguiente campo
   ============================================================ */
const FOCUS_ORDER = [
  "nombre", "codigo_barra", "codigo_barra_secundario", "sku", "descripcion",
  "categoria_id", "area_fisica_id",
  "proveedor_id", "proveedor2_id", "proveedor3_id",
  "unidad_medida", "factor_pack", "peso_kg", "volumen_ml",
  "precio_costo", "margen", "precio_venta", "iva_porcentaje",
  "precio_sugerido", "fecha_vencimiento", "imagen_url",
  "redondeo_100", "es_combo", "activo",
  "modo_pedido", "modo_envio",
];

/**
 * FormProducto — formulario reutilizable para crear/editar producto.
 *
 * Props:
 *  - initialData: objeto con datos del producto (null/undefined = nuevo vacío)
 *  - catalogos: { CATEGORIAS, PROVEEDORES, AREAS }
 *  - onSubmit(payload): callback con payload listo para API
 *  - onCancel(): callback para cancelar
 *  - submitLabel: texto del botón (default según initialData)
 *  - puedeEditarCosto: si false, el precio de costo se muestra solo-lectura y NO
 *      se envía (producto del depósito editado desde un local). El backend igual
 *      revalida. Default true (alta y productos propios del local).
 */
export default function FormProducto({
  initialData = null,
  catalogos,
  onSubmit,
  onCancel,
  submitLabel,
  enableVoiceInputs = false,
  onCatalogoCreado,
  puedeEditarCosto = true,
  // false cuando el local NO es dueño del producto (producto de depósito visto desde
  // un local): la FICHA MAESTRA se bloquea y solo quedan editables los campos locales
  // (precio de venta, margen, estado y recargo del local). Default true (alta y
  // productos propios). El backend revalida (defensa en profundidad).
  puedeEditarBase = true,
  // true cuando se edita el producto DENTRO de un local (no depósito): se edita el
  // OVERRIDE por local del recargo. false (alta o edición en depósito/base): se edita
  // el recargo POR DEFECTO del producto base. Evita mostrar un campo que la API ignora.
  editandoOverrideLocal = false,
}) {
  // Bloqueo de ficha maestra: producto de depósito editado desde un local no dueño.
  const soloLocal = !puedeEditarBase;
  const scrollRef = useRef(null);

  // Crear categorías/proveedores/áreas (entidades globales) es solo para admin: el
  // backend exige requireAdmin. Para no-admin ocultamos el "+ Nuevo" (puede seguir
  // seleccionando existentes) y NO usamos productos.crear como autorización indirecta.
  const { perfil } = useUser();

  // Guard de versión. `puedeGuardar()` consulta /api/version SIEMPRE, sin
  // reutilizar el chequeo oportunista de visibilidad.
  const { versionNueva, verificando: verificandoVersion, puedeGuardar } = useVersionGuard();
  const esAdmin = Array.isArray(perfil?.permisos) && perfil.permisos.includes("*");

  const toNum = (v) => {
    if (v === "" || v === null || v === undefined) return "";
    const n = Number(v);
    return Number.isFinite(n) ? n : "";
  };

  // El redondeo a 100 vive en lib/precios/redondeo.js (redondear100):
  // una sola regla para el form, las compras y la propagación depósito→locales.
  // Acá solo queda el redondeo a centavos, que es de PERSISTENCIA (Decimal(12,2)).
  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

  const camelToForm = (o = {}) => ({
    nombre: o.nombre ?? "",
    descripcion: o.descripcion ?? "",
    sku: o.sku ?? "",
    codigo_barra: o.codigo_barra ?? o.codigoBarra ?? "",
    codigo_barra_secundario: o.codigo_barra_secundario ?? o.codigoBarraSecundario ?? "",
    codigo_barra_propio: o.codigo_barra_propio ?? o.codigoBarraPropio ?? "",
    categoria_id: o.categoria_id ?? o.categoriaId ?? "",
    proveedor_id: o.proveedor_id ?? o.proveedorId ?? "",
    proveedor2_id: o.proveedor2_id ?? o.proveedor2Id ?? "",
    proveedor3_id: o.proveedor3_id ?? o.proveedor3Id ?? "",
    area_fisica_id: o.area_fisica_id ?? o.areaFisicaId ?? "",
    unidad_medida: o.unidad_medida ?? o.unidadMedida ?? "unidad",
    factor_pack: toNum(o.factor_pack ?? o.factorPack ?? ""),
    peso_kg: toNum(o.peso_kg ?? o.pesoKg ?? ""),
    volumen_ml: toNum(o.volumen_ml ?? o.volumenMl ?? ""),
    precio_costo: toNum(o.precio_costo ?? o.precioCosto ?? ""),
    precio_venta: toNum(o.precio_venta ?? o.precioVenta ?? ""),
    margen: toNum(o.margen ?? ""),
    // Estos dos llegan en camelCase desde /api/productos/obtener (precioSugerido,
    // ivaPorcentaje). Sin el fallback se leían como vacíos y el form los reenviaba
    // en null: al dueño le BORRABA el valor cargado, y a un local sobre un producto
    // del depósito le hacía rebotar el guardado con "no podés modificar la ficha
    // maestra" —bloqueando de hecho su propio precio de venta.
    precio_sugerido: toNum(o.precio_sugerido ?? o.precioSugerido ?? ""),
    iva_porcentaje: toNum(o.iva_porcentaje ?? o.ivaPorcentaje ?? ""),
    // Regla de precio de esta ubicación. Sin dato → la de siempre.
    reglaPrecio: o.reglaPrecio ?? o.regla_precio ?? "MARGEN_PORCENTUAL",
    recargoFijoUnidad: toNum(o.recargoFijoUnidad ?? o.recargo_fijo_unidad ?? ""),
    fecha_vencimiento:
      o.fecha_vencimiento
        ? String(o.fecha_vencimiento).split("T")[0]
        : o.fechaVencimiento
        ? String(o.fechaVencimiento).split("T")[0]
        : "",
    redondeo_100: Boolean(o.redondeo_100 ?? o.redondeo100 ?? true),
    activo: Boolean(o.activo ?? true),
    imagen_url: o.imagen_url ?? o.imagenUrl ?? "",
    es_combo: Boolean(o.es_combo ?? o.esCombo ?? false),
    // Servicios de importe variable (carga de colectivo / carga virtual)
    modalidad: o.modalidad === "IMPORTE_VARIABLE" ? "IMPORTE_VARIABLE" : "NORMAL",
    recargoServicioDefaultPct: toNum(o.recargoServicioDefaultPct ?? o.recargo_servicio_default_pct ?? ""),
    recargoServicioPct: toNum(o.recargoServicioPct ?? o.recargo_servicio_pct ?? ""),
    modo_pedido: o.modo_pedido ?? o.modoPedido ?? null,
    modo_envio: o.modo_envio ?? o.modoEnvio ?? defaultModoEnvio(o.unidad_medida ?? o.unidadMedida ?? "unidad"),
    modo_stock: o.modo_stock ?? o.modoStock ?? null,
    modoCompraProveedor: o.modoCompraProveedor ?? o.modo_compra_proveedor ?? "BULTO",
    pesoReferenciaKg: toNum(o.pesoReferenciaKg ?? o.peso_referencia_kg ?? ""),
    pesoEsFijo: Boolean(o.pesoEsFijo ?? o.peso_es_fijo ?? false),
    modoVentaDeposito: o.modoVentaDeposito ?? o.modo_venta_deposito ?? "PESO",
    actualizaPromedioPorRecepcion: o.actualizaPromedioPorRecepcion ?? o.actualiza_promedio_por_recepcion ?? true,
  });

  const calcularModoPedidoDefault = (data) => {
    if (!data) return "BULTO";
    const unidad = data.unidad_medida ?? data.unidadMedida ?? "unidad";
    const factor = data.factor_pack ?? data.factorPack ?? null;
    if (unidad === "unidad" || !factor || factor <= 1) {
      return "UNIDAD";
    }
    return data.modo_pedido ?? data.modoPedido ?? "BULTO";
  };

  const [form, setForm] = useState(() => {
    const initial = initialData || { unidad_medida: "unidad", redondeo_100: true };
    const modoPedido = calcularModoPedidoDefault(initial);
    return camelToForm({ ...initial, modo_pedido: modoPedido });
  });

  useEffect(() => {
    const initial = initialData || { unidad_medida: "unidad", redondeo_100: true };
    const modoPedido = calcularModoPedidoDefault(initial);
    setForm(camelToForm({ ...initial, modo_pedido: modoPedido }));
    setTimeout(() => scrollRef.current?.scrollTo(0, 0), 30);
  }, [initialData]);

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  // ========================================================================
  // Creación rápida de catálogos (categoría / área física / proveedor)
  // ========================================================================
  const crearCatalogo = async (tipo, payload, campoDestino) => {
    const url =
      tipo === "categoria"
        ? "/api/categorias/crear"
        : tipo === "area_fisica"
        ? "/api/areas-fisicas/crear"
        : tipo === "proveedor"
        ? "/api/proveedores/crear"
        : null;
    if (!url) throw new Error("Tipo de catálogo no soportado");

    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    let data = null;
    try {
      data = await res.json();
    } catch {}
    if (!res.ok || !data?.ok || !data?.item) {
      throw new Error(data?.error || `Error al crear ${tipo}`);
    }

    setField(campoDestino, Number(data.item.id));
    onCatalogoCreado?.(tipo, data.item);
    return data.item;
  };

  const setNumber = (key, val) => {
    if (val === "") return setField(key, "");
    const n = Number(val);
    if (Number.isFinite(n) && n >= 0) setField(key, n);
  };

  const applyFactorPackValue = (raw) => {
    const val = String(raw ?? "");
    if (val === "") {
      setForm((p) => ({ ...p, factor_pack: "", modo_pedido: "UNIDAD" }));
      return;
    }
    const n = Number(val);
    if (!Number.isFinite(n) || n < 0) return;
    let modoPedido = form.modo_pedido;
    if (!n || n <= 1) {
      modoPedido = "UNIDAD";
    } else if (!form.modo_pedido || form.modo_pedido === "") {
      modoPedido = "BULTO";
    }
    setForm((p) => ({ ...p, factor_pack: n, modo_pedido: modoPedido }));
  };

  const onChangeCosto = (val) => {
    if (val === "") return setForm((p) => ({ ...p, precio_costo: "" }));
    const pc = Number(val);
    if (!Number.isFinite(pc) || pc < 0) return;
    setForm((p) => {
      // Sin margen configurado no hay regla automática: se cambia el costo y el
      // precio de venta cargado a mano queda como está.
      const r = precioDesdeMargen({
        costo: pc,
        margenConfigurado: Number(p.margen) > 0 ? p.margen : null,
        redondeo100: p.redondeo_100,
      });
      if (!r.aplica) return { ...p, precio_costo: pc };
      return { ...p, precio_costo: pc, precio_venta: round2(r.precioFinal) };
    });
  };

  const onChangeMargen = (val) => {
    if (val === "") return setForm((p) => ({ ...p, margen: "" }));
    const m = Number(val);
    if (!Number.isFinite(m)) return; // margen negativo es válido (no se persiste "-" suelto)
    setForm((p) => {
      const pc = Number(p.precio_costo) || 0;
      // Venta derivada del margen (permite margen negativo → venta < costo).
      // No se redondea al tipear: el redondeo a 100 se difiere al blur y al
      // guardar, y cuando ocurre YA NO reescribe este margen.
      const r = precioDesdeMargen({ costo: pc, margenConfigurado: m, redondeo100: false });
      const pv = pc > 0 && r.aplica ? Math.max(0, round2(r.precioBase)) : 0;
      return { ...p, margen: m, precio_venta: pv };
    });
  };

  const onChangeVenta = (val) => {
    if (val === "") return setForm((p) => ({ ...p, precio_venta: "" }));
    const pv = Number(val);
    if (!Number.isFinite(pv) || pv < 0) return; // no precio negativo; venta baja o 0 permitido
    setForm((p) => {
      const pc = Number(p.precio_costo) || 0;
      // Margen puede quedar negativo (venta < costo); punto decimal interno (-99.58).
      // No se redondea al tipear para no pisar la escritura del usuario.
      const m = pc > 0 ? Number(((pv / pc - 1) * 100).toFixed(2)) : 0;
      return { ...p, precio_venta: pv, margen: m };
    });
  };

  // Redondeo a múltiplos de 100 diferido al blur: mantiene redondeo_100 sin
  // impedir escribir valores intermedios en Venta/Margen.
  //
  // SOLO toca precio_venta. Antes también reescribía `margen` con el margen
  // EFECTIVO del precio redondeado: escribir 30 y salir del campo lo convertía
  // en 33,33, y a partir de ahí todo recálculo por costo salía del 33,33. El
  // margen configurado es un dato del usuario, no una consecuencia del redondeo.
  const aplicarRedondeoVenta = () => {
    setForm((p) => {
      if (!p.redondeo_100) return p;
      const pv = Number(p.precio_venta);
      if (!Number.isFinite(pv) || pv <= 0) return p;
      const pvR = redondear100(pv);
      if (pvR === pv) return p;
      return { ...p, precio_venta: pvR };
    });
  };

  // Margen EFECTIVO: solo informativo. Se deriva del precio final que se va a
  // guardar (ya redondeado) y nunca entra al payload ni al campo Margen.
  const margenEfectivoInfo = (() => {
    const pc = Number(form.precio_costo);
    let pv = Number(form.precio_venta);
    if (!Number.isFinite(pv)) return null;
    if (form.redondeo_100 && pv > 0) pv = redondear100(pv);
    return margenEfectivoDe(pc, pv);
  })();

  const showPreciosRef =
    ["pack", "cajon"].includes(form.unidad_medida) && Number(form.factor_pack) > 1;
  const factorPackPrecios = Number(form.factor_pack) || 1;

  const toPrecioUnitarioRef = (precioBulto) => {
    if (precioBulto === "" || precioBulto === null || precioBulto === undefined)
      return "";
    const b = Number(precioBulto);
    if (!Number.isFinite(b)) return "";
    return Number((b / factorPackPrecios).toFixed(2));
  };

  const onChangeCostoUnitarioRef = (val) => {
    if (val === "") return onChangeCosto("");
    const ref = Number(val);
    if (!Number.isFinite(ref) || ref < 0) return;
    const bulto = Math.round(ref * factorPackPrecios * 100) / 100;
    onChangeCosto(bulto);
  };

  const onChangeVentaUnitarioRef = (val) => {
    if (val === "") return onChangeVenta("");
    const ref = Number(val);
    if (!Number.isFinite(ref) || ref < 0) return;
    const bulto = Math.round(ref * factorPackPrecios * 100) / 100;
    onChangeVenta(bulto);
  };

  // ── REGLA DE PRECIO ────────────────────────────────────────────────────────
  // Dos formas de llegar al precio de venta. La de siempre es el margen; la nueva
  // suma pesos fijos al costo UNITARIO. La elección es de ESTA ubicación.
  const porRecargo = form.reglaPrecio === REGLA_RECARGO;

  /** Recalcula la venta desde el recargo. El recargo guardado NO se toca acá. */
  const recalcularVentaPorRecargo = (recargo, costo = form.precio_costo) => {
    const r = precioDesdeRecargoUnidad({
      costo,
      recargoFijoUnidad: recargo,
      unidadMedida: form.unidad_medida,
      factorPack: form.factor_pack,
      redondeo100: form.redondeo_100,
    });
    return r.aplica ? r.precioVenta : "";
  };

  const onChangeRecargo = (val) => {
    setForm((p) => ({
      ...p,
      recargoFijoUnidad: val === "" ? "" : Number(val),
      precio_venta: val === "" ? p.precio_venta : recalcularVentaPorRecargo(val, p.precio_costo),
    }));
  };

  /** El usuario escribió un precio a mano: de ahí se deduce el recargo. Es el ÚNICO
      camino por el que el recargo guardado cambia. */
  const onChangeVentaConRecargo = (val) => {
    setForm((p) => {
      const nuevoRecargo =
        val === ""
          ? p.recargoFijoUnidad
          : recargoDesdePrecio({
              precioVenta: val,
              costo: p.precio_costo,
              unidadMedida: p.unidad_medida,
              factorPack: p.factor_pack,
            });
      return { ...p, precio_venta: val === "" ? "" : Number(val), recargoFijoUnidad: nuevoRecargo ?? p.recargoFijoUnidad };
    });
  };

  const onChangeRegla = (val) => {
    setForm((p) => {
      if (val === REGLA_RECARGO) {
        // Al entrar en modo recargo se propone el recargo que ya tiene el precio
        // actual, para no cambiarle el precio al usuario solo por cambiar de modo.
        const propuesto =
          p.recargoFijoUnidad !== "" && p.recargoFijoUnidad !== null && p.recargoFijoUnidad !== undefined
            ? p.recargoFijoUnidad
            : recargoDesdePrecio({
                precioVenta: p.precio_venta,
                costo: p.precio_costo,
                unidadMedida: p.unidad_medida,
                factorPack: p.factor_pack,
              });
        return { ...p, reglaPrecio: REGLA_RECARGO, recargoFijoUnidad: propuesto ?? "" };
      }
      return { ...p, reglaPrecio: REGLA_MARGEN };
    });
  };

  const costoUnitarioMostrado = costoUnitarioDesde(
    form.precio_costo,
    form.unidad_medida,
    form.factor_pack
  );

  // El texto sale de `lib/precios/escalaPrecio.js`, que es de donde lo lee ahora
  // también la tarjeta del catálogo. Estaba escrito acá y sólo acá, y la tarjeta
  // rotulaba "/ un" fijo sobre el mismo número: dos pantallas afirmando cosas
  // distintas sobre el mismo dato. Los paréntesis los pone esta pantalla porque
  // son de su formato de etiqueta, no de la escala.
  const labelEscalaPrecio = `(${etiquetaEscalaPrecio(form.unidad_medida)})`;

  // Servicio de importe variable: el importe se carga en el POS. No controla stock,
  // no usa lista de precios / margen ni redondeo.
  const esServicio = form.modalidad === "IMPORTE_VARIABLE";

  const validar = () => {
    if (!String(form.nombre).trim()) return "Completá el nombre.";

    // Servicio de importe variable: no requiere unidad, precio ni stock.
    if (esServicio) {
      const r = form.recargoServicioDefaultPct;
      if (r !== "" && (!Number.isFinite(Number(r)) || Number(r) < 0 || Number(r) > 100))
        return "El recargo por defecto debe estar entre 0 y 100.";
      const ro = form.recargoServicioPct;
      if (ro !== "" && (!Number.isFinite(Number(ro)) || Number(ro) < 0 || Number(ro) > 100))
        return "El recargo por local debe estar entre 0 y 100.";
      return null;
    }

    if (!form.unidad_medida) return "Seleccioná unidad.";

    if (["pack", "cajon"].includes(form.unidad_medida)) {
      if (!form.factor_pack || Number(form.factor_pack) <= 0)
        return "Definí un factor de pack válido (>0).";
    }

    if (form.precio_costo === "" || !Number.isFinite(Number(form.precio_costo)))
      return "Precio costo inválido.";

    if (form.precio_venta === "" || !Number.isFinite(Number(form.precio_venta)))
      return "Precio venta inválido.";

    if (form.modoCompraProveedor === "UNIDAD" && form.unidad_medida !== "kg")
      return "Modo compra 'Por pieza / barra' solo aplica a productos con tipo de venta Kg.";

    // Validar proveedores no repetidos
    const provs = [form.proveedor_id, form.proveedor2_id, form.proveedor3_id]
      .filter((v) => v !== "" && v !== null && v !== undefined)
      .map(Number);
    const unique = new Set(provs);
    if (unique.size !== provs.length)
      return "Los proveedores no pueden repetirse.";

    return null;
  };

  // Barrera de versión: si esta pestaña quedó con un bundle anterior a un
  // deploy, el submit se cancela ANTES de construir y enviar el payload. Un
  // bundle viejo puede calcular precios con reglas que ya no existen —pasó de
  // verdad con el margen— y el servidor solo persiste lo que recibe.
  // ── EL AVISO DE CAMBIO DE ESCALA ────────────────────────────────────────
  //
  // Cuando cambia la unidad de medida, el factor de pack o el modo de pieza
  // fija, el precio guardado queda con el número viejo y el significado nuevo.
  // Pasó con la pechuga el 2026-08-01 y nadie se enteró hasta que la tarjeta
  // mostró 110.700.
  //
  // El aviso NO convierte nada: muestra en qué quedaría cada ubicación y deja
  // que la persona decida. Guardar sigue guardando exactamente lo que se editó.
  const [avisoEscala, setAvisoEscala] = useState(null);
  const [escalaConfirmada, setEscalaConfirmada] = useState(false);

  // Al tocar cualquiera de los campos de escala, el aviso vuelve a preguntarse:
  // una confirmación vieja no puede autorizar un cambio distinto.
  useEffect(() => {
    setEscalaConfirmada(false);
    setAvisoEscala(null);
  }, [form.unidad_medida, form.factor_pack, form.pesoEsFijo, form.modoVentaDeposito, form.pesoReferenciaKg]);

  const consultarAvisoDeEscala = async () => {
    // Solo en edición: un producto nuevo no tiene precio viejo que quede mal.
    if (!initialData?.id) return null;
    try {
      const res = await fetch("/api/productos/aviso-escala", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: initialData.id,
          despues: {
            unidad_medida: form.unidad_medida,
            factor_pack: form.factor_pack === "" ? null : Number(form.factor_pack),
            pesoReferenciaKg: form.pesoReferenciaKg === "" ? null : Number(form.pesoReferenciaKg),
            pesoEsFijo: form.pesoEsFijo,
            modoVentaDeposito: form.modoVentaDeposito,
          },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        // DEGRADA SIN ROMPER, PERO NO EN SILENCIO: no poder calcular el aviso no
        // puede impedir guardar un producto. Queda el rastro para que se sepa que
        // esa vez nadie fue avisado.
        console.error(
          `productos/aviso-escala: no se pudo calcular el aviso (id=${initialData.id} status=${res.status}): ${data?.error ?? "sin detalle"}`
        );
        return null;
      }
      return data.aviso ?? null;
    } catch (e) {
      console.error(
        `productos/aviso-escala: no se pudo consultar el aviso (id=${initialData.id}): ${e?.message}`
      );
      return null;
    }
  };

  const handleSubmit = async () => {
    const err = validar();
    if (err) return alert(err);

    if (!(await puedeGuardar())) return; // el aviso ya quedó visible

    if (!escalaConfirmada) {
      const aviso = await consultarAvisoDeEscala();
      if (aviso) {
        setAvisoEscala(aviso);
        return; // no se guarda todavía: la persona tiene que verlo
      }
    }

    const p = form;

    let precioVentaOut = Number(p.precio_venta);
    if (p.redondeo_100 && precioVentaOut > 0)
      precioVentaOut = redondear100(precioVentaOut);

    const payload = {
      nombre: p.nombre,
      descripcion: p.descripcion || null,
      sku: p.sku || null,
      codigo_barra: p.codigo_barra || null,
      codigo_barra_secundario: p.codigo_barra_secundario || null,
      // Código propio de esta ubicación (ProductoLocal). Siempre se envía cuando el
      // form lo gestiona (edición): "" → el backend lo normaliza a null. El backend
      // lo aplica al ProductoLocal operante, independiente de los globales.
      codigo_barra_propio: p.codigo_barra_propio ?? "",
      categoria_id: p.categoria_id ? Number(p.categoria_id) : null,
      proveedor_id: p.proveedor_id ? Number(p.proveedor_id) : null,
      proveedor2_id: p.proveedor2_id ? Number(p.proveedor2_id) : null,
      proveedor3_id: p.proveedor3_id ? Number(p.proveedor3_id) : null,
      area_fisica_id: p.area_fisica_id ? Number(p.area_fisica_id) : null,
      unidad_medida: p.unidad_medida,
      factor_pack:
        p.unidad_medida === "unidad"
          ? 1
          : p.factor_pack === ""
          ? null
          : Number(p.factor_pack),
      peso_kg: p.peso_kg === "" ? null : Number(p.peso_kg),
      volumen_ml: p.volumen_ml === "" ? null : Number(p.volumen_ml),
      precio_costo: Number(p.precio_costo),
      precio_venta: precioVentaOut,
      // se elimina abajo si el costo no es editable (producto del depósito)
      margen: p.margen === "" ? null : Number(p.margen),
      precio_sugerido: p.precio_sugerido === "" ? null : Number(p.precio_sugerido),
      iva_porcentaje: p.iva_porcentaje === "" ? null : Number(p.iva_porcentaje),
      fecha_vencimiento: p.fecha_vencimiento
        ? new Date(p.fecha_vencimiento).toISOString()
        : null,
      redondeo_100: Boolean(p.redondeo_100),
      activo: Boolean(p.activo),
      imagen_url: p.imagen_url || null,
      es_combo: Boolean(p.es_combo),
      modalidad: esServicio ? "IMPORTE_VARIABLE" : "NORMAL",
      recargoServicioDefaultPct: esServicio
        ? (p.recargoServicioDefaultPct === "" ? 0 : Number(p.recargoServicioDefaultPct))
        : null,
      recargoServicioPct: esServicio
        ? (p.recargoServicioPct === "" ? null : Number(p.recargoServicioPct))
        : null,
      // Regla de precio de esta ubicación. El recargo viaja solo en su modo; en modo
      // margen va null para que el backend lo limpie.
      reglaPrecio: p.reglaPrecio || "MARGEN_PORCENTUAL",
      recargoFijoUnidad:
        p.reglaPrecio === "RECARGO_FIJO_UNIDAD"
          ? (p.recargoFijoUnidad === "" ? null : Number(p.recargoFijoUnidad))
          : null,
      modo_pedido: p.modo_pedido || "BULTO",
      modo_envio: p.modo_envio || defaultModoEnvio(p.unidad_medida),
      modo_stock: p.modo_stock || "BULTO",
      modoCompraProveedor: p.modoCompraProveedor || "BULTO",
      pesoReferenciaKg: p.pesoReferenciaKg === "" ? null : Number(p.pesoReferenciaKg),
      pesoEsFijo: Boolean(p.pesoEsFijo),
      modoVentaDeposito: p.modoVentaDeposito || "PESO",
      actualizaPromedioPorRecepcion: p.actualizaPromedioPorRecepcion !== false,
    };

    // Servicio de importe variable: no maneja precio, margen ni redondeo. Se envían
    // valores neutros para no romper NOT NULL en la base (el importe se define en el POS).
    if (esServicio) {
      payload.precio_costo = 0;
      payload.precio_venta = 0;
      payload.margen = null;
      payload.redondeo_100 = false;
    }

    // Costo administrado por el depósito (producto de depósito editado desde un
    // local): no enviar el costo. El backend igual lo bloquea (defensa en profundidad).
    if (!puedeEditarCosto) delete payload.precio_costo;

    onSubmit(payload);
  };

  /* ============================================================
     ENTER → SIGUIENTE CAMPO
     ============================================================ */
  const handleFormKeyDown = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();

    const fieldEl = e.target.closest("[data-field]");
    if (!fieldEl) return;

    const currentKey = fieldEl.dataset.field;
    const idx = FOCUS_ORDER.indexOf(currentKey);
    if (idx === -1) return;

    const container = scrollRef.current;
    if (!container) return;

    // Buscar el siguiente campo focuseable (saltar disabled)
    for (let i = idx + 1; i < FOCUS_ORDER.length; i++) {
      const nextEl = container.querySelector(`[data-field="${FOCUS_ORDER[i]}"]`);
      if (!nextEl) continue;

      const focusable = nextEl.querySelector(
        "input:not(:disabled), button:not(:disabled), [tabindex='0']"
      );
      if (focusable) {
        focusable.focus();
        return;
      }
    }
  };

  const label = submitLabel || (initialData ? "Guardar cambios" : "Crear producto");

  return (
    <>
      <div
        ref={scrollRef}
        onKeyDown={handleFormKeyDown}
        className="mx-auto w-full max-w-5xl space-y-5"
      >
        {soloLocal && (
          <div className="rounded-lg border sunmi-border sunmi-state-warning px-3 py-2 text-[12px] sunmi-text-accent">
            Este producto es administrado por el depósito. En tu local solo podés
            editar el <strong>precio de venta</strong>, el <strong>margen</strong>,
            el <strong>estado</strong> y el recargo del local. La ficha maestra
            (nombre, códigos, categoría, proveedores, medidas, etc.) está bloqueada.
          </div>
        )}

        {/* IDENTIDAD */}
        <Section title="Identidad">
          <MaestroLock locked={soloLocal}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nombre *" fieldKey="nombre">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <SunmiInput value={form.nombre} onChange={(e) => setField("nombre", e.target.value)} />
                </div>
                {enableVoiceInputs && (
                  <VoiceFieldButton
                    fieldName="nombre"
                    label="Dictar nombre"
                    onResult={(t) => {
                      const v = String(t || "").trim();
                      if (v) setField("nombre", v);
                    }}
                  />
                )}
              </div>
            </Field>

            <Field label="Código barras" fieldKey="codigo_barra">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  {/* `maxLength` frena el tecleo y recorta el pegado en el
                      navegador. `alEscribirCodigoBarra` es la misma regla en
                      JavaScript, y cubre lo que maxLength no ve: el dictado por
                      voz y cualquier camino que escriba el estado sin pasar por
                      el teclado. El valor se muestra SIN recortar, para no
                      mutilar los códigos largos que ya están guardados. */}
                  <SunmiInput
                    value={paraMostrarCodigoBarra(form.codigo_barra)}
                    maxLength={MAX_CODIGO_BARRA}
                    onChange={(e) =>
                      setField("codigo_barra", alEscribirCodigoBarra(e.target.value, form.codigo_barra))
                    }
                  />
                </div>
                {enableVoiceInputs && (
                  <VoiceFieldButton
                    fieldName="codigo_barra"
                    label="Dictar código de barras"
                    onResult={(t) => {
                      const v = parseVoiceCodigoBarra(t);
                      if (v) setField("codigo_barra", alEscribirCodigoBarra(v, form.codigo_barra));
                    }}
                  />
                )}
              </div>
            </Field>

            <Field label="Código barras secundario" fieldKey="codigo_barra_secundario">
              <SunmiInput
                value={paraMostrarCodigoBarra(form.codigo_barra_secundario)}
                maxLength={MAX_CODIGO_BARRA}
                onChange={(e) =>
                  setField(
                    "codigo_barra_secundario",
                    alEscribirCodigoBarra(e.target.value, form.codigo_barra_secundario)
                  )
                }
              />
              <p className="text-xs text-slate-500 mt-1">
                Opcional. Identifica al mismo producto que el principal.
              </p>
            </Field>

            <Field label="SKU" fieldKey="sku">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <SunmiInput value={form.sku} onChange={(e) => setField("sku", e.target.value)} />
                </div>
                {enableVoiceInputs && (
                  <VoiceFieldButton
                    fieldName="sku"
                    label="Dictar SKU"
                    onResult={(t) => {
                      const v = String(t || "").trim();
                      if (v) setField("sku", v);
                    }}
                  />
                )}
              </div>
            </Field>

            <Field label="Descripción" fieldKey="descripcion" colSpan>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <SunmiInput value={form.descripcion} onChange={(e) => setField("descripcion", e.target.value)} />
                </div>
                {enableVoiceInputs && (
                  <VoiceFieldButton
                    fieldName="descripcion"
                    label="Dictar descripción"
                    onResult={(t) => {
                      const v = String(t || "").trim();
                      if (v) setField("descripcion", v);
                    }}
                  />
                )}
              </div>
            </Field>
          </div>
          </MaestroLock>
        </Section>

        {/* CÓDIGO PROPIO DE ESTA UBICACIÓN — tercer código, editable SIEMPRE por el
            local activo (incluso cuando la ficha maestra está bloqueada). No modifica
            los dos códigos generales de la base. Solo en producto existente. */}
        {initialData?.id && (
          <Section title="Código propio de esta ubicación">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Código propio (opcional)" fieldKey="codigo_barra_propio">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <SunmiInput
                      value={paraMostrarCodigoBarra(form.codigo_barra_propio)}
                      placeholder="Agregar código propio"
                      maxLength={MAX_CODIGO_BARRA}
                      onChange={(e) =>
                        setField(
                          "codigo_barra_propio",
                          alEscribirCodigoBarra(e.target.value, form.codigo_barra_propio)
                        )
                      }
                    />
                  </div>
                  {String(form.codigo_barra_propio || "").trim() !== "" && (
                    <SunmiButton color="red" type="button" onClick={() => setField("codigo_barra_propio", "")}>
                      Quitar
                    </SunmiButton>
                  )}
                </div>
                <p className="text-xs sunmi-text-muted mt-1">
                  Este código funciona solamente en esta ubicación y no modifica los
                  códigos generales del producto.
                </p>
              </Field>
            </div>
          </Section>
        )}

        {/* MODALIDAD — producto normal vs servicio de importe variable */}
        <Section title="Modalidad">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MaestroLock locked={soloLocal}>
            <Field label="Modalidad del producto" fieldKey="modalidad">
              <SunmiSelectAdv
                value={form.modalidad}
                onChange={(v) =>
                  setField("modalidad", v === "IMPORTE_VARIABLE" ? "IMPORTE_VARIABLE" : "NORMAL")
                }
              >
                <SunmiSelectOption value="NORMAL">Producto normal</SunmiSelectOption>
                <SunmiSelectOption value="IMPORTE_VARIABLE">
                  Servicio de importe variable
                </SunmiSelectOption>
              </SunmiSelectAdv>
            </Field>

            {/* Recargo POR DEFECTO (producto base): alta o edición en depósito/base. */}
            {esServicio && !editandoOverrideLocal && (
              <Field label="Recargo por defecto (%)" fieldKey="recargoServicioDefaultPct">
                <SunmiInput
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={form.recargoServicioDefaultPct}
                  onWheel={(e) => e.target.blur()}
                  onChange={(e) => setNumber("recargoServicioDefaultPct", e.target.value)}
                />
                <p className="text-xs text-slate-500 mt-1">
                  Recargo aplicado sobre el importe cargado en el POS (0 a 100).
                </p>
              </Field>
            )}
            </MaestroLock>

            {/* Recargo OVERRIDE por local: solo al editar el producto dentro de un local. */}
            {esServicio && editandoOverrideLocal && (
              <Field label="Recargo de este local (%)" fieldKey="recargoServicioPct">
                <SunmiInput
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={form.recargoServicioPct}
                  onWheel={(e) => e.target.blur()}
                  onChange={(e) => setNumber("recargoServicioPct", e.target.value)}
                />
                <p className="text-xs text-slate-500 mt-1">
                  Override de este local. Vacío = usar el recargo por defecto del producto
                  {form.recargoServicioDefaultPct !== "" && form.recargoServicioDefaultPct != null
                    ? ` (${form.recargoServicioDefaultPct}%)`
                    : ""}
                  .
                </p>
              </Field>
            )}
          </div>

          {esServicio && (
            <p className="text-xs sunmi-text-muted mt-4">
              El importe se ingresa en el POS al vender. Este servicio no controla stock,
              no usa lista de precios ni margen, y no aplica redondeo.
            </p>
          )}
        </Section>

        {/* CATÁLOGOS */}
        <Section title="Catálogos">
          <MaestroLock locked={soloLocal}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Categoría" fieldKey="categoria_id">
              <SunmiSelectConCrearRapido
                puedeCrear={esAdmin}
                value={form.categoria_id === "" ? "" : String(form.categoria_id)}
                onChange={(v) =>
                  setField("categoria_id", v === "" ? "" : Number(v))
                }
                items={catalogos.CATEGORIAS || []}
                tituloModal="Crear categoría"
                campos={[{ key: "nombre", label: "Nombre", requerido: true }]}
                onCrear={(payload) => crearCatalogo("categoria", payload, "categoria_id")}
              />
            </Field>

            <Field label="Área física" fieldKey="area_fisica_id">
              <SunmiSelectConCrearRapido
                puedeCrear={esAdmin}
                value={form.area_fisica_id === "" ? "" : String(form.area_fisica_id)}
                onChange={(v) =>
                  setField("area_fisica_id", v === "" ? "" : Number(v))
                }
                items={catalogos.AREAS || []}
                tituloModal="Crear área física"
                campos={[
                  { key: "nombre", label: "Nombre", requerido: true },
                  { key: "descripcion", label: "Descripción" },
                  { key: "tipo", label: "Tipo" },
                ]}
                onCrear={(payload) =>
                  crearCatalogo("area_fisica", payload, "area_fisica_id")
                }
              />
            </Field>
          </div>
          </MaestroLock>
        </Section>

        {/* PROVEEDORES */}
        <Section title="Proveedores">
          <MaestroLock locked={soloLocal}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Proveedor 1" fieldKey="proveedor_id">
              <SunmiSelectConCrearRapido
                puedeCrear={esAdmin}
                value={form.proveedor_id === "" ? "" : String(form.proveedor_id)}
                onChange={(v) =>
                  setField("proveedor_id", v === "" ? "" : Number(v))
                }
                items={catalogos.PROVEEDORES || []}
                tituloModal="Crear proveedor"
                campos={[
                  { key: "nombre", label: "Nombre", requerido: true },
                  { key: "telefono", label: "Teléfono", type: "tel" },
                  { key: "email", label: "Email", type: "email" },
                  { key: "cuit", label: "CUIT" },
                  { key: "direccion", label: "Dirección" },
                ]}
                onCrear={(payload) =>
                  crearCatalogo("proveedor", payload, "proveedor_id")
                }
              />
            </Field>

            <Field label="Proveedor 2" fieldKey="proveedor2_id">
              <SunmiSelectConCrearRapido
                puedeCrear={esAdmin}
                value={form.proveedor2_id === "" ? "" : String(form.proveedor2_id)}
                onChange={(v) =>
                  setField("proveedor2_id", v === "" ? "" : Number(v))
                }
                items={catalogos.PROVEEDORES || []}
                tituloModal="Crear proveedor"
                campos={[
                  { key: "nombre", label: "Nombre", requerido: true },
                  { key: "telefono", label: "Teléfono", type: "tel" },
                  { key: "email", label: "Email", type: "email" },
                  { key: "cuit", label: "CUIT" },
                  { key: "direccion", label: "Dirección" },
                ]}
                onCrear={(payload) =>
                  crearCatalogo("proveedor", payload, "proveedor2_id")
                }
              />
            </Field>

            <Field label="Proveedor 3" fieldKey="proveedor3_id">
              <SunmiSelectConCrearRapido
                puedeCrear={esAdmin}
                value={form.proveedor3_id === "" ? "" : String(form.proveedor3_id)}
                onChange={(v) =>
                  setField("proveedor3_id", v === "" ? "" : Number(v))
                }
                items={catalogos.PROVEEDORES || []}
                tituloModal="Crear proveedor"
                campos={[
                  { key: "nombre", label: "Nombre", requerido: true },
                  { key: "telefono", label: "Teléfono", type: "tel" },
                  { key: "email", label: "Email", type: "email" },
                  { key: "cuit", label: "CUIT" },
                  { key: "direccion", label: "Dirección" },
                ]}
                onCrear={(payload) =>
                  crearCatalogo("proveedor", payload, "proveedor3_id")
                }
              />
            </Field>
          </div>
          </MaestroLock>
        </Section>

        {/* CÓDIGOS INTERNOS POR PROVEEDOR — identificación del producto por proveedor,
            junto al resto de datos principales. Solo en producto existente. */}
        {initialData?.id && (
          // El ancla la usa la conciliación de listas para traer directo acá a
          // quien necesita cargarle el código del proveedor a un producto.
          <div id="codigos-proveedor" className="scroll-mt-20">
            <MaestroLock locked={soloLocal}>
              <SeccionCodigosProveedor
                productoBaseId={initialData.id}
                proveedores={catalogos?.PROVEEDORES || []}
                proveedoresSugeridos={[form.proveedor_id, form.proveedor2_id, form.proveedor3_id]}
              />
            </MaestroLock>
          </div>
        )}

        {/* VENTA EN LOCAL + PRECIOS — ocultos para servicios de importe variable */}
        {!esServicio && (
        <>
        <Section title="Venta en local">
          <MaestroLock locked={soloLocal}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Tipo de venta *" fieldKey="unidad_medida">
              <SunmiSelectAdv
                value={form.unidad_medida}
                onChange={(v) => {
                  setForm((p) => {
                    let modoPedido = p.modo_pedido;
                    if (v === "unidad" || !p.factor_pack || p.factor_pack <= 1) {
                      modoPedido = "UNIDAD";
                    } else if (!p.modo_pedido || p.modo_pedido === "") {
                      modoPedido = "BULTO";
                    }
                    let modoEnvio = p.modo_envio;
                    if (!initialData || !p.modo_envio) {
                      modoEnvio = defaultModoEnvio(v);
                    }
                    // Si cambia de kg a otro, resetear modoCompraProveedor
                    let modoCompra = p.modoCompraProveedor;
                    if (v !== "kg" && modoCompra === "UNIDAD") {
                      modoCompra = "BULTO";
                    }
                    return { ...p, unidad_medida: v, modo_pedido: modoPedido, modo_envio: modoEnvio, modoCompraProveedor: modoCompra };
                  });
                }}
              >
                <SunmiSelectOption value="unidad">Unidad</SunmiSelectOption>
                <SunmiSelectOption value="pack">Pack</SunmiSelectOption>
                <SunmiSelectOption value="cajon">Cajón</SunmiSelectOption>
                <SunmiSelectOption value="kg">Kg</SunmiSelectOption>
              </SunmiSelectAdv>
              <p className="text-xs text-slate-500 mt-1">
                {form.unidad_medida === "kg"
                  ? "Se vende por peso en el POS (ej: fiambre, queso, carne)."
                  : form.unidad_medida === "unidad"
                  ? "Se vende por unidad en el POS."
                  : "Se vende por bulto (pack/cajón) en el POS."}
              </p>
            </Field>

            <Field label="Factor pack" fieldKey="factor_pack">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <SunmiInput
                    type="number"
                    value={form.factor_pack}
                    onWheel={(e) => e.target.blur()}
                    onChange={(e) => applyFactorPackValue(e.target.value)}
                  />
                </div>
                {enableVoiceInputs && (
                  <VoiceFieldButton
                    fieldName="factor_pack"
                    label="Dictar factor pack"
                    onResult={(t) => {
                      const n = parseVoiceNumber(t);
                      if (n !== null && n >= 0) applyFactorPackValue(n);
                    }}
                  />
                )}
              </div>
            </Field>

            <Field label="Peso del producto (kg)" fieldKey="peso_kg">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <SunmiInput
                    type="number"
                    value={form.peso_kg}
                    onWheel={(e) => e.target.blur()}
                    onChange={(e) => setNumber("peso_kg", e.target.value)}
                  />
                </div>
                {enableVoiceInputs && (
                  <VoiceFieldButton
                    fieldName="peso_kg"
                    label="Dictar peso en kg"
                    onResult={(t) => {
                      const n = parseVoiceNumber(t);
                      if (n !== null && n >= 0) setField("peso_kg", n);
                    }}
                  />
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Peso neto del producto o bulto (informativo).
              </p>
            </Field>

            <Field label="Volumen (ml)" fieldKey="volumen_ml">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <SunmiInput
                    type="number"
                    value={form.volumen_ml}
                    onWheel={(e) => e.target.blur()}
                    onChange={(e) => setNumber("volumen_ml", e.target.value)}
                  />
                </div>
                {enableVoiceInputs && (
                  <VoiceFieldButton
                    fieldName="volumen_ml"
                    label="Dictar volumen en ml"
                    onResult={(t) => {
                      const n = parseVoiceNumber(t);
                      if (n !== null && n >= 0) setField("volumen_ml", n);
                    }}
                  />
                )}
              </div>
            </Field>
          </div>
          </MaestroLock>
        </Section>

        {/* PRECIOS — orden lógico: costo → margen → venta */}
        <Section title="Precios">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Fila 1: Costo (+ costo unitario ref. en pack/cajón) */}
            <Field label={`Costo * ${labelEscalaPrecio}`} fieldKey="precio_costo">
              {puedeEditarCosto ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <SunmiInput
                      type="number"
                      value={form.precio_costo}
                      onWheel={(e) => e.target.blur()}
                      onChange={(e) => onChangeCosto(e.target.value)}
                    />
                  </div>
                  {enableVoiceInputs && (
                    <VoiceFieldButton
                      fieldName="precio_costo"
                      label="Dictar precio de costo"
                      onResult={(t) => {
                        const n = parseVoiceNumber(t);
                        if (n !== null && n >= 0) onChangeCosto(n);
                      }}
                    />
                  )}
                </div>
              ) : (
                <>
                  <SunmiInput type="number" value={form.precio_costo} readOnly disabled />
                  <p className="text-xs sunmi-text-muted mt-1">
                    El costo lo administra el depósito. Podés editar el resto (precio de venta, margen, etc.).
                  </p>
                </>
              )}
            </Field>

            {/* El costo unitario depende del PACK, no de quién mira la ficha.
                Estaba condicionado además a `puedeEditarCosto`, así que en un local
                sobre un producto del depósito desaparecía: se veía el costo del bulto
                en solo lectura pero no su costo por unidad, y había que dividir a mano.
                No se ocultaba nada sensible —es una división del número que ya está a
                la vista— y la venta unitaria de acá abajo nunca tuvo esa condición.
                Ahora se muestra siempre que haya pack, y cuando el costo no es editable
                se presenta en solo lectura igual que el campo de costo de arriba. */}
            {showPreciosRef && (
              <Field label="Costo unitario ref." fieldKey="precio_costo_unitario_ref">
                {puedeEditarCosto ? (
                  <SunmiInput
                    type="number"
                    value={toPrecioUnitarioRef(form.precio_costo)}
                    onWheel={(e) => e.target.blur()}
                    onChange={(e) => onChangeCostoUnitarioRef(e.target.value)}
                  />
                ) : (
                  <SunmiInput
                    type="number"
                    value={toPrecioUnitarioRef(form.precio_costo)}
                    readOnly
                    disabled
                  />
                )}
                <p className="text-xs text-slate-500 mt-1">
                  Referencia: costo del bulto ÷ {factorPackPrecios} uds.
                </p>
              </Field>
            )}

            {/* Regla de precio de ESTA ubicación. Margen es el default y deja todo
                como estaba; recargo fijo suma pesos al costo unitario. */}
            <Field label="Regla de precio" fieldKey="reglaPrecio" colSpan>
              <SunmiSelectAdv value={form.reglaPrecio} onChange={onChangeRegla}>
                <option value="MARGEN_PORCENTUAL">Margen porcentual</option>
                <option value="RECARGO_FIJO_UNIDAD">Recargo fijo por unidad</option>
              </SunmiSelectAdv>
              <p className="text-xs sunmi-text-muted mt-1">
                {porRecargo
                  ? "El precio sale del costo por unidad más un monto fijo en pesos. No se usa el margen."
                  : "El precio sale del costo más un porcentaje. Es el comportamiento de siempre."}
              </p>
            </Field>

            {porRecargo && (
              <>
                <Field label="Costo unitario ref." fieldKey="recargo_costo_unitario">
                  <SunmiInput type="number" value={costoUnitarioMostrado ?? ""} readOnly disabled />
                  <p className="text-xs text-slate-500 mt-1">
                    {showPreciosRef
                      ? `Costo del bulto ÷ ${factorPackPrecios} uds.`
                      : "El producto se vende por unidad: el costo unitario es el costo."}
                  </p>
                </Field>

                <Field label="Recargo por unidad $" fieldKey="recargoFijoUnidad">
                  <SunmiInput
                    type="number"
                    value={form.recargoFijoUnidad}
                    onWheel={(e) => e.target.blur()}
                    onChange={(e) => onChangeRecargo(e.target.value)}
                  />
                  <p className="text-xs sunmi-text-muted mt-1">
                    Se suma a cada unidad. El monto guardado no cambia cuando sube el costo:
                    solo lo modifica una edición manual del precio.
                  </p>
                </Field>
              </>
            )}

            {/* Fila 2: Margen % (fila propia cuando hay refs) */}
            {!porRecargo && (
            <Field label="Margen %" fieldKey="margen" colSpan={showPreciosRef}>
              <SunmiInput
                type="number"
                value={form.margen}
                onWheel={(e) => e.target.blur()}
                onChange={(e) => onChangeMargen(e.target.value)}
                onBlur={aplicarRedondeoVenta}
              />
              {/* Margen EFECTIVO: consecuencia del redondeo, no un dato editable.
                  Va en texto muted y con etiqueta propia para que no se lea como
                  un segundo campo de margen. No viaja en el payload. */}
              <p className="text-xs sunmi-text-muted mt-1">
                Margen efectivo tras redondeo:{" "}
                <span className="tabular-nums">
                  {margenEfectivoInfo === null
                    ? "—"
                    : `${margenEfectivoInfo.toLocaleString("es-AR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}%`}
                </span>
              </p>
            </Field>
            )}

            {/* Fila 3: Venta (+ venta unitario ref. en pack/cajón) */}
            <Field label={`Venta * ${labelEscalaPrecio}`} fieldKey="precio_venta">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <SunmiInput
                    type="number"
                    value={form.precio_venta}
                    onWheel={(e) => e.target.blur()}
                    // En modo recargo, escribir el precio a mano recalcula el recargo;
                    // es el único camino por el que ese monto cambia.
                    onChange={(e) =>
                      porRecargo ? onChangeVentaConRecargo(e.target.value) : onChangeVenta(e.target.value)
                    }
                    onBlur={porRecargo ? undefined : aplicarRedondeoVenta}
                  />
                </div>
                {enableVoiceInputs && (
                  <VoiceFieldButton
                    fieldName="precio_venta"
                    label="Dictar precio de venta"
                    onResult={(t) => {
                      const n = parseVoiceNumber(t);
                      if (n !== null && n >= 0) onChangeVenta(n);
                    }}
                  />
                )}
              </div>
            </Field>

            {showPreciosRef && (
              <Field label="Venta unitario ref." fieldKey="precio_venta_unitario_ref">
                <SunmiInput
                  type="number"
                  value={toPrecioUnitarioRef(form.precio_venta)}
                  onWheel={(e) => e.target.blur()}
                  onChange={(e) => onChangeVentaUnitarioRef(e.target.value)}
                />
                <p className="text-xs text-slate-500 mt-1">
                  Referencia: venta del bulto ÷ {factorPackPrecios} uds.
                </p>
              </Field>
            )}
          </div>
        </Section>
        </>
        )}

        {/* DATOS FISCALES — IVA no participa en el cálculo de precios */}
        <Section title="Datos fiscales">
          <MaestroLock locked={soloLocal}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="IVA %" fieldKey="iva_porcentaje">
              <SunmiInput
                type="number"
                value={form.iva_porcentaje}
                onWheel={(e) => e.target.blur()}
                onChange={(e) => setNumber("iva_porcentaje", e.target.value)}
              />
            </Field>
          </div>
          </MaestroLock>
        </Section>

        {/* OTROS */}
        <Section title="Otros">
          <MaestroLock locked={soloLocal}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Precio sugerido" fieldKey="precio_sugerido">
              <SunmiInput
                type="number"
                value={form.precio_sugerido}
                onWheel={(e) => e.target.blur()}
                onChange={(e) => setNumber("precio_sugerido", e.target.value)}
              />
            </Field>

            <Field label="Fecha vencimiento" fieldKey="fecha_vencimiento">
              <SunmiInput
                type="date"
                value={form.fecha_vencimiento}
                onChange={(e) => setField("fecha_vencimiento", e.target.value)}
              />
            </Field>

            <Field label="Imagen URL" fieldKey="imagen_url" colSpan>
              <SunmiInput
                value={form.imagen_url}
                onChange={(e) => setField("imagen_url", e.target.value)}
              />
            </Field>
          </div>
          </MaestroLock>
        </Section>

        {/* OPCIONES */}
        <Section title="Opciones">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {!esServicio && (
            <MaestroLock locked={soloLocal}>
            <div data-field="redondeo_100" tabIndex={0} className="flex flex-col gap-1.5 outline-none focus:ring-1 focus:ring-amber-400/50 rounded-md p-1 -m-1">
              <label className="text-[12px] sunmi-label">Redondeo a $100</label>
              <SunmiToggleEstado
                value={form.redondeo_100}
                onChange={(v) => {
                  setForm((p) => {
                    const next = { ...p, redondeo_100: v };
                    if (v && Number(p.precio_venta) > 0) {
                      next.precio_venta = redondear100(Number(p.precio_venta));
                    }
                    return next;
                  });
                }}
              />
            </div>
            </MaestroLock>
            )}

            {/* El toggle "Es combo" se removió: los combos se crean/editan por su
                flujo propio (+ Combo). El alta/edición normal nunca cambia es_combo. */}

            <div data-field="activo" tabIndex={0} className="flex flex-col gap-1.5 outline-none focus:ring-1 focus:ring-amber-400/50 rounded-md p-1 -m-1">
              <label className="text-[12px] sunmi-label">Activo</label>
              <SunmiToggleEstado
                value={form.activo}
                onChange={(v) => setField("activo", v)}
              />
            </div>
          </div>
        </Section>

        {/* REPOSICIÓN AUTOMÁTICA + COMPRA A PROVEEDOR — no aplican a servicios */}
        {!esServicio && (
        <>
        <Section title="Reposición automática">
          <MaestroLock locked={soloLocal}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Modo de pedido" fieldKey="modo_pedido">
              <SunmiSelectAdv
                value={form.modo_pedido || "BULTO"}
                onChange={(v) => setField("modo_pedido", v)}
                disabled={
                  form.unidad_medida === "unidad" ||
                  !form.factor_pack ||
                  form.factor_pack <= 1
                }
              >
                <SunmiSelectOption value="BULTO">Por bulto</SunmiSelectOption>
                <SunmiSelectOption value="UNIDAD">Por unidad</SunmiSelectOption>
              </SunmiSelectAdv>
              {(form.unidad_medida === "unidad" ||
                !form.factor_pack ||
                form.factor_pack <= 1) && (
                <p className="text-xs text-slate-500 mt-1">
                  Solo disponible para pack/cajón con factor &gt; 1
                </p>
              )}
            </Field>

            <Field label="Cómo sale (depósito→locales)" fieldKey="modo_envio">
              <SunmiSelectAdv
                value={form.modo_envio || defaultModoEnvio(form.unidad_medida)}
                onChange={(v) => setField("modo_envio", v)}
              >
                <SunmiSelectOption value="SOLO_BULTO">Bulto (cajón/pack)</SunmiSelectOption>
                <SunmiSelectOption value="SOLO_UNIDAD">Unidad</SunmiSelectOption>
              </SunmiSelectAdv>
              <p className="text-xs text-slate-500 mt-1">
                Bulto: local pide solo bultos completos. Unidad: pide por unidad.
              </p>
            </Field>
          </div>
          </MaestroLock>
        </Section>

        {/* COMPRA A PROVEEDOR */}
        <Section title={
          <span className="flex items-center gap-2">
            Compra a proveedor
            {form.modoCompraProveedor === "UNIDAD" && (
              <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-red-600 text-white leading-none">
                Fiambre
              </span>
            )}
          </span>
        }>
          <MaestroLock locked={soloLocal}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Modo compra proveedor" fieldKey="modoCompraProveedor">
              <SunmiSelectAdv
                value={form.modoCompraProveedor || "BULTO"}
                onChange={(v) => setField("modoCompraProveedor", v)}
                disabled={form.unidad_medida !== "kg"}
              >
                <SunmiSelectOption value="BULTO">Por kg</SunmiSelectOption>
                <SunmiSelectOption value="UNIDAD">Por pieza / barra</SunmiSelectOption>
              </SunmiSelectAdv>
              {form.unidad_medida !== "kg" && (
                <p className="text-xs text-amber-500 mt-1">
                  &quot;Por pieza / barra&quot; solo disponible para productos con tipo de venta Kg.
                </p>
              )}
              {form.unidad_medida === "kg" && form.modoCompraProveedor === "UNIDAD" && (
                <p className="text-xs text-slate-500 mt-1">
                  Se pide por piezas al proveedor, pero el stock se lleva en kg.
                </p>
              )}
            </Field>

            {form.modoCompraProveedor === "UNIDAD" && (
              <>
                <Field label="Peso referencia por pieza (kg)" fieldKey="pesoReferenciaKg">
                  <SunmiInput
                    type="number"
                    step="0.001"
                    min="0"
                    value={form.pesoReferenciaKg}
                    onWheel={(e) => e.target.blur()}
                    onChange={(e) => setNumber("pesoReferenciaKg", e.target.value)}
                    placeholder="ej: 4.5"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Ejemplo: mortadela pesa 4.5 kg por pieza.
                  </p>
                </Field>

                <div data-field="pesoEsFijo" tabIndex={0} className="flex flex-col gap-1.5 outline-none focus:ring-1 focus:ring-amber-400/50 rounded-md p-1 -m-1">
                  <label className="text-[12px] sunmi-label">Peso fijo / variable</label>
                  <SunmiToggleEstado
                    value={form.pesoEsFijo}
                    onChange={(v) => setField("pesoEsFijo", v)}
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    {form.pesoEsFijo
                      ? "Fijo: cada pieza pesa siempre lo mismo (ej: mortadela)."
                      : "Variable: el peso varía entre piezas (ej: salame)."}
                  </p>
                </div>

                <Field label="Modo de venta en depósito" fieldKey="modoVentaDeposito">
                  <SunmiSelectAdv
                    value={form.modoVentaDeposito || "PESO"}
                    onChange={(v) => setField("modoVentaDeposito", v)}
                  >
                    <SunmiSelectOption value="PESO">Por peso (kg)</SunmiSelectOption>
                    <SunmiSelectOption value="PIEZA">Por pieza</SunmiSelectOption>
                  </SunmiSelectAdv>
                  <p className="text-xs text-slate-500 mt-1">
                    {form.modoVentaDeposito === "PIEZA"
                      ? "El depósito maneja stock y vende por pieza. El local recibe en kg."
                      : "El depósito maneja stock y vende por kg (se pesa al vender)."}
                  </p>
                </Field>

                <div data-field="actualizaPromedioPorRecepcion" tabIndex={0} className="flex flex-col gap-1.5 outline-none focus:ring-1 focus:ring-amber-400/50 rounded-md p-1 -m-1">
                  <label className="text-[12px] sunmi-label">Actualizar promedio en recepción</label>
                  <SunmiToggleEstado
                    value={form.actualizaPromedioPorRecepcion}
                    onChange={(v) => setField("actualizaPromedioPorRecepcion", v)}
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Al recibir mercadería, recalcular peso promedio con los kg reales.
                  </p>
                </div>
              </>
            )}
          </div>
          </MaestroLock>
        </Section>
        </>
        )}
      </div>

      <div className="mx-auto w-full max-w-5xl mt-4 pt-4 border-t border-slate-800 space-y-3">
        <AvisoVersionNueva visible={versionNueva} />

        {/* Va acá, pegado al de versión y arriba del botón, porque es la misma
            clase de aviso: algo que hay que leer ANTES de guardar. */}
        <AvisoCambioDeEscala
          aviso={avisoEscala}
          onGuardarIgual={() => {
            setEscalaConfirmada(true);
            setAvisoEscala(null);
            // Se vuelve a llamar al submit ya con la confirmación puesta, para
            // que pase por las MISMAS validaciones. Saltear a `onSubmit` acá
            // dejaría un camino de guardado sin el guard de versión.
            setTimeout(() => handleSubmit(), 0);
          }}
          onCancelar={() => setAvisoEscala(null)}
        />

        <div className="flex justify-end gap-2">
          <SunmiButton color="cyan" onClick={onCancel}>
            Cancelar
          </SunmiButton>

          {/* Bloqueado mientras se verifica (evita el doble clic) y mientras
              haya versión nueva sin recargar. */}
          <SunmiButton onClick={handleSubmit} disabled={verificandoVersion || versionNueva}>
            {verificandoVersion ? "Verificando…" : label}
          </SunmiButton>
        </div>
      </div>
    </>
  );
}

/* ============================================================
   SUBCOMPONENTES LOCALES
   ============================================================ */

/** Sección visual — panel con fondo diferenciado y borde visible */
function Section({ title, children }) {
  return (
    <SunmiPanel className="ring-2 ring-inset sunmi-ring shadow-sm">
      <div className="flex items-center pb-2 mb-3 border-b sunmi-divider">
        <h3 className="text-[13px] sunmi-section-title">{title}</h3>
      </div>
      {children}
    </SunmiPanel>
  );
}

/** Campo con label — data-field permite Enter→next */
function Field({ label, children, colSpan, fieldKey }) {
  return (
    <div
      data-field={fieldKey}
      className={colSpan ? "md:col-span-2 flex flex-col gap-1.5" : "flex flex-col gap-1.5"}
    >
      <label className="text-[12px] sunmi-label mb-1 block">{label}</label>
      {children}
    </div>
  );
}
