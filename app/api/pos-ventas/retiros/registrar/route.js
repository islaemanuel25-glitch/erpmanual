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

export const MENSAJE_FLUJO_NUEVO =
  "El retiro cambió: ahora se separa el cambio y se toma un corte antes de contar. " +
  "Volvé a abrir la pantalla de retiro para empezar de nuevo.";

export async function POST() {
  return NextResponse.json(
    { ok: false, error: MENSAJE_FLUJO_NUEVO, flujoObsoleto: true },
    { status: 409 }
  );
}
