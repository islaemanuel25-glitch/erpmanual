"use client";

// ============================================================
// app/context/AccionDePaginaContext.jsx
//
// UN LUGAR DONDE LA PANTALLA ACTIVA PONE UNA ACCIÓN Y EL SHELL LA DIBUJA.
//
// El título de la página lo dibuja el shell, no la pantalla: en mobile es la
// fila de `LayoutBase`, en escritorio el `<h1>` del `Header`. El contenido de la
// pantalla vive dentro de `<main>`, que es una caja hermana y con su propio
// scroll. Por eso una pantalla no podía poner un botón a la altura de su propio
// título sin duplicarlo, esconder el global o empujar con márgenes negativos.
//
// Este contexto es la capacidad que faltaba, y es GENÉRICA: el shell no sabe
// qué pantalla registró ni qué nodo es. No hay ninguna comparación de ruta acá
// ni en `LayoutBase`; lo único que existe es "hay una acción" o "no hay".
//
// ── CÓMO SE USA ────────────────────────────────────────────────────────────
//
//   const volver = useAccionDePagina(() => <SunmiBackButton href="/x" />, []);
//
// Devuelve el mismo nodo que registró, para que la pantalla pueda además
// dibujarlo en su propio contenido si le hace falta —por ejemplo en escritorio,
// donde el shell no tiene fila de título propia—. Un solo lugar donde se
// declara, dos lugares donde puede aparecer.
//
// ── POR QUÉ RECIBE UNA FÁBRICA Y UN ARRAY DE DEPENDENCIAS ──────────────────
//
// Porque un elemento JSX escrito en línea es un objeto nuevo en cada render. Si
// se registrara así, el efecto correría en cada render, el registro cambiaría el
// estado del proveedor, eso volvería a renderizar la pantalla y el ciclo no
// terminaría nunca. Con la fábrica memorizada el nodo mantiene su identidad
// mientras las dependencias no cambien, y el efecto corre una sola vez.
//
// No es una decoración de estilo: es lo que hace que el mecanismo no pueda
// entrar en un lazo. La forma es la misma de `useMemo`, que es donde el que lo
// use ya espera un array de dependencias.
//
// ── POR QUÉ REGISTRA ANTES DE PINTAR ───────────────────────────────────────
//
// Con `useEffect` el navegador alcanza a pintar una vez la fila sin la acción y
// el botón aparecería un cuadro después. `useLayoutEffect` corre antes de ese
// pintado, así que la fila se ve completa desde el primer cuadro. En el
// servidor no existe y ahí se cae a `useEffect`, que es lo que React espera.
// ============================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";

import { limpiarAccion, registrarAccion } from "@/lib/layout/accionDePagina";

const AccionDePaginaContext = createContext({
  accion: null,
  registrar: () => () => {},
});

/** `useLayoutEffect` en el navegador, `useEffect` en el servidor. */
const useEfectoAntesDePintar = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function AccionDePaginaProvider({ children }) {
  const [accion, setAccion] = useState(null);

  const registrar = useCallback((nodo) => {
    setAccion((actual) => registrarAccion(actual, nodo));
    // La limpieza compara: si otra pantalla ya registró la suya, no la pisa.
    // El porqué está en `lib/layout/accionDePagina.js`.
    return () => setAccion((actual) => limpiarAccion(actual, nodo));
  }, []);

  const valor = useMemo(() => ({ accion, registrar }), [accion, registrar]);

  return (
    <AccionDePaginaContext.Provider value={valor}>{children}</AccionDePaginaContext.Provider>
  );
}

/**
 * Lo que el SHELL lee para dibujar. Devuelve `null` cuando la pantalla activa
 * no registró nada, que es el caso de casi todas.
 */
export function useAccionDelShell() {
  return useContext(AccionDePaginaContext).accion;
}

/**
 * Lo que la PANTALLA usa para registrar su acción.
 *
 * @param {() => React.ReactNode} fabrica Devuelve el nodo a mostrar. Devolver
 *   `null` deja el slot vacío: sirve para registrar solo bajo una condición sin
 *   llamar al hook condicionalmente.
 * @param {unknown[]} deps Dependencias de la fábrica, como en `useMemo`.
 * @returns {React.ReactNode} El mismo nodo registrado.
 */
export function useAccionDePagina(fabrica, deps = []) {
  const { registrar } = useContext(AccionDePaginaContext);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const nodo = useMemo(fabrica, deps);

  useEfectoAntesDePintar(() => registrar(nodo), [registrar, nodo]);

  return nodo;
}
