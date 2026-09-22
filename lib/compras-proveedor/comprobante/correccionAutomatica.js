// CUANDO EL NÚMERO SE DEDUCE, NO SE PREGUNTA.
//
// ── LA REGLA, DE EMANUEL ──────────────────────────────────────────────────
//
// Si el papel no cierra y el control señala UN SOLO producto, el número
// correcto se puede deducir de dos maneras independientes:
//
//   · POR EL TOTAL: total impreso − la suma de los demás subtotales.
//   · POR SU PROPIA CUENTA: (kilos o cantidad) × precio × (1 − bonificación).
//
// Si las dos coinciden dentro de la tolerancia del renglón, no hay nada que
// preguntar: las dos cuentas del papel apuntan al mismo número y lo que falló
// fue un dígito de la lectura. Se corrige solo.
//
// El caso que la definió, medido contra producción sobre el comprobante 13 del
// pedido 242: el yogur de vainilla se leyó $46.896,56; por el total da
// 861.376,07 − 814.489,52 = **$46.886,55**; por su cuenta, 10 × 4.688,659 =
// **$46.886,59**. Difieren 4 centavos sobre una tolerancia de 10, y el dígito
// mal leído salta a la vista: 896 por 886.
//
// ── CON CUÁL DE LOS DOS SE CORRIGE, Y POR QUÉ ─────────────────────────────
//
// Con el que sale DEL TOTAL. Es el único que hace cerrar el papel exactamente:
// medido sobre el 242, con él la diferencia final es de CERO centavos y con el
// otro quedan 4. La cuenta del renglón sirve para confirmar que el número es
// ése y no otro; el que manda es el que cuadra el papel.
//
// ── CUÁNDO SE SIGUE PREGUNTANDO ───────────────────────────────────────────
//
//   · HAY MÁS DE UN PRODUCTO SEÑALADO. Con dos, el reparto de la diferencia
//     entre ellos no es único y cualquier deducción sería una invención.
//   · LAS DOS CUENTAS NO COINCIDEN. Ahí no hay un número deducido: hay dos, y
//     cuál dice el papel lo contesta alguien mirando la foto.
//   · EL PAPEL NO TIENE TOTAL IMPRESO. Sin total no existe la primera cuenta —
//     es el caso del remito— y queda una sola, que no se puede confirmar contra
//     nada.
//
// En los tres casos vuelve el bloque de siempre: "Da la cuenta / Leyó /
// escribilo", con la foto al lado.
//
// Módulo puro: sin Prisma, sin React y sin red.

import {
  verificarCoherenciaDeLineas,
  toleranciaDelRenglon,
} from "./lector/puerta";

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const aCentavos = (v) => Math.round(v * 100);

/** Cuántas unidades tiene el renglón a los efectos de la tolerancia. */
function unidadesDelRenglon(linea) {
  const peso = num(linea?.peso ?? linea?.pesoKg);
  const cantidad = num(linea?.cantidad);
  return peso !== null && peso > 0 ? peso : cantidad;
}

/**
 * ¿SE PUEDE CORREGIR SOLO?
 *
 * @param lectura  la lectura rearmada: `{ hayTotalImpreso, pie: { total }, lineas: [...] }`
 *
 * @returns `{ aplica, porque, orden, leido, porElTotal, porSuCuenta, valor, diferencia, tolerancia }`.
 *          Con `aplica: false`, `porque` dice cuál de los tres motivos es — en
 *          castellano, para poder decirlo en pantalla si hiciera falta.
 */
