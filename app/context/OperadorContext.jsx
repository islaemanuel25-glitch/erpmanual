"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/app/context/UserContext";
import { useOperadorActivo } from "@/hooks/useOperadorActivo";
import { perfilExentoDeOperador } from "@/lib/operador-exencion";
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
 * Exentos: Admin (permiso *) y DUEÑO_LOCAL (rol de sistema, en su local).
 * Ver lib/operador-exencion.js. modulos.acceso_sin_operador quedó legacy.
 */
export function OperadorProvider({ children }) {
  const router = useRouter();
  const { perfil, refrescar: refrescarPerfil } = useUser();
  const { operador, voucher, loading, login, logout, refrescar } = useOperadorActivo();

  const exento = perfilExentoDeOperador(perfil);

  // LOS PERMISOS DEPENDEN DEL OPERADOR. Con operador activo `/api/me` devuelve
  // los de la cuenta menos lo que no es del operador (Finanzas, el total del
  // día: lib/rbac/permisosDelOperador.js). Cuando entra, sale o cambia el
  // operador, el perfil se vuelve a pedir para que el menú y el Panel muestren
  // lo que corresponde. Se dispara por CAMBIO de operador y no comparando con
  // `perfil.operadorActivo`: las dos fuentes miran la cookie con criterios
  // distintos (ésta valida contra el local) y compararlas podría no cerrar nunca.
  const operadorId = operador?.operadorId ?? null;
  const operadorVisto = useRef(undefined);
  useEffect(() => {
    if (loading) return;
    if (operadorVisto.current === undefined) {
      operadorVisto.current = operadorId;
      return;
    }
    if (operadorVisto.current === operadorId) return;
    operadorVisto.current = operadorId;
    refrescarPerfil?.();
  }, [loading, operadorId, refrescarPerfil]);

  // LA CAJA PIDE PIN A TODOS. Un exento (Admin, dueño, local sin operario
  // obligatorio) entra al sistema sin PIN, pero para usar una caja —abrir,
  // vender, retirar, cerrar— el servidor contesta 428 igual que a cualquiera:
  // una caja sin operador la comparte quien use la cuenta. Cuando eso pasa, el
  // handler llama `requerirOperador()` y acá se levanta el mismo modal del PIN.
  // Al exento se le deja salir sin identificarse: fuera de la caja no lo
  // necesita.
  const [pinPedido, setPinPedido] = useState(false);

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
    setPinPedido(true);
  }, [refrescar]);

  // Identificarse cierra el pedido de PIN: si después hace "cambiar operador",
  // el modal no vuelve solo para el exento hasta que una caja lo pida de nuevo.
  const loginYCerrar = useCallback(
    async (...args) => {
      const r = await login(...args);
      if (r?.ok) setPinPedido(false);
      return r;
    },
    [login]
  );

  const value = useMemo(
    () => ({ operador, voucher, loading, login: loginYCerrar, logout, refrescar, requerirOperador }),
    [operador, voucher, loading, loginYCerrar, logout, refrescar, requerirOperador]
  );

  // Modal derivado: se muestra cuando no hay operario PERO ya hubo uno en la
  // sesión (caída a mitad de sesión), o cuando una caja lo pidió. Se oculta solo
  // apenas vuelve a haber operario. El ingreso inicial (sin operario previo) va
  // por redirect, no acá.
  const mostrarModal = !operador && ((!exento && huboOperador) || pinPedido);

  // Puerta de ingreso inicial: mientras carga por primera vez y todavía no hubo
  // operario, no mostramos el chrome (igual que hacía layout.jsx antes).
  if (loading && !huboOperador && !exento) return null;

  return (
    <OperadorContext.Provider value={value}>
      {children}
      {mostrarModal && (
        <ModalPedirOperador
          onLogin={loginYCerrar}
          paraCaja={exento}
          onSalir={exento ? () => setPinPedido(false) : undefined}
        />
      )}
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
