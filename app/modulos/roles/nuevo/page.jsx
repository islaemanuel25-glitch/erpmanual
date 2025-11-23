import { redirect } from "next/navigation";
export default function NuevoRolRedirect() {
  redirect("/modulos/roles?nuevo=1");
  return null;
}
