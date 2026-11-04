"use client";

// CREAR EL PRODUCTO DESDE UN RENGLÓN DE LA LISTA QUE NO EXISTE EN EL CATÁLOGO.
//
// Es la HERMANA de `components/compras-proveedor/AltaDesdeElPapel.jsx`, copiada
// tal cual (Emanuel, 2026-11-04: "exactamente igual a la recepción"). Lo único
// que cambia es de dónde sale la precarga: `precargaDelAltaDesdeLaLista`, que
// lee una `ImportacionListaFila` en vez de un renglón del papel.
//
// No hay formulario nuevo: es `ModalProductoFinal`, el de "Nuevo producto" de
// Productos, sin tocarlo. Los catálogos salen de los mismos tres endpoints y el
// alta va por la misma ruta, `/api/productos/crear`, que revalida el permiso de
// crear productos y decide sola dónde se da de alta (depósito y locales).
//
// Al crear, devuelve el producto a quien lo abrió, que lo VINCULA por
// `filas/[filaId]/vincular`. Cancelar no crea nada.

import { useEffect, useMemo, useState } from "react";

import ModalProducto from "@/components/productos/ModalProductoFinal";
import useContextoActivo from "@/hooks/useContextoActivo";
import {
  codigoDelProveedorParaElAltaDesdeLaLista,
  precargaDelAltaDesdeLaLista,
} from "@/lib/proveedores/listas/altaDesdeLaLista";

export default function AltaDesdeLaLista({ fila, proveedorId, onCreado, onCancelar }) {
  const { contexto } = useContextoActivo();
  const localId = contexto?.localId || 0;
  const [catalogos, setCatalogos] = useState({ CATEGORIAS: [], PROVEEDORES: [], AREAS: [] });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  // Memorizada: el formulario se reinicia cada vez que cambia su `initialData`.
  const precarga = useMemo(() => precargaDelAltaDesdeLaLista({ fila, proveedorId }), [fila, proveedorId]);

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
        codigoProveedorAlCrear={codigoDelProveedorParaElAltaDesdeLaLista(fila)}
      />
    </>
  );
}
