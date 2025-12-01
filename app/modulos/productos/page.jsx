"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiButton from "@/components/sunmi/SunmiButton";

import FiltrosProductos from "@/components/productos/FiltrosProductos";
import ColumnManager from "@/components/productos/ColumnManager";
import ModalProducto from "@/components/productos/ModalProductoFinal";
import SunmiTablaProductos from "@/components/productos/SunmiTablaProductos";
import SelectorLocales from "@/components/productos/SelectorLocales";

export default function ProductosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const nuevo = searchParams.get("nuevo");
  const editarId = searchParams.get("editar");

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [localId, setLocalId] = useState(() => {
    if (typeof window !== "undefined") {
      return Number(localStorage.getItem("productosLocalId") || 1);
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
  const [loadingEditar, setLoadingEditar] = useState(false);

  const fetchCatalogos = async () => {
    try {
      const [cat, prov, area] = await Promise.all([
        fetch("/api/catalogos/categorias", { credentials: "include" }).then((r) =>
          r.json()
        ),
        fetch("/api/catalogos/proveedores", {
          credentials: "include",
        }).then((r) => r.json()),
        fetch("/api/catalogos/areas-fisicas", {
          credentials: "include",
        }).then((r) => r.json()),
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

  useEffect(() => {
    if (nuevo === "1") {
      setEditing(null);
      setModalOpen(true);
      return;
    }

    if (editarId) {
      const idNum = Number(editarId);
      if (!idNum) return;

      const cargar = async () => {
        try {
          setLoadingEditar(true);
          const r = await fetch(
            `/api/productos/obtener?id=${idNum}&localId=${localId}`,
            { credentials: "include" }
          );
          const data = await r.json();

          if (data.ok) {
            setEditing(data.item);
            setModalOpen(true);
          }
        } catch (err) {
          console.error("Error al editar:", err);
        } finally {
          setLoadingEditar(false);
        }
      };

      cargar();
      return;
    }

    setModalOpen(false);
    setEditing(null);
  }, [nuevo, editarId, localId]);

  const cerrarModal = () => {
    setModalOpen(false);
    setEditing(null);
    router.push("/modulos/productos");
  };

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

      cerrarModal();
      fetchProductos();
    } catch (err) {
      console.error("Error guardando producto:", err);
    }
  };

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

  const abrirNuevo = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("nuevo", "1");
    params.delete("editar");
    router.push(`/modulos/productos?${params.toString()}`);
  };

  const abrirEditar = (id) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("editar", String(id));
    params.delete("nuevo");
    router.push(`/modulos/productos?${params.toString()}`);
  };

  return (
    <div className="sunmi-bg w-full min-h-full p-2">
      <SunmiCard>
        <div className="flex flex-col gap-2">

          {/* ALCANCE */}
          <SunmiSeparator label="Alcance" className="!my-1" />

          <SelectorLocales
            value={localId}
            onChange={(v) => setLocalId(Number(v))}
          />

          {/* FILTROS */}
          <SunmiSeparator label="Filtros" className="!my-1" />

          <FiltrosProductos
            initial={filtros}
            catalogos={catalogos}
            onChange={(f) => {
              setPage(1);
              setFiltros(f);
            }}
          />

          {/* ACCIONES */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-2 w-full mt-1">
            <ColumnManager
              allColumns={allColumns}
              visibleKeys={visibleCols}
              onChange={setVisibleCols}
            />

            <SunmiButton color="amber" onClick={abrirNuevo}>
              ＋ Nuevo producto
            </SunmiButton>
          </div>

          {/* LISTADO */}
          <SunmiSeparator label="Listado" className="!my-1" />

          <div className="overflow-x-auto w-full mt-1">
            <div className="rounded-lg border border-slate-800 overflow-hidden">
              <SunmiTablaProductos
                rows={rows}
                columns={allColumns.filter((c) =>
                  visibleCols.includes(c.key)
                )}
                page={page}
                totalPages={totalPages}
                onNext={() => setPage((p) => p + 1)}
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onEditar={abrirEditar}
                onEliminar={handleEliminar}
                catalogos={catalogos}
                loading={loading || loadingEditar}
              />
            </div>
          </div>

          {(loading || loadingEditar) && (
            <div className="text-center text-slate-400 text-xs mt-1">
              Cargando...
            </div>
          )}
        </div>

        <ModalProducto
          open={modalOpen}
          onClose={cerrarModal}
          onSubmit={handleSubmit}
          catalogos={catalogos}
          initialData={editing}
          localId={localId}
        />
      </SunmiCard>
    </div>
  );
}
