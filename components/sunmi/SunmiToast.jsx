"use client";

import toast, { Toaster } from "react-hot-toast";

export const showSuccess = (msg) => toast.success(msg, { duration: 3000 });
export const showError = (msg) => toast.error(msg, { duration: 4000 });
export const showWarning = (msg) => toast(msg, { icon: "\u26a0\ufe0f", duration: 3500 });
export const showInfo = (msg) => toast(msg, { icon: "\u2139\ufe0f", duration: 3000 });

/*
USO:
import { showSuccess, showError, showWarning, showInfo } from '@/components/sunmi/SunmiToast';

showSuccess('Producto creado correctamente');
showError('Error al eliminar producto');
showWarning('Stock bajo, considerar reposicion');
showInfo('Procesando transferencia...');
*/

export function SunmiToaster() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 3000,
        style: {
          background: "#1e293b",
          color: "#f1f5f9",
          border: "1px solid #334155",
          borderRadius: "0.375rem",
          fontSize: "14px",
        },
        success: {
          iconTheme: {
            primary: "#10b981",
            secondary: "#fff",
          },
        },
        error: {
          iconTheme: {
            primary: "#ef4444",
            secondary: "#fff",
          },
        },
      }}
    />
  );
}
