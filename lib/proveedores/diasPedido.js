// Utilidades para Proveedor.dias_pedido.
// El enum Prisma DiaPedido usa valores SIN acentos (Lunes..Domingo, Miercoles, Sabado).
// La UI muestra labels con acentos (Miércoles, Sábado).

export const DIAS_LABEL = {
  Lunes: "Lunes",
  Martes: "Martes",
  Miercoles: "Miércoles",
  Jueves: "Jueves",
  Viernes: "Viernes",
  Sabado: "Sábado",
  Domingo: "Domingo",
};

// Date.getDay(): 0=Domingo, 1=Lunes, ..., 6=Sábado
export const DIAS_ENUM_ORDER = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miercoles",
  "Jueves",
  "Viernes",
  "Sabado",
];

// Devuelve el valor de enum DiaPedido correspondiente al día actual local del cliente.
export function diaActualEnum() {
  return DIAS_ENUM_ORDER[new Date().getDay()];
}

// Devuelve true si el array dias_pedido incluye el día actual local.
// Si el array está vacío o no es array, devuelve false (no podemos afirmar nada).
export function recibeHoy(diasPedido) {
  if (!Array.isArray(diasPedido) || diasPedido.length === 0) return false;
  return diasPedido.includes(diaActualEnum());
}

// Convierte un valor de enum DiaPedido al label con acento para mostrar al usuario.
export function formatDiaLabel(enumValue) {
  return DIAS_LABEL[enumValue] || enumValue;
}
