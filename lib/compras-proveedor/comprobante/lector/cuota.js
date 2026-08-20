// lib/compras-proveedor/comprobante/lector/cuota.js
//
// CUÁNTAS LECTURAS QUEDAN HOY.
//
// ── POR QUÉ SE CUENTAN LLAMADAS Y NO COMPROBANTES ──────────────────────────
//
// Una lectura que falló gasta cuota igual. El 429 del titular se cuenta contra
// el tope diario lo mismo que un acierto, y un comprobante que se leyó dos veces
// gastó dos. Contar comprobantes leídos mostraría MÁS lecturas disponibles de las
// que hay, y este número existe justamente para que nadie se entere de que no
// quedan con el camión en la puerta.
//
// Por eso hay una fila por LLAMADA, y la escribe la ruta con lo que informa la
// cadena — que sabe si hubo una o dos, porque pasar al respaldo son dos.
//
// ── EL LÍMITE, MEDIDO ──────────────────────────────────────────────────────
//
// No sale de la documentación: sale del cuerpo del 429 que devolvió la API el
// 2026-08-12, que trae el número exacto.
//
//   quotaId:     GenerateRequestsPerDayPerProjectPerModel-FreeTier
//   quotaValue:  20
//
// POR MODELO. Con titular y respaldo son dos modelos distintos, así que el techo
// real del día son 40 lecturas, no 20 — y por eso el conteo va por modelo y se
// suma después, en vez de llevar un total suelto.
//
// ── LA MEDIANOCHE NO ES LA NUESTRA, Y ESTO ES LO DELICADO ──────────────────
//
// La cuota se repone en la medianoche del huso del proveedor, no en la de acá.
// Contar "desde las 00:00 de Argentina" daría un número que no coincide con lo
// que pasa durante las horas en que los dos husos no están en el mismo día — y
// un contador que dice "quedan 12" cuando quedan 0 es peor que no tener ninguno.
//
// LO QUE SE SABE Y LO QUE NO:
//
//   · SE SABE que el tope es diario y de 20, porque lo dijo la API.
//   · NO SE SABE a qué hora exacta repone. No se puede averiguar desde acá sin
//     esperar a que ocurra, y no se va a afirmar de memoria.
//
// Qué se hace con eso, que es lo único honesto: la hora del corte es
// CONFIGURABLE —`COMPROBANTE_CUOTA_HUSO`, por defecto America/Los_Angeles, que
// es donde Google factura su nivel gratuito— y **la pantalla dice cuál está
// usando y a qué hora local repone**. Si el número no coincide con la realidad,
// se ve enseguida y se corrige la variable, en vez de quedar como un misterio.
//
// Y hay cómo averiguarlo con datos: cada llamada queda registrada con su hora y
// su motivo. La primera llamada que sale BIEN después de una racha de
// CUOTA_AGOTADA marca el momento en que repuso. Con dos o tres días de uso, la
// hora sale sola de la tabla. `horaDeReposicionObservada` hace esa cuenta.

/** MEDIDO en el cuerpo del 429, no leído en la documentación. */
import { TZ_AR } from "@/lib/fechas/formatearFechaHora";

export const LIMITE_POR_MODELO_POR_DIA = 20;

/** Debajo de esto, se muestra. Arriba, no se molesta. */
export const AVISAR_CUANDO_QUEDAN = 10;

export const HUSO_POR_DEFECTO = "America/Los_Angeles";

/**
 * El comienzo del día de la cuota, en tiempo real.
 *
 * Se calcula con `Intl`, que conoce los cambios de horario de verano. Hacerlo
 * restando horas fijas se rompe dos veces por año, y se rompe en silencio.
 */
export function comienzoDelDiaDeCuota(ahora, huso = HUSO_POR_DEFECTO) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: huso,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(ahora).map((x) => [x.type, x.value]));
  // Cuánto va del día ALLÁ, restado del instante actual: da el instante real en
  // que allá empezó el día. No hace falta reconstruir ninguna fecha.
  const hora = Number(p.hour === "24" ? "0" : p.hour);
  const transcurrido = (hora * 3600 + Number(p.minute) * 60 + Number(p.second)) * 1000;
  return new Date(ahora.getTime() - transcurrido);
}

/**
 * La hora local a la que repone, para poder decirla en la pantalla.
 *
 * ── POR QUÉ ÉSTA NO USA `horaAR` DEL HELPER ─────────────────────────────────
 *
 * Es el único caso del repo que convierte entre DOS husos: la cuota se corta en
 * California y hay que decir a qué hora es eso acá. El huso de destino es un
 * PARÁMETRO —para poder probar la conversión sin depender de dónde corra el
 * test—, así que no se puede fijar adentro como hace el helper. Lo que sí sale
 * del helper es la constante de Argentina, que es el default: la zona se define
 * en un solo lugar. El `hour12: false` ya estaba y por eso esta función nunca
 * mostró "a. m.".
 */
