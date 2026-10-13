"use client";

// components/periodo/SelectorDePeriodo.jsx
//
// EL SELECTOR DE FECHA ESTÁNDAR DEL CELULAR: Día · Semana · Mes · Otro, y
// debajo "‹ Lunes 12 de octubre ›". Con «Otro», el calendario de rango del kit.
//
// ── DE DÓNDE SALIÓ ────────────────────────────────────────────────────────
//
// Era `EncabezadoDePeriodo`, una función privada de
// `components/tesoreria/PantallaTesoreria.jsx` (Figma 21:1523), y se sacó TAL
// CUAL cuando "Turnos y cierres" necesitó el mismo selector: el mismo marcado,
// las mismas props. Tesorería la usa desde acá y su HTML quedó idéntico,
// comparado byte a byte con la pantalla renderizada antes y después.
//
// ── POR QUÉ NO VA EN components/sunmi ─────────────────────────────────────
//
// Porque sabe de dominio: arma los chips con `ChipsDePeriodo`, que conoce las
// unidades con que este negocio mira la plata, y decide qué es «Otro» con
// `CLAVE_OTRO_FINANZAS`. Una pieza del kit que conociera "SEMANA" dejaría de
// ser del kit —está escrito en `ChipsDePeriodo`—. Lo que NO sabe de dominio ya
// está en el kit: `SunmiSelectorDeOpciones` y `SunmiDateRangePicker`.
//
// ── LO QUE RECIBE ─────────────────────────────────────────────────────────
//
// `datos` es la respuesta de una API con la forma de Tesorería: el período con
// la `descripcion` de `descripcionFinanciera`, y `puedeAvanzar` /
// `puedeRetroceder` decididos por el servidor. `ctx` es el contexto de la URL
// (`parseContextoTesoreria`). Las flechas y el título no se calculan acá.

import ChipsDePeriodo from "@/components/transferencias/ChipsDePeriodo";
import NavegadorDePeriodo from "@/components/transferencias/NavegadorDePeriodo";
import SunmiDateRangePicker from "@/components/sunmi/SunmiDateRangePicker";
import { CLAVE_OTRO_FINANZAS } from "@/lib/finanzas/periodoFinanciero";

const sinCambio = () => {};

/**
 * EL ENCABEZADO TEMPORAL CANÓNICO DE FINANZAS (Figma 21:1523): los cuatro chips
 * y el navegador, con los textos de `descripcionFinanciera` que manda el
 * servidor. Acá «Otro» NO va apagado: Tesorería sabe consultarlo. Con «Otro»
 * aparece el calendario de rango del kit, y el navegador dice «Período elegido»
 * con las flechas apagadas —el servidor contesta `puedeAvanzar` y
 * `puedeRetroceder` en false—.
 */
/**
 * `tamano="compacto"`: para la barra de escritorio de Finanzas
 * (`LayoutFinanzasEscritorio`). Los chips y el navegador en su tamaño compacto
 * y en fila, con el calendario de «Otro» entre los dos. Sin la prop —el
 * celular, "Turnos y cierres"— el marcado es el de siempre.
 */
export default function SelectorDePeriodo({
  datos,
  ctx,
  hoy,
  onCambiarUnidad,
  onElegirRango,
  onAtras,
  onAdelante,
  tamano = "normal",
}) {
  const descripcion = datos?.periodo?.descripcion || null;
  const esOtro = ctx.unidad === CLAVE_OTRO_FINANZAS;
  const compacto = tamano === "compacto";
  return (
    <div className={compacto ? "flex flex-wrap items-center gap-3" : "space-y-3"}>
      <ChipsDePeriodo valor={ctx.unidad} onCambiar={onCambiarUnidad} tamano={tamano} />
      {esOtro && (
        <SunmiDateRangePicker
          valueDesde={ctx.desde || ""}
          valueHasta={ctx.hasta || ""}
          // El kit los llama al aplicar, ANTES de `onApply`: sin ellos «Aplicar»
          // se cae y el rango no llega. El período vive en la URL y solo cambia
          // al aplicar, así que no hay nada que guardar mientras se elige.
          onChangeDesde={sinCambio}
          onChangeHasta={sinCambio}
          onApply={(desde, hasta) => onElegirRango(desde, hasta)}
          placeholder="Elegí desde y hasta"
          maxDate={hoy}
        />
      )}
      {descripcion && (
        <NavegadorDePeriodo
          titulo={descripcion.titulo}
          subtitulo={descripcion.subtitulo}
          puedeAvanzar={Boolean(datos?.puedeAvanzar)}
          puedeRetroceder={Boolean(datos?.puedeRetroceder)}
          onAtras={onAtras}
          onAdelante={onAdelante}
          tamano={tamano}
        />
      )}
    </div>
  );
}
