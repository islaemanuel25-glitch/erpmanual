import { redirect } from "next/navigation";

// Compatibilidad: esta ruta dejó de ser la pantalla principal.
// Redirige a los submódulos reales preservando links viejos:
//   ?vista=historial                 → /historial
//   ?vista=activos&estado=ENVIADO     → /recepcion
//   (resto)                          → /pendientes
// Preserva proveedorId si viene.
export default async function ComprasProveedorRedirect({ searchParams }) {
  const sp = (await searchParams) || {};
  const vista = sp.vista;
  const estado = sp.estado;
  const proveedorId = sp.proveedorId;

  let dest;
  if (vista === "historial") {
    dest = "/modulos/compras-proveedor/historial";
  } else if (vista === "activos" && estado === "ENVIADO") {
    dest = "/modulos/compras-proveedor/recepcion";
  } else {
    dest = "/modulos/compras-proveedor/pendientes";
  }

  if (proveedorId) {
    dest += `?proveedorId=${encodeURIComponent(proveedorId)}`;
  }

  redirect(dest);
}
