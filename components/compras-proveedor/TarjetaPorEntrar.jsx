"use client";

// CUÁNTA PLATA ESTÁ POR ENTRAR, Y CUÁNTO HACE QUE ESPERA.
//
// ── EL NÚMERO ES ESTIMADO Y LA PANTALLA LO DICE ───────────────────────────
//
// Sale de lo que se calculó AL PEDIR —la suma de cantidad × costo de cada
// línea— y no de lo que el proveedor va a facturar. Son dos números distintos:
// entre que se manda el pedido y llega el remito puede haber un aumento, un
// faltante o una bonificación, y ninguno de los tres está acá.
//
// Por eso el rótulo dice "Estimado" al lado del monto, en chico. Sin esa
// palabra alguien compara este total contra una factura y la diferencia se lee
// como un error del sistema en vez de como lo que es: el precio cambió.
//
// ── EL BORDE ES DE 2 Y EN ACENTO, Y NO ES DECORACIÓN ──────────────────────
//
// Es la única tarjeta de la pantalla que resume en vez de listar. Con el borde
// de 1 que tienen los grupos de día quedaba como un grupo más y había que
// leerla para darse cuenta.

// El formateador del ERP, el mismo que usa la cuenta de transferencias —que es
// la pantalla que esta copia—. No se escribe un `fmtPesos` acá: ya hay dos
// copias sueltas de ese helper en el módulo y una tercera sería peor.
import { formatearMoneda } from "@/lib/moneda";

export default function TarjetaPorEntrar({
  total = 0,
  rotuloDelPeriodo = "",
  pedidos = 0,
  diasDelMasViejo = null,
}) {
  const hayPedidos = pedidos > 0;

  return (
    <div className="min-h-tarjetaPorEntrar rounded-xl border-2 sunmi-border-accent sunmi-bg-card px-4 py-filtro flex flex-col gap-dato">
      <span className="text-sm3 sunmi-text-muted">Por entrar</span>

      <span className="text-xl3 font-bold sunmi-text-strong tabular-nums">
        {formatearMoneda(total)}
      </span>

      {/* El período debajo del monto: sin esto el número no dice DE CUÁNDO es,
          y cambiar de semana con las flechas movería una cifra sin explicar. */}
      <span className="text-sm3 sunmi-text-muted">
        {rotuloDelPeriodo}
        {/* La palabra que evita la discusión con la factura. */}
        {" · estimado al pedir"}
      </span>

      <div className="border-t sunmi-divider pt-dato mt-dato">
        <span className="text-sm3 font-medium sunmi-text-accent">
          {hayPedidos
            ? `${pedidos} ${pedidos === 1 ? "pedido esperando" : "pedidos esperando"}`
            : "Sin pedidos esperando"}
          {hayPedidos && diasDelMasViejo != null
            ? ` · el más viejo hace ${diasDelMasViejo} ${
                diasDelMasViejo === 1 ? "día" : "días"
              }`
            : ""}
        </span>
      </div>
    </div>
  );
}
