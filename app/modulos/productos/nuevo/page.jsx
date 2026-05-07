"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import FormProducto from "@/components/productos/FormProducto";
import useContextoActivo from "@/hooks/useContextoActivo";

export default function NuevoProductoPage() {
  const router = useRouter();
  const { loading: loadingCtx, contexto, needsContexto } = useContextoActivo();

  const localId = contexto?.localId || 0;

  const [catalogos, setCatalogos] = useState({
    CATEGORIAS: [],
    PROVEEDORES: [],
    AREAS: [],
  });
  const [loadingCat, setLoadingCat] = useState(true);

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

  const handleSubmit = async (form) => {
    try {
      const res = await fetch(`/api/productos/crear?localId=${localId}`, {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (res.status === 401) {
        router.replace("/login");
        return;
      }

      const data = await res.json();

      if (!data.ok) {
        alert(data.error || "Error al crear producto");
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

  return (
    <div className="sunmi-bg w-full min-h-full p-2">
      <SunmiCard>
        <div className="flex items-center justify-between mb-3">
          <SunmiHeader title="Nuevo producto" />
          <SunmiBackButton href="/modulos/productos" />
        </div>

        {loadingCat ? (
          <SunmiLoader />
        ) : (
          <FormProducto
            initialData={null}
            catalogos={catalogos}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            submitLabel="Crear producto"
            enableVoiceInputs={true}
            onCatalogoCreado={handleCatalogoCreado}
          />
        )}
      </SunmiCard>
    </div>
  );
}
