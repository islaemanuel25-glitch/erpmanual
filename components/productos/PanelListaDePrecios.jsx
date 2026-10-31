"use client";

// EL PANEL DE "DESCARGAR LISTA DE PRECIOS".
//
// Se abre desde el catálogo —el botón de escritorio y la hoja "Más" del
// celular— y pide tres cosas antes de bajar el PDF: la ubicación, el proveedor
// y el tipo. El PDF lo arma el servidor (`/api/productos/export` con
// `formato: "pdf"`), con los mismos filtros que el Excel de Import / Export.
//
// Todo lo que dibuja ya estaba en la pantalla: `SunmiModalLayout` para la capa,
// `SunmiSelectAdv` para los campos —el proveedor y el tipo son
// `CamposDeExportacion`, los mismos de la solapa— y `SunmiButton` para la
// acción. No hay ninguna pieza nueva.
//
// ── LA UBICACIÓN SE PUEDE CAMBIAR, PERO SOLO ENTRE LAS QUE SE PUEDEN VER ───
//
// Arranca en la que está elegida en el catálogo. Las opciones salen de
// `/api/locales/opciones`, la misma lista de la pantalla de elegir ubicación:
// un usuario que no es administrador tiene una sola, la suya. Y el servidor lo
// vuelve a controlar con `resolveScope`, así que una opción que no corresponde
// no baja nada aunque alguien la mande.
//
// ── UN ERROR SE DICE ACÁ, NO SE TRAGA ─────────────────────────────────────
//
// Si el servidor contesta mal, el panel muestra el mensaje debajo del botón y
// se queda abierto. Un botón que no hace nada al tocarlo es el defecto del
// INC-0006.

import { useEffect, useState } from "react";
import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import SunmiButton from "@/components/sunmi/SunmiButton";
import CamposDeExportacion from "@/components/productos/CamposDeExportacion";
import { descargar } from "@/lib/compartir/compartirArchivo";
import { nombreDeUbicacion } from "@/lib/ubicacionActiva";

/**
 * @param {bool} open
 * @param {func} onClose
 * @param {number} localId     la ubicación elegida en el catálogo
 * @param {object} catalogos   `{ PROVEEDORES, CATEGORIAS }`, los de la pantalla
 */
export default function PanelListaDePrecios({ open, onClose, localId, catalogos }) {
  const [ubicaciones, setUbicaciones] = useState([]);
  const [ubicacionId, setUbicacionId] = useState(localId ? String(localId) : "");
  const [proveedorId, setProveedorId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState("");

  // Cada vez que se abre, arranca en la ubicación del catálogo y sin error.
  useEffect(() => {
    if (!open) return;
    setUbicacionId(localId ? String(localId) : "");
    setError("");
    let vigente = true;
    fetch("/api/locales/opciones", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (!vigente) return;
        if (data.ok) setUbicaciones(data.items || []);
        else setError(data.error || "No se pudieron cargar las ubicaciones.");
      })
      .catch(() => vigente && setError("No se pudieron cargar las ubicaciones: sin conexión."));
    return () => {
      vigente = false;
    };
  }, [open, localId]);

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
          localId: Number(ubicacionId) || null,
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
          <SunmiButton color="cyan" onClick={bajar} disabled={bajando || !ubicacionId} className="w-full">
            {bajando ? "Armando el PDF..." : "Descargar PDF"}
          </SunmiButton>
          {error && <p className="text-sm2 sunmi-text-danger">{error}</p>}
        </div>
      }
    >
      <div>
        <label className="text-sm2 sunmi-text-muted mb-1 block">Ubicación</label>
        <SunmiSelectAdv value={ubicacionId} onChange={(val) => setUbicacionId(val)}>
          {ubicaciones.map((u) => (
            <option key={u.id} value={String(u.id)}>{nombreDeUbicacion(u)}</option>
          ))}
        </SunmiSelectAdv>
      </div>
      <CamposDeExportacion
        catalogos={catalogos}
        proveedorId={proveedorId}
        onProveedor={setProveedorId}
        categoriaId={categoriaId}
        onCategoria={setCategoriaId}
        rotuloCategoria="Tipo"
        textoTodasCategorias="Todos"
      />
    </SunmiModalLayout>
  );
}
