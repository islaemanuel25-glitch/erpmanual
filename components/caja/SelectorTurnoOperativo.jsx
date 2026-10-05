"use client";

// components/caja/SelectorTurnoOperativo.jsx
//
// EL TURNO OPERATIVO AL ABRIR LA CAJA.
//
// El servidor manda los turnos ACTIVOS del local y lo que reconoce la hora
// contra las ventanas que configuró el local (`reconocimiento`):
//
//   · UNICO   → el turno queda propuesto, sin pregunta extra, con la acción
//               «Cambiar turno» a la vista;
//   · NINGUNO → se pregunta, sin adivinar ni elegir el más cercano;
//   · VARIOS  → se pregunta, diciendo cuáles coinciden, sin elegir ninguno.
//
// Esta pieza no conoce nombres ni horarios: todo viene del catálogo. Y no
// calcula la fecha operativa: la muestra como la mandó el servidor para cada
// turno, y la apertura la vuelve a calcular con el turno FINAL.

import { useEffect, useState } from "react";

import SunmiFiltroEstado from "@/components/sunmi/SunmiFiltroEstado";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiPar from "@/components/sunmi/SunmiPar";
import { RECONOCIMIENTO } from "@/lib/caja/turnoOperativo";

/** Las opciones del filtro: una por turno activo, en el orden del catálogo. */
export function opcionesDeTurnos(turnos = []) {
  return (turnos || []).filter((t) => t.activo !== false).map((t) => ({ clave: t.id, texto: t.nombre }));
}

/**
 * El turno con que se abre: el que eligió la persona o, si no tocó nada y la
 * hora reconoció UN solo turno, el propuesto. Con cero o varias coincidencias
 * no hay turno hasta que la persona elige.
 */
export function turnoFinalDeApertura(elegidoId, catalogo) {
  if (elegidoId != null) return elegidoId;
  const r = catalogo?.reconocimiento;
  return r?.estado === RECONOCIMIENTO.UNICO ? r.sugeridoId : null;
}

/** "2026-10-05" → "05/10/2026". */
export function fechaOperativaLegible(iso) {
  const [a, m, d] = String(iso || "").split("-");
  return a && m && d ? `${d}/${m}/${a}` : "";
}

/** Los turnos activos del local, con el reconocimiento que hizo el servidor. */
export function useTurnosOperativosActivos() {
  const [estado, setEstado] = useState({ cargando: true, turnos: [], reconocimiento: null, error: "" });
  useEffect(() => {
    let vivo = true;
    fetch("/api/config/turnos-operativos?activos=1", { credentials: "include", cache: "no-store" })
      .then((r) => r.json().then((json) => ({ r, json })))
      .then(({ r, json }) => {
        if (!vivo) return;
        if (!r.ok || !json?.ok) {
          setEstado({ cargando: false, turnos: [], reconocimiento: null, error: json?.error || "No se pudieron leer los turnos del local." });
          return;
        }
        setEstado({ cargando: false, turnos: json.turnos || [], reconocimiento: json.reconocimiento ?? null, error: "" });
      })
      .catch(
        () =>
          vivo &&
          setEstado({ cargando: false, turnos: [], reconocimiento: null, error: "Sin conexión: no se pudieron leer los turnos del local." })
      );
    return () => {
      vivo = false;
    };
  }, []);
  return estado;
}

/**
 * @param {object} props
 * @param {number|null} props.valor        el turno final (`turnoFinalDeApertura`)
 * @param {(id:number) => void} props.onCambiar   el turno que eligió la persona
 * @param {object} props.catalogo          lo de `useTurnosOperativosActivos()`
 */
export default function SelectorTurnoOperativo({ valor, onCambiar, catalogo }) {
  const [cambiando, setCambiando] = useState(false);
  const { cargando, turnos, reconocimiento, error } = catalogo;
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

  const elegido = turnos.find((t) => t.id === valor) ?? null;
  if (elegido && !cambiando) {
    const propuesto = reconocimiento?.estado === RECONOCIMIENTO.UNICO && reconocimiento.sugeridoId === elegido.id;
    const fecha = fechaOperativaLegible(elegido.fechaOperativa);
    return (
      <div className="flex items-center justify-between gap-3">
        <SunmiPar
          arriba={`Turno: ${elegido.nombre}`}
          abajo={[propuesto ? "Propuesto por el horario del local" : "Elegido", fecha && `fecha operativa ${fecha}`].filter(Boolean).join(" · ")}
        />
        <SunmiButton color="slate" onClick={() => setCambiando(true)}>
          Cambiar turno
        </SunmiButton>
      </div>
    );
  }

  const candidatos =
    reconocimiento?.estado === RECONOCIMIENTO.VARIOS
      ? turnos.filter((t) => reconocimiento.candidatosIds.includes(t.id)).map((t) => t.nombre)
      : [];
  return (
    <div className="flex flex-col gap-2">
      {candidatos.length > 1 && (
        <SunmiAviso tono="neutral">
          A esta hora coinciden {candidatos.join(" y ")}. Elegí cuál estás abriendo.
        </SunmiAviso>
      )}
      <SunmiFiltroEstado
        rotulo="¿Qué turno operativo estás abriendo?"
        opciones={opciones}
        valor={valor}
        onCambiar={(id) => {
          setCambiando(false);
          onCambiar?.(id);
        }}
      />
    </div>
  );
}
