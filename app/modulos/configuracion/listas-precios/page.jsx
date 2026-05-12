"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Star, Eye, Power } from "lucide-react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiButtonIcon from "@/components/sunmi/SunmiButtonIcon";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiBadgeEstado from "@/components/sunmi/SunmiBadgeEstado";
import SunmiPill from "@/components/sunmi/SunmiPill";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiToggle from "@/components/sunmi/SunmiToggle";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import ModalListaPrecio from "@/components/listas-precios/ModalListaPrecio";
import ModalPreviewPrecio from "@/components/listas-precios/ModalPreviewPrecio";

// ============================================================
// Helpers
// ============================================================
const tipoLabel = (tipo) => {
  if (tipo === "PRECIO_VENTA") return "Precio de venta";
  if (tipo === "COSTO") return "Costo";
  if (tipo === "MANUAL_AUTORIZADO") return "Manual";
  return tipo || "—";
};

// ============================================================
// Página: Listas de Precios
// ============================================================
export default function ListasPreciosPage() {
  const router = useRouter();
  const { perfil, cargando } = useUser();
  const { contexto } = useContextoActivo();
  const localIdFinal = contexto?.localId || null;

  const [listas, setListas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [incluirInactivas, setIncluirInactivas] = useState(false);

  const [modalCrearEditar, setModalCrearEditar] = useState({
    open: false,
    mode: "nuevo",
    lista: null,
  });
  const [modalPreview, setModalPreview] = useState({
    open: false,
    lista: null,
  });

  // =========================
  // CARGAR LISTAS
  // =========================
  const cargar = useCallback(async () => {
    if (!localIdFinal) return;
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("localId", String(localIdFinal));
      if (incluirInactivas) params.set("incluirInactivas", "true");
      const res = await fetch(`/api/listas-precios/listar?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });

      if (res.status === 401) {
        router.replace("/login");
        return;
      }

      const data = await res.json();
      if (!data?.ok) {
        setListas([]);
        alert(data?.error || "Error al cargar listas de precios");
        return;
      }
      setListas(data.items || []);
    } catch (e) {
      console.error("Error cargando listas de precios:", e);
      setListas([]);
      alert("Error al cargar listas de precios");
    } finally {
      setLoading(false);
    }
  }, [incluirInactivas, localIdFinal, router]);

  useEffect(() => {
    if (!perfil || !localIdFinal) return;
    cargar();
  }, [perfil, localIdFinal, cargar]);

  // =========================
  // PERMISOS (sanity)
  // =========================
  if (cargando) return null;

  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");
  if (!esAdmin && !permisos.includes("listas_precios.ver")) {
    return <SinPermisos />;
  }

  const puedeCrear = esAdmin || permisos.includes("listas_precios.crear");
  const puedeEditar = esAdmin || permisos.includes("listas_precios.editar");
  const puedeEliminar = esAdmin || permisos.includes("listas_precios.eliminar");

  // =========================
  // ACCIONES
  // =========================
  const abrirNuevo = () => {
    setModalCrearEditar({ open: true, mode: "nuevo", lista: null });
  };

  const abrirEditar = (lista) => {
    setModalCrearEditar({ open: true, mode: "editar", lista });
  };

  const cerrarModalCrearEditar = () => {
    setModalCrearEditar({ open: false, mode: "nuevo", lista: null });
  };

  const abrirPreview = (lista) => {
    setModalPreview({ open: true, lista });
  };

  const cerrarModalPreview = () => {
    setModalPreview({ open: false, lista: null });
  };

  const marcarDefault = async (lista) => {
    if (
      !confirm(
        `Marcar "${lista.nombre}" como default del grupo? La actual default perderá ese estado.`
      )
    ) {
      return;
    }
    try {
      const res = await fetch(
        `/api/listas-precios/marcar-default/${lista.id}?localId=${localIdFinal}`,
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
        }
      );
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        alert(data?.error || "Error al marcar como default");
        return;
      }
      cargar();
    } catch (e) {
      console.error("Error marcar default:", e);
      alert("Error al marcar como default");
    }
  };

  const toggleActivo = async (lista) => {
    const accion = lista.activo ? "desactivar" : "activar";
    if (!confirm(`¿${accion === "desactivar" ? "Desactivar" : "Activar"} la lista "${lista.nombre}"?`)) {
      return;
    }
    try {
      const res = await fetch(
        `/api/listas-precios/activar/${lista.id}?localId=${localIdFinal}`,
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
        }
      );
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        alert(data?.error || `Error al ${accion} la lista`);
        return;
      }
      cargar();
    } catch (e) {
      console.error("Error toggle activo:", e);
      alert("Error genérico");
    }
  };

  const eliminar = async (lista) => {
    if (!confirm(`¿Eliminar la lista "${lista.nombre}"? (queda inactiva)`)) {
      return;
    }
    try {
      const res = await fetch(
        `/api/listas-precios/eliminar/${lista.id}?localId=${localIdFinal}`,
        {
          method: "DELETE",
          credentials: "include",
          cache: "no-store",
        }
      );
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        alert(data?.error || "Error al eliminar la lista");
        return;
      }
      cargar();
    } catch (e) {
      console.error("Error eliminar:", e);
      alert("Error al eliminar la lista");
    }
  };

  // =========================
  // RENDER
  // =========================
  return (
    <div className="p-3 space-y-4">
      <SunmiCard className="p-0 overflow-hidden">
        <div className="p-3">
          <SunmiCardHeader title="Listas de precios">
            <div className="flex items-center gap-3">
              <SunmiToggle
                value={incluirInactivas}
                onChange={(v) => setIncluirInactivas(v)}
                label="Incluir inactivas"
              />
              <SunmiButton onClick={abrirNuevo} disabled={!puedeCrear}>
                <span className="inline-flex items-center gap-1">
                  <Plus size={14} /> Nueva lista
                </span>
              </SunmiButton>
            </div>
          </SunmiCardHeader>
        </div>

        <SunmiSeparator />

        {loading ? (
          <div className="p-6 flex justify-center">
            <SunmiLoader />
          </div>
        ) : (
          <SunmiTable
            headers={[
              "Nombre",
              "Tipo",
              "Margen",
              "Redondeo",
              "Default",
              "Estado",
              "Acciones",
            ]}
          >
            {listas.length === 0 ? (
              <SunmiTableEmpty message="No hay listas de precios" colSpan={7} />
            ) : (
              listas.map((l) => {
                const margenTxt =
                  l.tipoBase === "COSTO" &&
                  l.margenPorcentaje !== null &&
                  l.margenPorcentaje !== undefined
                    ? `${Number(l.margenPorcentaje)}%`
                    : "—";

                const redondeoTxt = l.redondeo_100 ? "✓ a 100" : "—";

                const puedeMarcarDefault =
                  puedeEditar && l.activo && !l.esDefault;

                return (
                  <SunmiTableRow key={l.id}>
                    <td className="px-3 py-2">{l.nombre}</td>
                    <td className="px-3 py-2">{tipoLabel(l.tipoBase)}</td>
                    <td className="px-3 py-2">{margenTxt}</td>
                    <td className="px-3 py-2">{redondeoTxt}</td>
                    <td className="px-3 py-2">
                      {l.esDefault ? <SunmiPill color="amber">Default</SunmiPill> : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <SunmiBadgeEstado value={l.activo} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        {/* Preview */}
                        <SunmiButtonIcon
                          icon={Eye}
                          color="slate"
                          onClick={() => abrirPreview(l)}
                        />

                        {/* Editar */}
                        {puedeEditar && (
                          <SunmiButtonIcon
                            icon={Pencil}
                            color="amber"
                            onClick={() => abrirEditar(l)}
                          />
                        )}

                        {/* Marcar default */}
                        {puedeMarcarDefault && (
                          <SunmiButtonIcon
                            icon={Star}
                            color="amber"
                            onClick={() => marcarDefault(l)}
                          />
                        )}

                        {/* Activar/desactivar */}
                        {puedeEditar && (
                          <SunmiButtonIcon
                            icon={Power}
                            color="slate"
                            onClick={() => toggleActivo(l)}
                          />
                        )}

                        {/* Eliminar */}
                        {puedeEliminar && (
                          <SunmiButtonIcon
                            icon={Trash2}
                            color="red"
                            onClick={() => eliminar(l)}
                          />
                        )}
                      </div>
                    </td>
                  </SunmiTableRow>
                );
              })
            )}
          </SunmiTable>
        )}
      </SunmiCard>

      {/* Modales */}
      <ModalListaPrecio
        open={modalCrearEditar.open}
        mode={modalCrearEditar.mode}
        lista={modalCrearEditar.lista}
        onClose={cerrarModalCrearEditar}
        onSaved={cargar}
        puedeEditar={puedeEditar}
      />

      <ModalPreviewPrecio
        open={modalPreview.open}
        lista={modalPreview.lista}
        onClose={cerrarModalPreview}
      />
    </div>
  );
}
