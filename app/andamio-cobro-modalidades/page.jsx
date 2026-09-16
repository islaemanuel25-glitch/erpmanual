"use client";

// ANDAMIO del panel de cobro con MODALIDADES — `FormaPago` + `SelectorModalidad`.
//
// ── QUÉ SE PUEDE VER ACÁ Y NO EN LA PANTALLA DE VERDAD ────────────────────
//
// El POS necesita turno abierto, stock, cliente y una venta que entre en la
// base. Para mirar cómo se ve el selector —y sobre todo para ejercer QUÉ PASA
// DESPUÉS DE COBRAR— eso es una montaña de requisitos que además deja ventas de
// prueba adentro de una base.
//
// Acá el panel es el de verdad, con sus props reales, y el botón de abajo hace
// lo único que hace la pantalla al registrar una venta: **vaciar el carrito**.
// Eso alcanza para ver el defecto que esta tanda arregla, que era quedarse en el
// selector de modalidad con el carrito ya vacío.
//
// ── LOS NÚMEROS NO ESTÁN ESCRITOS: SALEN DEL MOTOR ────────────────────────
//
// Es la lección que dejó el andamio de la tarjeta de producto, y está escrita en
// su archivo: un andamio con los textos escritos a mano TAPÓ el defecto más
// grave de aquella tanda, porque no había un campo del que las dos cosas
// salieran y por eso no podían contradecirse.
//
// Los totales de cada opción salen de `totalesPorOpcionDeCobro`, el MISMO motor
// que corre en el servidor al cobrar. Si el selector alguna vez mostrara un
// número que el backend no cobraría, se vería acá.
//
// Los medios son de mentira y se ven; lo que es real es su FORMA: pasan por
// `componerModalidades`, igual que los que devuelve `/api/medios-cobro`.

import { useState } from "react";
import { notFound } from "next/navigation";

import SunmiButton from "@/components/sunmi/SunmiButton";
import FormaPago from "@/components/pos-ventas/FormaPago";
import { componerModalidades } from "@/lib/pos-ventas/modalidadesDeMedio";
import { CLASE_BOTON_MEDIO } from "@/lib/pos-ventas/mediosCobroPantalla";
import { totalesPorOpcionDeCobro } from "@/lib/ofertas/previewPos";

// TRES MODALIDADES Y UNA SIN RECARGO, que es el caso que hay que poder mirar:
// con todas cargadas, la de "Sin recargo" tiene que distinguirse de un vistazo
// porque es la que el cliente pregunta.
const MEDIOS = [
  {
    id: 30, nombre: "Efectivo", activo: true, orden: 1, tipoContable: "EFECTIVO",
    procesador: null, recargoPct: 0, comisionPct: 0, modalidades: [],
  },
  {
    id: 10, nombre: "Mercado Pago", activo: true, orden: 2, tipoContable: "MERCADOPAGO",
    procesador: "MERCADOPAGO", recargoPct: 0, comisionPct: 5,
    modalidades: componerModalidades([
      { id: 101, nombre: "QR / dinero en cuenta", activo: true, orden: 1, tipoContable: "MERCADOPAGO", recargoPct: 0, comisionPct: 1 },
      { id: 102, nombre: "Crédito 1 pago", activo: true, orden: 2, tipoContable: "CREDITO", recargoPct: 7, comisionPct: 3 },
      { id: 103, nombre: "Crédito 12 cuotas", activo: true, orden: 3, tipoContable: "CREDITO", recargoPct: 15, comisionPct: 9 },
    ]),
  },
  {
    id: 20, nombre: "Banco X", activo: true, orden: 3, tipoContable: "CREDITO",
    procesador: "BANCO", recargoPct: 6, comisionPct: 9, modalidades: [],
  },
];

// $200.000, que es el importe del caso reportado: con la modalidad al 7 % da
// $214.000, el número que quedaba pegado en el recuadro después de la venta.
const CARRITO = [{ productoLocalId: 1, nombre: "Heladera", cantidad: 1, precio: 200000 }];

// ── EL SEGUNDO CASO: LA GRILLA DESPAREJA ──────────────────────────────────
//
// Cuatro medios, uno de ellos con DOS modalidades de distinto recargo —que es
// lo que hace aparecer el importe en cada botón— y una oferta de SOLO EFECTIVO,
// que separa el total de efectivo del de los demás. Con los cuatro dando lo
// mismo el panel no dibuja importes y el defecto no se puede ver.
//
// La oferta tiene la forma de la real: `precioOferta` y `condicionPago`, los
// campos con los que la manda el carrito. El motor decide a qué medio se le
// aplica; acá no se resta nada.
const OFERTA_EFECTIVO = {
  ofertaId: 7,
  ofertaNombre: "Semana del vino",
  precioOferta: 3800,
  condicionPago: "SOLO_EFECTIVO",
};

