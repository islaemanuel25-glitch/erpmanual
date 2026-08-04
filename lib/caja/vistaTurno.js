// lib/caja/vistaTurno.js
//
// Traducción del cierre de caja a LENGUAJE DIRECTO, y desglose de qué pasó entre
// un arqueo y el siguiente.
//
// No calcula plata nueva: toda la aritmética contable vive en efectivoEsperado.js
// y en cierreCaja.js. Acá solo se decide QUÉ SE DICE y CÓMO, para que la pantalla
// no tenga texto suelto y esto se pueda probar sin renderizar nada.
//
// Por qué existe: la pantalla mostraba "Sobrante $62.500" y nada más. El cajero
// leía un badge sin saber si eso era grave, ni de dónde salía, ni qué hacer. Un
// sobrante de esa magnitud casi siempre es plata de turnos anteriores que quedó
// en el cajón o un retiro que nadie registró — pero eso es una PISTA, no un
// veredicto, y el texto tiene que decirlo así.

import { aCentavos, desdeCentavos } from "./efectivoEsperado.js";

export const CAJA_CORRECTA = "CORRECTA";
export const CAJA_SOBRANTE = "SOBRANTE";
export const CAJA_FALTANTE = "FALTANTE";

const fmt = (n) =>
  Number(n ?? 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Resultado del cierre en palabras.
 *
 * @param {{esperado:any, contado:any}} args
 * @returns {{estado:string, titulo:string, monto:number, explicacion:string|null, cerrado:boolean}}
 */
export function resultadoCierre({ esperado, contado } = {}) {
  if (contado === null || contado === undefined) {
    return {
      estado: null,
      titulo: "Turno abierto",
      monto: 0,
      explicacion: "Todavía no se contó la caja. El resultado aparece al cerrar el turno.",
      cerrado: false,
    };
  }

  const dif = aCentavos(contado) - aCentavos(esperado);
  const monto = desdeCentavos(Math.abs(dif));

  if (dif === 0) {
    return {
      estado: CAJA_CORRECTA,
      titulo: "Caja correcta",
      monto: 0,
      explicacion: "Lo contado coincide exactamente con lo que tenía que haber.",
      cerrado: true,
    };
  }

  if (dif > 0) {
    return {
      estado: CAJA_SOBRANTE,
      titulo: `Sobran $${fmt(monto)}`,
      monto,
      // Pista, no veredicto: se enumeran las causas frecuentes sin afirmar cuál fue.
      explicacion:
        "Este sobrante puede ser dinero de turnos anteriores que quedó en el cajón o retiros no registrados.",
      cerrado: true,
    };
  }

  return {
    estado: CAJA_FALTANTE,
    titulo: `Faltan $${fmt(monto)}`,
    monto,
    explicacion:
      "Este faltante puede ser un error de conteo, un vuelto mal dado o dinero que salió del cajón sin registrarse.",
    cerrado: true,
  };
}

/**
 * Aviso específico cuando el faltante tiene la forma exacta del fondo omitido.
 * Se apoya en la misma regla que frena el cierre (cierreCaja.detectarFondoOmitido),
 * pero acá sirve para explicar un turno YA cerrado.
 */
export function pistaFondoOmitido({ esperado, contado, montoInicial } = {}) {
  const inicial = aCentavos(montoInicial);
  if (inicial <= 0) return null;
  if (aCentavos(esperado) - aCentavos(contado) !== inicial) return null;
  return `Lo contado coincide justo con el movimiento del turno: parece que no se contó el fondo inicial de $${fmt(
    desdeCentavos(inicial)
  )}.`;
}

/**
 * Qué pasó en el cajón ENTRE un arqueo y el anterior.
 *
 * El esperado de cada corte ya incluye todo lo acumulado desde la apertura, así
 * que su variación entre dos cortes ES el movimiento de esa ventana:
 *
 *     Δesperado = ventas en efectivo + ingresos − retiros
 *
 * Los ingresos y retiros salen de los CajaMovimiento con fecha dentro de la
 * ventana; el efectivo vendido se despeja. Así el usuario no tiene que restar dos
 * tarjetas a ojo para entender qué pasó en el medio.
 *
 * @param {Array} arqueos ordenados por fecha ascendente
 * @param {Array} movimientos CajaMovimiento del turno (con createdAt)
 * @param {any} montoInicial fondo de apertura (base del primer tramo)
 * @returns {Array} los mismos arqueos con { desdeAnterior: {ventasEfectivo, ingresos, retiros, texto} }
 */
export function desglosarEntreArqueos(arqueos = [], movimientos = [], montoInicial = 0) {
  const lista = Array.isArray(arqueos) ? arqueos : [];
  const movs = Array.isArray(movimientos) ? movimientos : [];

  // ── Qué movimiento pertenece a qué retiro: por VÍNCULO, no por reloj ──────
  //
  // `ArqueoCaja.fechaHora` se sella unos milisegundos ANTES de crear el
  // CajaMovimiento del propio retiro (9 a 190 ms medidos en el turno 188 de
  // producción). Con ventanas `t > previo && t <= actual`, el movimiento de un
  // retiro caía siempre fuera de su propia ventana y aparecía en la fila
  // SIGUIENTE: la fila del retiro de $38.400 decía "se retiraron $103.400", que
  // es lo que se había llevado el control anterior. El retiro anterior
  // reapareciendo.
  //
  // `cajaMovimientoRetiroId` identifica sin ambigüedad el movimiento de cada
  // retiro, y no depende del orden de escritura dentro de la transacción. Los
  // movimientos SIN vínculo —caja chica, ingresos, retiros manuales— siguen
  // repartiéndose por fecha, que para ellos es el único criterio disponible.
  const montoPorMovimiento = new Map();
  for (const m of movs) {
    if (m?.id != null) montoPorMovimiento.set(Number(m.id), aCentavos(m.monto));
  }
  const idsVinculados = new Set();
  for (const a of lista) {
    if (a?.cajaMovimientoRetiroId != null) idsVinculados.add(Number(a.cajaMovimientoRetiroId));
  }
  /** Importe del retiro propio de un arqueo, en centavos. */
  const retiroPropioCent = (a) => {
    if (!a) return 0;
    const id = a.cajaMovimientoRetiroId != null ? Number(a.cajaMovimientoRetiroId) : null;
    if (id != null && montoPorMovimiento.has(id)) return montoPorMovimiento.get(id);
    // Sin el movimiento a mano (lista parcial), el importe guardado en la fila.
    return aCentavos(a.efectivoRetirado ?? 0);
  };

  return lista.map((a, i) => {
    const previo = i > 0 ? lista[i - 1] : null;
    const desde = previo ? new Date(previo.fechaHora).getTime() : null;
    const hasta = new Date(a.fechaHora).getTime();

    // Solo movimientos SIN vínculo: los vinculados ya tienen dueño y contarlos
    // otra vez acá los duplicaría.
    const manualesEnVentana = movs.filter((m) => {
      if (m?.id != null && idsVinculados.has(Number(m.id))) return false;
      const t = new Date(m.createdAt ?? m.fecha).getTime();
      if (!Number.isFinite(t)) return false;
      return (desde === null || t > desde) && t <= hasta;
    });

    let ingresosCent = 0;
    let manualesCent = 0;
    for (const m of manualesEnVentana) {
      if (m.tipo === "INGRESO") ingresosCent += aCentavos(m.monto);
      else if (m.tipo === "RETIRO") manualesCent += aCentavos(m.monto);
    }

    // ── Dos conjuntos distintos, y no da lo mismo confundirlos ──────────────
    //
    // ARITMÉTICA: el esperado de un arqueo se calcula ANTES de su propio retiro,
    // así que la variación entre dos cortes la explica el retiro del control
    // PREVIO, no el de este. Con este conjunto se despejan las ventas.
    //
    // PRESENTACIÓN: la fila muestra SU retiro. Es lo que la persona busca cuando
    // mira ese renglón.
    const retirosAritmeticaCent = manualesCent + retiroPropioCent(previo);
    const propioCent = retiroPropioCent(a);

    const baseCent = previo ? aCentavos(previo.efectivoEsperado) : aCentavos(montoInicial);
    const deltaCent = aCentavos(a.efectivoEsperado) - baseCent;
    // Se despeja: si el delta no se explica por movimientos, lo que queda son ventas.
    const ventasCent = deltaCent - ingresosCent + retirosAritmeticaCent;

    const ventasEfectivo = desdeCentavos(ventasCent);
    const ingresos = desdeCentavos(ingresosCent);
    const retiroDelControl = desdeCentavos(propioCent);
    const retirosManuales = desdeCentavos(manualesCent);
    const retiros = desdeCentavos(propioCent + manualesCent);

    const partes = [];
    partes.push(`entraron $${fmt(ventasEfectivo)} en efectivo`);
    if (ingresosCent > 0) partes.push(`ingresaron $${fmt(ingresos)}`);
    if (propioCent > 0) partes.push(`se retiraron $${fmt(retiroDelControl)}`);
    // Los manuales se nombran aparte: mezclarlos con el retiro del control da un
    // número que no coincide con ninguno de los dos.
    if (manualesCent > 0) partes.push(`salieron $${fmt(retirosManuales)} en movimientos manuales`);
    const cabeza = previo ? "Desde el control anterior" : "Desde la apertura";
    const texto = `${cabeza} ${partes.join(", ")}.`;

    return {
      ...a,
      desdeAnterior: {
        ventasEfectivo,
        ingresos,
        retiros,
        retiroDelControl,
        retirosManuales,
        texto,
      },
    };
  });
}

/**
 * Resumen de la tarjeta de arqueos, sin sumar diferencias.
 *
 * Sumar la diferencia de cada corte cuenta el mismo faltante una vez por arqueo
 * posterior: un faltante de $1.000 detectado a las 10:47 sigue faltando a las
 * 12:25, es el mismo, no $2.000. Por eso se informa la MAYOR y la FINAL.
 */
export function resumenArqueosVista(arqueos = []) {
  const lista = Array.isArray(arqueos) ? arqueos : [];
  let conDiferencia = 0;
  let mayor = 0;
  for (const a of lista) {
    const d = Number(a?.diferencia) || 0;
    if (aCentavos(d) !== 0) conDiferencia += 1;
    if (Math.abs(d) > Math.abs(mayor)) mayor = d;
  }
  const final = lista.find((a) => a?.tipo === "FINAL") || null;
  return {
    cantidad: lista.length,
    conDiferencia,
    mayorDiferencia: mayor,
    diferenciaFinal: final ? Number(final.diferencia) : null,
    hayFinal: !!final,
  };
}

/**
 * Cómo se llama cada registro en pantalla.
 *
 * Un arqueo histórico fue SOLO un conteo: nunca movió dinero. Mostrarlo como
 * "retiro" sería reinterpretar el pasado — hay ~33 de esos en producción.
 *
 * La distinción se hace por los DATOS, no por la fecha ni por el importe: si
 * tiene movimiento de caja vinculado o estado de entrega, hubo retiro de verdad.
 * Un retiro de $0 no genera movimiento pero sí tiene estado, así que sigue
 * contando como retiro; un registro viejo con importes sueltos, no.
 */
export function etiquetaRegistro(a) {
  const huboRetiro = a?.cajaMovimientoRetiroId != null || a?.estadoEntrega != null;
  if (a?.tipo === "FINAL") return huboRetiro ? "cierre con retiro" : "cierre";
  return huboRetiro ? "retiro de dinero" : "conteo histórico";
}
