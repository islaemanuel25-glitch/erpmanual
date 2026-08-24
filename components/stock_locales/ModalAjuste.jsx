"use client";

import { useState, useEffect, useRef } from "react";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import { toUnidades, fromUnidades } from "@/lib/conversiones/stock";
import { useNumberInputHandlers } from "@/hooks/useNumberInputHandlers";

export default function ModalAjuste({ open, onClose, producto, local }) {
  // Hooks deben ejecutarse siempre, antes de cualquier return condicional
  const [bultos, setBultos] = useState("");
  const [sueltas, setSueltas] = useState("");
  const [tipo, setTipo] = useState("sumar");
  const [motivo, setMotivo] = useState("");
  const cantidadRef = useRef(null);

  useEffect(() => {
    if (open) {
      setBultos("");
      setSueltas("");
      setTipo("sumar");
      setMotivo("");
      // Autofocus y seleccionar al abrir
      setTimeout(() => {
        cantidadRef.current?.focus();
        cantidadRef.current?.select();
      }, 50);
    }
  }, [open]);

  // Handlers de input numérico + lock de scroll del body (hook compartido).
  const { handleWheel, handleFocus, handleBlur } = useNumberInputHandlers(open);

  // Validación después de los hooks
  if (!open || !producto) return null;

  const factorPack = Number(producto.factorPack || producto.factor_pack || 1);
  const unidadMedida = producto.unidadMedida || producto.unidad_medida || "unidad";
  const esDeposito = local?.esDeposito || local?.es_deposito || false;
  const usarBultos = esDeposito && factorPack > 1 && (unidadMedida === "pack" || unidadMedida === "cajon");

  // Calcular total en unidades
  const totalUnidades = usarBultos
    ? toUnidades({
        cantidad: Number(bultos || 0),
        unidad: "BULTO",
        factorPack,
      }) + Number(sueltas || 0)
    : Number(sueltas || bultos || 0);

  const guardar = async () => {
    const cantidadInvalida =
      tipo === "fijar" ? totalUnidades < 0 : totalUnidades <= 0;
    if (cantidadInvalida) {
      alert(
        tipo === "fijar"
          ? "La cantidad no puede ser negativa"
          : "La cantidad debe ser mayor a 0"
      );
      return;
    }

    try {
      const body = {
        modo: "ajuste",
        localId: local.id,
        productoLocalId: producto.id,
        cantidad: totalUnidades, // Siempre en unidades para el backend
        tipo,
        motivo,
      };

      const res = await fetch("/api/stock_locales/ajustar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (json.ok) {
        onClose(true);
      } else {
        alert(json.error || "Error ajustando stock");
      }
    } catch (e) {
      console.error("AJUSTE ERROR:", e);
      alert("Error inesperado");
    }
  };

  // El modal lo arma el kit. Ver el comentario de `ModalLimites`: acá había el
  // mismo `fixed inset-0` a mano, con su velo y su encabezado propios.
  return (
    <SunmiModalLayout
      open={open}
      title="Ajustar stock"
      onClose={() => onClose(false)}
      maxWidth="max-w-md"
      // Ver el comentario de `ModalLimites`: los dos primeros no tienen default
      // a propósito, y `destructivo` conserva que tocar afuera NO cierre, que es
      // lo que hacía la capa a mano. Acá lo que se pierde es la cantidad
      // escrita y su motivo.
      espacioCuerpo="mt-2 gap-3"
      z={9999}
      destructivo
      footer={
        <SunmiButton color="amber" className="w-full" onClick={guardar}>
          Guardar ajuste
        </SunmiButton>
      }
    >
      <div>
        <div>

          {/* El nombre volvió al cuerpo: `SunmiModalLayout` declara `subtitle`
              pero no lo dibuja, así que pasarlo por ahí perdía de vista QUÉ
              producto se está ajustando. Se vio en la captura. */}
          <p className="text-sm2 font-medium sunmi-text-strong">
            {producto.nombre}
          </p>
          <p className="text-xs sunmi-text-muted">
            {local.nombre}
          </p>

          {(() => {
            const stockNum = Number(producto.stock || 0);
            if (usarBultos) {
              const presentacionLabel =
                unidadMedida === "cajon"
                  ? `Cajón x${factorPack}`
                  : `Pack x${factorPack}`;
              let stockActualLabel;
              if (stockNum < 0) {
                stockActualLabel = `${stockNum} uds`;
              } else if (stockNum === 0) {
                stockActualLabel = "0 uds";
              } else {
                const { bultos, sueltas } = fromUnidades({
                  unidades: stockNum,
                  factorPack,
                });
                if (bultos > 0 && sueltas > 0) {
                  stockActualLabel = `${bultos} bultos + ${sueltas} uds`;
                } else if (bultos > 0) {
                  stockActualLabel = `${bultos} bultos`;
                } else {
                  stockActualLabel = `${sueltas} uds`;
                }
              }
              return (
                <div className="text-[13px] mt-2 px-3 py-2 rounded sunmi-surface-soft">
                  <div className="text-[11px] sunmi-text-muted">
                    Presentación:{" "}
                    <span className="sunmi-text-strong">{presentacionLabel}</span>
                  </div>
                  <div>
                    Stock actual:{" "}
                    <strong className="sunmi-text-strong">{stockActualLabel}</strong>
                  </div>
                  <div className="text-[11px] sunmi-text-muted">
                    Total: {stockNum} unidades
                  </div>
                </div>
              );
            }
            return (
              <p className="text-[13px] mt-2 px-3 py-2 rounded sunmi-surface-soft">
                Stock actual:{" "}
                <strong className="sunmi-text-strong">
                  {unidadMedida === "kg"
                    ? `${stockNum.toFixed(3)} kg`
                    : `${Math.round(stockNum)} unidades`}
                </strong>
              </p>
            );
          })()}

          {/* Inputs */}
          <div className="flex flex-col gap-3 mt-4">
            {usarBultos ? (
              <>
                {/* Bultos + Sueltas */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] sunmi-label mb-1 block">
                      Bultos
                    </label>
                    <SunmiInput
                      ref={cantidadRef}
                      type="number"
                      placeholder="0"
                      min={0}
                      value={bultos}
                      onChange={(e) => setBultos(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && guardar()}
                      onWheel={handleWheel}
                      onFocus={handleFocus}
                      onBlur={handleBlur}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] sunmi-label mb-1 block">
                      Sueltas
                    </label>
                    <SunmiInput
                      type="number"
                      placeholder="0"
                      min={0}
                      max={factorPack - 1}
                      value={sueltas}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (val >= 0 && val < factorPack) {
                          setSueltas(e.target.value);
                        }
                      }}
                      onKeyDown={(e) => e.key === "Enter" && guardar()}
                      onWheel={handleWheel}
                      onFocus={handleFocus}
                      onBlur={handleBlur}
                    />
                  </div>
                </div>
                <p className="text-slate-400 text-[11px]">
                  Total: <strong className="text-slate-200">{totalUnidades} {unidadMedida === "kg" ? "kg" : "unidades"}</strong>
                </p>
              </>
            ) : (
              <>
                {/* Solo unidades / kg */}
                <div>
                  <label className="text-[11px] sunmi-label mb-1 block">
                    {unidadMedida === "kg" ? "Cantidad (kg)" : "Cantidad (unidades)"}
                  </label>
                  <SunmiInput
                    ref={cantidadRef}
                    type="number"
                    placeholder="0"
                    min={0}
                    step={unidadMedida === "kg" ? 0.001 : 1}
                    value={sueltas || bultos}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (unidadMedida !== "kg") {
                        const entero = raw === "" ? "" : String(parseInt(raw, 10) || 0);
                        setSueltas(entero);
                      } else {
                        setSueltas(raw);
                      }
                      setBultos("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && guardar()}
                    onWheel={handleWheel}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                  />
                </div>
              </>
            )}

            {/* Tipo */}
            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                <input
                  type="radio"
                  name="tipo-ajuste"
                  value="sumar"
                  checked={tipo === "sumar"}
                  onChange={() => setTipo("sumar")}
                  className="accent-cyan-500"
                />
                <span className="sunmi-text-strong">Sumar</span>
              </label>
              <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                <input
                  type="radio"
                  name="tipo-ajuste"
                  value="restar"
                  checked={tipo === "restar"}
                  onChange={() => setTipo("restar")}
                  className="accent-cyan-500"
                />
                <span className="sunmi-text-strong">Restar</span>
              </label>
              <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                <input
                  type="radio"
                  name="tipo-ajuste"
                  value="fijar"
                  checked={tipo === "fijar"}
                  onChange={() => setTipo("fijar")}
                  className="accent-cyan-500"
                />
                <span className="sunmi-text-strong">Fijar stock real</span>
              </label>
            </div>

            {/* Motivo */}
            <textarea
              className="sunmi-input h-20"
              placeholder="Motivo (opcional)"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>

          {/* El botón de guardar se fue al `footer` del layout. */}
        </div>
      </div>
    </SunmiModalLayout>
  );
}
