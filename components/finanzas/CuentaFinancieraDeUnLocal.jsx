"use client";

// components/finanzas/CuentaFinancieraDeUnLocal.jsx
//
// LA PANTALLA DE ADENTRO DE UN LOCAL. **UNA SOLA, PARA LOS DOS QUE LA MIRAN.**
//
// El depósito llega por la lista de locales; un local llega directo a la suya.
// Lo único que los separa es cómo se llega, y eso vive en el RUTEO —la página de
// `[localId]` para uno, `TableroFinanzas` para el otro—. Esta pieza recibe los
// datos ya resueltos y no sabe quién la está mirando.
//
// Es la misma decisión que tomó la cuenta de Transferencias, y está tomada de
// entrada por lo que allá costó descubrirla: había dos pantallas para la misma
// pregunta y una se quedó atrás mostrando el período equivocado.
//
// ── "OTRO" SE DIBUJA APAGADO ─────────────────────────────────────────────
//
// El chip existe y todavía no hay selector de rango: ni calendario acá, ni
// `desde`/`hasta` en el endpoint. Las dos alternativas eran peores —no dibujarlo
// cambia el ancho de los otros tres, y dejarlo caer a Semana muestra un período
// distinto del que se eligió—. Apagado dice la verdad.

import { useState } from "react";

import ChipsDePeriodo, { CLAVE_OTRO } from "@/components/transferencias/ChipsDePeriodo";
import NavegadorDePeriodo from "@/components/transferencias/NavegadorDePeriodo";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";
import { recortarActividad } from "@/lib/finanzas/presentacionResumen";

import DiaDeActividad from "./DiaDeActividad";
import ResumenDelPeriodo from "./ResumenDelPeriodo";

/**
 * Los chips que no se pueden usar todavía. Es una constante del módulo y no un
 * arreglo escrito en el JSX: así no se crea uno nuevo en cada render y, sobre
 * todo, el día que "Otro" se implemente se borra de UN lugar.
 */
export const CHIPS_APAGADOS = Object.freeze([CLAVE_OTRO]);

/**
 * LA ACTIVIDAD EN EL RESUMEN: los primeros tres hechos, y una puerta al resto.
 *
 * En el Resumen la actividad acompaña, no compite con el Resultado: se muestran
 * los tres primeros HECHOS del período —en el orden canónico que ya arma el
 * servidor, día por día— y "Ver toda la actividad" expande en el lugar el resto,
 * que es la lista completa de siempre. El recorte es SOLO de presentación: no
 * cambia la fuente, no reordena y no crea una segunda lógica de actividad —vive
 * en `recortarActividad`, con su candado—.
 */
function ActividadDelResumen({ actividad, onAbrirTurno }) {
  const [verTodo, setVerTodo] = useState(false);

  if (!actividad.length) {
    // EL PERÍODO VACÍO EXISTE. El rango es una cuenta de calendario, no de
    // datos: decir "no hay período" sería falso. Lo hay, y no pasó nada, que es
    // una respuesta distinta y es la verdadera.
    return (
      <div className="text-center py-12 sunmi-text-muted text-xs">
        No hubo turnos ni movimientos de caja en este período.
      </div>
    );
  }

  const { dias, hayMas } = recortarActividad(actividad, verTodo ? null : 3);

  return (
    <>
      {dias.map((dia) => (
        <DiaDeActividad key={dia.clave} dia={dia} onAbrirTurno={onAbrirTurno} />
      ))}
      {hayMas && !verTodo && (
        <div className="flex justify-end py-2">
          <SunmiLinkButton onClick={() => setVerTodo(true)}>Ver toda la actividad ›</SunmiLinkButton>
        </div>
      )}
    </>
  );
}

export default function CuentaFinancieraDeUnLocal({
  datos,
  cargando = false,
  error = "",
  unidad,
  onCambiarUnidad,
  onAtras,
  onAdelante,
  onAbrirTurno,
}) {
  const periodo = datos?.periodo;
  const actividad = datos?.actividad || [];

  return (
    <>
      <ChipsDePeriodo
        valor={unidad}
        onCambiar={onCambiarUnidad}
        deshabilitadas={CHIPS_APAGADOS}
      />

      {periodo?.descripcion && (
        <NavegadorDePeriodo
          titulo={periodo.descripcion.titulo}
          subtitulo={periodo.descripcion.subtitulo}
          puedeAvanzar={Boolean(datos?.puedeAvanzar)}
          puedeRetroceder={Boolean(datos?.puedeRetroceder)}
          onAtras={onAtras}
          onAdelante={onAdelante}
        />
      )}

      {cargando && (
        <div className="py-12">
          <SunmiLoader />
        </div>
      )}

      {error && !cargando && (
        <div className="rounded-xl border sunmi-border-danger px-4 py-3 text-xs sunmi-text-danger">
          {error}
        </div>
      )}

      {!cargando && !error && datos?.resumen && (
        <>
          <ResumenDelPeriodo resumen={datos.resumen} descripcion={periodo?.descripcion} />

          <h2 className="text-xs2 font-semibold sunmi-text-muted tracking-wider">ACTIVIDAD</h2>

          <ActividadDelResumen actividad={actividad} onAbrirTurno={onAbrirTurno} />
        </>
      )}
    </>
  );
}
