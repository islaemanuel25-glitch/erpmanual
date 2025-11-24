"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function RedirigirNuevoLocal() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/modulos/locales?nuevo=1");
  }, [router]);

  return null;
}
