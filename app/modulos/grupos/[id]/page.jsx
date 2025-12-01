"use client";

import { use } from "react";
import { useRouter } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";

import EditorGrupo from "@/components/grupos/EditorGrupo";

export default function PageGrupo({ params }) {
  const router = useRouter();
  const { id } = use(params);
  const numId = Number(id);

  if (!numId || Number.isNaN(numId)) {
    router.push("/modulos/grupos");
    return null;
  }

  return (
    <div className="w-full min-h-full">
      <SunmiCard>
        <SunmiCardHeader
          title="Administrar Grupo"
          subtitle={`Grupo #${numId}`}
          color="amber"
        />

        <SunmiSeparator />

        <EditorGrupo grupoId={numId} />
      </SunmiCard>
    </div>
  );
}
