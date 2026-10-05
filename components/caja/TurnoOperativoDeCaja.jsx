"use client";

// components/caja/TurnoOperativoDeCaja.jsx
//
// EL TURNO OPERATIVO DE LA CAJA ABIERTA, DEBAJO DE "POS Ventas".
//
// Se dibuja en la bajada del shell (`useBajadaDePagina`), pegada al título y
// fuera de la barra de acciones de la caja. Dice "Turno <nombre>" con el nombre
// que configuró el local (`rotuloDeTurno`), o "Sin turno asignado" para una
// caja que se abrió sin turno —esa no se corrige: no hay backfill—.
//
// Tocarlo abre una hoja para CORREGIR el turno de la caja: quien abrió eligiendo
// el turno equivocado lo cambia sin cerrar la caja. Las opciones las da el
// servidor y son las que el ciclo del local ofrecía al ABRIR esta caja; la
// fecha operativa también la calcula él. La pantalla solo manda el turno
// elegido. Reclasifica la caja entera: sus ventas y movimientos no se tocan.

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import SunmiAviso from "@/components/sunmi/SunmiAviso";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiFiltroEstado from "@/components/sunmi/SunmiFiltroEstado";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import { ROTULO_SIN_TURNO, rotuloDeTurno } from "@/lib/caja/turnoOperativo";
import { fechaOperativaLegible, opcionesDeTurnos } from "@/components/caja/SelectorTurnoOperativo";

/** La ruta de la corrección, para una caja. */
export const rutaTurnoOperativoDeCaja = (cajaId) => `/api/pos-ventas/turnos/${cajaId}/turno-operativo`;

/**
 * @param {object} props
 * @param {{id:number, turnoOperativo:{id:number, nombre:string}|null}} props.caja  la caja abierta del POS
 * @param {(caja:object) => void} props.onCorregido  la clasificación nueva, como la devuelve el servidor
 * @param {() => void} [props.onRequiereOperador]  sin operario activo (428): el POS pide el PIN
 */
export default function TurnoOperativoDeCaja({ caja, onCorregido, onRequiereOperador }) {
  const [hoja, setHoja] = useState(null); // null = cerrada; si no, { cargando, opciones, elegido, error, guardando }

  if (!caja?.turnoOperativo) {
    return <span className="sunmi-text-muted">{ROTULO_SIN_TURNO}</span>;
  }

  const actualId = caja.turnoOperativo.id;
  const cerrar = () => setHoja(null);

  const abrir = async () => {
    setHoja({ cargando: true, opciones: [], elegido: actualId, error: "", guardando: false });
    try {
      const res = await fetch(rutaTurnoOperativoDeCaja(caja.id), { credentials: "include", cache: "no-store" });
      if (res.status === 428) {
        cerrar();
        onRequiereOperador?.();
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setHoja((h) => h && { ...h, cargando: false, error: json?.error || "No se pudieron leer los turnos de esta caja." });
        return;
      }
      setHoja((h) => h && {
        ...h,
        cargando: false,
        opciones: json.opciones || [],
        error: json.corregible ? "" : json.motivo?.error || "El turno de esta caja no se puede corregir.",
      });
    } catch {
      setHoja((h) => h && { ...h, cargando: false, error: "Sin conexión: no se pudieron leer los turnos de esta caja." });
    }
  };

  const confirmar = async () => {
    if (!hoja || hoja.elegido === actualId) {
      cerrar();
      return;
    }
    setHoja((h) => ({ ...h, guardando: true, error: "" }));
    try {
      const res = await fetch(rutaTurnoOperativoDeCaja(caja.id), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ turnoOperativoId: hoja.elegido }),
      });
      if (res.status === 428) {
        cerrar();
        onRequiereOperador?.();
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setHoja((h) => h && { ...h, guardando: false, error: json?.error || "No se pudo corregir el turno de la caja." });
        return;
      }
      cerrar();
      onCorregido?.(json.caja);
    } catch {
      setHoja((h) => h && { ...h, guardando: false, error: "Sin conexión: el turno de la caja no se cambió." });
    }
  };

  const elegida = hoja?.opciones?.find((o) => o.id === hoja.elegido);

  return (
    <>
      <SunmiButton
        color="ghost"
        onClick={abrir}
        aria-haspopup="dialog"
        aria-label={`${rotuloDeTurno(caja.turnoOperativo.nombre)}. Corregir el turno de esta caja`}
        className="min-h-0 max-w-full px-0 py-1 gap-1 text-sm3"
      >
        <span className="truncate">{rotuloDeTurno(caja.turnoOperativo.nombre)}</span>
        <ChevronDown size={14} aria-hidden="true" className="shrink-0" />
      </SunmiButton>

      <SunmiModalLayout
        open={Boolean(hoja)}
        title="Cambiar turno"
        color="cyan"
        onClose={hoja?.guardando ? undefined : cerrar}
        showCloseButton={false}
        maxWidth="max-w-sm"
        forma="hoja-o-centrado"
        espacioCuerpo="gap-3"
        z={9999}
        footer={
          <div className="flex gap-2 w-full border-t sunmi-divider pt-3">
            <SunmiButton color="slate" onClick={cerrar} disabled={hoja?.guardando} className="flex-1 min-h-toque">
              Cancelar
            </SunmiButton>
            <SunmiButton
              color="primary"
              onClick={confirmar}
              disabled={!hoja || hoja.cargando || hoja.guardando || !hoja.opciones.length}
              className="flex-1 min-h-toque font-bold"
            >
              {hoja?.guardando ? "Guardando…" : "Confirmar"}
            </SunmiButton>
          </div>
        }
      >
        <p className="text-sm2 sunmi-text-muted">
          Corrige el turno de esta caja. Sus ventas y movimientos siguen en la misma caja.
        </p>
        {hoja?.cargando ? (
          <SunmiLoader />
        ) : (
          hoja?.opciones?.length > 0 && (
            <SunmiFiltroEstado
              rotulo="Turno de esta caja"
              opciones={opcionesDeTurnos(hoja.opciones)}
              valor={hoja.elegido}
              onCambiar={(id) => setHoja((h) => ({ ...h, elegido: id }))}
            />
          )
        )}
        {elegida && fechaOperativaLegible(elegida.fechaOperativa) && (
          <p className="text-sm2 sunmi-text-muted">Fecha operativa {fechaOperativaLegible(elegida.fechaOperativa)}</p>
        )}
        {hoja?.error && <SunmiAviso tono="danger">{hoja.error}</SunmiAviso>}
      </SunmiModalLayout>
    </>
  );
}