const MEDIOS_GRILLA = [
  { id: 30, nombre: "Efectivo", activo: true, orden: 1, tipoContable: "EFECTIVO", procesador: null, recargoPct: 0, comisionPct: 0, modalidades: [] },
  { id: 40, nombre: "Débito", activo: true, orden: 2, tipoContable: "DEBITO", procesador: "BANCO", recargoPct: 3, comisionPct: 2, modalidades: [] },
  {
    id: 10, nombre: "Mercado Pago", activo: true, orden: 3, tipoContable: "MERCADOPAGO",
    procesador: "MERCADOPAGO", recargoPct: 0, comisionPct: 5,
    modalidades: componerModalidades([
      { id: 201, nombre: "Crédito 1 pago", activo: true, orden: 1, tipoContable: "CREDITO", recargoPct: 4, comisionPct: 3 },
      { id: 202, nombre: "Crédito 6 cuotas", activo: true, orden: 2, tipoContable: "CREDITO", recargoPct: 12, comisionPct: 7 },
    ]),
  },
  { id: 20, nombre: "Crédito", activo: true, orden: 4, tipoContable: "CREDITO", procesador: "BANCO", recargoPct: 9, comisionPct: 9, modalidades: [] },
];

const CARRITO_GRILLA = [
  { productoLocalId: 42, productoBaseId: 11, nombre: "Nueve de Oro", cantidad: 1, precio: 3959,
    stockMax: 100, factorPack: 1, unidadMedida: "unidad", modoVentaLinea: "NORMAL", oferta: OFERTA_EFECTIVO },
];

const PREVIEW_GRILLA = totalesPorOpcionDeCobro({ carrito: CARRITO_GRILLA, medios: MEDIOS_GRILLA });
const SUBTOTAL_GRILLA = CARRITO_GRILLA.reduce((a, l) => a + l.precio * l.cantidad, 0);

const PREVIEW_CON_CARRITO = totalesPorOpcionDeCobro({ carrito: CARRITO, medios: MEDIOS });
const PREVIEW_VACIO = totalesPorOpcionDeCobro({ carrito: [], medios: MEDIOS });
const SUBTOTAL = CARRITO.reduce((a, l) => a + l.precio * l.cantidad, 0);

export default function AndamioCobroModalidades() {
  // La ruta no existe en producción. Es UNA línea por archivo y es lo único que
  // separa este andamio de una página servida a quien escriba la dirección: en
  // este proyecto no hay middleware, así que no hay una segunda barrera.
  if (process.env.NODE_ENV === "production") notFound();

  const [hayCarrito, setHayCarrito] = useState(true);

  return (
    <div className="p-3 flex flex-col gap-3" style={{ maxWidth: 480 }}>
      <FormaPago
        subtotal={hayCarrito ? SUBTOTAL : 0}
        formaPago="efectivo"
        onFormaPagoChange={() => {}}
        onCobrar={() => setHayCarrito(false)}
        cobrando={false}
        disabled={false}
        mediosCobro={MEDIOS}
        previewPorOpcion={hayCarrito ? PREVIEW_CON_CARRITO : PREVIEW_VACIO}
      />

      {/* LA GRILLA DE BOTONES, con importe en cada uno. Es el caso donde se ve
          si los cuatro tienen el mismo alto y si el nombre y el importe quedan
          a la misma altura entre columnas. Va en su propio panel para poder
          medirla sin que el de arriba la mueva. */}
      <div data-andamio="grilla">
        <FormaPago
          subtotal={SUBTOTAL_GRILLA}
          formaPago="efectivo"
          onFormaPagoChange={() => {}}
          onCobrar={() => {}}
          cobrando={false}
          disabled={false}
          mediosCobro={MEDIOS_GRILLA}
          previewPorOpcion={PREVIEW_GRILLA}
          hayOfertaSoloEfectivo
        />
      </div>

      {/* Lo que hace la pantalla al registrar la venta, y nada más: vaciar el
          carrito. El panel tiene que volver solo al principio. */}
      <SunmiButton
        color="ghost"
        type="button"
        data-andamio="alternar-carrito"
        onClick={() => setHayCarrito((v) => !v)}
        className={`${CLASE_BOTON_MEDIO} w-full`}
      >
        {hayCarrito ? "Registrar venta (vacía el carrito)" : "Reponer carrito"}
      </SunmiButton>
    </div>
  );
}
