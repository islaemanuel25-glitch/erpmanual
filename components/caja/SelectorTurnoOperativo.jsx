"use client";

// components/caja/SelectorTurnoOperativo.jsx
//
// EL TURNO OPERATIVO AL ABRIR LA CAJA.
//
// El servidor manda SOLO los turnos que se pueden abrir a esta hora según el
// ciclo del local —la ocurrencia actual y la siguiente—, y lo que reconoce la
// hora contra las ventanas (`reconocimiento`):
//
//   · UNICO   → el turno queda propuesto, sin pregunta extra, con la acción
//               «Cambiar turno» a la vista;
//   · NINGUNO → se pregunta entre las opciones, sin adivinar;
//   · VARIOS  → se pregunta, diciendo cuáles coinciden, sin elegir ninguno.
//
// Si el ciclo no se puede resolver (`bloqueo`), se dice qué falta configurar
// y no se ofrece nada. Esta pieza no conoce nombres ni horarios, no filtra
// turnos ni calcula fechas: muestra lo que mandó el servidor, que vuelve a
// validar y calcular todo con el turno FINAL.

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
  if (catalogo?.bloqueo) return null;
  if (elegidoId != null) return elegidoId;
  const r = catalogo?.reconocimiento;
  const ofrecido = (catalogo?.turnos || []).some((t) => t.id === r?.sugeridoId);
  return r?.estado === RECONOCIMIENTO.UNICO && ofrecido ? r.sugeridoId : null;
}

/** "2026-10-05" → "05/10/2026". */
export function fechaOperativaLegible(iso) {
  const [a, m, d] = String(iso || "").split("-");
  return a && m && d ? `${d}/${m}/${a}` : "";
}

/** Los turnos que se pueden abrir ahora, con el reconocimiento que hizo el servidor. */
export function useTurnosOperativosActivos() {
  const [estado, setEstado] = useState({ cargando: true, turnos: [], reconocimiento: null, bloqueo: null, error: "" });
  useEffect(() => {
    let vivo = true;
    fetch("/api/config/turnos-operativos?activos=1", { credentials: "include", cache: "no-store" })
      .then((r) => r.json().then((json) => ({ r, json })))
      .then(({ r, json }) => {
        if (!vivo) return;
        if (!r.ok || !json?.ok) {
          setEstado({ cargando: false, turnos: [], reconocimiento: null, bloqueo: null, error: json?.error || "No se pudieron leer los turnos del local." });
          return;
        }
        setEstado({
          cargando: false,
          turnos: json.turnos || [],
          reconocimiento: json.reconocimiento ?? null,
          bloqueo: json.bloqueo ?? null,
          error: "",
        });
      })
      .catch(
        () =>
          vivo &&
          setEstado({ cargando: false, turnos: [], reconocimiento: null, bloqueo: null, error: "Sin conexión: no se pudieron leer los turnos del local." })
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
  const { cargando, turnos, reconocimiento, bloqueo, error } = catalogo;
  if (cargando) return <SunmiLoader />;
  if (error) return <SunmiAviso tono="danger">{error}</SunmiAviso>;
  if (bloqueo) {
    return (
      <SunmiAviso tono="warning" titulo="No se puede saber qué turno abrir">
        {bloqueo.error}
      </SunmiAviso>
    );
  }
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
