"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import SunmiCampoBusquedaVoz from "@/components/sunmi/SunmiCampoBusquedaVoz";
import SunmiSelectAdv, {
  SunmiSelectOption,
} from "@/components/sunmi/SunmiSelectAdv";
import SunmiButton from "@/components/sunmi/SunmiButton";

export default function FiltrosProductos({ onChange, catalogos, initial }) {
  const [search, setSearch] = useState(initial.search || "");
  const [categoria, setCategoria] = useState(initial.categoria || "");
  const [proveedor, setProveedor] = useState(initial.proveedor || "");
  const [area, setArea] = useState(initial.area || "");
  const [estado, setEstado] = useState(initial.estado || "activos");
  const [tipo, setTipo] = useState(initial.tipo || "todos");

  const inputRef = useRef(null);
  const lastKeyTime = useRef(0);
  const scanBuffer = useRef("");
  const debounceRef = useRef(null);

  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      onChange({ search, categoria, proveedor, area, estado, tipo });
    }, 250);

    return () => clearTimeout(debounceRef.current);
    // onChange llega inline desde la página; los valores del filtro son la fuente
    // del pedido y evitan reiniciar el debounce por identidad de función.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, categoria, proveedor, area, estado, tipo]);

  const buscarInmediato = useCallback(
    (texto) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      onChange({ search: texto, categoria, proveedor, area, estado, tipo });
    },
    [onChange, categoria, proveedor, area, estado, tipo]
  );

  const handleKeyDown = (event) => {
    const now = Date.now();
    const diff = now - lastKeyTime.current;
    lastKeyTime.current = now;

    if (event.key === "Escape") {
      setSearch("");
      buscarInmediato("");
      inputRef.current?.focus();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();

      if (diff < 200 && scanBuffer.current.length > 3) {
        setSearch(scanBuffer.current);
        buscarInmediato(scanBuffer.current);
        scanBuffer.current = "";
        return;
      }

      buscarInmediato(search);
      scanBuffer.current = "";
      return;
    }

    if (event.key.length === 1) {
      if (diff > 500) scanBuffer.current = "";
      scanBuffer.current += event.key;
    }
  };

  const limpiar = () => {
    setSearch("");
    setCategoria("");
    setProveedor("");
    setArea("");
    setEstado("activos");
    setTipo("todos");
  };

  const hayFiltrosActivos =
    search !== "" ||
    categoria !== "" ||
    proveedor !== "" ||
    area !== "" ||
    estado !== "activos" ||
    tipo !== "todos";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex-1 min-w-0">
          <SunmiCampoBusquedaVoz
            value={search}
            onChange={setSearch}
            onVoz={(texto) => {
              setSearch(texto);
              buscarInmediato(texto);
            }}
            inputRef={inputRef}
            onKeyDown={handleKeyDown}
            placeholder="Buscar producto, código o categoría..."
            ariaLabel="Buscar productos"
          />
        </div>

        <div className="w-full md:w-40 md:shrink-0">
          <SunmiSelectAdv
            value={tipo}
            onChange={setTipo}
            placeholder="Tipo"
            aria-label="Tipo de producto"
          >
            <SunmiSelectOption value="todos">Todos</SunmiSelectOption>
            <SunmiSelectOption value="productos">Productos</SunmiSelectOption>
            <SunmiSelectOption value="combos">Combos</SunmiSelectOption>
          </SunmiSelectAdv>
        </div>

        <div className="w-full md:w-44 md:shrink-0">
          <SunmiSelectAdv
            value={estado}
            onChange={setEstado}
            placeholder="Estado"
            aria-label="Estado del producto"
          >
            <SunmiSelectOption value="activos">Activos</SunmiSelectOption>
            <SunmiSelectOption value="inactivos">Inactivos</SunmiSelectOption>
            <SunmiSelectOption value="todos">Todos</SunmiSelectOption>
          </SunmiSelectAdv>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex-1 min-w-0">
          <SunmiSelectAdv
            value={categoria}
            onChange={setCategoria}
            placeholder="Categoría"
            searchable
            aria-label="Categoría"
          >
            <SunmiSelectOption value="">Todas las categorías</SunmiSelectOption>
            {catalogos.CATEGORIAS?.map((c) => (
              <SunmiSelectOption key={c.id} value={String(c.id)}>
                {c.nombre}
              </SunmiSelectOption>
            ))}
          </SunmiSelectAdv>
        </div>

        <div className="flex-1 min-w-0">
          <SunmiSelectAdv
            value={proveedor}
            onChange={setProveedor}
            placeholder="Proveedor"
            searchable
            aria-label="Proveedor"
          >
            <SunmiSelectOption value="">Todos los proveedores</SunmiSelectOption>
            {catalogos.PROVEEDORES?.map((p) => (
              <SunmiSelectOption key={p.id} value={String(p.id)}>
                {p.nombre}
              </SunmiSelectOption>
            ))}
          </SunmiSelectAdv>
        </div>

        <div className="flex-1 min-w-0">
          <SunmiSelectAdv
            value={area}
            onChange={setArea}
            placeholder="Área física"
            searchable
            aria-label="Área física"
          >
            <SunmiSelectOption value="">Todas las áreas</SunmiSelectOption>
            {catalogos.AREAS?.map((a) => (
              <SunmiSelectOption key={a.id} value={String(a.id)}>
                {a.nombre}
              </SunmiSelectOption>
            ))}
          </SunmiSelectAdv>
        </div>

        {hayFiltrosActivos && (
          <SunmiButton color="slate" onClick={limpiar} className="md:shrink-0">
            Limpiar filtros
          </SunmiButton>
        )}
      </div>
    </div>
  );
}
