"use client";

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/app/context/UserContext";
import { useOperadorActivo } from "@/hooks/useOperadorActivo";
import ModalPedirOperador from "@/components/operador/ModalPedirOperador";

const OperadorContext = createContext(null);

/**
 * Fuente ÚNICA del estado de operario para todo /modulos.
 *
 * - Ingreso inicial sin operario  → redirect a /bloqueo-operador (como antes).
 * - Vencimiento / logout a mitad de sesión → modal de PIN POR ENCIMA de la
 *   pantalla actual, sin navegar: la venta/turno/caja queda intacto.
 * - Handlers de 428 llaman requerirOperador() → revalida; al confirmarse que no
 *   hay operario, aparece el mismo modal.
 *
 * El dueño (permiso *) y quien tenga modulos.acceso_sin_operador quedan exentos.
 */
export function OperadorProvider({ children }) {
  const router = useRouter();
  const { perfil } = useUser();
  const { operador, voucher, loading, login, logout, refrescar } = useOperadorActivo();

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const exento =
    permisos.includes("*") || permisos.includes("modulos.acceso_sin_operador");

  // ¿Hubo operario alguna vez en esta sesión? Distingue "ingreso inicial" (nunca
  // hubo → redirect) de "se cayó a mitad de sesión" (había → modal). Es estado
  // (no ref) para poder leerlo en render sin romper la regla de hooks.
  const [huboOperador, setHuboOperador] = useState(false);

  useEffect(() => {
    if (loading || exento) return;
    if (operador) {
      // Flag sticky de sesión: sincroniza que YA hubo operario. Es la única forma
      // de distinguir el ingreso inicial (redirect) de una caída a mitad de
      // sesión (modal). Justifica el setState dentro del effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!huboOperador) setHuboOperador(true);
      return;
    }
    // operador === null y ya cargó
    if (!huboOperador) {
      router.replace("/bloqueo-operador"); // ingreso inicial
    }
  }, [loading, operador, exento, huboOperador, router]);

  // Disparo imperativo desde los handlers de 428: revalidamos; si efectivamente
  // no hay operario (token vencido), operador pasa a null y el modal (derivado)
  // aparece solo.
  const requerirOperador = useCallback(() => {
    refrescar();
  }, [refrescar]);

  const value = useMemo(
    () => ({ operador, voucher, loading, login, logout, refrescar, requerirOperador }),
    [operador, voucher, loading, login, logout, refrescar, requerirOperador]
  );

  // Modal derivado: se muestra cuando no hay operario PERO ya hubo uno en la
  // sesión (caída a mitad de sesión). Se oculta solo apenas vuelve a haber
  // operario. El ingreso inicial (sin operario previo) va por redirect, no acá.
  const mostrarModal = !exento && !operador && huboOperador;

  // Puerta de ingreso inicial: mientras carga por primera vez y todavía no hubo
  // operario, no mostramos el chrome (igual que hacía layout.jsx antes).
  if (loading && !huboOperador && !exento) return null;

  return (
    <OperadorContext.Provider value={value}>
      {children}
      {mostrarModal && <ModalPedirOperador onLogin={login} />}
    </OperadorContext.Provider>
  );
}

export function useOperadorContext() {
  const ctx = useContext(OperadorContext);
  if (!ctx) {
    throw new Error("useOperadorContext debe usarse dentro de <OperadorProvider>");
  }
  return ctx;
}
