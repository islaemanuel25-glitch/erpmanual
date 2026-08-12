// components/sunmi/SunmiPar.jsx
//
// DOS RENGLONES EN UNA CELDA: arriba lo que identifica, abajo lo que aclara.
//
// ── NO ES UNA CELDA ────────────────────────────────────────────────────────
//
// No dibuja un `<td>` ni un `<th>` y no los va a dibujar: eso ya lo hace
// `SunmiTable` en modo por columnas. Esto es el CONTENIDO de una celda, que es
// lo único que las pantallas siguen escribiendo a mano.
//
// ── DE DÓNDE SALE, Y CUÁNTAS VECES ESTÁ ESCRITO ────────────────────────────
//
// Sale de `TablaCatalogo`, que es la tabla que la pantalla de listas de
// proveedores renderiza de verdad, donde está escrito cuatro veces: el nombre
// del producto con la descripción del archivo debajo, el código activo con los
// dados de baja debajo, el costo actual con su fecha debajo, y el costo nuevo
// con de dónde viene debajo.
//
// Y otras tres en la conciliación de comprobantes: el producto con el texto del
// papel debajo, y las dos columnas que comparan —Pedido y Factura— con la
// cantidad arriba y el precio abajo.
//
// Siete lugares, dos pantallas, y YA SE HABÍAN SEPARADO: las cuatro del
// catálogo dicen `text-[9.5px]` y las tres de comprobantes `text-xs2`, que son
// 10px. Media letra de diferencia entre dos pantallas que muestran lo mismo,
// que es exactamente lo que pasa cuando algo se escribe dos veces.
//
// ── EL DEFAULT CEDE ────────────────────────────────────────────────────────
//
// El renglón chico trae tamaño y color del kit, y los dos ceden si la pantalla
// declara el suyo — la misma forma que `SunmiInput`, por el mismo motivo, que
// está escrito en `lib/sunmi/claseNegociada.js`. Es lo que deja que el catálogo
// conserve sus 9.5 px y quede idéntico mientras la pieza tiene una opinión.
//
// ── LO QUE A PROPÓSITO NO HACE ─────────────────────────────────────────────
//
// El renglón de arriba NO tiene default de nada. Miradas las siete, no comparten
// ninguno: una va en `font-medium`, otra en `font-semibold`, otra sin nada.
// Ponerle uno cambiaría alguna de las pantallas de las que salió.
//
// Y no fija alto: el alto lo da el contenido. Un renglón de abajo que no existe
// no deja hueco, porque no se dibuja.

import { componerClaseTexto } from "@/lib/sunmi/claseNegociada";

/** Base del renglón chico: lo que nunca cede, porque no es negociable. */
const BASE_ABAJO = "";
const TAMANO_ABAJO = "text-xs2";
const COLOR_ABAJO = "sunmi-text-muted";

/**
 * @param {object} p
 * @param {React.ReactNode} p.arriba        lo que identifica. Siempre se dibuja.
 * @param {React.ReactNode} [p.abajo]       lo que aclara. Si no hay, no hay renglón.
 * @param {string} [p.className]            clases del renglón de arriba.
 * @param {string} [p.classNameAbajo]       clases del de abajo. Pisa tamaño y color.
 * @param {string} [p.title]                título del renglón de arriba.
 * @param {string} [p.titleAbajo]           título del de abajo.
 */
export default function SunmiPar({
  arriba,
  abajo = null,
  className = "",
  classNameAbajo = "",
  title,
  titleAbajo,
  ...resto
}) {
  return (
    <>
      <div className={className || undefined} title={title} {...resto}>
        {arriba}
      </div>
      {abajo == null || abajo === false || abajo === "" ? null : (
        <div
          className={componerClaseTexto({
            base: BASE_ABAJO,
            tamano: TAMANO_ABAJO,
            color: COLOR_ABAJO,
            pedido: classNameAbajo,
          })}
          title={titleAbajo}
        >
          {abajo}
        </div>
      )}
    </>
  );
}
