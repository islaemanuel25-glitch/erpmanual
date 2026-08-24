"use client";

import { useState, useEffect, useRef } from "react";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import { toUnidades, fromUnidades } from "@/lib/conversiones/stock";
import { useNumberInputHandlers } from "@/hooks/useNumberInputHandlers";

export default function ModalLimites({ open, onClose, producto, local }) {
  const [minimo, setMinimo] = useState("");
  const [maximo, setMaximo] = useState("");
  const minimoRef = useRef(null);

  const factorPack = Number(producto?.factorPack || producto?.factor_pack || 1);
  const unidadMedida = producto?.unidadMedida || producto?.unidad_medida || "unidad";
  const esDeposito = local?.esDeposito || local?.es_deposito || false;
  const usarBultos = esDeposito && factorPack > 1 && (unidadMedida === "pack" || unidadMedida === "cajon");

  useEffect(() => {
    if (open && producto) {
      // ── UN 0 CONFIGURADO SE DIBUJA COMO 0, NO COMO VACÍO ────────────────
      //
      // Acá decía `producto.stockMin || ""`, y con un límite en 0 eso daba
      // cadena vacía: el input se abría en blanco. Y como vacío ahora significa
      // "borrá el límite", abrir Límites y guardar sin tocar nada BORRABA un
      // cero puesto a propósito.
      //
      // Es la misma confusión que la tanda vino a cerrar, del lado de la
      // pantalla: `|| ""` no distingue el 0 del null porque los dos son falsy.
      const aTexto = (v) => (v === null || v === undefined ? "" : String(v));

      if (usarBultos) {
        // Mostrar en bultos: convertir unidades → bultos
        const minUds = producto.stockMin === null || producto.stockMin === undefined
          ? null : Number(producto.stockMin);
        const maxUds = producto.stockMax === null || producto.stockMax === undefined
          ? null : Number(producto.stockMax);
        setMinimo(minUds === null ? "" : String(fromUnidades({ unidades: minUds, factorPack }).bultos));
        setMaximo(maxUds === null ? "" : String(fromUnidades({ unidades: maxUds, factorPack }).bultos));
      } else {
        setMinimo(aTexto(producto.stockMin));
        setMaximo(aTexto(producto.stockMax));
      }
      // Autofocus y seleccionar al abrir
      setTimeout(() => {
        minimoRef.current?.focus();
        minimoRef.current?.select();
      }, 50);
    }
  }, [open, producto]);

  // Handlers de input numérico + lock de scroll del body (hook compartido).
  const { handleWheel, handleFocus, handleBlur } = useNumberInputHandlers(open);

  if (!open || !producto) return null;

  const guardar = async () => {
    try {
      // Si depósito pack, convertir bultos → unidades antes de enviar
      const minVal = minimo === "" ? null : Number(minimo);
      const maxVal = maximo === "" ? null : Number(maximo);

      const body = {
        modo: "limites",
        localId: local.id,
        productoLocalId: producto.id,
        nuevoMin: usarBultos && minVal != null
          ? toUnidades({ cantidad: minVal, unidad: "BULTO", factorPack })
          : minVal,
        nuevoMax: usarBultos && maxVal != null
          ? toUnidades({ cantidad: maxVal, unidad: "BULTO", factorPack })
          : maxVal,
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
        alert(json.error || "Error guardando límites");
      }
    } catch (e) {
      console.error("LÍMITES ERROR:", e);
      alert("Error inesperado");
    }
  };

  // ── EL MODAL LO ARMA EL KIT, NO ESTE ARCHIVO ────────────────────────────
  //
  // Acá había un `fixed inset-0 bg-black/50` a mano: su propio velo, su propia
  // capa, su propio encabezado y su propio botón de cerrar. Eso significa que en
  // un celular no traía nada de lo que `SunmiModalLayout` ya resuelve —cierre con
  // Escape, foco atrapado, alto máximo, comportamiento del velo— y que cualquier
  // cambio del kit no lo alcanzaba.
  //
  // El título y el subtítulo pasan a ser props: los dibuja el layout.
  return (
    <SunmiModalLayout
      open={open}
      title="Límites de stock"
      onClose={() => onClose(false)}
      maxWidth="max-w-md"
      // ── LOS TRES QUE EL KIT NO ADIVINA ──────────────────────────────────
      //
      // `espacioCuerpo` y `z` no tienen default a propósito: el kit obliga a
      // declararlos para que ningún modal nazca con un espaciado o una capa que
      // nadie decidió. Hay un candado que lo exige.
      //
      // `destructivo` es "no cerrar al tocar el velo", y acá CONSERVA el
      // comportamiento anterior: la capa hecha a mano no tenía `onClick`, así
      // que tocar afuera nunca cerró. Sin declararlo, migrar al kit habría
      // cambiado el comportamiento en vez de conservarlo — y lo que se pierde es
      // un formulario con los dos límites escritos.
      espacioCuerpo="mt-2 gap-3"
      z={9999}
      destructivo
      footer={
        <SunmiButton color="amber" className="w-full" onClick={guardar}>
          Guardar límites
        </SunmiButton>
      }
    >
      <div>
        {/* ── EL PRODUCTO VA EN EL CUERPO, NO EN `subtitle` ─────────────────
            `SunmiModalLayout` DECLARA la prop `subtitle` y no la dibuja: se
            acepta y se descarta. Se vio en la captura, no leyendo el código — el
            modal salía diciendo "Límites de stock" sin decir de qué producto.
            El modal a mano sí lo mostraba, así que pasarlo por ahí habría sido
            perder información al migrar. */}
        <div>
          <p className="text-sm2 font-medium sunmi-text-strong">{producto.nombre}</p>
          <p className="text-xs sunmi-text-muted">{local.nombre}</p>
        </div>
        <div>

          {/* Inputs */}
          <div className="flex flex-col gap-3 mt-4">

            {/* Min */}
            <div>
              <label className="text-[11px] sunmi-label mb-1 block">
                {usarBultos ? "Stock mínimo (bultos)" : "Stock mínimo"}
              </label>
              <SunmiInput
                ref={minimoRef}
                type="number"
                placeholder={usarBultos ? "0 bultos" : "0"}
                min={0}
                step={unidadMedida === "kg" ? 0.001 : 1}
                value={minimo}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (unidadMedida !== "kg") {
                    setMinimo(raw === "" ? "" : String(parseInt(raw, 10) || 0));
                  } else {
                    setMinimo(raw);
                  }
                }}
                onKeyDown={(e) => e.key === "Enter" && guardar()}
                onWheel={handleWheel}
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </div>

            {/* Max */}
            <div>
              <label className="text-[11px] sunmi-label mb-1 block">
                {usarBultos ? "Stock máximo (bultos)" : "Stock máximo"}
              </label>
              <SunmiInput
                type="number"
                placeholder={usarBultos ? "0 bultos" : "0"}
                min={0}
                step={unidadMedida === "kg" ? 0.001 : 1}
                value={maximo}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (unidadMedida !== "kg") {
                    setMaximo(raw === "" ? "" : String(parseInt(raw, 10) || 0));
                  } else {
                    setMaximo(raw);
                  }
                }}
                onKeyDown={(e) => e.key === "Enter" && guardar()}
                onWheel={handleWheel}
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </div>
          </div>

          {/* El botón de guardar se fue al `footer` del layout: así queda fijo
              abajo cuando el contenido scrollea, que en un celular importa. */}
        </div>
      </div>
    </SunmiModalLayout>
  );
}
