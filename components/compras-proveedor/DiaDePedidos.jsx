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
// Lo que se repetía era el ARMADO de la tarjeta de día, y ése ya es uno solo:
// `DiaConBanda`. Acá quedan los renglones y qué dice la banda.

import SunmiButton from "@/components/sunmi/SunmiButton";
import DiaConBanda from "@/components/periodo/DiaConBanda";
import { formatearMoneda } from "@/lib/moneda";
import { horaAR } from "@/lib/fechas/formatearFechaHora";

export default function DiaDePedidos({ dia, onRecibir }) {
  const pedidos = dia?.pedidos || [];

  // La caja y la banda son `DiaConBanda`, la misma de Transferencias, Pagos a
  // proveedores y Finanzas. Su aspecto salió de acá: esta era la única banda
  // que se veía, con el fondo de los botones secundarios.
  return (
    <DiaConBanda
      titulo={dia?.rotulo}
      // Dos nodos de texto y el espacio, como estaban.
      dato={
        <>
          {pedidos.length} {pedidos.length === 1 ? "pedido" : "pedidos"}
        </>
      }
      // ── EL SUBTOTAL SOLO CUANDO SUMA ALGO ──────────────────────────────
      // Con un solo pedido en el día, el subtotal de la franja y el importe de
      // la fila son el mismo número escrito dos veces a treinta píxeles de
      // distancia. Dos números iguales juntos no se leen como una suma: se leen
      // como una repetición, y quien mira se pregunta cuál de los dos es el
      // bueno. Desde dos pedidos sí suma algo que no está escrito en ningún otro
      // lado.
      importe={pedidos.length > 1 ? formatearMoneda(dia?.total || 0) : null}
    >
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
              {/* PRODUCTOS, no "ítems". Es la palabra del mostrador y la que
                  usa el resto del módulo desde la tanda del #232. */}
              {horaAR(p.fechaEnviado || p.createdAt)} · {p.cantItems}{" "}
              {p.cantItems === 1 ? "producto" : "productos"}
            </div>
            <div className="text-sm3 sunmi-text-accent truncate">Esperando mercadería</div>
          </div>

          <div className="shrink-0 flex flex-col items-end gap-dato">
            {/* ── EL PAPEL MANDA SOBRE EL ESTIMADO ─────────────────────────
                Lo que se estimó al pedir sirve mientras no haya nada mejor. En
                cuanto el proveedor factura, lo que importa es cuánto facturó:
                es la plata que hay que pagar, y sale del papel y no de una
                cuenta nuestra. El rótulo cambia con el número para que nadie
                tenga que adivinar cuál de los dos está mirando. */}
            <span className="text-sm3 font-bold sunmi-text-strong tabular-nums">
              {formatearMoneda(p.totalFacturado ?? p.totalEstimado ?? 0)}
            </span>
            <span className="text-sm2 sunmi-text-muted">
              {p.totalFacturado != null ? "te facturó" : "estimado al pedir"}
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
    </DiaConBanda>
  );
}
