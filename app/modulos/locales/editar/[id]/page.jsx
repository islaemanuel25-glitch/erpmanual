"use client";

import { useRouter, useParams } from "next/navigation";
import { useEffect } from "react";

export default function RedirigirEditarLocal() {
  const router = useRouter();
  const { id } = useParams();

  useEffect(() => {
    router.replace(`/modulos/locales?editar=${id}`);
  }, [id, router]);

  return null;
}
