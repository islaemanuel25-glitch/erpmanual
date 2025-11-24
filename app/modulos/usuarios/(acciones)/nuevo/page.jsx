import { redirect } from "next/navigation";
export default function NuevoUsuarioRedirect() {
  redirect("/modulos/usuarios?nuevo=1");
}
