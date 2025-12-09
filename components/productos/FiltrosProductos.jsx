"use client";

import { useEffect, useState } from "react";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv, {
  SunmiSelectOption,
} from "@/components/sunmi/SunmiSelectAdv";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function FiltrosProductos({ onChange, catalogos, initial }) {
  const { ui } = useUIConfig();
  const [search, setSearch] = useState(initial.search || "");
  const [categoria, setCategoria] = useState(initial.categoria || "");
  const [proveedor, setProveedor] = useState(initial.proveedor || "");
  const [area, setArea] = useState(initial.area || "");
  const [activo, setActivo] = useState(initial.activo ?? "");

  const [open, setOpen] = useState(false);

  // ============================
  // Debounce 250ms
  // ============================
  useEffect(() => {
    const timeout = setTimeout(() => {
      onChange({ search, categoria, proveedor, area, activo });
    }, 250);

    return () => clearTimeout(timeout);
  }, [search, categoria, proveedor, area, activo]);

  const limpiar = () => {
    setSearch("");
    setCategoria("");
    setProveedor("");
    setArea("");
    setActivo("");
  };

  return (
    <div
      className="flex flex-col"
      style={{
        gap: ui.helpers.spacing("lg"),
      }}
    >
      {/* ================================= */}
      {/* BARRA PRINCIPAL */}
      {/* ================================= */}
      <div
        className="flex flex-col md:flex-row md:items-center md:justify-between"
        style={{
          gap: ui.helpers.spacing("md"),
        }}
      >
        {/* BUSCADOR SUNMI */}
        <div className="flex-1">
          <SunmiInput
            placeholder="Buscar producto, código o categoría..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon="search"
          />
        </div>

        {/* BOTÓN MÁS FILTROS */}
        <SunmiButton
          color="slate"
          className="w-full md:w-auto"
          onClick={() => setOpen(!open)}
        >
          {open ? "Ocultar filtros" : "Más filtros"}
        </SunmiButton>
      </div>

      {/* ================================= */}
      {/* PANEL DE FILTROS AVANZADOS */}
      {/* ================================= */}
      {open && (
        <div
          className="border border-slate-700 bg-slate-900 shadow-md animate-fadeIn"
          style={{
            borderRadius: ui.helpers.radius("xl"),
            padding: ui.helpers.spacing("lg"),
          }}
        >
          <SunmiSeparator label="Filtros avanzados" color="amber" />

          <div
            className="grid grid-cols-1 md:grid-cols-5"
            style={{
              gap: ui.helpers.spacing("lg"),
              marginTop: ui.helpers.spacing("lg"),
            }}
          >
            {/* CATEGORÍA */}
            <SunmiSelectAdv
              value={categoria}
              onChange={setCategoria}
              placeholder="Categoría..."
            >
              <SunmiSelectOption value="">Categoría...</SunmiSelectOption>
              {catalogos.CATEGORIAS?.map((c) => (
                <SunmiSelectOption key={c.id} value={String(c.id)}>
                  {c.nombre}
                </SunmiSelectOption>
              ))}
            </SunmiSelectAdv>

            {/* PROVEEDOR */}
            <SunmiSelectAdv
              value={proveedor}
              onChange={setProveedor}
              placeholder="Proveedor..."
            >
              <SunmiSelectOption value="">Proveedor...</SunmiSelectOption>
              {catalogos.PROVEEDORES?.map((p) => (
                <SunmiSelectOption key={p.id} value={String(p.id)}>
                  {p.nombre}
                </SunmiSelectOption>
              ))}
            </SunmiSelectAdv>

            {/* ÁREA FÍSICA */}
            <SunmiSelectAdv
              value={area}
              onChange={setArea}
              placeholder="Área física..."
            >
              <SunmiSelectOption value="">Área física...</SunmiSelectOption>
              {catalogos.AREAS?.map((a) => (
                <SunmiSelectOption key={a.id} value={String(a.id)}>
                  {a.nombre}
                </SunmiSelectOption>
              ))}
            </SunmiSelectAdv>

            {/* ESTADO */}
            <SunmiSelectAdv
              value={activo}
              onChange={setActivo}
              placeholder="Estado..."
            >
              <SunmiSelectOption value="">Estado...</SunmiSelectOption>
              <SunmiSelectOption value="true">Activo</SunmiSelectOption>
              <SunmiSelectOption value="false">Inactivo</SunmiSelectOption>
            </SunmiSelectAdv>

            {/* LIMPIAR */}
            <SunmiButton color="cyan" onClick={limpiar}>
              Limpiar
            </SunmiButton>
          </div>
        </div>
      )}
    </div>
  );
}
