"use client";

import { useEffect, useState, useCallback } from "react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiButton from "@/components/sunmi/SunmiButton";

import useContextoActivo from "@/hooks/useContextoActivo";

// ============================================================
// Tarjeta: Lista predeterminada del DEPÓSITO activo.
// Solo define qué lista usa el POS del depósito cuando la venta NO tiene
// cliente con lista asignada. No afecta a los locales, ni a clientes, ni a esDefault.
// En un LOCAL normal muestra solo una aclaración (no hay default automática).
// ============================================================
const SIN_LISTA = "__SIN_LISTA__";

export default function CardDefaultDeposito({ puedeEditar = true }) {
  const { contexto } = useContextoActivo();
  const localId = contexto?.localId || null;
  const ubicacionNombre = contexto?.nombre || "esta ubicación";

  const [cfg, setCfg] = useState(null); // { esDeposito, listaPrecioDefaultId, listaActual, listasDisponibles }
  const [sel, setSel] = useState(SIN_LISTA);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const cargar = useCallback(async () => {
    if (!localId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/listas-precios/default-deposito?localId=${localId}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setCfg(null);
        return;
      }
      setCfg(data);
      setSel(data.listaPrecioDefaultId ? String(data.listaPrecioDefaultId) : SIN_LISTA);
    } catch {
      setCfg(null);
    } finally {
      setLoading(false);
    }
  }, [localId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardar = async () => {
    if (!puedeEditar) return;
    try {
      setSaving(true);
      const listaPrecioDefaultId = sel === SIN_LISTA ? null : Number(sel);
      const res = await fetch(`/api/listas-precios/default-deposito?localId=${localId}`, {
        method: "PUT",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listaPrecioDefaultId }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        alert(data?.error || "No se pudo guardar la configuración");
        return;
      }
      await cargar();
    } catch {
      alert("No se pudo guardar la configuración");
    } finally {
      setSaving(false);
    }
  };

  if (!localId || loading || !cfg) return null;

  // ── Local normal: solo aclaración ──
  if (!cfg.esDeposito) {
    return (
      <SunmiCard className="p-3">
        <p className="text-[12px] font-semibold">Listas comerciales en este local</p>
        <p className="text-[11px] text-slate-500 mt-1">
          Este local vende con el precio configurado en cada producto. Las listas comerciales
          solo se aplican cuando un cliente tiene una lista asignada.
        </p>
      </SunmiCard>
    );
  }

  // ── Depósito: selector de default ──
  const listaActualInactiva =
    cfg.listaPrecioDefaultId && cfg.listaActual && cfg.listaActual.activo === false;
  const efectivoTexto =
    cfg.listaPrecioDefaultId && cfg.listaActual?.activo
      ? `Actualmente el depósito vende por defecto con: ${cfg.listaActual.nombre}`
      : "Actualmente el depósito utiliza el precio normal de cada producto.";

  // ACÁ DECÍA `p-0` Y NUNCA SE APLICÓ: LA TARJETA DIBUJABA 21 px.
  //
  // `SunmiCard` concatenaba su `p-6`, y entre dos utilidades de la misma familia
  // decide el orden de la hoja de Tailwind y no el del atributo. Desde que la
  // pieza cede ante un pedido de cero, ese `p-0` empezaría a aplicarse — y acá
  // no corresponde.
  //
  // Las otras siete tarjetas que piden cero son TABLAS: el cero las hace ir de
  // borde a borde, que es para lo que está el `overflow-hidden`. Esta es un
  // FORMULARIO, y el cero le aprieta el título y el selector contra el marco.
  // Se miró en una captura antes de decidirlo.
  //
  // Queda declarado el `p-6` que ya venía dibujando, así que el código dice lo
  // que el navegador hace.
  //
  // Y el aire de toda la aplicación SÍ se apretó, en la tanda siguiente: las 86
  // tarjetas que pedían menos padding pasaron a aplicarlo. Ésta no entró, y no
  // por olvido — pedía cero, no menos aire, y el cero acá no dibuja una tabla.
  // Con el eje entero negociado, este `p-6` es lo único que la separa de quedar
  // con los campos pegados al marco. Tiene su candado.
  return (
    <SunmiCard className="p-6 overflow-hidden">
      <div className="p-3">
        <SunmiCardHeader title={`Lista predeterminada del depósito — ${ubicacionNombre}`} />
        <p className="text-[11px] text-slate-500 mt-1">
          Se aplicará en ventas del depósito que no tengan un cliente con lista asignada. No afecta
          a los locales.
        </p>
      </div>

      <SunmiSeparator />

      <div className="p-3 space-y-3">
        {listaActualInactiva && (
          <div className="rounded-lg border border-amber-400/50 bg-amber-50/50 dark:bg-amber-500/10 p-2">
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              La lista configurada (“{cfg.listaActual.nombre}”) está inactiva. El depósito está
              usando el precio normal de cada producto. Elegí otra lista o dejala en “Sin lista
              predeterminada”.
            </p>
          </div>
        )}

        <div>
          <label className="text-[11px] sunmi-label mb-1 block">Lista predeterminada</label>
          <SunmiSelectAdv value={sel} onChange={setSel}>
            <SunmiSelectOption value={SIN_LISTA}>Sin lista predeterminada</SunmiSelectOption>
            {cfg.listasDisponibles.map((l) => (
              <SunmiSelectOption key={l.id} value={String(l.id)}>
                {l.nombre}
              </SunmiSelectOption>
            ))}
          </SunmiSelectAdv>
        </div>

        <p className="text-[11px] text-slate-500">{efectivoTexto}</p>

        <div className="flex justify-end">
          <SunmiButton onClick={guardar} disabled={saving || !puedeEditar}>
            {saving ? "Guardando..." : "Guardar configuración"}
          </SunmiButton>
        </div>
      </div>
    </SunmiCard>
  );
}
