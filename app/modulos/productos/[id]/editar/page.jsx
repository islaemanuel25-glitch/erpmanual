"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import FormProducto from "@/components/productos/FormProducto";
import useContextoActivo from "@/hooks/useContextoActivo";

export default function EditarProductoPage({ params }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loading: loadingCtx, contexto, needsContexto } = useContextoActivo();

  const localId = contexto?.localId || 0;

  // URL de retorno al listado preservando contexto (page, sort, filtros)
  const returnUrl = useMemo(() => {
    const listing = new URLSearchParams();
    for (const [k, v] of searchParams.entries()) {
      listing.set(k, v);
    }
    const qs = listing.toString();
    return qs ? `/modulos/productos?${qs}` : "/modulos/productos";
  }, [searchParams]);

  const [catalogos, setCatalogos] = useState({
    CATEGORIAS: [],
    PROVEEDORES: [],
    AREAS: [],
  });
  const [initialData, setInitialData] = useState(null);
  const [puedeEditarCosto, setPuedeEditarCosto] = useState(true);
  const [loadingCat, setLoadingCat] = useState(true);
  const [loadingProd, setLoadingProd] = useState(true);
  const [prodId, setProdId] = useState(null);

  // Resolver params (puede ser promise en App Router)
  useEffect(() => {
    Promise.resolve(params).then((p) => setProdId(Number(p.id)));
  }, [params]);

  // Cargar catálogos
  useEffect(() => {
    const cargar = async () => {
      try {
        const [catRes, provRes, areaRes] = await Promise.all([
          fetch("/api/catalogos/categorias", { credentials: "include" }),
          fetch("/api/catalogos/proveedores", { credentials: "include" }),
          fetch("/api/catalogos/areas-fisicas", { credentials: "include" }),
        ]);

        if (catRes.status === 401 || provRes.status === 401 || areaRes.status === 401) {
          router.replace("/login");
          return;
        }

        const [cat, prov, area] = await Promise.all([
          catRes.json(),
          provRes.json(),
          areaRes.json(),
        ]);

        setCatalogos({
          CATEGORIAS: cat.items ?? [],
          PROVEEDORES: prov.items ?? [],
          AREAS: area.items ?? [],
        });
      } catch (err) {
        console.error("Error cargando catálogos:", err);
      }
      setLoadingCat(false);
    };

    cargar();
  }, []);

  // Cargar producto
  useEffect(() => {
    if (!prodId || !localId) return;

    const cargar = async () => {
      setLoadingProd(true);
      try {
        const res = await fetch(
          `/api/productos/obtener?id=${prodId}&localId=${localId}`,
          { credentials: "include" }
        );

        if (res.status === 401) {
          router.replace("/login");
          return;
        }

        const data = await res.json();

        if (!data.ok) {
          alert(data.error || "Producto no encontrado");
          router.push(returnUrl);
          return;
        }

        setInitialData(data.item);
        // Costo editable solo si el backend lo autoriza (dueño del producto).
        setPuedeEditarCosto(data.puedeEditarCosto !== false);
      } catch (err) {
        console.error("Error cargando producto:", err);
        router.push(returnUrl);
      }
      setLoadingProd(false);
    };

    cargar();
  }, [prodId, localId]);

  const handleSubmit = async (form) => {
    try {
      const res = await fetch(
        `/api/productos/editar/${prodId}?localId=${localId}`,
        {
          credentials: "include",
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );

      if (res.status === 401) {
        router.replace("/login");
        return;
      }

      const data = await res.json();

      if (!data.ok) {
        alert(data.error || "Error al editar producto");
        return;
      }

      router.push(returnUrl);
    } catch (err) {
      console.error("Error guardando producto:", err);
      alert("Error interno");
    }
  };

  const handleCancel = () => {
    router.push(returnUrl);
  };

  const handleCatalogoCreado = (tipo, item) => {
    if (!item) return;
    setCatalogos((prev) => {
      if (tipo === "categoria") return { ...prev, CATEGORIAS: [...prev.CATEGORIAS, item] };
      if (tipo === "area_fisica") return { ...prev, AREAS: [...prev.AREAS, item] };
      if (tipo === "proveedor") return { ...prev, PROVEEDORES: [...prev.PROVEEDORES, item] };
      return prev;
    });
  };

  if (loadingCtx) return null;
  if (needsContexto) { router.push("/inicio"); return null; }

  const loading = loadingCat || loadingProd;

  return (
    <div className="sunmi-bg w-full min-h-full p-2">
      <SunmiCard>
        <div className="flex items-center justify-between mb-3">
          <SunmiHeader title="Editar producto" />
          <SunmiBackButton href={returnUrl} />
        </div>

        {loading ? (
          <SunmiLoader />
        ) : initialData ? (
          <FormProducto
            initialData={initialData}
            catalogos={catalogos}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            submitLabel="Guardar cambios"
            enableVoiceInputs={true}
            onCatalogoCreado={handleCatalogoCreado}
            puedeEditarCosto={puedeEditarCosto}
          />
        ) : (
          <p className="sunmi-text-muted text-sm">Producto no encontrado.</p>
        )}
      </SunmiCard>
    </div>
  );
}
