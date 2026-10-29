"use client";

// CREAR EL PRODUCTO DESDE UN RENGLÓN QUE NO EXISTE EN EL CATÁLOGO.
//
// Myf #383, "HELLMANNS MAY LIVIANA DP 24X237G": no estaba en el catálogo y la
// hoja "Qué producto es" no tenía salida, había que irse de la recepción.
//
// No hay formulario nuevo: es `ModalProductoFinal`, el de "Nuevo producto" de
// Productos, con lo que el papel ya dice precargado (`precargaDelAlta`). Los
// catálogos salen de los mismos tres endpoints y el alta va por la misma ruta,
// `/api/productos/crear`, que revalida el permiso de crear productos.
//
// Al crear, devuelve el producto a quien lo abrió, que lo VINCULA por el camino
// de siempre —el que escribe el alias del proveedor—. Cancelar no crea nada.

import { useEffect, useMemo, useState } from "react";

import ModalProducto from "@/components/productos/ModalProductoFinal";
import useContextoActivo from "@/hooks/useContextoActivo";
import { precargaDelAlta } from "@/lib/compras-proveedor/altaDesdeElPapel";

export default function AltaDesdeElPapel({ fila, proveedorId, onCreado, onCancelar }) {
  const { contexto } = useContextoActivo();
  const localId = contexto?.localId || 0;
  const [catalogos, setCatalogos] = useState({ CATEGORIAS: [], PROVEEDORES: [], AREAS: [] });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  // Memorizada: el formulario se reinicia cada vez que cambia su `initialData`.
  const precarga = useMemo(() => precargaDelAlta({ fila, proveedorId }), [fila, proveedorId]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [cat, prov, area] = await Promise.all(
          ["/api/catalogos/categorias", "/api/catalogos/proveedores", "/api/catalogos/areas-fisicas"].map((u) =>
            fetch(u, { credentials: "include" }).then((r) => r.json())
          )
        );
        if (vivo) setCatalogos({ CATEGORIAS: cat?.items ?? [], PROVEEDORES: prov?.items ?? [], AREAS: area?.items ?? [] });
      } catch (e) {
        if (vivo) setError("No se pudieron cargar las categorías y los proveedores. Probá de nuevo.");
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // El fallo se avisa como lo avisa el alta de Productos: con el formulario
  // abierto y lo cargado intacto, para corregir y volver a guardar.
  const crear = async (form) => {
    try {
      const res = await fetch(`/api/productos/crear?localId=${localId}`, {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => null);
      if (!data?.ok || !data?.item?.id) {
        alert(data?.error || "No se pudo crear el producto.");
        return;
      }
      await onCreado?.(data.item);
    } catch (e) {
      alert("No se pudo crear el producto: se cortó la conexión.");
    }
  };

  return (
    <>
      {error && <span className="text-sm3 sunmi-text-danger break-words">{error}</span>}
      <ModalProducto
        // Sin catálogos no se abre: el aviso queda en la hoja, a la vista.
        open={!cargando && !error}
        onClose={onCancelar}
        onSubmit={crear}
        catalogos={catalogos}
        initialData={precarga}
      />
    </>
  );
}
