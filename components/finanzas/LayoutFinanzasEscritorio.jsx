// components/finanzas/LayoutFinanzasEscritorio.jsx
//
// EL MOLDE DE FINANZAS EN ESCRITORIO (Figma EVJ2KvVCrY0oVSowfboymQ, 378:1583,
// "Escritorio v2 · Gastos"). Lo usan Tesorería y Gastos. Desde `md` (768 px),
// cuatro franjas apiladas a todo el ancho, 16 px entre una y otra
// (`gap-bloque`, token del config):
//
//   a) BARRA ...... el período compacto a la izquierda; Volver y la acción
//                   principal a la derecha.
//   b) TOTALES .... una tarjeta horizontal partida en partes iguales.
//   c) FILTROS .... una fila.
//   d) CONTENIDO .. a todo el ancho.
//
// Los márgenes de los costados (32 px) los pone la página: 14 del shell más
// `md:px-4.5`.
//
// ── EL CELULAR VA APARTE, Y ENTERO ───────────────────────────────────────
//
// La versión anterior de este molde (32bfa8c) repartía las MISMAS piezas del
// celular en dos columnas, y por eso llevó a la computadora los controles
// grandes del pulgar. En escritorio casi todo se dibuja distinto —el segmentado
// compacto, una tabla en vez de bandas, los totales en una franja—, así que el
// molde recibe el celular como una ranura propia (`celular`) y la muestra
// debajo de `md` tal cual se la dan. Es el patrón de `TablaStock` y de
// `ListadoPedidosProveedor`: los dos dibujos en el DOM y el ancho elige.
//
// La caja del celular no mueve un píxel: es un bloque con el mismo
// `space-y-3.5` que la lista plana de la página, así que toma el margen que
// antes tomaba su primera pieza y reparte el mismo espacio entre las demás.

/**
 * @param {object} props
 * @param {React.ReactNode} props.celular    lo de siempre, debajo de `md`
 * @param {React.ReactNode} props.periodo    segmentado y navegador compactos
 * @param {React.ReactNode} [props.acciones] Volver y la acción principal
 * @param {Array<{clave:string, rotulo:string, valor:string, nota?:React.ReactNode, tono?:"advertencia"}>} [props.totales]
 * @param {React.ReactNode} [props.filtros]
 * @param {React.ReactNode} props.contenido
 */
export default function LayoutFinanzasEscritorio({ celular, periodo, acciones = null, totales = null, filtros = null, contenido }) {
  return (
    <>
      <div className="space-y-3.5 md:hidden" data-finanzas-celular>
        {celular}
      </div>

      <div className="hidden md:flex md:flex-col md:gap-bloque" data-finanzas-escritorio>
        <div className="flex flex-wrap items-center gap-3" data-franja="barra">
          {periodo}
          {acciones ? <div className="ml-auto flex items-center gap-3">{acciones}</div> : null}
        </div>

        {totales && totales.length > 0 ? <FranjaDeTotales totales={totales} /> : null}

        {filtros ? (
          <div className="flex items-center gap-3" data-franja="filtros">
            {filtros}
          </div>
        ) : null}

        {contenido}
      </div>
    </>
  );
}

const TONO_DEL_VALOR = {
  advertencia: "sunmi-text-warning",
};

/**
 * LA FRANJA DE TOTALES: una tarjeta, partes iguales (`auto-cols-fr`) y una
 * línea vertical entre ellas (`divide-x` con el borde del tema). Cada parte:
 * rótulo chico gris, número grande en negrita, una línea chica debajo.
 */
function FranjaDeTotales({ totales }) {
  return (
    <div
      className="grid grid-flow-col auto-cols-fr divide-x sunmi-divide rounded-xl2 border sunmi-border sunmi-bg-card"
      data-franja="totales"
    >
      {totales.map((t) => (
        <div key={t.clave} className="min-w-0 space-y-1 px-6 py-3.5" data-total={t.clave}>
          <div className="text-sm2 sunmi-text-muted truncate">{t.rotulo}</div>
          <div className={`text-xl2 font-bold tabular-nums break-words ${TONO_DEL_VALOR[t.tono] || "sunmi-text-strong"}`}>
            {t.valor}
          </div>
          {t.nota ? <div className="text-sm2 sunmi-text-muted">{t.nota}</div> : null}
        </div>
      ))}
    </div>
  );
}

/**
 * LO QUE NO USA EL MOLDE en una pantalla que sí lo usa —en Tesorería, los
 * detalles de turno, caja y verificación, y la lista de locales—. La página no
 * topea el ancho desde `md` para que el molde llegue a los costados; esto le
 * devuelve a esas vistas el ancho de lectura que tenían (`max-w-4xl`, el tope
 * de la página). Debajo de `md` no hace nada: es una caja sin clases que toma
 * el mismo margen que antes traía su hija.
 */
export function AnchoDeLectura({ children }) {
  return <div className="md:mx-auto md:max-w-4xl">{children}</div>;
}
