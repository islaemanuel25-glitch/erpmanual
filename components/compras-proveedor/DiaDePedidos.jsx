"use client";

// UN DÍA DE PEDIDOS ESPERANDO MERCADERÍA.
//
// ── LA FECHA ES LA DEL ENVÍO, NO LA DE LA MERCADERÍA ──────────────────────
//
// Se agrupa por cuándo se MANDÓ el pedido. Parece obvio y no lo es: la pantalla
// se llama "Recibir mercadería" y la tentación es agrupar por fecha de entrega
// — que todavía no existe, porque justamente lo que se está esperando es que
// llegue. Agrupar por una fecha vacía pondría todo en un solo montón.
//
// El día contesta la pregunta que se hace quien mira: hace cuánto que pedí esto.
//
// ── POR QUÉ ESTA TARJETA NO ES `DiaDeTransferencias` ──────────────────────
//
// Esa existe, en el módulo de transferencias, y tiene la misma FORMA: tarjeta
// con encabezado de día, subtotal a la derecha y filas separadas por una línea.
// Pero su contenido es de transferencias —los badges de presentación, los
// estados de una transferencia, sus dos acciones— y lo que va adentro de cada
// renglón acá es otra cosa: proveedor, número, hora, ítems y un botón Recibir.
//
// O sea que lo que se repite es el ARMADO de la tarjeta de día, no la pieza.
// Queda anotado: es el mismo caso que llevó a `SunmiPantallaDeTrabajo`, y es la
// próxima extracción al kit. No se hizo acá para no rediseñar de paso la
// pantalla de transferencias, que en esta tanda no se toca.

import SunmiButton from "@/components/sunmi/SunmiButton";
import { formatearMoneda } from "@/lib/moneda";
import { horaAR } from "@/lib/fechas/formatearFechaHora";

export default function DiaDePedidos({ dia, onRecibir }) {
  const pedidos = dia?.pedidos || [];

  return (
    <div className="rounded-xl border sunmi-divider sunmi-bg-card overflow-hidden">
      {/* ── LA FRANJA DEL DÍA ──────────────────────────────────────────────
          Con el encabezado del mismo blanco que las filas, dos días seguidos se
          leían como una lista continua: no se veía dónde terminaba uno y
          empezaba el otro. La franja lleva el fondo de los botones secundarios
          —`--pos-control-bg`, el mismo token— y eso alcanza para separarlos sin
          agregar ninguna línea más.

          Es lo PRIMERO de la tarjeta, así que el redondeo de arriba se lo
          recorta el `overflow-hidden` del contenedor. Sin ese recorte el fondo
          saldría cuadrado por encima del borde redondeado.

          `sunmi-control` trae un `:hover` que acá no significa nada —esto no se
          toca— pero en un teléfono no hay hover, y usar la clase que ya existe
          es preferible a escribir una variante nueva para ahorrarse una regla
          que nunca se activa. */}
      <div className="sunmi-control px-4 py-renglon flex items-baseline gap-renglon">
        <div className="text-sm3 font-bold sunmi-text-strong flex-1 min-w-0 truncate">
          {dia?.rotulo}
        </div>

        {/* La cuenta, en gris: dice cuántos hay sin competir con el día. */}
        <div className="text-sm3 sunmi-text-muted shrink-0">
          {pedidos.length} {pedidos.length === 1 ? "pedido" : "pedidos"}
        </div>

        {/* ── EL SUBTOTAL SOLO CUANDO SUMA ALGO ──────────────────────────
            Con un solo pedido en el día, el subtotal de la franja y el importe
            de la fila son el mismo número escrito dos veces a treinta píxeles
            de distancia. Dos números iguales juntos no se leen como una suma:
            se leen como una repetición, y quien mira se pregunta cuál de los
            dos es el bueno. Desde dos pedidos sí suma algo que no está escrito
            en ningún otro lado. */}
        {pedidos.length > 1 && (
          <div className="text-sm3 font-bold sunmi-text-strong tabular-nums shrink-0">
            {formatearMoneda(dia?.total || 0)}
          </div>
        )}
      </div>

      {pedidos.map((p, i) => (
        <div
          key={p.id}
          // El separador va ARRIBA de cada fila MENOS LA PRIMERA. Sin esa
          // excepción quedan dos líneas juntas debajo del encabezado del día
          // —la del encabezado y la de la fila— y se lee como un filo doble.
          className={`min-h-filaPedido px-4 py-filtro flex items-center justify-between gap-renglon ${
            i > 0 ? "border-t sunmi-divider" : ""
          }`}
        >
          <div className="min-w-0 flex flex-col gap-0.5">
            <div className="text-sm3 font-bold sunmi-text-strong truncate">
              {p.proveedorNombre} <span className="sunmi-text-muted">#{p.id}</span>
            </div>
            <div className="text-sm3 sunmi-text-muted truncate">
              {horaAR(p.fechaEnviado || p.createdAt)} · {p.cantItems}{" "}
              {p.cantItems === 1 ? "ítem" : "ítems"}
            </div>
            <div className="text-sm3 sunmi-text-accent truncate">Esperando mercadería</div>
          </div>

          <div className="shrink-0 flex flex-col items-end gap-dato">
            <span className="text-sm3 font-bold sunmi-text-strong tabular-nums">
              {formatearMoneda(p.totalEstimado || 0)}
            </span>
            <SunmiButton
              type="button"
              color="primary"
              onClick={() => onRecibir?.(p)}
              className="min-h-botonRecibir rounded-control px-4 text-sm3"
            >
              Recibir
            </SunmiButton>
          </div>
        </div>
      ))}
    </div>
  );
}
