"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiToggle from "@/components/sunmi/SunmiToggle";
import SunmiButton from "@/components/sunmi/SunmiButton";

import useContextoActivo from "@/hooks/useContextoActivo";

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
  const { contexto } = useContextoActivo();
  const localIdFinal = contexto?.localId || null;

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

      if (!localIdFinal) {
        alert("Activá un local desde la pantalla de Inicio para gestionar listas.");
        return;
      }

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
        // esDefault ya no se manda: el control se sacó de la pantalla y el valor
        // que tenga la lista se conserva como está. Ver el comentario del bloque
        // que estaba abajo del separador.
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
        payload = { ...diff, localId: localIdFinal };
      } else {
        url = "/api/listas-precios/crear";
        method = "POST";
        payload = {
          nombre: form.nombre.trim(),
          tipoBase: form.tipoBase,
          margenPorcentaje: margenNum,
          // Una lista nueva nace sin la marca: el control se sacó de la pantalla
          // porque ningún camino de venta la lee. El endpoint sigue aceptando el
          // campo, pero ya nadie se lo manda desde acá.
          redondeo_100: form.redondeo_100,
          notas: form.notas.trim() || null,
          localId: localIdFinal,
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

  const mostrarMargen = form.tipoBase === "COSTO";

  return (
    <SunmiModalLayout
      open={open}
      title={editMode ? "Editar lista de precios" : "Nueva lista de precios"}
      onClose={onClose}
      // El valor efectivo que esta pantalla ya tenía. El kit dejó de tener
      // default de `z`.
      z={9999}
      // Es un formulario: un toque al costado con media pantalla escrita tiraría
      // lo escrito, y en el teléfono ese toque pasa solo.
      destructivo
      // El ancho de esta pantalla es `max-w-md`, no el `max-w-xl` del kit.
      maxWidth="max-w-md"
      // El cuerpo trae su propio padding y su propia separación de campos.
      // Medido antes de migrar: el paso de bloque a `flex flex-col` no mueve
      // nada acá, cero píxeles a 1366 y a 360.
      espacioCuerpo="p-4 space-y-4"
    >
        <>
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

          {/* El toggle "Default del grupo" se sacó de acá.
              Escribía ListaPrecio.esDefault, que NINGÚN camino de venta lee: lo
              dice el propio motor en lib/precios/resolverListaCliente.js:10.
              Alguien lo marcaba, creía haber cambiado los precios de la
              ubicación, y no había cambiado nada.
              La lista que sí se aplica se elige en la tarjeta "Lista
              predeterminada del depósito", que escribe
              GrupoDeposito.listaPrecioDefaultId.
              La columna NO se borró ni se migró: el dato queda por si algún día
              se conecta. Reconectarlo toca la resolución de precio y es una
              tanda propia — ver docs/roadmap/README.md. */}

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
        </>
    </SunmiModalLayout>
  );
}
