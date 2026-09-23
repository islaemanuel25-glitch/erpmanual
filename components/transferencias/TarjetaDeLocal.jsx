"use client";

// components/transferencias/TarjetaDeLocal.jsx
//
// UN LOCAL EN LA PANTALLA DE ENTRADA. Fachada, nombre y una flecha.
//
// ── POR QUÉ ACÁ NO HAY IMPORTE NI PERÍODO ────────────────────────────────
//
// Porque cada local corta su semana el día que acordó, así que "esta semana" no
// significa lo mismo para todos y un importe al lado del nombre tendría que
// elegir un período — y cualquiera que eligiera sería el equivocado para
// alguien. El período aparece adentro del local, que es donde se sabe cuál es.
//
// El domingo 2026-09-13 lo dejó a la vista: la pantalla mostraba la semana en
// curso, que ese día tenía un día de vida, y escondía la que había que cobrar.
//
// ── LA FRANJA VA PEGADA AL BORDE ─────────────────────────────────────────
//
// Seis píxeles a la izquierda, a TODO el alto. Eso obliga a dos cosas que se
// pagan si faltan: la tarjeta recorta el contenido —`overflow-hidden`— o la
// franja se come las esquinas redondeadas; y el padding va ADENTRO, en el
// contenido, no en la tarjeta, o la franja quedaría flotando con un borde claro
// alrededor.
//
// La franja SÍ sale del tema —es interfaz—, a diferencia de la fachada, que es
// un dibujo. Por eso una usa un token y la otra una paleta.
//
// ── EL FONDO ES `sunmi-bg-card`, Y EL NOMBRE DE LA OTRA ENGAÑA ───────────
//
// La primera versión usaba `sunmi-surface`. Se llama "surface" y pinta
// `--app-bg`: el fondo de la APLICACIÓN. O sea que la tarjeta salía exactamente
// del color de la página y lo único que la separaba era el borde. Se vio en
// producción, en el tema crema, donde los dos tonos son casi el mismo.
//
// No era cosa de ese tema: medido en los catorce, `--app-bg` y `--card-bg` son
// distintos en los catorce, así que la tarjeta perdía su fondo propio siempre.
// El motivo de que la clase nueva exista —y de que no sirvan `.sunmi-card` ni
// `.sunmi-card-surface`— está en la hoja, al lado de su declaración.

import SunmiButton from "@/components/sunmi/SunmiButton";
import FachadaDelLocal from "./FachadaDelLocal";

/**
 * ── `insignia` ───────────────────────────────────────────────────────────
 *
 * Una palabra al lado del nombre. `null` por defecto, y sin ella el marcado es
 * exactamente el de siempre: el nodo no se dibuja, así que la pantalla de
 * transferencias no cambia ni un píxel.
 *
 * Existe porque la lista de Finanzas incluye locales DADOS DE BAJA —cerrar un
 * local no borra lo que vendió, y mirar el mes en que cerró es justamente lo que
 * se va a querer hacer— y un local cerrado dibujado igual que uno abierto es una
 * afirmación falsa sobre el negocio. Transferencias los excluye de su lista, así
 * que allá esta pregunta no existe.
 *
 * Es texto y no un color: el estado de un local tiene que poder leerse, y un
 * tono distinto no se distingue en los catorce temas.
 */
export default function TarjetaDeLocal({ local, onEntrar, insignia = null }) {
  return (
    <SunmiButton
      type="button"
      color="ghost"
      onClick={() => onEntrar?.(local)}
      aria-label={`Abrir ${local?.nombre || "el local"}`}
      // `p-0` y `overflow-hidden` son los dos que hacen que la franja llegue a
      // los extremos. El resto son los ejes que `SunmiButton` cede.
      className="flex w-full items-stretch p-0 min-h-0 rounded-xl2 overflow-hidden border sunmi-border sunmi-bg-card text-left"
    >
      <span className="w-1.5 shrink-0 self-stretch sunmi-bg-accent" aria-hidden="true" />

      <span className="flex flex-1 items-center gap-3 pl-3.5 pr-4 py-3 min-w-0">
        <FachadaDelLocal nombre={local?.nombre} />
        <span className="flex-1 min-w-0 text-lg2 font-semibold sunmi-text-strong truncate">
          {local?.nombre || "—"}
        </span>
        {insignia ? (
          <span className="shrink-0 text-xs2 font-medium sunmi-text-muted">{insignia}</span>
        ) : null}
        <span className="shrink-0 text-lg3 sunmi-text-muted" aria-hidden="true">
          ›
        </span>
      </span>
    </SunmiButton>
  );
}
