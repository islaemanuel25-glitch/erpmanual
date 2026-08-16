"use client";

// DESHACER UNA APLICACIÓN, con la previa a la vista antes de confirmar.
//
// Revertir escribe cientos de costos y arrastra precios de venta: los tres
// números que importan van arriba y en criollo, y el botón lleva el número
// adentro para que nadie apriete "revertir" sin saber cuántos son.
//
// Los omitidos van ABAJO y separados. No son un detalle técnico: son los
// productos que alguien tocó a mano después de aplicar, y que esta herramienta
// deja como están a propósito. Mezclarlos con los que vuelven haría creer que
// también se tocan.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Undo2 } from "lucide-react";

import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import { money } from "@/lib/proveedores/listas/presentacion";

/** Un número grande con su leyenda. Lo que se lee antes de decidir. */
function Numero({ valor, leyenda, tono = "sunmi-text-strong" }) {
  return (
    <div className="rounded-lg border sunmi-border p-2.5 min-w-0">
      <div className={`text-[22px] leading-none font-bold tabular-nums ${tono}`}>{valor}</div>
      <div className="text-[11px] sunmi-text-muted leading-tight mt-1">{leyenda}</div>
    </div>
  );
}

export default function ModalRevertir({ abierto, importacionId, onCerrar, onRevertido }) {
  const [cargando, setCargando] = useState(true);
  const [previa, setPrevia] = useState(null);
  const [error, setError] = useState("");
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    if (!abierto || !importacionId) return;
    let vivo = true;
    setCargando(true);
    setError("");
    setPrevia(null);
    (async () => {
      try {
        const r = await fetch(`/api/proveedores/listas/${importacionId}/revertir`, {
          credentials: "include",
          cache: "no-store",
        });
        const j = await r.json();
        if (!vivo) return;
        if (!r.ok || !j?.ok) setError(j?.error || "No se pudo calcular la reversión.");
        else setPrevia(j);
      } catch {
        if (vivo) setError("Error de conexión.");
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [abierto, importacionId]);

  const revertir = async () => {
    if (!previa) return;
    setTrabajando(true);
    setError("");
    try {
      const r = await fetch(`/api/proveedores/listas/${importacionId}/revertir`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        // Los mismos tres números que se están mostrando. El servidor los
        // recalcula y rechaza si cambiaron: la previa de hace un rato no escribe.
        body: JSON.stringify({
          confirmacion: {
            revierten: previa.resumen.revierten,
            ventasQueSeTocan: previa.resumen.ventasQueSeTocan,
            omitidos: previa.resumen.omitidos,
          },
        }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) {
        setError(j?.error || "No se pudo revertir.");
        return;
      }
      onRevertido?.(j);
    } catch {
      setError("Error de conexión.");
    } finally {
      setTrabajando(false);
    }
  };

  if (!abierto) return null;

  const r = previa?.resumen ?? null;
  const puede = !!r && r.revierten > 0 && !cargando && !trabajando;

  const contenido = (
    <SunmiModalLayout
      open={abierto}
      title="Deshacer esta aplicación"
      subtitle="Los productos vuelven al costo que tenían antes de aplicar esta lista."
      color="amber"
      onClose={trabajando ? undefined : onCerrar}
      maxWidth="max-w-2xl"
      // El valor que este modal ya tenía: era el default del kit y ahora se
      // declara, porque el kit dejó de tener uno. No cambia un píxel.
      espacioCuerpo="mt-2 gap-3"
      // El valor efectivo que esta pantalla ya tenía. El kit dejó de tener
      // default de `z`.
      z={9999}
      // Escribe cientos de costos: tocar el velo por error no puede cerrarlo.
      destructivo
      footer={
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <SunmiButton color="slate" onClick={onCerrar} disabled={trabajando} className="py-2 text-xs">
            No, volver
          </SunmiButton>
          <SunmiButton
            color="amber"
            onClick={revertir}
            disabled={!puede}
            className="py-2 font-bold text-xs inline-flex items-center gap-1"
          >
            <Undo2 size={14} aria-hidden="true" />
            {trabajando
              ? "Revirtiendo…"
              : cargando
                ? "Calculando…"
                : `Revertir los ${r?.revierten ?? 0} productos`}
          </SunmiButton>
        </div>
      }
    >
      {cargando ? (
        <div className="py-6 flex justify-center">
          <SunmiLoader />
        </div>
      ) : error ? (
        <div className="rounded-lg border sunmi-border p-3 flex items-start gap-2 sunmi-text-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div className="text-[12px] leading-snug">{error}</div>
        </div>
      ) : r ? (
        <>
          {/* Los tres números que importan, antes de confirmar. */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Numero
              valor={r.revierten}
              leyenda="productos vuelven al costo que tenían antes"
              tono="sunmi-text-accent"
            />
            <Numero valor={r.ventasQueSeTocan} leyenda="precios de venta se recalculan" />
            <Numero valor={r.filasQueVuelven} leyenda="filas vuelven a quedar pendientes" />
          </div>

          <p className="text-[11.5px] sunmi-text-muted leading-snug">
            El precio de venta vuelve donde todavía sea el que escribió esta lista. Donde alguien lo
            cambió a mano después, el costo vuelve igual y la venta se respeta. También vuelven{" "}
            {r.overridesQueSeTocan} precios por ubicación.
          </p>

          {/* Los que NO se tocan, aparte. */}
          {r.omitidos > 0 ? (
            <div className="rounded-lg border sunmi-border p-2.5">
              <div className="text-[12px] font-semibold sunmi-text-warning">
                {r.omitidos} {r.omitidos === 1 ? "producto queda" : "productos quedan"} como está
              </div>
              <div className="text-[10.5px] sunmi-text-muted mt-0.5">
                No se tocan porque su costo de hoy ya no es el que escribió esta lista.
              </div>
              {/* Mismo criterio que la muestra de abajo: renglones enteros y una
                  línea de cierre con el número real de cada ancho. Acá cada
                  omitido trae su motivo explicado, así que ocupa más y entran
                  menos. */}
              <ul className="mt-1.5 space-y-1">
                {previa.omitidos.slice(0, 6).map((o, n) => (
                  <li
                    key={o.productoBaseId}
                    className={`text-[10.5px] leading-snug ${n >= 2 ? "hidden sm:list-item" : ""}`}
                  >
                    <span className="sunmi-text-strong">{o.nombre ?? `Producto #${o.productoBaseId}`}</span>
                    <span className="sunmi-text-muted"> · {o.texto}</span>
                  </li>
                ))}
                {previa.omitidos.length > 2 ? (
                  <li className="text-[10.5px] sunmi-text-muted sm:hidden">
                    y {previa.omitidos.length - 2} más.
                  </li>
                ) : null}
                {previa.omitidos.length > 6 ? (
                  <li className="text-[10.5px] sunmi-text-muted hidden sm:list-item">
                    y {previa.omitidos.length - 6} más.
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {/* Una muestra de lo que se va a escribir.
             *
             * SE CORTA POR RENGLONES ENTEROS, nunca a mitad de un producto. Antes
             * eran cinco fijos y en la Sunmi el último quedaba partido al ras del
             * alto del modal: un renglón cortado sin indicio de scroll no se lee
             * como "hay más", se lee como que la pantalla se rompió.
             *
             * En 360 px cada producto ocupa dos o tres líneas, así que entran
             * tres; en escritorio entran cinco. El corte lo decide el ancho y la
             * línea de cierre dice cuántos quedaron afuera EN CADA CASO — por eso
             * son dos líneas y no una: el número real cambia con el ancho. */}
          {previa.items.length > 0 ? (
            <div className="rounded-lg border sunmi-border p-2.5">
              <div className="text-[10px] uppercase tracking-wide sunmi-text-muted">
                Algunos de los que vuelven
              </div>
              <ul className="mt-1 space-y-0.5">
                {previa.items.slice(0, 5).map((i, n) => (
                  <li
                    key={i.productoBaseId}
                    className={`text-[10.5px] leading-snug tabular-nums ${n >= 3 ? "hidden sm:list-item" : ""}`}
                  >
                    <span className="sunmi-text-strong">{i.nombre}</span>
                    <span className="sunmi-text-muted">
                      {" "}
                      · costo {money(i.costoActual)} → {money(i.costoDestino)}
                      {i.ventaDestino !== null
                        ? ` · venta ${money(i.ventaActual)} → ${money(i.ventaDestino)}`
                        : " · la venta no se toca"}
                    </span>
                  </li>
                ))}
                {previa.items.length > 3 ? (
                  <li className="text-[10.5px] sunmi-text-muted sm:hidden">
                    y {previa.items.length - 3} más.
                  </li>
                ) : null}
                {previa.items.length > 5 ? (
                  <li className="text-[10.5px] sunmi-text-muted hidden sm:list-item">
                    y {previa.items.length - 5} más.
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {r.revierten === 0 ? (
            <div className="rounded-lg border sunmi-border p-2.5 text-[11.5px] sunmi-text-muted">
              No hay nada para deshacer: ningún producto de esta importación conserva el costo que
              escribió la aplicación.
            </div>
          ) : null}
        </>
      ) : null}
    </SunmiModalLayout>
  );

  // Al body, para que el modal no herede el `overflow` ni el apilado de la
  // tabla donde vive el botón.
  return typeof document !== "undefined" ? createPortal(contenido, document.body) : null;
}
