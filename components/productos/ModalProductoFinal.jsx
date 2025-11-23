"use client";

import { useEffect, useRef, useState } from "react";

export default function ModalProducto({
  open,
  onClose,
  onSubmit,
  catalogos,
  initialData = null,
  localId,
}) {
  // ✅ Nunca desmontamos el modal (NO usar return null)
  const modalRef = useRef(null);

  const inputClass =
    "h-[36px] w-full px-3 rounded-md border border-gray-300 bg-white text-[13px] text-gray-800 focus:border-blue-500 focus:outline-none";

  /** ✅ Conversión segura */
  const toNum = (v) => {
    if (v === "" || v === null || v === undefined) return "";
    const n = Number(v);
    return Number.isFinite(n) ? n : "";
  };

  /** ✅ Redondeo a 100 */
  const roundUp100 = (n) => {
    if (!Number.isFinite(n) || n <= 0) return n;
    return Math.ceil(n / 100) * 100;
  };

  /** ✅ Convertimos API → Form */
  const camelToForm = (o = {}) => ({
    nombre: o.nombre ?? "",
    descripcion: o.descripcion ?? "",
    sku: o.sku ?? "",
    codigo_barra: o.codigo_barra ?? o.codigoBarra ?? "",
    categoria_id: o.categoria_id ?? o.categoriaId ?? "",
    proveedor_id: o.proveedor_id ?? o.proveedorId ?? "",
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
  });

  const [form, setForm] = useState(
    camelToForm(initialData || { unidad_medida: "unidad", redondeo_100: true })
  );

  /** ✅ Cuando se abre el modal → resetear los datos (pero sin desmontar) */
  useEffect(() => {
    if (!open) return;
    setForm(
      camelToForm(initialData || { unidad_medida: "unidad", redondeo_100: true })
    );
    setTimeout(() => modalRef.current?.scrollTo(0, 0), 30);
  }, [open, initialData]);

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const setNumber = (key, val) => {
    if (val === "") return setField(key, "");
    const n = Number(val);
    if (Number.isFinite(n) && n >= 0) setField(key, n);
  };

  const costo = Number(form.precio_costo) || 0;
  const usarRedondeo = Boolean(form.redondeo_100);

  /** ✅ Costo */
  const onChangeCosto = (val) => {
    if (val === "") return setField("precio_costo", "");
    let pc = Number(val);
    if (!Number.isFinite(pc) || pc < 0) return;

    if (form.margen > 0) {
      let pv = pc * (1 + form.margen / 100);
      if (usarRedondeo) pv = roundUp100(pv);
      setForm((p) => ({ ...p, precio_costo: pc, precio_venta: pv }));
    } else setField("precio_costo", pc);
  };

  /** ✅ Margen */
  const onChangeMargen = (val) => {
    if (val === "") return setField("margen", "");
    let m = Number(val);
    if (!Number.isFinite(m) || m < 0) return;

    let pv = costo > 0 ? costo * (1 + m / 100) : 0;
    if (usarRedondeo && pv > 0) pv = roundUp100(pv);
    setForm((p) => ({ ...p, margen: m, precio_venta: pv }));
  };

  /** ✅ Venta */
  const onChangeVenta = (val) => {
    if (val === "") return setField("precio_venta", "");
    let pv = Number(val);
    if (!Number.isFinite(pv) || pv < 0) return;
    if (usarRedondeo) pv = roundUp100(pv);

    let m = costo > 0 ? (pv / costo - 1) * 100 : 0;
    setForm((p) => ({ ...p, precio_venta: pv, margen: Number(m.toFixed(2)) }));
  };

  /** ✅ Validación */
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

    return null;
  };

  /** ✅ Submit */
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
    };

    onSubmit(payload);
  };

  return (
    <div
      className={`fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-3 ${
        open ? "block" : "hidden"
      }`}
    >
      <div className="w-[95%] max-w-4xl bg-white rounded-xl shadow-xl overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {initialData ? "Editar producto" : "Nuevo producto"}
          </h2>

          <button onClick={onClose} className="px-3 py-1 rounded-md border">
            Cerrar
          </button>
        </div>

        <div ref={modalRef} className="p-5 max-h-[70vh] overflow-y-auto space-y-4">
          {/* IDENTIDAD */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nombre *">
              <input
                className={inputClass}
                value={form.nombre}
                onChange={(e) => setField("nombre", e.target.value)}
              />
            </Field>

            <Field label="Código barras">
              <input
                className={inputClass}
                value={form.codigo_barra}
                onChange={(e) => setField("codigo_barra", e.target.value)}
              />
            </Field>

            <Field label="SKU">
              <input
                className={inputClass}
                value={form.sku}
                onChange={(e) => setField("sku", e.target.value)}
              />
            </Field>

            <Field label="Descripción" colSpan>
              <input
                className={inputClass}
                value={form.descripcion}
                onChange={(e) => setField("descripcion", e.target.value)}
              />
            </Field>
          </div>

          {/* CATÁLOGOS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Categoría">
              <select
                className={inputClass}
                value={form.categoria_id}
                onChange={(e) => setField("categoria_id", e.target.value)}
              >
                <option value="">-</option>
                {catalogos.CATEGORIAS?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Proveedor">
              <select
                className={inputClass}
                value={form.proveedor_id}
                onChange={(e) => setField("proveedor_id", e.target.value)}
              >
                <option value="">-</option>
                {catalogos.PROVEEDORES?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Área física">
              <select
                className={inputClass}
                value={form.area_fisica_id}
                onChange={(e) => setField("area_fisica_id", e.target.value)}
              >
                <option value="">-</option>
                {catalogos.AREAS?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {/* PRESENTACIÓN */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Field label="Unidad *">
              <select
                className={inputClass}
                value={form.unidad_medida}
                onChange={(e) => setField("unidad_medida", e.target.value)}
              >
                <option value="unidad">Unidad</option>
                <option value="pack">Pack</option>
                <option value="cajon">Cajón</option>
                <option value="kg">Kg</option>
              </select>
            </Field>

            <Field label="Factor pack">
              <input
                type="number"
                className={inputClass}
                value={form.factor_pack}
                onChange={(e) => setNumber("factor_pack", e.target.value)}
              />
            </Field>

            <Field label="Peso (kg)">
              <input
                type="number"
                className={inputClass}
                value={form.peso_kg}
                onChange={(e) => setNumber("peso_kg", e.target.value)}
              />
            </Field>

            <Field label="Volumen (ml)">
              <input
                type="number"
                className={inputClass}
                value={form.volumen_ml}
                onChange={(e) => setNumber("volumen_ml", e.target.value)}
              />
            </Field>
          </div>

          {/* PRECIOS */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Field label="Costo *">
              <input
                type="number"
                className={inputClass}
                value={form.precio_costo}
                onChange={(e) => onChangeCosto(e.target.value)}
              />
            </Field>

            <Field label="Margen %">
              <input
                type="number"
                className={inputClass}
                value={form.margen}
                onChange={(e) => onChangeMargen(e.target.value)}
              />
            </Field>

            <Field label="Venta *">
              <input
                type="number"
                className={inputClass}
                value={form.precio_venta}
                onChange={(e) => onChangeVenta(e.target.value)}
              />
            </Field>

            <Field label="IVA %">
              <input
                type="number"
                className={inputClass}
                value={form.iva_porcentaje}
                onChange={(e) => setNumber("iva_porcentaje", e.target.value)}
              />
            </Field>
          </div>

          {/* OTROS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Precio sugerido">
              <input
                type="number"
                className={inputClass}
                value={form.precio_sugerido}
                onChange={(e) => setNumber("precio_sugerido", e.target.value)}
              />
            </Field>

            <Field label="Fecha vencimiento">
              <input
                type="date"
                className={inputClass}
                value={form.fecha_vencimiento}
                onChange={(e) => setField("fecha_vencimiento", e.target.value)}
              />
            </Field>

            <Field label="Imagen URL">
              <input
                className={inputClass}
                value={form.imagen_url}
                onChange={(e) => setField("imagen_url", e.target.value)}
              />
            </Field>
          </div>

          {/* SWITCHES */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Switch
              checked={form.redondeo_100}
              onChange={(v) => {
                setField("redondeo_100", v);
                if (v && form.precio_venta > 0)
                  setField("precio_venta", roundUp100(Number(form.precio_venta)));
              }}
              label="Redondeo a $100"
            />

            <Switch
              checked={form.es_combo}
              onChange={(v) => setField("es_combo", v)}
              label="Es combo"
            />

            <Switch
              checked={form.activo}
              onChange={(v) => setField("activo", v)}
              label="Activo"
            />
          </div>
        </div>

        <div className="px-5 py-3 border-t bg-gray-50 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border rounded-md">
            Cancelar
          </button>

          <button
            onClick={handleSubmit}
            className="px-4 py-2 rounded-md bg-blue-600 text-white"
          >
            {initialData ? "Guardar cambios" : "Crear producto"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* SUBCOMPONENTES */
function Field({ label, children, colSpan }) {
  return (
    <div className={colSpan ? "md:col-span-2 flex flex-col gap-1" : "flex flex-col gap-1"}>
      <label className="text-[12px] text-gray-600">{label}</label>
      {children}
    </div>
  );
}

function Switch({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2 select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 accent-blue-600"
      />
      <span className="text-[13px]">{label}</span>
    </label>
  );
}
