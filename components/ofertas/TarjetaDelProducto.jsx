"use client";

// EL PRODUCTO DE LA OFERTA: nombre, precio normal, costo y stock.
//
// ── POR QUÉ SE EXTRAJO ───────────────────────────────────────────────────
//
// Vivía adentro de la pantalla de crear. El detalle de la oferta muestra lo
// mismo —es la misma oferta, con todo cargado— y escribirlo de nuevo habría
// dejado dos bloques que se ven igual hasta el día que uno cambie.
//
// Salió TAL CUAL estaba: los mismos nodos, las mismas clases, los mismos hijos.
// La prueba de que salió bien no es que compile — es que la pantalla de donde se
// sacó quede idéntica, comparada píxel a píxel. Está medido con el arnés de
// `nueva`, que saca las mismas trece capturas antes y después.
//
// ── EL AVISO DE STOCK RESPETA LA CONFIGURACIÓN DEL LOCAL ─────────────────
//
// Con venta sin stock HABILITADA un negativo es normal: el local vende igual y
// el stock se regulariza después. Avisar ahí sería ruido permanente, y un aviso
// que siempre está se deja de leer.
//
// Con venta sin stock DESHABILITADA y stock en cero o menos, el aviso dice lo
// que de verdad pasa: ese producto HOY no se puede vender en este local. No
// bloquea —se está programando un precio para los próximos días y el pedido
// puede estar por llegar—.
//
// La decisión la toma `avisaSinStock`, que tiene sus dos ramas ejercidas. Acá
// solo se dibuja.

import { avisaSinStock, money } from "@/lib/ofertas/crearOfertaMovil";

/** Una fila etiqueta/valor de la tarjeta del producto. */
function Dato({ etiqueta, valor }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm3 sunmi-text-muted">{etiqueta}</span>
      <span className="text-sm3 font-medium sunmi-text-strong tabular-nums">{valor}</span>
    </div>
  );
}

export default function TarjetaDelProducto({ producto, nombreDelLocal = null }) {
  if (!producto) return null;

  return (
    <section className="sunmi-bg-card rounded-xl2 border sunmi-border p-4 space-y-3">
      <div className="text-lg2 font-semibold sunmi-text-strong">{producto.nombre}</div>
      <div className="space-y-1.5">
        <Dato etiqueta="Precio normal" valor={money(producto.precioNormal)} />
        <Dato etiqueta="Costo" valor={money(producto.costo)} />
        <Dato
          etiqueta={`Stock hoy en ${nombreDelLocal || "esta ubicación"}`}
          valor={String(producto.stock ?? 0)}
        />
      </div>
      {avisaSinStock(producto) && (
        <div className="text-sm3 font-medium sunmi-text-warning">
          Hoy este producto no se puede vender en {nombreDelLocal || "esta ubicación"}:
          no hay stock y el local no tiene habilitada la venta sin stock. Igual podés
          dejar la oferta cargada.
        </div>
      )}
    </section>
  );
}
