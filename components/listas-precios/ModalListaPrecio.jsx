"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiToggle from "@/components/sunmi/SunmiToggle";
import SunmiButton from "@/components/sunmi/SunmiButton";

// ============================================================
// Modal Crear / Editar Lista de Precio
// Patrón inspirado en components/categorias/ModalCategoria.jsx
// ============================================================
export default function ModalListaPrecio({
  open,
  mode, // "nuevo" | "editar"
  lista = null,
  onClose,
  onSaved,
  puedeEditar = true,
}) {
  const router = useRouter();

  // =========================
  // FORM STATE
  // =========================
  const [form, setForm] = useState({
    nombre: "",
    tipoBase: "PRECIO_VENTA",
    margenPorcentaje: "",
    esDefault: false,
    redondeo_100: false,
    notas: "",
  });

  const [loading, setLoading] = useState(false);
  const editMode = mode === "editar";

  // =========================
  // CARGA DATOS EN EDICIÓN / RESET EN NUEVO
  // =========================
  useEffect(() => {
    if (!open) return;

    if (editMode && lista) {
      setForm({
        nombre: lista.nombre || "",
        tipoBase: lista.tipoBase || "PRECIO_VENTA",
        margenPorcentaje:
          lista.margenPorcentaje === null || lista.margenPorcentaje === undefined
            ? ""
            : String(lista.margenPorcentaje),
        esDefault: Boolean(lista.esDefault),
        redondeo_100: Boolean(lista.redondeo_100),
        notas: lista.notas || "",
      });
    } else {
      setForm({
        nombre: "",
        tipoBase: "PRECIO_VENTA",
        margenPorcentaje: "",
        esDefault: false,
        redondeo_100: false,
        notas: "",
      });
    }
  }, [open, editMode, lista]);

  // =========================
  // SUBMIT
  // =========================
  const handleSubmit = async () => {
    try {
      if (!puedeEditar) return;

      // Validaciones cliente
      if (!form.nombre.trim()) {
        alert("El nombre es requerido");
        return;
      }

      let margenNum = null;
      if (form.margenPorcentaje !== "" && form.margenPorcentaje !== null) {
        const n = Number(form.margenPorcentaje);
        if (!Number.isFinite(n) || n < 0) {
          alert("El margen debe ser un número mayor o igual a 0");
          return;
        }
        margenNum = n;
      }

      setLoading(true);

      let url;
      let method;
      let payload;

      if (editMode) {
        // Solo enviar campos cambiados
        const diff = {};
        if ((lista?.nombre || "") !== form.nombre.trim()) {
          diff.nombre = form.nombre.trim();
        }
        if ((lista?.tipoBase || "PRECIO_VENTA") !== form.tipoBase) {
          diff.tipoBase = form.tipoBase;
        }
        // Margen: comparar normalizado
        const margenOriginal =
          lista?.margenPorcentaje === null || lista?.margenPorcentaje === undefined
            ? null
            : Number(lista.margenPorcentaje);
        if (margenOriginal !== margenNum) {
          diff.margenPorcentaje = margenNum;
        }
        if (Boolean(lista?.esDefault) !== form.esDefault) {
          diff.esDefault = form.esDefault;
        }
        if (Boolean(lista?.redondeo_100) !== form.redondeo_100) {
          diff.redondeo_100 = form.redondeo_100;
        }
        const notasOriginal = lista?.notas || "";
        if (notasOriginal !== form.notas) {
          diff.notas = form.notas.trim() || null;
        }

        if (Object.keys(diff).length === 0) {
          // No hubo cambios, no llamar a la API
          setLoading(false);
          onClose?.();
          return;
        }

        url = `/api/listas-precios/editar/${lista.id}`;
        method = "PUT";
        payload = diff;
      } else {
        url = "/api/listas-precios/crear";
        method = "POST";
        payload = {
          nombre: form.nombre.trim(),
          tipoBase: form.tipoBase,
          margenPorcentaje: margenNum,
          esDefault: form.esDefault,
          redondeo_100: form.redondeo_100,
          notas: form.notas.trim() || null,
        };
      }

      const res = await fetch(url, {
        method,
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 401) {
        onClose?.();
        router.replace("/login");
        return;
      }

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        alert(data?.error || "Error al guardar la lista");
        return;
      }

      onSaved?.();
      onClose?.();
    } catch (e) {
      console.error("Error guardando lista de precios:", e);
      alert("Error al guardar la lista");
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // RENDER
  // =========================
  if (!open) return null;

  const mostrarMargen = form.tipoBase === "COSTO";

  return (
    <div
      className="
        fixed inset-0 z-50
        bg-black/50
        backdrop-blur-sm
        flex items-center justify-center
        p-4
      "
    >
      <SunmiCard className="w-full max-w-md p-0 overflow-hidden">
        <SunmiCardHeader
          title={editMode ? "Editar lista de precios" : "Nueva lista de precios"}
        />

        <div className="p-4 space-y-4">
          {/* NOMBRE */}
          <div>
            <label className="text-[11px] sunmi-label mb-1 block">Nombre</label>
            <SunmiInput
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              placeholder="Ej: Lista mayorista"
              disabled={!puedeEditar}
            />
          </div>

          {/* TIPO BASE */}
          <div>
            <label className="text-[11px] sunmi-label mb-1 block">Tipo base</label>
            <SunmiSelectAdv
              value={form.tipoBase}
              onChange={(v) =>
                setForm((f) => ({
                  ...f,
                  tipoBase: v,
                  // Si no es COSTO, limpiamos el margen para evitar confusión
                  margenPorcentaje: v === "COSTO" ? f.margenPorcentaje : "",
                }))
              }
            >
              <SunmiSelectOption value="PRECIO_VENTA">Precio de venta</SunmiSelectOption>
              <SunmiSelectOption value="COSTO">Costo</SunmiSelectOption>
              <SunmiSelectOption value="MANUAL_AUTORIZADO">Manual autorizado</SunmiSelectOption>
            </SunmiSelectAdv>
          </div>

          {/* MARGEN (solo si tipoBase === COSTO) */}
          {mostrarMargen && (
            <div>
              <label className="text-[11px] sunmi-label mb-1 block">
                Margen sobre costo (%)
              </label>
              <SunmiInput
                type="number"
                step="0.5"
                min="0"
                value={form.margenPorcentaje}
                onChange={(e) =>
                  setForm((f) => ({ ...f, margenPorcentaje: e.target.value }))
                }
                placeholder="Ej: 30"
                disabled={!puedeEditar}
              />
            </div>
          )}

          <SunmiSeparator />

          {/* TOGGLE DEFAULT */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] sunmi-label">Default del grupo</span>
            <SunmiToggle
              value={form.esDefault}
              onChange={(v) => setForm((f) => ({ ...f, esDefault: v }))}
            />
          </div>

          {/* TOGGLE REDONDEO */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] sunmi-label">
              Redondear hacia arriba a múltiplo de 100
            </span>
            <SunmiToggle
              value={form.redondeo_100}
              onChange={(v) => setForm((f) => ({ ...f, redondeo_100: v }))}
            />
          </div>

          <SunmiSeparator />

          {/* NOTAS */}
          <div>
            <label className="text-[11px] sunmi-label mb-1 block">Notas (opcional)</label>
            <SunmiInput
              value={form.notas}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
              placeholder="Descripción interna de la lista"
              disabled={!puedeEditar}
            />
          </div>

          <SunmiSeparator />

          {/* BOTONES */}
          <div className="flex justify-end gap-3">
            <SunmiButton color="slate" onClick={onClose}>
              Cancelar
            </SunmiButton>

            <SunmiButton
              onClick={handleSubmit}
              disabled={loading || !puedeEditar}
            >
              {loading ? "Guardando..." : "Guardar"}
            </SunmiButton>
          </div>
        </div>
      </SunmiCard>
    </div>
  );
}
