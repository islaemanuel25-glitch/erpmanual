import { redirect } from "next/navigation";

// Compatibilidad: "Pedidos activos" se reemplazó por "Pedidos pendientes".
// Redirige preservando proveedorId si viene.
export default async function ActivosRedirect({ searchParams }) {
  const sp = (await searchParams) || {};
  const proveedorId = sp.proveedorId;
  let dest = "/modulos/compras-proveedor/pendientes";
  if (proveedorId) dest += `?proveedorId=${encodeURIComponent(proveedorId)}`;
  redirect(dest);
}
