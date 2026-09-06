"use client";

// ============================================================
// app/context/AccionDePaginaContext.jsx
//
// UN LUGAR DONDE LA PANTALLA ACTIVA PONE SU TÍTULO Y SU ACCIÓN, Y EL SHELL LOS
// DIBUJA.
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
// ── Y EL TÍTULO TIENE EL MISMO PROBLEMA QUE LA ACCIÓN ──────────────────────
//
// El texto de esa fila sale de la RUTA: un mapa de overrides, o el item del
// menú. Eso alcanza mientras el título se pueda escribir de antemano en una
// tabla, y no alcanza cuando el título es un DATO. "Editar medio de cobro"
// tiene que decir el nombre del medio, y ese nombre lo sabe la pantalla recién
// después de leerlo de la API: ninguna tabla de rutas puede contener
// "Efectivo".
//
// Así que el título viaja por el MISMO slot, no por uno nuevo al lado. Son la
// misma pregunta —qué puso la pantalla activa en la fila del shell— y tenerlas
// en dos proveedores distintos sería dos suscripciones y dos ciclos de vida
// para algo que siempre se registra junto.
//
// ── CÓMO SE USA ────────────────────────────────────────────────────────────
//
//   const volver = useAccionDePagina(() => <SunmiBackButton href="/x" />, []);
//   useTituloDePagina(medio?.nombre || "Editar medio");
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
  titulo: null,
  registrarTitulo: () => () => {},
});

/** `useLayoutEffect` en el navegador, `useEffect` en el servidor. */
const useEfectoAntesDePintar = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function AccionDePaginaProvider({ children }) {
  const [accion, setAccion] = useState(null);
  const [titulo, setTitulo] = useState(null);

  const registrar = useCallback((nodo) => {
    setAccion((actual) => registrarAccion(actual, nodo));
    // La limpieza compara: si otra pantalla ya registró la suya, no la pisa.
    // El porqué está en `lib/layout/accionDePagina.js`.
    return () => setAccion((actual) => limpiarAccion(actual, nodo));
  }, []);

  // Las mismas dos decisiones, sobre otro dato. Se REUSAN a propósito: el
  // problema de la limpieza tardía al navegar entre dos pantallas que registran
  // es idéntico, y un título borrado por la limpieza de la pantalla anterior
  // dejaría el shell diciendo el nombre del módulo sin que nada avise.
  //
  // Lo que se registra es el REGISTRO, no el texto suelto: `limpiarAccion`
  // compara por identidad, y dos pantallas distintas pueden tener el mismo
  // texto. Con el texto pelado, ir de un medio llamado "Efectivo" a otro
  // llamado igual dejaría la fila en blanco —la limpieza tardía de la primera
  // encontraría su propio texto puesto por la segunda y lo borraría—.
  const registrarTitulo = useCallback((registro) => {
    setTitulo((actual) => registrarAccion(actual, registro));
    return () => setTitulo((actual) => limpiarAccion(actual, registro));
  }, []);

  const valor = useMemo(
    () => ({ accion, registrar, titulo, registrarTitulo }),
    [accion, registrar, titulo, registrarTitulo]
  );

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
 * Lo que el SHELL lee para titular. Devuelve `null` cuando la pantalla activa
 * no registró título, que es el caso de casi todas: ahí el título lo sigue
 * resolviendo la ruta, como siempre.
 */
export function useTituloDelShell() {
  return useContext(AccionDePaginaContext).titulo?.texto ?? null;
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

/**
 * Lo que la PANTALLA usa para titular su propia fila del shell.
 *
 * No pide fábrica ni dependencias —a diferencia de `useAccionDePagina`— porque
 * un título es un texto y no un árbol de JSX: acá alcanza con el propio texto
 * para saber si cambió. La envoltura se arma adentro, y está memorizada por el
 * mismo motivo que allá: sin eso el registro sería un objeto nuevo en cada
 * render, el efecto correría siempre, cada corrida cambiaría el estado del
 * proveedor y el ciclo no terminaría nunca.
 *
 * @param {string|null|undefined} titulo Vacío, `null` o `undefined` dejan que
 *   el título lo siga resolviendo la ruta.
 * @returns {string|null|undefined} El mismo título, para poder reusarlo.
 */
export function useTituloDePagina(titulo) {
  const { registrarTitulo } = useContext(AccionDePaginaContext);

  const registro = useMemo(() => (titulo ? { texto: titulo } : null), [titulo]);

  useEfectoAntesDePintar(() => registrarTitulo(registro), [registrarTitulo, registro]);

  return titulo;
}
