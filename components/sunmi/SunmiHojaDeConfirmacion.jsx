"use client";

// components/sunmi/SunmiHojaDeConfirmacion.jsx
//
// ANTES DE UNA ACCIÓN QUE ESCRIBE: QUÉ VA A PASAR, RENGLÓN POR RENGLÓN, Y DOS
// BOTONES GRANDES.
//
// ── DE DÓNDE SALIÓ ────────────────────────────────────────────────────────
//
// De `components/proveedores/listas/HojaConfirmarAplicar.jsx`, tal cual estaba:
// el mismo `SunmiModalLayout`, los mismos renglones con viñeta y los mismos dos
// botones del alto táctil. Apareció la segunda pantalla que necesitaba lo mismo
// —confirmar un cambio de semana operativa— y se sacó lo que no sabe de dominio.
// `HojaConfirmarAplicar` sigue existiendo, arma sus cuatro renglones y dibuja con
// esta pieza el MISMO marcado; un candado lo compara.
//
// ── POR QUÉ UNA CONFIRMACIÓN Y NO UNA CASILLA ─────────────────────────────
//
// Lo que protege es SABER QUÉ VA A PASAR, y eso se resuelve diciéndolo. Una
// casilla de 14 × 14 px es un blanco que se falla y que se marca sin leer.
//
// ── NO LLEVA `destructivo` ────────────────────────────────────────────────
//
// Adentro no hay nada escrito que se pueda perder, así que tocar el velo cierra,
// que es lo que espera quien abre una hoja por error con el pulgar. El criterio
// del kit es qué se pierde al cerrar sin querer, no qué tan grave es la acción;
// lo grave lo sostiene el botón, que hay que ir a buscar.

import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiButton from "@/components/sunmi/SunmiButton";

/**
 * @param {object} props
 * @param {string}   props.titulo
 * @param {string[]} props.puntos           los renglones, ya redactados
 * @param {string}   props.textoConfirmar
 * @param {string}   props.textoTrabajando  lo que dice el botón mientras escribe
 * @param {string}   [props.colorConfirmar] un color de `SunmiButton` ("cyan")
 * @param {boolean}  [props.trabajando]     apaga los dos botones y el velo
 * @param {() => void} props.onConfirmar
 * @param {() => void} props.onVolver
 */
export default function SunmiHojaDeConfirmacion({
  titulo,
  puntos = [],
  textoConfirmar,
  textoTrabajando,
  colorConfirmar = "cyan",
  trabajando = false,
  onConfirmar,
  onVolver,
}) {
  return (
    <SunmiModalLayout
      open
      title={titulo}
      color="amber"
      onClose={trabajando ? undefined : onVolver}
      // Los dos que el kit ya NO tiene default: los declara cada consumidor y
      // hay un censo que lo exige. Son los valores que traían `ModalRevertir` y
      // `ModalTerminar`, los hermanos de la pantalla de donde salió.
      espacioCuerpo="mt-2 gap-3"
      z={9999}
      footer={
        <div className="space-y-2 w-full">
          <SunmiButton
            color={colorConfirmar}
            onClick={onConfirmar}
            disabled={trabajando}
            className="w-full min-h-toque text-base font-bold"
          >
            {trabajando ? textoTrabajando : textoConfirmar}
          </SunmiButton>
          <SunmiButton
            color="slate"
            onClick={onVolver}
            disabled={trabajando}
            className="w-full min-h-toque text-sm3"
          >
            Volver
          </SunmiButton>
        </div>
      }
    >
      <ul className="space-y-2">
        {puntos.map((p, i) => (
          <li key={i} className="flex gap-2 text-sm3 sunmi-text-strong leading-snug">
            <span aria-hidden="true" className="sunmi-text-muted">•</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </SunmiModalLayout>
  );
}
