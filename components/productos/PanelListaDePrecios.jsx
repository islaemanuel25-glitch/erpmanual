"use client";

// EL PANEL DE "DESCARGAR LISTA DE PRECIOS".
//
// Se abre desde el catálogo —el botón de escritorio y la hoja "Más" del
// celular— y pide dos cosas antes de bajar el PDF: el proveedor y la
// categoría. El PDF lo arma el servidor (`/api/productos/export` con
// `formato: "pdf"`), con los mismos filtros que el Excel de Import / Export.
//
// Todo lo que dibuja ya estaba en la pantalla: `SunmiModalLayout` para la capa,
// `CamposDeExportacion` —los mismos campos de la solapa, acá con el buscador de
// `SunmiSelectAdv` prendido— y `SunmiButton` para la acción.
//
// ── LA UBICACIÓN ES LA DEL ENCABEZADO, Y NO SE ELIGE ───────────────────────
//
// Decidido por Emanuel el 2026-10-31: la lista se baja solo de la ubicación
// donde el usuario está parado, administrador incluido. El panel la muestra
// fija y la manda; el servidor la compara contra la actual del usuario y
// rechaza cualquier otra.
//
// ── UN ERROR SE DICE ACÁ, NO SE TRAGA ─────────────────────────────────────
//
// Si el servidor contesta mal, el panel muestra el mensaje debajo del botón y
// se queda abierto. Un botón que no hace nada al tocarlo es el defecto del
// INC-0006.

import { useEffect, useState } from "react";
import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiButton from "@/components/sunmi/SunmiButton";
import CamposDeExportacion from "@/components/productos/CamposDeExportacion";
import { descargar } from "@/lib/compartir/compartirArchivo";
import { nombreDeUbicacion } from "@/lib/ubicacionActiva";

/**
 * @param {bool} open
 * @param {func} onClose
 * @param {object} ubicacion   el contexto activo de la pantalla: `{ localId, nombre, esDeposito }`
 * @param {object} catalogos   `{ PROVEEDORES, CATEGORIAS }`, los de la pantalla
 */
export default function PanelListaDePrecios({ open, onClose, ubicacion, catalogos }) {
  const [proveedorId, setProveedorId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState("");

  // Cada vez que se abre, sin el error de la vez anterior.
  useEffect(() => {
    if (open) setError("");
  }, [open]);

  const localId = Number(ubicacion?.localId) || null;

  const bajar = async () => {
    setBajando(true);
    setError("");
    try {
      const res = await fetch("/api/productos/export", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formato: "pdf",
          localId,
          proveedorId: proveedorId ? Number(proveedorId) : null,
          categoriaId: categoriaId ? Number(categoriaId) : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `El servidor no pudo armar la lista (error ${res.status}).`);
        return;
      }
      const blob = await res.blob();
      const hoy = new Date().toISOString().split("T")[0];
      descargar(blob, `lista-de-precios_${hoy}.pdf`);
      onClose?.();
    } catch {
      setError("No se pudo bajar la lista: sin conexión.");
    } finally {
      setBajando(false);
    }
  };

  return (
    <SunmiModalLayout
      open={open}
      onClose={onClose}
      title="Lista de precios"
      subtitle="PDF con el costo y la venta de cada producto"
      forma="hoja-o-centrado"
      z={9999}
      espacioCuerpo="mt-2 gap-3"
      maxWidth="max-w-xl"
      footer={
        <div className="flex flex-col gap-2">
          <SunmiButton color="cyan" onClick={bajar} disabled={bajando || !localId} className="w-full">
            {bajando ? "Armando el PDF..." : "Descargar PDF"}
          </SunmiButton>
          {error && <p className="text-sm2 sunmi-text-danger">{error}</p>}
        </div>
      }
    >
      <div>
        <label className="text-sm2 sunmi-text-muted mb-1 block">Ubicación</label>
        <p className="text-sm3 sunmi-text-strong">{ubicacion ? nombreDeUbicacion(ubicacion) : "—"}</p>
      </div>
      <CamposDeExportacion
        catalogos={catalogos}
        proveedorId={proveedorId}
        onProveedor={setProveedorId}
        categoriaId={categoriaId}
        onCategoria={setCategoriaId}
        buscable
      />
    </SunmiModalLayout>
  );
}
