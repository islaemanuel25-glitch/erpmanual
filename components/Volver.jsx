"use client";
import { useRouter } from "next/navigation";

export default function Volver() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      className="text-blue-600 hover:text-blue-800 font-medium mb-3"
    >
      ← Volver
    </button>
  );
}
