// components/turnos/imprimirZReport.js
//
// EL COMPROBANTE Z DE UNA CAJA, impreso en una ventana aparte.
//
// Vivía adentro de `app/modulos/turnos/[id]/page.jsx` y se mudó acá TAL CUAL,
// sin cambiar una línea del papel, cuando "Turnos y cierres" necesitó
// reimprimirlo: dos copias del comprobante se desincronizan el día que una
// cambia un renglón. Las dos pantallas lo importan de acá.
//
// Recibe la forma que ya recibía: el turno (con su local y su cajero), el
// resumen de `/api/pos-ventas/turnos/resumen` —cantidad, efectivo, digital y el
// desglose por medio— y los movimientos de caja con `id`, `tipo` y `monto`.

import { fechaHoraAR } from "@/lib/fechas/formatearFechaHora";
import { TEXTO_SIN_CONTAR, TEXTO_DIFERENCIA_NO_DISPONIBLE } from "@/lib/caja/cierreRelevo";

const fmt = (n) =>
  n != null
    ? Number(n).toLocaleString("es-AR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "-";

// Zona de Argentina y 24 horas: ver `lib/fechas/formatearFechaHora.js`.
const fmtFecha = (iso) => fechaHoraAR(iso, { vacio: "-" });

// Un importe, o la palabra que dice por qué no hay. En el papel, "$-" se lee como
// un cero; un turno cerrado sin conteo tiene que decir "Sin contar".
const plataOTexto = (n, texto) => (n != null ? `$${fmt(n)}` : texto);

export function imprimirZReport(turno, resumen, movimientos) {
  const totalVentas =
    (resumen.totalEfectivo || 0) + (resumen.totalDigital || 0);

  // El RETIRO DE CIERRE se separa del resto. Ocurre DESPUÉS del conteo, así que
  // no forma parte del efectivo esperado: si se sumara al resto de los retiros,
  // el comprobante imprimiría un esperado más bajo que el del arqueo FINAL y el
  // faltante que muestra el papel no coincidiría con el guardado.
  const idRetiroCierre = turno.retiroCierreMovimientoId ?? null;
  const previos = (movimientos || []).filter((m) => m.id !== idRetiroCierre);
  const totalIngresos = previos.filter((m) => m.tipo === "INGRESO").reduce((s, m) => s + m.monto, 0);
  const totalRetiros = previos.filter((m) => m.tipo === "RETIRO").reduce((s, m) => s + m.monto, 0);

  // El esperado GUARDADO manda. Solo se recalcula en turnos anteriores al
  // circuito, que no lo tienen persistido.
  const esperado =
    turno.montoEsperadoEfectivo != null
      ? Number(turno.montoEsperadoEfectivo)
      : Number(turno.montoInicial) + (resumen.totalEfectivo || 0) + totalIngresos - totalRetiros;

  let movHtml = "";
  if (previos.length > 0) {
    movHtml = `
<div class="line"></div>
<div class="center bold">MOVIMIENTOS CAJA</div>
<div class="row"><span>Ingresos:</span><span>+$${fmt(totalIngresos)}</span></div>
<div class="row"><span>Retiros:</span><span>-$${fmt(totalRetiros)}</span></div>`;
  }

  // Entrega del efectivo. Solo se imprime en turnos que pasaron por el circuito
  // nuevo: en los históricos estos campos son NULL y la sección no existe.
  const hayEntrega = turno.efectivoRetiradoCierre != null || turno.fondoDejadoCierre != null;
  const entregaHtml = hayEntrega
    ? `
<div class="line"></div>
<div class="center bold">ENTREGA DEL EFECTIVO</div>
<div class="row"><span>Se retira:</span><span>${plataOTexto(turno.efectivoRetiradoCierre, TEXTO_SIN_CONTAR)}</span></div>
<div class="row bold"><span>Queda de cambio:</span><span>${fmt(turno.fondoDejadoCierre)}</span></div>
${turno.destinoRetiroCierre ? `<div class="row"><span>Destino:</span><span>${turno.destinoRetiroCierre}</span></div>` : ""}
${turno.recibidoPorCierre ? `<div class="row"><span>Recibe:</span><span>${turno.recibidoPorCierre}</span></div>` : ""}
<div class="center" style="font-size:10px;margin-top:4px;">El cambio que queda abre el proximo turno</div>`
    : "";

  const obsHtml = turno.observaciones
    ? `
<div class="line"></div>
<div class="center bold">OBSERVACIONES</div>
<div style="font-size:11px;">${String(turno.observaciones).replace(/</g, "&lt;")}</div>`
    : "";

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Z Report - Turno #${turno.id}</title>
<style>
  body { font-family: monospace; font-size: 12px; width: 280px; margin: 0 auto; padding: 10px; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .line { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; }
  .row span:last-child { text-align: right; }
  .big { font-size: 14px; }
  h2 { margin: 4px 0; font-size: 14px; }
</style></head><body>
<div class="center bold big">Z REPORT</div>
<div class="center">Cierre de Turno</div>
<div class="line"></div>
<div class="row"><span>Turno:</span><span>#${turno.id}</span></div>
<div class="row"><span>Local:</span><span>${turno.local?.nombre || "-"}</span></div>
<div class="row"><span>Cajero:</span><span>${turno.vendedor?.nombre || "-"}</span></div>
<div class="row"><span>Apertura:</span><span>${fmtFecha(turno.apertura)}</span></div>
<div class="row"><span>Cierre:</span><span>${fmtFecha(turno.cierre)}</span></div>
<div class="line"></div>
<div class="center bold">VENTAS</div>
<div class="row"><span>Cantidad:</span><span>${resumen.cantidadVentas || 0}</span></div>
<div class="line"></div>
<div class="row"><span>Efectivo:</span><span>$${fmt(resumen.totalEfectivo)}</span></div>
<div class="row"><span>MercadoPago:</span><span>$${fmt(resumen.desglose?.mercadopago)}</span></div>
<div class="row"><span>Debito:</span><span>$${fmt(resumen.desglose?.debito)}</span></div>
<div class="row"><span>Credito:</span><span>$${fmt(resumen.desglose?.credito)}</span></div>
<div class="row"><span>Fiado:</span><span>$${fmt(resumen.desglose?.fiado)}</span></div>
<div class="line"></div>
<div class="row bold"><span>Total ventas:</span><span>$${fmt(totalVentas)}</span></div>
${movHtml}
<div class="line"></div>
<div class="center bold">ARQUEO EFECTIVO</div>
<div class="row"><span>Cambio inicial:</span><span>${fmt(turno.montoInicial)}</span></div>
<div class="row"><span>+ Ventas efectivo:</span><span>$${fmt(resumen.totalEfectivo)}</span></div>
${totalIngresos > 0 ? `<div class="row"><span>+ Ingresos:</span><span>$${fmt(totalIngresos)}</span></div>` : ""}
${totalRetiros > 0 ? `<div class="row"><span>- Retiros:</span><span>$${fmt(totalRetiros)}</span></div>` : ""}
<div class="row bold"><span>Efectivo esperado:</span><span>$${fmt(esperado)}</span></div>
<div class="row"><span>Efectivo contado:</span><span>${plataOTexto(turno.montoRealEfectivo, TEXTO_SIN_CONTAR)}</span></div>
<div class="row bold"><span>Diferencia:</span><span>${plataOTexto(turno.diferenciaEfectivo, TEXTO_DIFERENCIA_NO_DISPONIBLE)}</span></div>
${entregaHtml}
${obsHtml}
<div class="line"></div>
<div class="center" style="font-size:10px; margin-top:8px;">Impreso: ${fechaHoraAR(new Date())}</div>
</body></html>`;

  const win = window.open("", "_blank", "width=320,height=600");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}
