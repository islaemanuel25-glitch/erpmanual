// POST /api/pos-ventas/retiros/registrar — RETIRADO DE SERVICIO
//
// Este endpoint registraba un retiro de recaudación en un solo golpe: recibía el
// conteo del cajón completo y calculaba el efectivo esperado EN ESE MOMENTO,
// dentro de la misma transacción que lo persistía.
//
// POR QUÉ SE DA DE BAJA EN VEZ DE ARREGLARSE
//
// El problema no era un cálculo mal hecho sino el momento en que se hacía.
// Contar un cajón lleva veinte minutos y el POS sigue vendiendo: al confirmar se
// comparaba un conteo de las 19:00 contra un esperado de las 19:20, y al cajero
// le aparecía un faltante por plata que entró después de que cerrara la pila.
// Peor: si "cuadraba" recontando el cajón, se llevaba ventas posteriores a su
// propio corte.
//
// Arreglarlo exige congelar el esperado ANTES de contar, y para congelar hace
// falta una fila. Ese es el flujo nuevo:
//
//   POST /api/pos-ventas/retiros/iniciar            separa el cambio y corta
//   GET  /api/pos-ventas/retiros/[token]            lee el corte congelado
//   POST /api/pos-ventas/retiros/[token]/confirmar  cuenta sólo lo retirado
//
// Se conserva la ruta respondiendo 409 en vez de borrarla, y no es por
// prolijidad: una pestaña abierta con la pantalla vieja puede seguir viva
// después del despliegue, y su POST tiene que fallar con un mensaje que se
// entienda en lugar de un 404 mudo. Registrar el retiro "como antes" sería
// reintroducir el bug justo en el caso en que la pestaña lleva horas abierta,
// que es cuando más grande es la diferencia.
//
// Los retiros ya registrados por esta vía NO se tocan: siguen siendo ArqueoCaja
// PARCIAL y se leen exactamente igual que siempre.
import { NextResponse } from "next/server";

/**
 * El texto que ve el cajero en la pestaña vieja.
 *
 * Es lo único que va a leer: el bundle anterior muestra `json.error` tal cual en
 * su renglón de error, sin más contexto. Por eso dice las tres cosas que hacen
 * falta —qué cambió, que ESTE conteo no se puede confirmar, y qué hacer— en vez
 * de un "operación no permitida" que dejaría a la persona mirando un cajón
 * contado sin saber si la plata salió o no.
 */
export const MENSAJE_FLUJO_NUEVO =
  "El retiro de recaudación ahora comienza separando el cambio. " +
  "Este conteo no puede confirmarse con el proceso anterior. " +
  "Volvé al POS e iniciá un retiro nuevo.";

export async function POST() {
  return NextResponse.json(
    { ok: false, error: MENSAJE_FLUJO_NUEVO, flujoObsoleto: true },
    { status: 409 }
  );
}
