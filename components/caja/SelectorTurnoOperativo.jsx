"use client";

// components/caja/SelectorTurnoOperativo.jsx
//
// ELEGIR EL TURNO OPERATIVO AL ABRIR LA CAJA.
//
// Los turnos son los ACTIVOS del catálogo del local —Mañana, Tarde, Noche, o
// los que use—, todos a la vista, con `SunmiFiltroEstado`. No se preselecciona
// ninguno, ni siquiera si hay uno solo: el turno se ELIGE, no se deduce. Y no
// hay horas: la pantalla no adivina el turno por la hora del celular.
//
// La fecha operativa la fija el servidor. Esta pieza la recibe con el catálogo
// y la devuelve en `onCambiar`, para que la apertura la mande y el servidor
// rechace una pantalla que quedó abierta desde ayer.

import { useEffect, useState } from "react";

import SunmiFiltroEstado from "@/components/sunmi/SunmiFiltroEstado";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiAviso from "@/components/sunmi/SunmiAviso";

/** Las opciones del filtro: una por turno activo, en el orden del catálogo. */
export function opcionesDeTurnos(turnos = []) {
  return (turnos || []).filter((t) => t.activo !== false).map((t) => ({ clave: t.id, texto: t.nombre }));
}

/** El catálogo activo del local, con la fecha operativa del servidor. */
export function useTurnosOperativosActivos() {
  const [estado, setEstado] = useState({ cargando: true, turnos: [], fechaOperativa: null, error: "" });
  useEffect(() => {
    let vivo = true;
    fetch("/api/config/turnos-operativos?activos=1", { credentials: "include", cache: "no-store" })
      .then((r) => r.json().then((json) => ({ r, json })))
      .then(({ r, json }) => {
        if (!vivo) return;
        if (!r.ok || !json?.ok) {
          setEstado({ cargando: false, turnos: [], fechaOperativa: null, error: json?.error || "No se pudieron leer los turnos del local." });
          return;
        }
        setEstado({ cargando: false, turnos: json.turnos || [], fechaOperativa: json.fechaOperativa ?? null, error: "" });
      })
      .catch(() => vivo && setEstado({ cargando: false, turnos: [], fechaOperativa: null, error: "Sin conexión: no se pudieron leer los turnos del local." }));
    return () => {
      vivo = false;
    };
  }, []);
  return estado;
}

/**
 * @param {object} props
 * @param {number|null} props.valor            el id elegido
 * @param {(id:number, fechaOperativa:string|null) => void} props.onCambiar
 * @param {object} props.catalogo              lo de `useTurnosOperativosActivos()`
 */
export default function SelectorTurnoOperativo({ valor, onCambiar, catalogo }) {
  const { cargando, turnos, fechaOperativa, error } = catalogo;
  if (cargando) return <SunmiLoader />;
  if (error) return <SunmiAviso tono="danger">{error}</SunmiAviso>;
  const opciones = opcionesDeTurnos(turnos);
  if (!opciones.length) {
    return (
      <SunmiAviso tono="warning" titulo="Este local no tiene turnos operativos">
        Sin turno no se puede abrir caja. Quien tenga permiso de configuración del POS los da de alta en Configuración → POS →
        Turnos operativos.
      </SunmiAviso>
    );
  }
  return (
    <SunmiFiltroEstado
      rotulo="¿De qué turno es esta caja?"
      opciones={opciones}
      valor={valor}
      onCambiar={(id) => onCambiar?.(id, fechaOperativa)}
    />
  );
}
