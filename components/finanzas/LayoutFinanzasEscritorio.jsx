// components/finanzas/LayoutFinanzasEscritorio.jsx
//
// EL MOLDE DE FINANZAS EN ESCRITORIO. Tres ranuras —`periodo`, `resumen` y
// `contenido`— y un solo armado para las pantallas que lo usan (Tesorería y
// Gastos). Desde `md` (768 px):
//
//   ┌ periodo: chips (400) · navegador (420) ─────────────────────────┐
//   │ resumen (380)        │ contenido (el resto)                     │
//
// con 21 px entre columnas —`gap-x-6`; los 20 del pedido no caen en la escala
// de 3,5— y los márgenes laterales de la página. Las columnas son tokens de
// `tailwind.config.js` (`grid-cols-finanzas*`), no medidas escritas acá.
//
// ── DEBAJO DE `md` NO HACE NADA, Y ESO ES LO DIFÍCIL ─────────────────────
//
// El celular tiene que quedar idéntico, y el celular es una lista plana: cada
// pieza es hija directa de un contenedor con `space-y-3.5`. Envolver las
// piezas en una caja por ranura movería píxeles en los bordes: una ranura que
// en el celular no muestra nada —el contenido mientras carga, o las piezas que
// solo existen en escritorio— seguiría siendo una caja vacía con su margen de
// arriba, y ese margen se escapa al final de la página.
//
// Por eso las ranuras son `contents` debajo de `md`: no generan caja, y sus
// hijas quedan en el flujo del molde como si fueran hermanas, en el orden de
// las ranuras. El espacio entre ellas lo sigue poniendo `space-y-3.5`, que es
// un selector de HERMANAS EN EL DOM (`> * ~ *`): por eso `resumen` y
// `contenido` empiezan con un `Tope` invisible, que convierte a su primera
// pieza en "una que viene después de otra" y le da los mismos 12,25 px que le
// daba la lista plana. `periodo` no lo lleva: su primera pieza es la primera
// del molde, y el margen de arriba lo trae el molde entero.
//
// Lo que el celular ve, entonces, es la secuencia `periodo`, `resumen`,
// `contenido`, separadas igual que antes. Una pantalla cuyo orden de celular
// no coincide con el de las ranuras (Gastos) pone en cada ranura la pieza que
// el celular necesita ahí con `md:hidden`, y la de escritorio con
// `hidden md:block`.
//
// ── EN ESCRITORIO ────────────────────────────────────────────────────────
//
// `resumen` y `contenido` pasan a columnas flex con `gap`, que —a diferencia
// del margen— ignora lo oculto: una pieza `md:hidden` al principio no deja un
// hueco arriba de la columna. Las columnas van con posición explícita para que
// un `resumen` vacío no corra el contenido a la columna angosta.

/**
 * LO QUE NO USA EL MOLDE en una pantalla que sí lo usa —en Tesorería, los
 * detalles de turno, caja y verificación, y la lista de locales—. La página
 * dejó de topear el ancho desde `md` para que el molde llegue a los costados;
 * esto le devuelve a esas vistas el ancho de lectura que tenían (`max-w-4xl`,
 * el tope de la página). Debajo de `md` no hace nada: es una caja sin clases
 * que se apoya en el mismo margen que antes traía su hija.
 */
export function AnchoDeLectura({ children }) {
  return <div className="md:mx-auto md:max-w-4xl">{children}</div>;
}

/** Una hermana anterior para el `space-y` del celular. Ver arriba. */
function Tope() {
  return <div className="hidden" aria-hidden="true" />;
}

/**
 * @param {object} props
 * @param {React.ReactNode} props.periodo    chips y navegador, en ese orden
 * @param {React.ReactNode} props.resumen    la columna angosta de la izquierda
 * @param {React.ReactNode} props.contenido  la columna ancha de la derecha
 */
export default function LayoutFinanzasEscritorio({ periodo, resumen, contenido }) {
  return (
    <div
      className="md:grid md:grid-cols-finanzasEscritorio md:gap-x-6 md:gap-y-3.5 md:items-start"
      data-finanzas-escritorio
    >
      <div
        className="contents space-y-3.5 md:col-span-2 md:grid md:grid-cols-finanzasPeriodo md:gap-x-6 md:gap-y-3 md:items-center md:space-y-0"
        data-ranura="periodo"
      >
        {periodo}
      </div>
      <div
        className="contents space-y-3.5 md:col-start-1 md:row-start-2 md:flex md:min-w-0 md:flex-col md:gap-3.5 md:space-y-0"
        data-ranura="resumen"
      >
        <Tope />
        {resumen}
      </div>
      <div
        className="contents space-y-3.5 md:col-start-2 md:row-start-2 md:flex md:min-w-0 md:flex-col md:gap-3.5 md:space-y-0"
        data-ranura="contenido"
      >
        <Tope />
        {contenido}
      </div>
    </div>
  );
}
