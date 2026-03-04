"use client";

import { useEffect, useRef, useState } from "react";
import SunmiPanel from "@/components/sunmi/SunmiPanel";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiToggleEstado from "@/components/sunmi/SunmiToggleEstado";
import { defaultModoEnvio } from "@/lib/conversiones/stock";

/* ============================================================
   FOCUS ORDER — Enter avanza al siguiente campo
   ============================================================ */
const FOCUS_ORDER = [
  "nombre", "codigo_barra", "sku", "descripcion",
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
 */
export default function FormProducto({
  initialData = null,
  catalogos,
  onSubmit,
  onCancel,
  submitLabel,
}) {
  const scrollRef = useRef(null);

  const toNum = (v) => {
    if (v === "" || v === null || v === undefined) return "";
    const n = Number(v);
    return Number.isFinite(n) ? n : "";
  };

  const roundUp100 = (n) => {
    if (!Number.isFinite(n) || n <= 0) return n;
    return Math.ceil(n / 100) * 100;
  };

  const camelToForm = (o = {}) => ({
    nombre: o.nombre ?? "",
    descripcion: o.descripcion ?? "",
    sku: o.sku ?? "",
    codigo_barra: o.codigo_barra ?? o.codigoBarra ?? "",
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
    precio_sugerido: toNum(o.precio_sugerido ?? ""),
    iva_porcentaje: toNum(o.iva_porcentaje ?? ""),
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
    modo_pedido: o.modo_pedido ?? o.modoPedido ?? null,
    modo_envio: o.modo_envio ?? o.modoEnvio ?? defaultModoEnvio(o.unidad_medida ?? o.unidadMedida ?? "unidad"),
    modo_stock: o.modo_stock ?? o.modoStock ?? null,
    modoCompraProveedor: o.modoCompraProveedor ?? o.modo_compra_proveedor ?? "BULTO",
    pesoReferenciaKg: toNum(o.pesoReferenciaKg ?? o.peso_referencia_kg ?? ""),
    pesoEsFijo: Boolean(o.pesoEsFijo ?? o.peso_es_fijo ?? false),
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

  const setNumber = (key, val) => {
    if (val === "") return setField(key, "");
    const n = Number(val);
    if (Number.isFinite(n) && n >= 0) setField(key, n);
  };

  const onChangeCosto = (val) => {
    if (val === "") return setForm((p) => ({ ...p, precio_costo: "" }));
    const pc = Number(val);
    if (!Number.isFinite(pc) || pc < 0) return;
    setForm((p) => {
      const m = Number(p.margen) || 0;
      if (m > 0) {
        let pv = Math.round(pc * (1 + m / 100) * 100) / 100;
        if (p.redondeo_100 && pv > 0) pv = roundUp100(pv);
        return { ...p, precio_costo: pc, precio_venta: pv };
      }
      return { ...p, precio_costo: pc };
    });
  };

  const onChangeMargen = (val) => {
    if (val === "") return setForm((p) => ({ ...p, margen: "" }));
    const m = Number(val);
    if (!Number.isFinite(m) || m < 0) return;
    setForm((p) => {
      const pc = Number(p.precio_costo) || 0;
      let pv = pc > 0 ? Math.round(pc * (1 + m / 100) * 100) / 100 : 0;
      if (p.redondeo_100 && pv > 0) pv = roundUp100(pv);
      return { ...p, margen: m, precio_venta: pv };
    });
  };

  const onChangeVenta = (val) => {
    if (val === "") return setForm((p) => ({ ...p, precio_venta: "" }));
    const pvRaw = Number(val);
    if (!Number.isFinite(pvRaw) || pvRaw < 0) return;
    setForm((p) => {
      let pv = pvRaw;
      if (p.redondeo_100) pv = roundUp100(pv);
      const pc = Number(p.precio_costo) || 0;
      const m = pc > 0 ? (pv / pc - 1) * 100 : 0;
      return { ...p, precio_venta: pv, margen: Number(m.toFixed(2)) };
    });
  };

  const validar = () => {
    if (!String(form.nombre).trim()) return "Completá el nombre.";
    if (!form.unidad_medida) return "Seleccioná unidad.";

    if (["pack", "cajon"].includes(form.unidad_medida)) {
      if (!form.factor_pack || Number(form.factor_pack) <= 0)
        return "Definí un factor de pack válido (>0).";
    }

    if (form.precio_costo === "" || !Number.isFinite(Number(form.precio_costo)))
      return "Precio costo inválido.";

    if (form.precio_venta === "" || !Number.isFinite(Number(form.precio_venta)))
      return "Precio venta inválido.";

    // Validar proveedores no repetidos
    const provs = [form.proveedor_id, form.proveedor2_id, form.proveedor3_id]
      .filter((v) => v !== "" && v !== null && v !== undefined)
      .map(Number);
    const unique = new Set(provs);
    if (unique.size !== provs.length)
      return "Los proveedores no pueden repetirse.";

    return null;
  };

  const handleSubmit = () => {
    const err = validar();
    if (err) return alert(err);

    const p = form;

    let precioVentaOut = Number(p.precio_venta);
    if (p.redondeo_100 && precioVentaOut > 0)
      precioVentaOut = roundUp100(precioVentaOut);

    const payload = {
      nombre: p.nombre,
      descripcion: p.descripcion || null,
      sku: p.sku || null,
      codigo_barra: p.codigo_barra || null,
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
      modo_pedido: p.modo_pedido || "BULTO",
      modo_envio: p.modo_envio || defaultModoEnvio(p.unidad_medida),
      modo_stock: p.modo_stock || "BULTO",
      modoCompraProveedor: p.modoCompraProveedor || "BULTO",
      pesoReferenciaKg: p.pesoReferenciaKg === "" ? null : Number(p.pesoReferenciaKg),
      pesoEsFijo: Boolean(p.pesoEsFijo),
      actualizaPromedioPorRecepcion: p.actualizaPromedioPorRecepcion !== false,
    };

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
        {/* IDENTIDAD */}
        <Section title="Identidad">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nombre *" fieldKey="nombre">
              <SunmiInput value={form.nombre} onChange={(e) => setField("nombre", e.target.value)} />
            </Field>

            <Field label="Código barras" fieldKey="codigo_barra">
              <SunmiInput value={form.codigo_barra} onChange={(e) => setField("codigo_barra", e.target.value)} />
            </Field>

            <Field label="SKU" fieldKey="sku">
              <SunmiInput value={form.sku} onChange={(e) => setField("sku", e.target.value)} />
            </Field>

            <Field label="Descripción" fieldKey="descripcion" colSpan>
              <SunmiInput value={form.descripcion} onChange={(e) => setField("descripcion", e.target.value)} />
            </Field>
          </div>
        </Section>

        {/* CATÁLOGOS */}
        <Section title="Catálogos">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Categoría" fieldKey="categoria_id">
              <SunmiSelectAdv
                searchable
                value={form.categoria_id === "" ? "" : String(form.categoria_id)}
                onChange={(v) =>
                  setField("categoria_id", v === "" ? "" : Number(v))
                }
              >
                <SunmiSelectOption value="">-</SunmiSelectOption>
                {catalogos.CATEGORIAS?.map((c) => (
                  <SunmiSelectOption key={c.id} value={String(c.id)}>
                    {c.nombre}
                  </SunmiSelectOption>
                ))}
              </SunmiSelectAdv>
            </Field>

            <Field label="Área física" fieldKey="area_fisica_id">
              <SunmiSelectAdv
                searchable
                value={form.area_fisica_id === "" ? "" : String(form.area_fisica_id)}
                onChange={(v) =>
                  setField("area_fisica_id", v === "" ? "" : Number(v))
                }
              >
                <SunmiSelectOption value="">-</SunmiSelectOption>
                {catalogos.AREAS?.map((c) => (
                  <SunmiSelectOption key={c.id} value={String(c.id)}>
                    {c.nombre}
                  </SunmiSelectOption>
                ))}
              </SunmiSelectAdv>
            </Field>
          </div>
        </Section>

        {/* PROVEEDORES */}
        <Section title="Proveedores">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Proveedor 1" fieldKey="proveedor_id">
              <SunmiSelectAdv
                searchable
                value={form.proveedor_id === "" ? "" : String(form.proveedor_id)}
                onChange={(v) =>
                  setField("proveedor_id", v === "" ? "" : Number(v))
                }
              >
                <SunmiSelectOption value="">-</SunmiSelectOption>
                {catalogos.PROVEEDORES?.map((c) => (
                  <SunmiSelectOption key={c.id} value={String(c.id)}>
                    {c.nombre}
                  </SunmiSelectOption>
                ))}
              </SunmiSelectAdv>
            </Field>

            <Field label="Proveedor 2" fieldKey="proveedor2_id">
              <SunmiSelectAdv
                searchable
                value={form.proveedor2_id === "" ? "" : String(form.proveedor2_id)}
                onChange={(v) =>
                  setField("proveedor2_id", v === "" ? "" : Number(v))
                }
              >
                <SunmiSelectOption value="">-</SunmiSelectOption>
                {catalogos.PROVEEDORES?.map((c) => (
                  <SunmiSelectOption key={c.id} value={String(c.id)}>
                    {c.nombre}
                  </SunmiSelectOption>
                ))}
              </SunmiSelectAdv>
            </Field>

            <Field label="Proveedor 3" fieldKey="proveedor3_id">
              <SunmiSelectAdv
                searchable
                value={form.proveedor3_id === "" ? "" : String(form.proveedor3_id)}
                onChange={(v) =>
                  setField("proveedor3_id", v === "" ? "" : Number(v))
                }
              >
                <SunmiSelectOption value="">-</SunmiSelectOption>
                {catalogos.PROVEEDORES?.map((c) => (
                  <SunmiSelectOption key={c.id} value={String(c.id)}>
                    {c.nombre}
                  </SunmiSelectOption>
                ))}
              </SunmiSelectAdv>
            </Field>
          </div>
        </Section>

        {/* PRESENTACIÓN */}
        <Section title="Presentación">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Unidad *" fieldKey="unidad_medida">
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
                    return { ...p, unidad_medida: v, modo_pedido: modoPedido, modo_envio: modoEnvio };
                  });
                }}
              >
                <SunmiSelectOption value="unidad">Unidad</SunmiSelectOption>
                <SunmiSelectOption value="pack">Pack</SunmiSelectOption>
                <SunmiSelectOption value="cajon">Cajón</SunmiSelectOption>
                <SunmiSelectOption value="kg">Kg</SunmiSelectOption>
              </SunmiSelectAdv>
            </Field>

            <Field label="Factor pack" fieldKey="factor_pack">
              <SunmiInput
                type="number"
                value={form.factor_pack}
                onWheel={(e) => e.target.blur()}
                onChange={(e) => {
                  const val = e.target.value;
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
                }}
              />
            </Field>

            <Field label="Peso (kg)" fieldKey="peso_kg">
              <SunmiInput
                type="number"
                value={form.peso_kg}
                onWheel={(e) => e.target.blur()}
                onChange={(e) => setNumber("peso_kg", e.target.value)}
              />
            </Field>

            <Field label="Volumen (ml)" fieldKey="volumen_ml">
              <SunmiInput
                type="number"
                value={form.volumen_ml}
                onWheel={(e) => e.target.blur()}
                onChange={(e) => setNumber("volumen_ml", e.target.value)}
              />
            </Field>
          </div>
        </Section>

        {/* PRECIOS */}
        <Section title="Precios">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Costo *" fieldKey="precio_costo">
              <SunmiInput
                type="number"
                value={form.precio_costo}
                onWheel={(e) => e.target.blur()}
                onChange={(e) => onChangeCosto(e.target.value)}
              />
            </Field>

            <Field label="Margen %" fieldKey="margen">
              <SunmiInput
                type="number"
                value={form.margen}
                onWheel={(e) => e.target.blur()}
                onChange={(e) => onChangeMargen(e.target.value)}
              />
            </Field>

            <Field label="Venta *" fieldKey="precio_venta">
              <SunmiInput
                type="number"
                value={form.precio_venta}
                onWheel={(e) => e.target.blur()}
                onChange={(e) => onChangeVenta(e.target.value)}
              />
            </Field>

            <Field label="IVA %" fieldKey="iva_porcentaje">
              <SunmiInput
                type="number"
                value={form.iva_porcentaje}
                onWheel={(e) => e.target.blur()}
                onChange={(e) => setNumber("iva_porcentaje", e.target.value)}
              />
            </Field>
          </div>
        </Section>

        {/* OTROS */}
        <Section title="Otros">
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
        </Section>

        {/* OPCIONES */}
        <Section title="Opciones">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div data-field="redondeo_100" tabIndex={0} className="flex flex-col gap-1.5 outline-none focus:ring-1 focus:ring-amber-400/50 rounded-md p-1 -m-1">
              <label className="text-[12px] sunmi-label">Redondeo a $100</label>
              <SunmiToggleEstado
                value={form.redondeo_100}
                onChange={(v) => {
                  setForm((p) => {
                    const next = { ...p, redondeo_100: v };
                    if (v && Number(p.precio_venta) > 0) {
                      next.precio_venta = roundUp100(Number(p.precio_venta));
                    }
                    return next;
                  });
                }}
              />
            </div>

            <div data-field="es_combo" tabIndex={0} className="flex flex-col gap-1.5 outline-none focus:ring-1 focus:ring-amber-400/50 rounded-md p-1 -m-1">
              <label className="text-[12px] sunmi-label">Es combo</label>
              <SunmiToggleEstado
                value={form.es_combo}
                onChange={(v) => setField("es_combo", v)}
              />
            </div>

            <div data-field="activo" tabIndex={0} className="flex flex-col gap-1.5 outline-none focus:ring-1 focus:ring-amber-400/50 rounded-md p-1 -m-1">
              <label className="text-[12px] sunmi-label">Activo</label>
              <SunmiToggleEstado
                value={form.activo}
                onChange={(v) => setField("activo", v)}
              />
            </div>
          </div>
        </Section>

        {/* REPOSICIÓN AUTOMÁTICA */}
        <Section title="Reposición automática">
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
        </Section>

        {/* COMPRAS A PROVEEDOR (FIAMBRE) */}
        <Section title="Compras a proveedor (fiambre)">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Modo compra proveedor" fieldKey="modoCompraProveedor">
              <SunmiSelectAdv
                value={form.modoCompraProveedor || "BULTO"}
                onChange={(v) => setField("modoCompraProveedor", v)}
              >
                <SunmiSelectOption value="BULTO">Bulto (default)</SunmiSelectOption>
                <SunmiSelectOption value="UNIDAD">Unidad (fiambre/kg)</SunmiSelectOption>
              </SunmiSelectAdv>
              <p className="text-xs text-slate-500 mt-1">
                Fiambre: stock en kg, pedido por unidades (piezas)
              </p>
            </Field>

            {form.modoCompraProveedor === "UNIDAD" && (
              <>
                <Field label="Peso referencia (kg)" fieldKey="pesoReferenciaKg">
                  <SunmiInput
                    type="number"
                    step="0.001"
                    min="0"
                    value={form.pesoReferenciaKg}
                    onWheel={(e) => e.target.blur()}
                    onChange={(e) => setNumber("pesoReferenciaKg", e.target.value)}
                    placeholder="ej: 3.5"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Peso por pieza. Ej: mortadela 4.5kg, salame 1.2kg
                  </p>
                </Field>

                <div data-field="pesoEsFijo" tabIndex={0} className="flex flex-col gap-1.5 outline-none focus:ring-1 focus:ring-amber-400/50 rounded-md p-1 -m-1">
                  <label className="text-[12px] sunmi-label">Peso fijo</label>
                  <SunmiToggleEstado
                    value={form.pesoEsFijo}
                    onChange={(v) => setField("pesoEsFijo", v)}
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Fijo: mortadela siempre 4.5kg. Variable: salame (peso varía)
                  </p>
                </div>

                <div data-field="actualizaPromedioPorRecepcion" tabIndex={0} className="flex flex-col gap-1.5 outline-none focus:ring-1 focus:ring-amber-400/50 rounded-md p-1 -m-1">
                  <label className="text-[12px] sunmi-label">Actualizar promedio en recepción</label>
                  <SunmiToggleEstado
                    value={form.actualizaPromedioPorRecepcion}
                    onChange={(v) => setField("actualizaPromedioPorRecepcion", v)}
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Al recibir, recalcular peso promedio con los kg reales
                  </p>
                </div>
              </>
            )}
          </div>
        </Section>
      </div>

      <div className="mx-auto w-full max-w-5xl mt-4 pt-4 border-t border-slate-800 flex justify-end gap-2">
        <SunmiButton color="cyan" onClick={onCancel}>
          Cancelar
        </SunmiButton>

        <SunmiButton onClick={handleSubmit}>
          {label}
        </SunmiButton>
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
    <SunmiPanel className="sunmi-surface ring-2 ring-inset sunmi-ring shadow-sm">
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
