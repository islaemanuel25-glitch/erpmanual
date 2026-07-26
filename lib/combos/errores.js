// lib/combos/errores.js
//
// Error de CONTEXTO/validación de combos con `.status` para que las rutas lo
// mapeen a HTTP (400 params, 403 sin acceso, 404 inexistente, 409 conflicto).
// Mismo patrón que lib/precios/resolverListaCliente.js.
export function errCombo(msg, status = 400) {
  const e = new Error(msg);
  e.status = status;
  e.esErrorCombo = true;
  return e;
}

// Códigos de PrismaClientKnownRequestError que significan "el esquema de combos
// no existe en esta base de datos" (migración E1 sin aplicar).
const PRISMA_ESQUEMA_FALTA = new Set(["P2021", "P2022"]); // tabla / columna inexistente

// Traduce cualquier error de los endpoints de combos a una respuesta SEGURA para
// la UI. Regla:
//   - Error de negocio (lanzado con e.status 4xx y mensaje propio, p.ej. errCombo):
//     se muestra tal cual, específico. No se oculta.
//   - Error técnico (Prisma, 5xx, desconocido): la UI recibe un mensaje limpio.
//     El detalle técnico (stack, ruta local, chunk, invocación Prisma) SOLO se
//     registra en el servidor; nunca viaja al cliente.
//   - Caso especial P2021/P2022: falta el esquema de combos → mensaje accionable.
//
// Nunca devuelve éxito falso: siempre acompaña de un status de error.
// `accion` va en infinitivo: "crear el combo", "guardar el combo", "cargar el combo",
// "calcular la disponibilidad".
export function mensajeErrorCombo(e, { accion = "completar la operación" } = {}) {
  const status = Number(e?.status) || 500;

  // 1) Error de negocio explícito: mensaje específico, se respeta.
  if (status >= 400 && status < 500 && e?.message) {
    return { status, mensaje: e.message };
  }

  // 2) Falta el esquema de combos (E1 no aplicada en esta base).
  if (PRISMA_ESQUEMA_FALTA.has(e?.code)) {
    return {
      status: 503,
      mensaje: `No se pudo ${accion}. La funcionalidad de combos todavía no está habilitada en esta base de datos.`,
    };
  }

  // 3) Cualquier otro error técnico: mensaje genérico y limpio.
  return { status: 500, mensaje: `No se pudo ${accion}. Ocurrió un error interno.` };
}
