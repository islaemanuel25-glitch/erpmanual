// components/sunmi/SunmiBarraDeAvance.jsx
//
// CUÁNTO DE UN TOTAL YA ESTÁ HECHO, EN UNA BARRA.
//
// ── DE DÓNDE SALIÓ ────────────────────────────────────────────────────────
//
// De `components/tesoreria/PiezasTesoreria.jsx` (`BarraDeAvance`, Figma
// EVJ2KvVCrY0oVSowfboymQ, "Avance · verificado / entregado"), tal cual estaba:
// el mismo marcado y las mismas clases. Se mudó al kit cuando apareció la
// segunda pantalla que la necesitaba —la recepción de transferencias en la
// computadora, "4 / 15 revisados"—; Tesorería la sigue usando con el mismo
// nombre y su HTML no cambia.
//
// `pct` va de 0 a 100 y lo calcula quien la usa, truncado: la barra no dice
// 100 si falta algo. Lo hecho va en el token de éxito y lo que falta en el de
// advertencia, los dos con `bg-current` sobre el color de texto del tema: no
// hay una clase de fondo de éxito o advertencia y no se escribe uno fijo.
//
// El ancho de lo hecho es el único `style` y no se puede evitar: es un dato,
// no una medida de diseño.

/**
 * @param {object} props
 * @param {number|null} props.pct  0 a 100; con null no se dibuja
 */
export default function SunmiBarraDeAvance({ pct }) {
  if (pct == null) return null;
  return (
    <div className="flex h-1.5 gap-0.5 overflow-hidden" aria-hidden="true" data-avance={pct}>
      {pct > 0 && <div className="h-full rounded-full bg-current sunmi-text-success" style={{ width: `${pct}%` }} />}
      {pct < 100 && <div className="h-full flex-1 rounded-full bg-current sunmi-text-warning" />}
    </div>
  );
}