export function horaLocalDeReposicion(ahora, huso = HUSO_POR_DEFECTO, husoLocal = TZ_AR) {
  const inicio = comienzoDelDiaDeCuota(ahora, huso);
  // El próximo corte es 24 horas después del último.
  const proximo = new Date(inicio.getTime() + 24 * 3600 * 1000);
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: husoLocal, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(proximo);
}

/**
 * Cuántas quedan, por modelo y en total.
 *
 * @param llamadas  [{ modelo, creadoEn }] — TODAS, hayan salido bien o mal
 * @param modelos   los de la cadena, en orden: [titular, respaldo]
 */
export function cuotaDelDia({ llamadas = [], modelos = [], ahora = new Date(), huso = HUSO_POR_DEFECTO, limite = LIMITE_POR_MODELO_POR_DIA } = {}) {
  const desde = comienzoDelDiaDeCuota(ahora, huso);
  const usadasPor = new Map();
  for (const l of llamadas) {
    if (!l?.modelo || !l?.creadoEn) continue;
    if (new Date(l.creadoEn) < desde) continue;
    usadasPor.set(l.modelo, (usadasPor.get(l.modelo) || 0) + 1);
  }

  // ── EL 429 MANDA SOBRE NUESTRA CUENTA ────────────────────────────────
  //
  // Si el proveedor ya dijo hoy que este modelo no tiene más cuota, no tiene
  // sentido seguir informando lo que da la resta: él sabe y nosotros estimamos.
  //
  // No es teórico. La tabla arrancó vacía el día que se creó, con el titular ya
  // agotado por las pruebas: sin esto, la pantalla habría dicho "quedan 40" con
  // la mitad efectivamente en cero. Y pasa igual cada vez que algo consuma cuota
  // por fuera de esta aplicación —otra prueba, otro proyecto usando la misma
  // clave—, que es una posibilidad permanente y no un caso de estreno.
  //
  // La regla, que vale más allá de acá: cuando el que sabe contesta, su respuesta
  // gana sobre el número que dedujimos nosotros. Un contador optimista es peor
  // que no tener contador.
  const agotadosPorElProveedor = new Set(
    llamadas
      .filter((l) => l?.motivo === "CUOTA_AGOTADA" && l?.creadoEn && new Date(l.creadoEn) >= desde)
      .map((l) => l.modelo)
  );

  const porModelo = modelos.filter(Boolean).map((m) => {
    const usadas = usadasPor.get(m) || 0;
    const loDijoElProveedor = agotadosPorElProveedor.has(m);
    return {
      modelo: m,
      usadas,
      quedan: loDijoElProveedor ? 0 : Math.max(0, limite - usadas),
      limite,
      // Se distingue para poder decirlo distinto: "se agotó" no es lo mismo que
      // "por nuestra cuenta quedan pocas".
      loDijoElProveedor,
    };
  });

  const quedan = porModelo.reduce((a, x) => a + x.quedan, 0);
  return {
    porModelo,
    quedan,
    // El techo del día con la cadena entera, para poder decir "3 de 40".
    techo: porModelo.length * limite,
    desde,
    huso,
    // La pantalla no decide el umbral: viene decidido de acá, en un solo lugar.
    mostrar: quedan <= AVISAR_CUANDO_QUEDAN,
  };
}

/**
 * A qué hora repuso DE VERDAD, según lo observado.
 *
 * La primera llamada que sale bien después de una racha de CUOTA_AGOTADA del
 * mismo modelo marca el momento en que repuso. Devuelve null mientras no haya
 * ocurrido: no se inventa una hora por no tener ninguna.
 *
 * Existe para que la hora del corte deje de ser una suposición configurable y
 * pase a ser un dato, con dos o tres días de uso normal.
 */
export function horaDeReposicionObservada(llamadas = []) {
  const orden = [...llamadas]
    .filter((l) => l?.modelo && l?.creadoEn)
    .sort((a, b) => new Date(a.creadoEn) - new Date(b.creadoEn));

  const observaciones = [];
  const agotadoDesde = new Map();
  for (const l of orden) {
    if (l.motivo === "CUOTA_AGOTADA") {
      if (!agotadoDesde.has(l.modelo)) agotadoDesde.set(l.modelo, l.creadoEn);
    } else if (l.ok && agotadoDesde.has(l.modelo)) {
      observaciones.push({ modelo: l.modelo, repusoAntesDe: l.creadoEn, agotadoDesde: agotadoDesde.get(l.modelo) });
      agotadoDesde.delete(l.modelo);
    }
  }
  return observaciones.length ? observaciones : null;
}
