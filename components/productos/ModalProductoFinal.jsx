"use client";

import { useEffect, useRef, useState } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiToggleEstado from "@/components/sunmi/SunmiToggleEstado";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";

export default function ModalProducto({
  open,
  onClose,
  onSubmit,
  catalogos,
  initialData = null,
}) {
  const modalRef = useRef(null);

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

  const onChangeMargen = (val) => {
    if (val === "") return setField("margen", "");
    let m = Number(val);
    if (!Number.isFinite(m) || m < 0) return;

    let pv = costo > 0 ? costo * (1 + m / 100) : 0;
    if (usarRedondeo && pv > 0) pv = roundUp100(pv);
    setForm((p) => ({ ...p, margen: m, precio_venta: pv }));
  };

  const onChangeVenta = (val) => {
    if (val === "") return setField("precio_venta", "");
    let pv = Number(val);
    if (!Number.isFinite(pv) || pv < 0) return;
    if (usarRedondeo) pv = roundUp100(pv);

    let m = costo > 0 ? (pv / costo - 1) * 100 : 0;
    setForm((p) => ({ ...p, precio_venta: pv, margen: Number(m.toFixed(2)) }));
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
      className={`fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-3 ${
        open ? "block" : "hidden"
      }`}
    >
      <SunmiCard className="w-[95%] max-w-4xl">
        <div className="flex items-center justify-between mb-3">
          <SunmiHeader title={initialData ? "Editar producto" : "Nuevo producto"} color="amber" />
          <SunmiButton color="cyan" onClick={onClose}>
            Cerrar
          </SunmiButton>
        </div>

        <div ref={modalRef} className="max-h-[70vh] overflow-y-auto space-y-4">
          {/* IDENTIDAD */}
          <SunmiSeparator label="Identidad" color="amber" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nombre *">
              <SunmiInput value={form.nombre} onChange={(e) => setField("nombre", e.target.value)} />
            </Field>

            <Field label="Código barras">
              <SunmiInput value={form.codigo_barra} onChange={(e) => setField("codigo_barra", e.target.value)} />
            </Field>

            <Field label="SKU">
              <SunmiInput value={form.sku} onChange={(e) => setField("sku", e.target.value)} />
            </Field>

            <Field label="Descripción" colSpan>
              <SunmiInput value={form.descripcion} onChange={(e) => setField("descripcion", e.target.value)} />
            </Field>
          </div>

          {/* CATÁLOGOS */}
          <SunmiSeparator label="Catálogos" color="amber" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Categoría">
              <SunmiSelectAdv
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

            <Field label="Proveedor">
              <SunmiSelectAdv
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

            <Field label="Área física">
              <SunmiSelectAdv
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

          {/* PRESENTACIÓN */}
          <SunmiSeparator label="Presentación" color="amber" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Field label="Unidad *">
              <SunmiSelectAdv
                value={form.unidad_medida}
                onChange={(v) => setField("unidad_medida", v)}
              >
                <SunmiSelectOption value="unidad">Unidad</SunmiSelectOption>
                <SunmiSelectOption value="pack">Pack</SunmiSelectOption>
                <SunmiSelectOption value="cajon">Cajón</SunmiSelectOption>
                <SunmiSelectOption value="kg">Kg</SunmiSelectOption>
              </SunmiSelectAdv>
            </Field>

            <Field label="Factor pack">
              <SunmiInput
                type="number"
                value={form.factor_pack}
                onChange={(e) => setNumber("factor_pack", e.target.value)}
              />
            </Field>

            <Field label="Peso (kg)">
              <SunmiInput
                type="number"
                value={form.peso_kg}
                onChange={(e) => setNumber("peso_kg", e.target.value)}
              />
            </Field>

            <Field label="Volumen (ml)">
              <SunmiInput
                type="number"
                value={form.volumen_ml}
                onChange={(e) => setNumber("volumen_ml", e.target.value)}
              />
            </Field>
          </div>

          {/* PRECIOS */}
          <SunmiSeparator label="Precios" color="amber" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Field label="Costo *">
              <SunmiInput
                type="number"
                value={form.precio_costo}
                onChange={(e) => onChangeCosto(e.target.value)}
              />
            </Field>

            <Field label="Margen %">
              <SunmiInput
                type="number"
                value={form.margen}
                onChange={(e) => onChangeMargen(e.target.value)}
              />
            </Field>

            <Field label="Venta *">
              <SunmiInput
                type="number"
                value={form.precio_venta}
                onChange={(e) => onChangeVenta(e.target.value)}
              />
            </Field>

            <Field label="IVA %">
              <SunmiInput
                type="number"
                value={form.iva_porcentaje}
                onChange={(e) => setNumber("iva_porcentaje", e.target.value)}
              />
            </Field>
          </div>

          {/* OTROS */}
          <SunmiSeparator label="Otros" color="amber" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Precio sugerido">
              <SunmiInput
                type="number"
                value={form.precio_sugerido}
                onChange={(e) => setNumber("precio_sugerido", e.target.value)}
              />
            </Field>

            <Field label="Fecha vencimiento">
              <SunmiInput
                type="date"
                value={form.fecha_vencimiento}
                onChange={(e) => setField("fecha_vencimiento", e.target.value)}
              />
            </Field>

            <Field label="Imagen URL">
              <SunmiInput
                value={form.imagen_url}
                onChange={(e) => setField("imagen_url", e.target.value)}
              />
            </Field>
          </div>

          {/* SWITCHES */}
          <SunmiSeparator label="Opciones" color="amber" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[12px] text-slate-400">Redondeo a $100</label>
              <SunmiToggleEstado
                checked={form.redondeo_100}
                onChange={(v) => {
                  setField("redondeo_100", v);
                  if (v && form.precio_venta > 0)
                    setField("precio_venta", roundUp100(Number(form.precio_venta)));
                }}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[12px] text-slate-400">Es combo</label>
              <SunmiToggleEstado
                checked={form.es_combo}
                onChange={(v) => setField("es_combo", v)}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[12px] text-slate-400">Activo</label>
              <SunmiToggleEstado
                checked={form.activo}
                onChange={(v) => setField("activo", v)}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-800 flex justify-end gap-2">
          <SunmiButton color="cyan" onClick={onClose}>
            Cancelar
          </SunmiButton>

          <SunmiButton color="amber" onClick={handleSubmit}>
            {initialData ? "Guardar cambios" : "Crear producto"}
          </SunmiButton>
        </div>
      </SunmiCard>
    </div>
  );
}

/* SUBCOMPONENTES */
function Field({ label, children, colSpan }) {
  return (
    <div className={colSpan ? "md:col-span-2 flex flex-col gap-1" : "flex flex-col gap-1"}>
      <label className="text-[12px] text-slate-400">{label}</label>
      {children}
    </div>
  );
}
