"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export default function SunmiBackButton({ href, className = "" }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => (href ? router.push(href) : router.back())}
      className={`sunmi-btn-base sunmi-btn-slate inline-flex items-center gap-1.5 ${className}`}
    >
      <ArrowLeft size={15} />
      Volver
    </button>
  );
}
