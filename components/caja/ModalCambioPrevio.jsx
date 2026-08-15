"use client";

// SEPARAR EL CAMBIO, en un modal.
//
// POR QUÉ UN MODAL Y NO UNA PÁGINA
//
// La primera versión ponía la grilla de denominaciones al lado del resumen, en
// una pantalla de dos columnas. Funcionaba, pero convertía el paso previo del
// cierre —que hasta entonces era una tarjeta con cuatro datos y un botón— en una
// página grande, y esa pantalla es la que el cajero ve todos los días. Acá la
// grilla aparece sólo cuando hace falta: al apretar el botón.
//
// EL MODAL NO INICIA NADA
//
// Abrirlo, cerrarlo o apretar Escape no crea la preparación, no congela ninguna
// cifra y no publica ningún cambio pendiente. El corte se toma recién con el
// botón de confirmación, y quien decide los números finales es el servidor.
//
// Lo que se muestra acá es una ESTIMACIÓN. El efectivo esperado se leyó al abrir
// la pantalla y el local puede haber cobrado algo desde entonces; por eso quien
// llama revalida antes de confirmar y, si cambió, lo avisa en vez de mandar un
// número viejo.

import { useEffect } from "react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import TablaDenominaciones from "@/components/caja/TablaDenominaciones";
import { Fila, money } from "@/components/caja/CifrasRetiro";
import { Aviso } from "@/components/caja/PanelesRetiro";
import { AVISO_CAMBIO_SUPERA_ESPERADO } from "@/components/caja/PanelesCierre";

export const TITULO_MODAL_CAMBIO = "Cambio que queda en la caja";
export const AYUDA_MODAL_CAMBIO =
  "Separá los billetes y monedas que quedarán disponibles para seguir vendiendo.";

/** El aviso cuando el esperado se movió mientras el modal estaba abierto. */
export const AVISO_ESPERADO_CAMBIO =
  "El efectivo esperado cambió por una operación nueva. Revisá el retiro estimado y confirmá otra vez.";

export default function ModalCambioPrevio({
  abierto = false,
  /** Efectivo esperado AHORA. Todavía no hay nada congelado. */
  esperado = null,
  desglose = {},
  onDesglose,
  totalCambio = 0,
  retiroEstimado = null,
  textoConfirmar = "Separar cambio, iniciar cierre y liberar POS",
  confirmando = false,
  /** Se mostró un esperado nuevo: hace falta una segunda confirmación. */
  revalidado = false,
  error = "",
  onCancelar,
  onConfirmar,
}) {
  // Escape CIERRA, nunca confirma. Es la salida que la gente busca por reflejo,
  // y en una pantalla que congela una caja no puede ser un atajo al alta.
  useEffect(() => {
    if (!abierto) return;
    const alTecla = (e) => {
      if (e.key === "Escape") onCancelar?.();
    };
    window.addEventListener("keydown", alTecla);
    return () => window.removeEventListener("keydown", alTecla);
  }, [abierto, onCancelar]);

  if (!abierto) return null;

  const superaEsperado = retiroEstimado != null && retiroEstimado < 0;

  // El telón usa `sunmi-overlay` y no `bg-black/60`: también es un token del
  // sistema de temas, y escribir el color a mano lo deja fuera de control.
  return (
    <SunmiModalLayout
      open={abierto}
      title={TITULO_MODAL_CAMBIO}
      onClose={onCancelar}
      // El valor efectivo que esta pantalla ya tenía, MEDIDO en el navegador
      // antes de escribirlo. El kit dejó de tener default de `z`.
      z={9999}
      // Es un formulario de carga: el desglose de billetes ya escrito se
      // perdería con un toque al costado, y en el teléfono ese toque pasa solo.
      destructivo
      // La forma de la que esta pantalla es ORIGEN: hoja pegada abajo en el
      // teléfono, centrada de `sm` para arriba. El redondeo y la columna los
      // deriva la forma; el tope de alto lo aplica a la TARJETA, que es lo que
      // esta pantalla necesita.
      forma="hoja-o-centrado"
      alto="max-h-[92vh] sm:max-h-[88vh]"
      maxWidth="sm:max-w-lg"
      // La tarjeta no tiene padding propio: cada bloque pone su `px-4`. Y la
      // sombra es más marcada que la del kit. Los `!` no son adorno: SunmiCard
      // concatena en vez de negociar.
      paddingTarjeta="!p-0"
      sombraTarjeta="!shadow-2xl"
      espacioCuerpo="px-4 space-y-3"
      // El pie es una GRILLA, no el flex del kit: en el teléfono los dos botones
      // van apilados y a todo el ancho, y de `sm` para arriba en una fila con el
      // de confirmar ocupando lo que sobra. El `!grid` le gana al `flex` de la
      // pieza; sin el `!` decidiría el orden de la hoja de estilos.
      espacioPie="!grid grid-cols-1 sm:grid-cols-[auto_1fr] px-4 py-3 border-t sunmi-border"
      className="sm:mx-4"
      footer={
        <>
          <SunmiButton
            color="slate"
            onClick={onCancelar}
            disabled={confirmando}
            className="py-3 !text-xs order-2 sm:order-1"
          >
            Cancelar
          </SunmiButton>
          <SunmiButton
            color="amber"
            onClick={onConfirmar}
            disabled={confirmando}
            className="py-3 font-bold !text-xs order-1 sm:order-2"
          >
            {confirmando ? "Cortando…" : textoConfirmar}
          </SunmiButton>
        </>
      }
    >
      {/* La ayuda estaba en el encabezado a mano, debajo del título. El
          encabezado del kit no dibuja subtítulo, así que baja al cuerpo. */}
      <p className="text-[12px] sunmi-text-muted leading-snug">
        {AYUDA_MODAL_CAMBIO}
      </p>

          <TablaDenominaciones
            desglose={desglose}
            onCambiar={onDesglose}
            idPrefijo="cambio-previo"
            titulo="Cantidad que se deja"
          />

          <div className="sunmi-surface-soft sunmi-border rounded-lg p-3 space-y-1">
            <Fila label="Efectivo esperado" valor={esperado ?? "—"} />
            <Fila label="Cambio que queda" valor={totalCambio} />
            <div className="pt-1 border-t sunmi-border">
              <Fila
                label="Retiro estimado"
                valor={retiroEstimado ?? "—"}
                clase={superaEsperado ? "sunmi-text-warning" : "sunmi-text-accent"}
                fuerte
              />
            </div>
            {/* La resta, escrita. No es decoración: es lo que le permite al
                cajero verificar de dónde sale el número sin confiar a ciegas. */}
            <p className="text-[10px] sunmi-text-muted leading-snug pt-1">
              Retiro estimado = {money(esperado ?? 0)} − {money(totalCambio)}
            </p>
          </div>

          {superaEsperado && <Aviso>{AVISO_CAMBIO_SUPERA_ESPERADO}</Aviso>}

          {revalidado && <Aviso>{AVISO_ESPERADO_CAMBIO}</Aviso>}

          {error && <div className="text-[12px] sunmi-text-danger text-center">{error}</div>}
    </SunmiModalLayout>
  );
}
