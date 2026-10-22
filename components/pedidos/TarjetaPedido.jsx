"use client";

// components/pedidos/TarjetaPedido.jsx
//
// LA TARJETA DE UN PRODUCTO DEL PEDIDO, EN EL CELULAR.
//
// Vivía adentro de `app/modulos/pedidos/page.jsx`. Salió el 2026-10-22, tal
// cual, cuando el detalle de un pedido anterior (`/modulos/pedidos/historial/
// [id]`) necesitó la misma tarjeta: una tarjeta copiada al lado sería la
// segunda que hay que acordarse de cambiar.
//
// ── DOS VARIANTES DE LA MISMA TARJETA ─────────────────────────────────────
//
// · EDITABLE —el catálogo, el borrador, el modo sumar—: la de siempre, nodo
//   por nodo, con la ✕ y el − valor +.
// · SOLO LECTURA (`soloLectura`) —"Ver pedido" del pedido enviado o
//   empezado, la lista mientras el depósito lo prepara, el detalle de un
//   pedido anterior—: sin − ni + ni el recuadro del campo, sin ✕ y sin su
//   lugar. Emanuel, probándolo en el celular: aunque estén apagados, "es como
//   irrelevante que estén". La cantidad va como número grande a la derecha de
//   la unidad, y la tarjeta mide lo que necesita: sin los botones, más baja.
//
// El nombre, la unidad, la foto y la inicial salen del mismo lugar en las dos:
// `Nombre`, `textoDeUnidad` y `MiniaturaProductoTarjeta`, más abajo.
//
// No muestra stock del depósito —está mayormente en negativo y confunde—, ni
// categoría, ni código.
//
// El número se puede tipear: lo escrito se manda al salir del campo (o con
// Enter), no tecla por tecla, para que "12" no viaje como un 1 y después un 12.
// El − y el + mandan en el acto.

import { useRef, useState } from "react";
import { X } from "lucide-react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiCampoCantidad from "@/components/sunmi/SunmiCampoCantidad";
import { MiniaturaProductoTarjeta } from "@/components/sunmi/SunmiProductoCard";
import { salePorBulto } from "@/lib/pedidos/lineasDelPedido";

/** "Por BULTO de 6 u" o "UNIDAD": lo que la tarjeta dice de cómo se pide. */
export function textoDeUnidad(producto) {
  return salePorBulto(producto) ? `Por BULTO de ${producto.factorPack} u` : "UNIDAD";
}

/** El nombre del producto, igual en las dos variantes. */
function Nombre({ nombre }) {
  return <p className="flex-1 min-w-0 text-sm3 font-semibold sunmi-text-strong break-words">{nombre}</p>;
}

/** La unidad, en suave, igual en las dos variantes. */
function Unidad({ producto }) {
  return (
    <span data-unidad-pedido="" className="min-w-0 text-sm2 sunmi-text-muted">
      {textoDeUnidad(producto)}
    </span>
  );
}

export default function TarjetaPedido({ producto, cantidad, enPedido = false, soloLectura = false, conFoto = false, onCantidad }) {
  const { nombre } = producto;
  const unidad = salePorBulto(producto) ? "BULTO" : "UNIDAD";
  const puedeQuitar = enPedido;
  const [escrito, setEscrito] = useState(null);
  const campoRef = useRef(null);

  // Con "Ver fotos" prendido, la foto a la izquierda ocupando su lugar
  // siempre: sin foto, la inicial en el mismo cuadrado. Apagado, no hay
  // cuadrado y el resto usa todo el ancho.
  const foto = conFoto ? <MiniaturaProductoTarjeta url={producto.imagenUrl} conservaLugar nombre={nombre} /> : null;

  if (soloLectura) {
    return (
      <SunmiCard data-tarjeta-pedido={nombre} data-solo-lectura="" className="p-3">
        <div className="flex gap-3">
          {foto}
          <div className="flex-1 min-w-0 space-y-1">
            <Nombre nombre={nombre} />
            <div className="flex items-center justify-between gap-2">
              <Unidad producto={producto} />
              <span data-cantidad-pedido="" className="shrink-0 text-xl2 font-bold tabular-nums sunmi-text-strong">
                {cantidad ?? 0}
              </span>
            </div>
          </div>
        </div>
      </SunmiCard>
    );
  }

  const cambiar = (s) => {
    if (typeof document !== "undefined" && document.activeElement === campoRef.current) {
      setEscrito(s);
      return;
    }
    onCantidad?.(Number(s) || 0, unidad);
  };

  // Al salir: vacío vale 0 —el producto sale del pedido, como con la ✕—, y si
  // no cambió no se manda nada.
  const confirmar = () => {
    if (escrito === null) return;
    const n = Number(escrito) || 0;
    setEscrito(null);
    if (n !== cantidad) onCantidad?.(n, unidad);
  };

  return (
    // Las dos marcas son el asidero de los candados (`pantallaPedidos.test.mjs`).
    <SunmiCard data-tarjeta-pedido={nombre} className="p-3">
      <div className="flex gap-3">
      {foto}
      <div className="flex-1 min-w-0 space-y-2">
      <div className="flex items-start gap-2">
        <Nombre nombre={nombre} />
        {/* ── EL LUGAR DE LA ✕ ESTÁ SIEMPRE ──────────────────────────────
            Aparecía solo con el producto en el pedido, y como es un toque de
            44 px al lado de una línea de texto, al pasar de 0 a 1 el renglón
            del nombre crecía y el − valor + bajaba: el dedo quedaba sobre otra
            cosa. Ahora el botón está siempre, del mismo alto y ancho. Sin el
            producto en el pedido va invisible, apagado, fuera del orden de foco
            y oculto al lector de pantalla: ocupa su lugar y nada más. */}
        <SunmiButton
          color="ghost"
          data-lugar-quitar=""
          aria-label={puedeQuitar ? `Quitar ${nombre} del pedido` : undefined}
          aria-hidden={puedeQuitar ? undefined : "true"}
          tabIndex={puedeQuitar ? undefined : -1}
          disabled={!puedeQuitar}
          onClick={() => {
            if (puedeQuitar) onCantidad?.(0, "UNIDAD");
          }}
          className={`shrink-0 min-w-toque min-h-toque inline-flex items-center justify-center${puedeQuitar ? "" : " invisible"}`}
        >
          <X size={18} aria-hidden="true" />
        </SunmiButton>
      </div>
      {/* Con la foto al lado, "Por BULTO de 6 u" y el − valor + no siempre
          entran en un renglón a 360 px: la unidad se parte en dos (`min-w-0`)
          y el campo no se achica (`shrink-0`), que es el que se toca. */}
      <div className="flex items-center justify-between gap-2">
        <Unidad producto={producto} />
        <div className="shrink-0">
          <SunmiCampoCantidad
            valor={escrito ?? String(cantidad ?? 0)}
            onCambiar={cambiar}
            etiqueta={`Cantidad de ${nombre}`}
            minimo={0}
            tamano="grande"
            claseMarco="w-16"
            apagaMenosEnMinimo
            // El 0 es guía y no un número cargado, y lo que se escribe
            // reemplaza lo que había. Vacío al salir vale 0: lo decide
            // `confirmar`, que además no manda nada si no cambió.
            minimoComoGuia
            inputRef={campoRef}
            onBlur={confirmar}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </div>
      </div>
      </div>
      </div>
    </SunmiCard>
  );
}
