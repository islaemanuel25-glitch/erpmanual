"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import FormProducto from "@/components/productos/FormProducto";
import useContextoActivo from "@/hooks/useContextoActivo";

export default function EditarProductoPage({ params }) {
  const router = useRouter();
  const { loading: loadingCtx, contexto, needsContexto } = useContextoActivo();

  const localId = contexto?.localId || 0;

  const [catalogos, setCatalogos] = useState({
    CATEGORIAS: [],
    PROVEEDORES: [],
    AREAS: [],
  });
  const [initialData, setInitialData] = useState(null);
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
          router.push("/modulos/productos");
          return;
        }

        setInitialData(data.item);
      } catch (err) {
        console.error("Error cargando producto:", err);
        router.push("/modulos/productos");
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

      router.push("/modulos/productos");
    } catch (err) {
      console.error("Error guardando producto:", err);
      alert("Error interno");
    }
  };

  const handleCancel = () => {
    router.push("/modulos/productos");
  };

  if (loadingCtx) return null;
  if (needsContexto) { router.push("/inicio"); return null; }

  const loading = loadingCat || loadingProd;

  return (
    <div className="sunmi-bg w-full min-h-full p-2">
      <SunmiCard>
        <div className="flex items-center justify-between mb-3">
          <SunmiHeader title="Editar producto" />
          <SunmiButton color="cyan" onClick={handleCancel}>
            Volver
          </SunmiButton>
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
          />
        ) : (
          <p className="text-slate-400 text-sm">Producto no encontrado.</p>
        )}
      </SunmiCard>
    </div>
  );
}
