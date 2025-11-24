import { redirect } from "next/navigation";

export default function EditarUsuarioRedirect({ params }) {
  redirect(`/modulos/usuarios?editar=${params.id}`);
  return null;
}