export function correccionAutomatica(lectura) {
  const lineas = Array.isArray(lectura?.lineas) ? lectura.lineas : [];
  const total = num(lectura?.pie?.total);

  if (lectura?.hayTotalImpreso !== true || total === null) {
    return { aplica: false, porque: "El papel no trae total impreso, así que no hay con qué confirmar el número." };
  }
  if (!lineas.length) {
    return { aplica: false, porque: "El papel no trae renglones." };
  }

  // Quiénes no dan su cuenta. La MISMA función que usa la puerta: si un día
  // cambia la tolerancia, cambia para los dos.
  const coherencia = verificarCoherenciaDeLineas(lineas);
  const señalados = coherencia?.incoherentes ?? [];

  if (señalados.length === 0) {
    return { aplica: false, porque: "Ningún renglón está señalado." };
  }
  if (señalados.length > 1) {
    return {
      aplica: false,
      porque: `Hay ${señalados.length} productos señalados: con más de uno, cómo se reparte la diferencia no se puede deducir.`,
    };
  }

  const señalado = señalados[0];
  // `verificarCoherenciaDeLineas` devuelve el ÍNDICE dentro del arreglo que se
  // le pasó, no el `orden` del papel. Buscar por orden acá daría undefined y la
  // corrección se calcularía sobre el renglón equivocado.
  const linea = lineas[señalado.indice];
  if (!linea) return { aplica: false, porque: "No se encontró el renglón señalado." };

  // ── LAS DOS CUENTAS ─────────────────────────────────────────────────────
  //
  // En centavos: sumar pesos con decimales y comparar después es cómo se
  // fabrican diferencias de un centavo que no existen en el papel.
  const leidoCent = aCentavos(num(linea.subtotalLeido ?? linea.subtotalImpreso) ?? 0);
  let sumaDeLosDemasCent = 0;
  for (let i = 0; i < lineas.length; i += 1) {
    // Se descarta POR POSICIÓN y no por `orden`: una lectura recién hecha
    // todavía no tiene `orden` asignado —se numera al guardarla— y comparar dos
    // `undefined` no descarta nada, así que el renglón señalado se sumaría a sí
    // mismo y la resta contra el total daría cualquier cosa.
    if (i === señalado.indice) continue;
    const s = num(lineas[i].subtotalImpreso);
    if (s === null) {
      return { aplica: false, porque: "Otro renglón no trae subtotal, así que la resta contra el total no se puede hacer." };
    }
    sumaDeLosDemasCent += aCentavos(s);
  }

  const porElTotalCent = aCentavos(total) - sumaDeLosDemasCent;
  const porSuCuentaCent = señalado.subtotalQueDaLaCuenta != null
    ? aCentavos(señalado.subtotalQueDaLaCuenta)
    : null;

  if (porSuCuentaCent === null) {
    return { aplica: false, porque: "El renglón no tiene cómo dar su propia cuenta." };
  }
  if (porElTotalCent <= 0) {
    return { aplica: false, porque: "Lo que sale del total no es un importe posible para ese renglón." };
  }

  const tolerancia = toleranciaDelRenglon(unidadesDelRenglon(linea));
  const diferencia = Math.abs(porElTotalCent - porSuCuentaCent);

  if (diferencia > tolerancia) {
    return {
      aplica: false,
      porque:
        "Las dos cuentas no coinciden: por el total da un número y por su cuenta otro. " +
        "Cuál dice el papel lo tiene que decir alguien mirando la foto.",
      orden: Number(linea.orden ?? señalado.indice + 1),
      porElTotal: porElTotalCent / 100,
      porSuCuenta: porSuCuentaCent / 100,
      diferencia: diferencia / 100,
      tolerancia: tolerancia / 100,
    };
  }

  return {
    aplica: true,
    porque: null,
    orden: Number(linea.orden ?? señalado.indice + 1),
    nombre: linea.descripcion ?? linea.textoCrudo ?? null,
    leido: leidoCent / 100,
    // El que hace cerrar el papel. La cuenta del renglón confirma que es ése.
    valor: porElTotalCent / 100,
    porElTotal: porElTotalCent / 100,
    porSuCuenta: porSuCuentaCent / 100,
    diferencia: diferencia / 100,
    tolerancia: tolerancia / 100,
  };
}

/**
 * LA LÍNEA QUE VE LA PERSONA. Una sola, sin botones.
 *
 * Dice qué producto, qué se había leído y en qué quedó. Los dos números están
 * porque quien mira tiene que poder cotejarlo contra el papel si quiere — no
 * porque haya que decidir nada.
 */
export function textoDeLaCorreccion({ nombre, leido, valor } = {}, { moneda = (v) => `$${v}` } = {}) {
  if (valor === null || valor === undefined) return null;
  const quien = String(nombre ?? "Un producto").trim();
  return `${quien}: leyó ${moneda(leido)}, corregido a ${moneda(valor)}.`;
}
