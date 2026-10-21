"use client";

// LA RECETA QUE ARMÓ EL SISTEMA, PARA QUE ALGUIEN DIGA "ESTÁ BIEN".
//
// ── DE DÓNDE SALE ─────────────────────────────────────────────────────────
//
// Estaba escrito adentro de `ExplicacionDelPapel`, la pantalla de Recetas de
// facturas, y se sacó tal cual para que la recepción dibuje el MISMO bloque
// cuando el proveedor del papel que se está recibiendo tiene una receta
// propuesta (pedido de Emanuel, 2026-10-21: no quiere ir a otra pantalla para
// confirmarla). Dos copias se separarían el día que una cambie: es la regla 1.
//
// Son tres piezas porque en la pantalla de recetas no van juntas —entre la
// explicación y "Así lo entendió" están el papel de prueba y la variación—, y
// moverlas cambiaría esa pantalla, que tiene que quedar igual:
//
//   · `TarjetaDeLaExplicacion` — cómo viene el papel, y en qué estado está;
//   · `MensajeDeLaReceta`      — lo que contestó el servidor al guardar;
//   · `PropuestaDeReceta`      — "Así lo entendió" con «Está bien, guardar».
//
// Lo que guarda NO vive acá: es `useGuardarLaExplicacion`, en
// `ExplicacionDelPapel`, el mismo camino de siempre con la relectura de los
// papeles sin recibir. Acá solo se dibuja.

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiTextarea from "@/components/sunmi/SunmiTextarea";
import AsiLoEntendio from "@/components/compras-proveedor/AsiLoEntendio";
import { rotuloDelTipo } from "@/lib/compras-proveedor/comprobante/explicacionPorTipo";

/** La línea que dice que esto lo armó el sistema y no una persona. */
export const TEXTO_PROPUESTA =
  "Esto lo armó el sistema leyendo una factura de este proveedor, y la cuenta cierra. Revisalo: si está bien, se guarda como su receta.";

/**
 * ¿SE PUEDE GUARDAR LO QUE ESTÁ EN PANTALLA?
 *
 * Con una lectura a la vista, solo si la cuenta cierra. La excepción es un
 * papel sin total impreso, que no tiene contra qué cerrar: ahí alcanza con que
 * haya algo escrito. Sin lectura, igual.
 */
export function sePuedeGuardarLaExplicacion({ resultado, explicacion }) {
  return !resultado || resultado.hayTotal === false ? Boolean(explicacion.trim()) : resultado.cierra;
}

/**
 * CÓMO VIENE ESTE TIPO DE PAPEL, Y EN QUÉ ESTADO ESTÁ SU EXPLICACIÓN.
 *
 * @param tipo         el tipo de papel (`explicacionPorTipo.js`)
 * @param propuesta    true si hay una que armó el sistema esperando
 * @param confirmada   la confirmada de este tipo, `{ version }`, o null
 */
export function TarjetaDeLaExplicacion({ tipo, propuesta = false, confirmada = null, explicacion, onCambiar }) {
  return (
    <SunmiCard className="p-3 space-y-dato">
      <span className="block text-sm3 font-medium sunmi-text-strong">
        Cómo viene la {rotuloDelTipo(tipo).toLowerCase()}
      </span>
      <span className="block text-sm2 sunmi-text-muted">
        {propuesta
          ? "Está para confirmar: la armó el sistema."
          : confirmada
            ? `Confirmada, versión ${confirmada.version}.`
            : "Todavía no tiene explicación: la primera que llegue la explica el lector grande."}
      </span>
      <SunmiTextarea
        rows={7}
        value={explicacion}
        onChange={(e) => onCambiar(e.target.value)}
        placeholder="Por ejemplo: CANTIDAD son las unidades que manda. BONIF. es el descuento en porcentaje. Cuando la columna PESO trae un número, el PRECIO es por kilo y la cantidad son piezas."
        className="w-full text-sm3"
      />
    </SunmiCard>
  );
}

/** Lo que contestó el servidor: verde si salió, rojo si no. */
export function MensajeDeLaReceta({ mensaje }) {
  if (!mensaje) return null;
  return (
    <p
      className={`text-sm3 break-words ${
        mensaje.tipo === "error" ? "sunmi-text-danger" : "sunmi-text-success"
      }`}
    >
      {mensaje.texto}
    </p>
  );
}

/**
 * "ASÍ LO ENTENDIÓ", CON «ESTÁ BIEN, GUARDAR».
 *
 * @param resultado       lo que devuelve `comoLoEntendio`
 * @param propuesta       true si lo que se muestra es la que armó el sistema
 * @param guardando       mientras el servidor guarda
 * @param releyendo       `{ hechas, total }` mientras se releen los papeles sin
 *                        recibir, o null
 * @param sePuedeGuardar  `sePuedeGuardarLaExplicacion`
 * @param onGuardar       «Está bien, guardar»
 * @param onCorregir      «Algo está mal: corregir la explicación»
 */
export default function PropuestaDeReceta({
  resultado,
  propuesta = false,
  guardando = false,
  releyendo = null,
  sePuedeGuardar,
  onGuardar,
  onCorregir,
}) {
  return (
    <>
      <span className="block text-sm3 font-medium sunmi-text-strong">Así lo entendió</span>
      {propuesta && (
        <p className="text-sm2 sunmi-text-muted break-words">{TEXTO_PROPUESTA}</p>
      )}

      <AsiLoEntendio resultado={resultado} />

      <div className="flex flex-col gap-dato">
        <SunmiButton
          color="primary"
          type="button"
          disabled={guardando || Boolean(releyendo) || !sePuedeGuardar}
          onClick={onGuardar}
          className="w-full min-h-botonFoto justify-center text-sm3 font-bold"
        >
          {releyendo
          ? `Releyendo ${releyendo.hechas} de ${releyendo.total}…`
          : guardando
            ? "Guardando…"
            : "Está bien, guardar"}
        </SunmiButton>
        {!sePuedeGuardar && (
          <span className="text-sm3 sunmi-text-muted text-center">
            Se puede guardar cuando los productos sumen el total del papel.
          </span>
        )}
        <SunmiButton
          color="slate"
          type="button"
          onClick={onCorregir}
          className="w-full min-h-toque justify-center text-sm3"
        >
          Algo está mal: corregir la explicación
        </SunmiButton>
      </div>
    </>
  );
}
