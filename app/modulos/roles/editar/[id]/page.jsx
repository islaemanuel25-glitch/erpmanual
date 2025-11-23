import { redirect } from "next/navigation";
export default function EditarRolRedirect({ params }) {
  redirect(`/modulos/roles?editar=${params.id}`);
  return null;
}
