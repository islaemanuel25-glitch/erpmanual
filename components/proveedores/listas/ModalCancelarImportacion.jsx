"use client";

// ¿CANCELAR ESTA LISTA?
//
// ── POR QUÉ NO SE REUSA `ModalTerminar` ─────────────────────────────────────
//
// Porque dice otra cosa. Terminar y cancelar cierran la lista las dos, pero no
// son la misma decisión: terminar es "ya está, lo que quedó afuera queda así";
// cancelar es "esto no servía". El modal de terminar dice "Sí, terminar" y
// enumera cuántos productos quedan sin aplicar, que es el balance de un trabajo
// hecho — sobre una lista que se está descartando, ese texto cuenta una historia
// que no ocurrió.
//
// Reusar la pieza equivocada porque se parece es la forma de reuso que deja al
// usuario leyendo la palabra que no es. Lo que sí se reusa es el layout del kit,
// que es la pieza de verdad.
//
// ── DE DÓNDE SALE ───────────────────────────────────────────────────────────
//
// Del aviso de la lista que quedó leída con el rango en 0 a 0. Hasta ahora
// cancelar una importación no se podía hacer desde ninguna pantalla —el endpoint
// existía y nadie lo llamaba— así que una lista inservible se quedaba abierta
// para siempre.

import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiButton from "@/components/sunmi/SunmiButton";

export default function ModalCancelarImportacion({
  abierto,
  archivo,
  // ── CUÁNTOS COSTOS YA ESCRIBIÓ ESTA LISTA ──────────────────────────────
  //
  // Una lista PARCIALMENTE_APLICADA sigue abierta y por lo tanto se puede
  // cancelar, pero ya escribió costos. Sin este dato el modal decía "No se cambia
  // ningún costo" sobre una lista que había cambiado cuarenta: cierto para la
  // mayoría de los casos y falso justo en el que más importa.
  //
  // Va como número y no como booleano porque el texto lo dice: "los 4 costos que
  // ya aplicaste quedan como están" es accionable, "hay costos aplicados" manda a
  // averiguar cuántos.
  aplicados = 0,
  trabajando = false,
  onCerrar,
  onCancelar,
}) {
  if (!abierto) return null;

  const hayAplicados = Number(aplicados) > 0;

  return (
    <SunmiModalLayout
      open={abierto}
      title="¿Cancelar esta lista?"
      subtitle={
        hayAplicados
          ? "La lista se cierra y sale del trabajo pendiente. Los costos que ya aplicaste NO se deshacen."
          : "No se cambia ningún costo. La lista se cierra y sale del trabajo pendiente."
      }
      color="amber"
      onClose={trabajando ? undefined : onCerrar}
      maxWidth="max-w-lg"
      // Los dos que el kit ya NO tiene default: los declara cada consumidor y
      // hay un censo que lo exige.
      espacioCuerpo="mt-2 gap-3"
      z={9999}
      // NO lleva `destructivo`: adentro no hay nada escrito que se pueda perder
      // —dos renglones de lectura y dos botones—, así que tocar el velo cierra,
      // que es lo que espera quien lo abre con el pulgar sin querer. El criterio
      // del kit es qué se pierde al cerrar sin querer, no qué tan grave es la
      // acción; lo grave lo sostiene el botón, que hay que ir a buscar.
      footer={
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <SunmiButton color="slate" onClick={onCerrar} disabled={trabajando} className="py-2 text-xs">
            No, volver
          </SunmiButton>
          <SunmiButton
            color="amber"
            onClick={onCancelar}
            disabled={trabajando}
            className="py-2 font-bold text-xs"
          >
            {trabajando ? "Cancelando…" : "Sí, cancelar"}
          </SunmiButton>
        </div>
      }
    >
      <p className="text-sm3 sunmi-text-strong leading-snug">
        {archivo ? `Se cancela ${archivo}.` : "Se cancela esta importación."}{" "}
        {hayAplicados
          ? `Ya no vas a poder aplicar ni revisar nada más de esta lista, y queda en el historial como cancelada.`
          : `Los costos de tus productos quedan como están.`}
      </p>

      {/* ── LO QUE YA SE ESCRIBIÓ, Y CÓMO VOLVER ATRÁS ────────────────────
          Lo más importante del modal cuando hay costos aplicados, así que va en
          su propio párrafo y con el número. Cancelar NO revierte: una persona
          que cancele creyendo que deshace se queda con los costos nuevos y la
          lista cerrada, o sea sin el botón de deshacer a mano. */}
      {hayAplicados && (
        <p className="text-sm3 sunmi-text-warning leading-snug">
          {aplicados === 1
            ? "El costo que ya aplicaste queda aplicado."
            : `Los ${aplicados} costos que ya aplicaste quedan aplicados.`}{" "}
          Cancelar no los deshace. Si querés volver atrás, primero usá «Deshacer» y después
          cancelá.
        </p>
      )}

      <p className="text-sm2 sunmi-text-muted leading-snug">
        Si querés volver a intentarlo, subí el archivo de nuevo desde «Subir una lista».
      </p>
    </SunmiModalLayout>
  );
}
