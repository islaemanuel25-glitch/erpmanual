"use client";

// components/transferencias/FilaCorteDeSemana.jsx
//
// UNA RELACIÓN DEPÓSITO–LOCAL y el día en que le arranca la semana (V29).
//
// ── POR QUÉ ESTO SE CONFIGURA UNA VEZ Y NO SE ELIGE EN CADA PANTALLA ──────
//
// Porque es un ACUERDO entre dos partes, no una preferencia de quien mira. El
// depósito y el local se pusieron de acuerdo en que la semana arranca el lunes;
// esa semana es la misma para los dos, la mire quien la mire.
//
// ── LA RELACIÓN SIN ACUERDO SE VE, SIEMPRE ────────────────────────────────
//
// Cae al domingo para poder mostrar un rango, y queda MARCADA. Las dos cosas
// juntas: un domingo mostrado sin marca se lee como una decisión que alguien
// tomó, y no la tomó nadie. Acá la marca es la píldora "Sin configurar" en el
// mismo renglón del local —la misma que la lista de trabajo— más el borde en
// warning de la fila entera.
//
// ── EL PIE DICE EL RANGO QUE ESTE DÍA PRODUCE ─────────────────────────────
//
// Es lo que hace que la pantalla se pueda usar sin entender la regla: se toca
// un día y abajo cambia el rango de la semana en curso. Sin eso, elegir "Mar"
// es elegir a ciegas.
//
// ── LA FILA EN EDICIÓN SE DISTINGUE POR LA FORMA, NO POR EL COLOR ─────────
//
// La primera versión la marcaba con el borde en `accent` y la relación sin
// configurar con el borde en `warning`. Eso NO FUNCIONA, y está medido sobre
// los catorce temas de `app/globals.css`:
//
//   · en **sunmiSand** `--pos-accent` y `--pos-warning` son EL MISMO hex
//     (#b45309): los dos estados quedan idénticos, no parecidos;
//   · en siete de los catorce la distancia perceptual entre los dos es menor a
//     20 —los cuatro ámbar de #fbbf24 contra #f59e0b, y sunmiLight y ambarCaja
//     de #d97706 contra #b45309—.
//
// Así que la señal es el ESTILO del borde: **punteado mientras se edita**,
// sólido en los otros dos estados. Un `border-style` no depende de ninguna
// variable de tema, así que funciona igual en los catorce, y además dice lo que
// pasa: lo punteado es provisorio, todavía no se guardó.
//
// Se conserva el color `accent` encima porque en los siete temas donde SÍ se
// distingue ayuda y no cuesta nada. Lo que no se conserva es depender de él: el
// candado `lib/sunmi/senalNoCromatica.test.mjs` afirma que la diferencia entre
// los estados sobrevive con las dos variables puestas en el mismo valor.
//
// Y la marca de "sin configurar" NO se pierde cuando esa misma fila se está
// editando: la píldora sigue en el renglón del local, que es donde vive el
// hecho. El borde dice qué estoy haciendo; la píldora, cómo está la relación.
//
// ── LO QUE NO SABE ────────────────────────────────────────────────────────
//
// Si se está guardando bien o mal, ni quién más está editando. Recibe el día
// elegido y avisa; la pantalla decide que solo una fila se edita por vez.

import SunmiButton from "@/components/sunmi/SunmiButton";
import { DIAS, abreviaturaDelDia, rotuloDelRango } from "@/lib/transferencias/periodoDePago";

export default function FilaCorteDeSemana({
  relacion,
  editando = false,
  diaElegido,
  guardando = false,
  /** Sin el permiso del depósito la fila se LEE, y no ofrece un botón que el
   *  servidor va a rechazar con 403. El permiso se vuelve a pedir allá. */
  puedeEditar = true,
  onElegirDia,
  onEditar,
  onGuardar,
}) {
  const dia = editando ? diaElegido : relacion?.diaDeCorte;

  return (
    <section
      // `sunmi-bg-card` y no `sunmi-surface`: aquélla pinta `--app-bg`, el fondo
      // de la APLICACIÓN, así que la fila salía del mismo color que la página y
      // lo único que la separaba era el borde. Medido: los dos en
      // `rgb(15, 23, 42)`. El borde no se toca — acá además señala el estado.
      className={`sunmi-bg-card rounded-xl2 p-4 space-y-3.5 ${
        editando
          ? "border-1.5 border-dashed sunmi-border-accent"
          : relacion?.sinConfigurar
            ? "border-1.5 border-solid sunmi-border-warning"
            : "border border-solid sunmi-border"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm3 sunmi-text-muted truncate">
              {relacion?.depositoNombre || "Depósito"}
            </span>
            <span className="sunmi-text-muted" aria-hidden="true">
              →
            </span>
            <span className="text-md2 font-semibold sunmi-text-strong truncate">
              {relacion?.localNombre || "—"}
            </span>
            {relacion?.sinConfigurar && (
              <span className="shrink-0 rounded-lg border sunmi-border-warning sunmi-state-warning-soft sunmi-text-warning text-xs2 font-semibold px-1.5 py-1 leading-none">
                Sin configurar
              </span>
            )}
          </div>
        </div>

        {!editando && (
          <div className="shrink-0 text-right">
            <div className="text-xs2 sunmi-text-muted">Arranca</div>
            <div className="text-base2 font-semibold sunmi-text-strong">
              {abreviaturaDelDia(relacion?.diaDeCorte)}.
            </div>
          </div>
        )}
      </div>

      {editando && (
        <div role="group" aria-label="Día de arranque" className="flex gap-1">
          {DIAS.map((d) => {
            const activo = d.valor === dia;
            return (
              <SunmiButton
                key={d.valor}
                type="button"
                color={activo ? "primary" : "slate"}
                aria-pressed={activo}
                onClick={() => onElegirDia?.(d.valor)}
                className={`flex-1 basis-0 justify-center px-1 py-3 rounded-lg text-sm2 ${
                  activo ? "font-semibold" : "font-normal"
                }`}
              >
                {abreviaturaDelDia(d.valor)}
              </SunmiButton>
            );
          })}
        </div>
      )}

      <div className="border-t sunmi-divider opacity-70" aria-hidden="true" />

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs2 sunmi-text-muted">Semana en curso</div>
          <div className="text-xs font-medium sunmi-text-strong">
            {rotuloDelRango(editando ? relacion?.rangoPropuesto : relacion?.rango)}
          </div>
        </div>

        {editando ? (
          <SunmiButton
            type="button"
            color="primary"
            disabled={guardando}
            onClick={() => onGuardar?.(dia)}
            className="shrink-0 px-4 py-2.5 rounded-lg text-sm3 font-semibold"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </SunmiButton>
        ) : !puedeEditar ? null : (
          // Fantasma: el relleno no existe, el contorno y el tono los pone esta
          // pantalla con clases del kit. Ver `.sunmi-btn-ghost`.
          <SunmiButton
            type="button"
            color="ghost"
            onClick={() => onEditar?.()}
            className="shrink-0 px-4 py-2.5 rounded-lg text-sm3 font-semibold border-1.5 sunmi-border-accent sunmi-text-accent"
          >
            Cambiar
          </SunmiButton>
        )}
      </div>
    </section>
  );
}
