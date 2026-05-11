"use client";

import { use } from "react";
import { useRouter } from "next/navigation";

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
    <div className="w-full min-h-full p-2">
      <EditorGrupo grupoId={numId} />
    </div>
  );
}
