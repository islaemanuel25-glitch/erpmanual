// EL CONTADOR COMPARTIDO DE CONSULTAS A LA IA.
//
// ── SE CUENTA ANTES DE LLAMAR, NO DESPUÉS ─────────────────────────────────
//
// Es la diferencia que hace que el contador sirva. Una consulta que falla gasta
// cuota igual: el 429 se cuenta contra el tope lo mismo que un acierto. Contar
// después de que salió bien mostraría MÁS consultas disponibles de las que hay,
// y este número existe justamente para que nadie se entere de que no quedan con
// el camión en la puerta.
//
// Y contar antes tapa el otro agujero: si el proceso se muere en el medio, la
// consulta se hizo y la fila quedó. Contando después, esa consulta sería
// invisible para siempre.
//
// ── LA TABLA YA EXISTÍA ───────────────────────────────────────────────────
//
// `LlamadaLector` la creó el módulo de comprobantes y guarda una fila por
// llamada, con su modelo y su motivo. No se creó otra al lado: el pedido es que
// el importador y los comprobantes compartan el MISMO contador, y dos tablas
// serían dos cuentas que suman distinto.
//
// Lo que cambia es quién la escribe. Antes la escribían las rutas de
// comprobantes, después de leer; ahora la escribe la puerta, antes de salir. Las
// filas del importador tienen `comprobanteId` en null, que es lo que ya
// significaba "una llamada sin comprobante detrás".

import prisma from "@/lib/prisma";
import { desdeCuandoSeCuenta, hayCuota, limiteDiario, MOTIVO_LIMITE } from "./limiteDiario";

/** Lo que se escribe mientras la consulta está en curso. */
export const MOTIVO_EN_CURSO = "EN_CURSO";

/**
 * CUÁNTAS SE USARON HOY, contando TODOS los modelos juntos.
 *
 * El tope de Google es por modelo, pero el que le importa a quien está delante
 * de la pantalla es cuántas consultas puede hacer hoy. Sumar los modelos es la
 * cuenta conservadora: nunca promete más de las que hay.
 */
export async function usadasHoy({ ahora = new Date(), env = process.env, cliente = prisma } = {}) {
  const { desde } = desdeCuandoSeCuenta(ahora, env);
  return cliente.llamadaLector.count({ where: { creadoEn: { gte: desde } } });
}

/** El estado del consumo, para mostrarlo. No reserva nada. */
export async function estadoDeConsumo({ ahora = new Date(), env = process.env, cliente = prisma } = {}) {
  const usadas = await usadasHoy({ ahora, env, cliente });
  return hayCuota({ usadasHoy: usadas, limite: limiteDiario(env) });
}

/**
 * RESERVA UNA CONSULTA, O DICE QUE NO HAY.
 *
 * Devuelve `{ ok:true, id }` con la fila ya escrita —la consulta está contada
 * antes de existir— o `{ ok:false, motivo: LIMITE_DIARIO }`.
 *
 * ── LO QUE ESTO NO ES ─────────────────────────────────────────────────────
 *
 * No es un candado contra concurrencia: dos pedidos simultáneos podrían leer el
 * mismo conteo y reservar los dos. Con un tope de veinte y un solo operador eso
 * no cambia nada, y resolverlo bien pide un bloqueo en la base que costaría más
 * de lo que arregla. Se dice acá para que nadie lo suponga resuelto.
 */
export async function reservarConsulta({
  modelo,
  comprobanteId = null,
  ahora = new Date(),
  env = process.env,
  cliente = prisma,
} = {}) {
  const estado = await estadoDeConsumo({ ahora, env, cliente });
  if (!estado.puede) return { ok: false, motivo: MOTIVO_LIMITE, ...estado };

  const fila = await cliente.llamadaLector.create({
    data: { modelo: String(modelo || "desconocido"), ok: false, motivo: MOTIVO_EN_CURSO, comprobanteId },
    select: { id: true },
  });
  return { ok: true, id: fila.id, ...estado, usadas: estado.usadas + 1, quedan: Math.max(0, estado.quedan - 1) };
}

/** Cierra la fila con lo que pasó. La fila YA existe: esto no cuenta de nuevo. */
export async function cerrarConsulta({ id, ok, motivo = null, cliente = prisma } = {}) {
  if (!id) return;
  try {
    await cliente.llamadaLector.update({ where: { id }, data: { ok: ok === true, motivo: motivo ?? null } });
  } catch {
    // Que no se pueda cerrar la fila no puede tumbar la consulta: la reserva ya
    // cumplió su trabajo, que era contar. El motivo se pierde, el conteo no.
  }
}

/**
 * EL CONTADOR QUE USA LA PUERTA POR DEFECTO.
 *
 * Se pasa como objeto para poder inyectar uno de mentira en los candados. El de
 * verdad toca la base; el de los candados cuenta en memoria. Sin esta costura,
 * probar el límite exigiría una base.
 */
export const contadorPersistente = {
  reservar: (args) => reservarConsulta(args),
  cerrar: (args) => cerrarConsulta(args),
  estado: (args) => estadoDeConsumo(args),
};

/**
 * UN CONTADOR EN MEMORIA, para candados y para el andamio.
 *
 * Vive acá y no en un archivo de pruebas porque también lo usa la sonda: si
 * estuviera del lado de las pruebas, la sonda tendría que escribir el suyo y
 * serían dos cosas que se comportan parecido.
 */
export function contadorEnMemoria({ limite = 20, usadas = 0 } = {}) {
  let cuenta = usadas;
  let proximoId = 1;
  const filas = [];
  return {
    async reservar({ modelo } = {}) {
      if (cuenta >= limite) {
        return { ok: false, motivo: MOTIVO_LIMITE, usadas: cuenta, limite, quedan: 0, puede: false };
      }
      cuenta += 1;
      const id = proximoId++;
      filas.push({ id, modelo, ok: false, motivo: MOTIVO_EN_CURSO });
      return { ok: true, id, usadas: cuenta, limite, quedan: limite - cuenta, puede: true };
    },
    async cerrar({ id, ok, motivo } = {}) {
      const f = filas.find((x) => x.id === id);
      if (f) { f.ok = ok === true; f.motivo = motivo ?? null; }
    },
    async estado() {
      return hayCuota({ usadasHoy: cuenta, limite });
    },
    /** Para que un candado pueda afirmar CUÁNTAS se contaron. */
    cuantasSeContaron: () => cuenta,
    filasEscritas: () => filas.slice(),
  };
}
