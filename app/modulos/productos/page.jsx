"use client";

import { useEffect, useState } from "react";
import FiltrosProductos from "@/components/productos/FiltrosProductos";
import ColumnManager from "@/components/productos/ColumnManager";
import ModalProducto from "@/components/productos/ModalProductoFinal";
import SunmiTablaProductos from "@/components/productos/SunmiTablaProductos";
import SelectorLocales from "@/components/productos/SelectorLocales";

export default function ProductosPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Local seleccionado
  const [localId, setLocalId] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = Number(localStorage.getItem("productosLocalId") || 1);
      return saved > 0 ? saved : 1;
    }
    return 1;
  });

  useEffect(() => {
    localStorage.setItem("productosLocalId", String(localId));
  }, [localId]);

  const [filtros, setFiltros] = useState({
    search: "",
    categoria: "",
    proveedor: "",
    area: "",
    activo: "",
  });

  const allColumns = [
    { key: "imagenUrl", label: "Imagen" },
    { key: "nombre", label: "Nombre" },
    { key: "codigoBarra", label: "Código barra" },
    { key: "sku", label: "SKU" },
    { key: "categoriaId", label: "Categoría" },
    { key: "proveedorId", label: "Proveedor" },
    { key: "areaFisicaId", label: "Área física" },
    { key: "unidadMedida", label: "Unidad" },
    { key: "factorPack", label: "Pack" },
    { key: "pesoKg", label: "Peso (kg)" },
    { key: "volumenMl", label: "Volumen (ml)" },
    { key: "precioCosto", label: "Costo" },
    { key: "precioVenta", label: "Venta" },
    { key: "margen", label: "Margen %" },
    { key: "ivaPorcentaje", label: "IVA %" },
    { key: "fechaVencimiento", label: "Vencimiento" },
    { key: "esCombo", label: "Combo" },
    { key: "activo", label: "Estado" },
  ];

  const [visibleCols, setVisibleCols] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("productosCols");
      if (saved) return JSON.parse(saved);
    }
    return allColumns.map((c) => c.key);
  });

  useEffect(() => {
    localStorage.setItem("productosCols", JSON.stringify(visibleCols));
  }, [visibleCols]);

  const [catalogos, setCatalogos] = useState({
    CATEGORIAS: [],
    PROVEEDORES: [],
    AREAS: [],
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  // Cargar catálogos
  const fetchCatalogos = async () => {
    try {
      const [cat, prov, area] = await Promise.all([
        fetch("/api/catalogos/categorias", { credentials: "include" }).then((r) => r.json()),
        fetch("/api/catalogos/proveedores", { credentials: "include" }).then((r) => r.json()),
        fetch("/api/catalogos/areas-fisicas", { credentials: "include" }).then((r) => r.json()),
      ]);

      setCatalogos({
        CATEGORIAS: cat.items ?? [],
        PROVEEDORES: prov.items ?? [],
        AREAS: area.items ?? [],
      });
    } catch (err) {
      console.error("Error cargando catálogos:", err);
    }
  };

  // Cargar productos
  const fetchProductos = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        q: filtros.search,
        categoriaId: filtros.categoria,
        proveedorId: filtros.proveedor,
        areaFisicaId: filtros.area,
        activo: filtros.activo,
        localId: String(localId),
      });

      const res = await fetch(`/api/productos/listar?${params.toString()}`, {
        credentials: "include",
      });

      const data = await res.json();

      if (data.ok) {
        setRows(data.items);
        setTotalPages(data.totalPages);
      }
    } catch (err) {
      console.error("Error cargando productos:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCatalogos();
  }, []);

  useEffect(() => {
    fetchProductos();
  }, [page, filtros, localId]);

  // Crear / Editar
  const handleSubmit = async (form) => {
    try {
      const isEdit = Boolean(editing);

      const url = isEdit
        ? `/api/productos/editar/${editing.id}?localId=${localId}`
        : `/api/productos/crear?localId=${localId}`;

      const res = await fetch(url, {
        credentials: "include",
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!data.ok) {
        alert(data.error || "Error guardando producto");
        return;
      }

      setModalOpen(false);
      setEditing(null);
      fetchProductos();
    } catch (err) {
      console.error("Error guardando producto:", err);
    }
  };

  // Editar
  const handleEditar = async (id) => {
    try {
      const r = await fetch(`/api/productos/obtener?id=${id}&localId=${localId}`, {
        credentials: "include",
      });

      const data = await r.json();

      if (data.ok) {
        setEditing(data.item);
        setModalOpen(true);
      }
    } catch (err) {
      console.error("Error al editar:", err);
    }
  };

  // Eliminar
  const handleEliminar = async (id) => {
    if (!confirm("¿Eliminar producto?")) return;

    try {
      const r = await fetch(`/api/productos/eliminar/${id}`, {
        credentials: "include",
        method: "DELETE",
      });

      const data = await r.json();

      if (data.ok) fetchProductos();
      else alert(data.error || "Error eliminando producto");
    } catch (err) {
      console.error("Error eliminando:", err);
    }
  };

  return (
    <div className="p-4 flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Productos</h1>

      <SelectorLocales value={localId} onChange={(v) => setLocalId(Number(v))} />

      <FiltrosProductos
        initial={filtros}
        catalogos={catalogos}
        onChange={(f) => {
          setPage(1);
          setFiltros(f);
        }}
      />

      <div className="flex items-center justify-end gap-2">
        <ColumnManager
          allColumns={allColumns}
          visibleKeys={visibleCols}
          onChange={setVisibleCols}
        />

        <button
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
          className="px-4 py-2 rounded-md bg-blue-600 text-white"
        >
          Nuevo producto
        </button>
      </div>

      <div className="overflow-x-auto w-full border rounded-lg">
        <SunmiTablaProductos
          rows={rows}
          columns={allColumns.filter((c) => visibleCols.includes(c.key))}
          page={page}
          totalPages={totalPages}
          onNext={() => setPage((p) => p + 1)}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onEditar={handleEditar}
          onEliminar={handleEliminar}
          catalogos={catalogos}
        />
      </div>

      {/* Modal */}
      <div className={modalOpen ? "block" : "hidden"}>
        <ModalProducto
          open={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          onSubmit={handleSubmit}
          catalogos={catalogos}
          initialData={editing}
          localId={localId}
        />
      </div>

      {loading && (
        <div className="text-center text-gray-500 mt-4">
          Cargando...
        </div>
      )}
    </div>
  );
}
