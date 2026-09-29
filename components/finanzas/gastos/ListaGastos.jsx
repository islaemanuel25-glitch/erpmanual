"use client";

// components/finanzas/gastos/ListaGastos.jsx
//
// GASTOS: los de la ubicación, EN EL CALENDARIO, como Pagos a proveedores.
//
// ── LA MISMA ESTRUCTURA, PIEZA POR PIEZA ─────────────────────────────────
//
// De arriba hacia abajo, lo mismo que `ListaCuentasPorPagar`:
//
//   1. Día / Semana / Mes / Otro       → `ChipsDePeriodo`, con Otro apagado.
//   2. el período, con sus flechas      → `NavegadorDePeriodo`.
//   3. Pendientes / Pagados / Todos     → `SunmiSelectorDeOpciones`.
//   4. la categoría                     → `SunmiChipsFiltro`, desde la API.
//   5. el resumen                       → `ResumenConImporte`, por `ResumenDeGastos`.
//   6. Nuevo gasto, si se puede crear   → `SunmiButton`, según `puedeCrear`.
//   7. el buscador, si hay filas        → `SunmiInput`.
//   8. Anteriores con saldo, Pendientes → `DiaConBanda`.
//   9. los días del período             → `DiaConBanda`, con `FilaGasto` adentro.
//
// ── EL PERÍODO FILTRA POR LA FECHA DEL GASTO ─────────────────────────────
//
// Y lo filtra la API, no la pantalla: se le pide el rango del período y la
// pestaña. En Pendientes se pide además lo pendiente de ANTES del período, que
// si no desaparecería. Está en `lib/finanzas/calendarioDeGastos.js`.
//
// ── TODO VIVE EN LA URL ──────────────────────────────────────────────────
//
// Pestaña, período y categoría: desde acá se entra a un gasto y se vuelve, y
// con `useState` se volvería siempre a Pendientes, a la semana en curso y a
// Todas. La búsqueda no viaja: es de este vistazo, como en Pagos.
//
// ── LA BÚSQUEDA, SOBRE EL CONJUNTO Y NO SOBRE LO CARGADO ─────────────────
//
// Si lo cargado es todo, se filtra acá, como en Pagos. Si la API dijo que hay
// más de los 200 que manda, buscar acá podría decir "ninguno coincide" sobre un
// gasto que existe, así que se le pregunta a la misma ruta con `q`, período y
// anteriores juntos, un momento después de la última tecla. El porqué está en
// `lib/finanzas/calendarioDeGastos.js`.
//
// ── LOS DOS VACÍOS ───────────────────────────────────────────────────────
//
// Un período sin gastos lo dice el resumen, con su nota —"No hay gastos con
// saldo en este período."—: es el estado "Período sin gastos" del diseño y el
// patrón de Pagos, y por eso el buscador ni se dibuja. Una búsqueda sin
// coincidencias sobre un período que SÍ tiene gastos lo dice la lista.
//
// ── QUIÉN PUEDE CREAR LO DICE EL SERVIDOR ────────────────────────────────
//
// El botón "Nuevo gasto" aparece con `puedeCrear` de la respuesta, que exige el
// permiso Y operar una ubicación. Y la ubicación del gasto nuevo es la que el
// servidor dice que se opera (`ubicacionOperada`): no se elige.

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiSelectorDeOpciones from "@/components/sunmi/SunmiSelectorDeOpciones";
import SunmiChipsFiltro from "@/components/sunmi/SunmiChipsFiltro";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import DiaConBanda from "@/components/periodo/DiaConBanda";
import ChipsDePeriodo from "@/components/transferencias/ChipsDePeriodo";
import NavegadorDePeriodo from "@/components/transferencias/NavegadorDePeriodo";
import { CHIPS_APAGADOS } from "@/components/finanzas/CuentaFinancieraDeUnLocal";
import { OPCIONES_FILTRO_CUENTAS } from "@/components/finanzas/pagos/ListaCuentasPorPagar";
import { formatearMoneda } from "@/lib/moneda";
import { hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { descripcionDePagos, puedeAvanzarPagos, puedeRetrocederPagos } from "@/lib/finanzas/calendarioDePagos";
import {
  ESPERA_BUSQUEDA_MS,
  VACIO_DE_LA_LISTA,
  busquedaEnElServidor,
  calendarioDeGastos,
  claveDeBusqueda,
  consultaDeAnteriores,
  consultaDelPeriodo,
  gastosDeLaLista,
  rotuloDeGastos,
  textoDeBusqueda,
  vacioDeLaLista,
} from "@/lib/finanzas/calendarioDeGastos";
import { parseContextoGastos, urlDeGasto, urlDeGastos } from "@/lib/finanzas/contextoFinanzas";

import FilaGasto from "./FilaGasto";
import ModalNuevoGasto from "./ModalNuevoGasto";
import ResumenDeGastos from "./ResumenDeGastos";

async function pedirGastos(consulta) {
  const res = await fetch(`/api/finanzas/gastos?${consulta}`, { cache: "no-store", credentials: "include" });
  const j = await res.json().catch(() => ({}));
  // El caso malo tiene rama propia: un error que se viera como una lista vacía
  // diría "no hay gastos" cuando lo que pasa es que no se pudieron leer.
  if (!res.ok || !j.ok) throw new Error(j?.error || "No se pudieron leer los gastos.");
  return j;
}

export default function ListaGastos() {
  const router = useRouter();
  const params = useSearchParams();
  const ctx = parseContextoGastos(params);
  const { estado: filtro, unidad, desp, cat } = ctx;

  const hoy = hoyArgentinaISO();
  const descripcion = descripcionDePagos({ unidad, desplazamiento: desp, filtro, hoy });
  const { desde, hasta } = descripcion.rango || {};

  const [datos, setDatos] = useState(null);
  const [anteriores, setAnteriores] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [resultado, setResultado] = useState(null);
  const [nuevoAbierto, setNuevoAbierto] = useState(false);

  // Las categorías, una vez: salen de la tabla y no de una lista escrita acá.
  useEffect(() => {
    let vigente = true;
    (async () => {
      try {
        const res = await fetch("/api/finanzas/gastos/categorias", { cache: "no-store", credentials: "include" });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.ok) throw new Error(j?.error || "No se pudieron leer las categorías.");
        if (vigente) setCategorias(j.categorias || []);
      } catch (e) {
        if (vigente) setError(e.message);
      }
    })();
    return () => {
      vigente = false;
    };
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const rango = { desde, hasta };
      const deAntes = consultaDeAnteriores({ filtro, rango, categoriaId: cat });
      // Dos consultas a la MISMA ruta, en paralelo: el período, y lo pendiente
      // de antes. Ninguna por fila.
      const [periodo, previos] = await Promise.all([
        pedirGastos(consultaDelPeriodo({ filtro, rango, categoriaId: cat })),
        deAntes ? pedirGastos(deAntes) : Promise.resolve(null),
      ]);
      setDatos(periodo);
      setAnteriores(previos);
    } catch (e) {
      setError(e.message);
      setDatos(null);
      setAnteriores(null);
    } finally {
      setCargando(false);
    }
  }, [filtro, desde, hasta, cat]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const termino = textoDeBusqueda(busqueda);
  const contexto = { filtro, rango: { desde, hasta }, categoriaId: cat };
  const clave = claveDeBusqueda(contexto, termino);
  const alServidor = Boolean(termino) && busquedaEnElServidor({ periodo: datos, anteriores });

  // La búsqueda en el servidor: solo cuando lo cargado no alcanza, un momento
  // después de la última tecla, y la respuesta queda marcada con su consulta
  // para que una vieja no se muestre como la de ahora. Depende de `datos`
  // para volver a buscar después de un alta.
  useEffect(() => {
    if (!alServidor) return undefined;
    let vigente = true;
    const espera = setTimeout(async () => {
      try {
        const rango = { desde, hasta };
        const deAntes = consultaDeAnteriores({ filtro, rango, categoriaId: cat, q: termino });
        const [periodo, previos] = await Promise.all([
          pedirGastos(consultaDelPeriodo({ filtro, rango, categoriaId: cat, q: termino })),
          deAntes ? pedirGastos(deAntes) : Promise.resolve(null),
        ]);
        if (vigente) setResultado({ clave, periodo, anteriores: previos });
      } catch (e) {
        if (vigente) setResultado({ clave, error: e.message });
      }
    }, ESPERA_BUSQUEDA_MS);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [alServidor, clave, termino, filtro, desde, hasta, cat, datos]);

  // `scroll: false`: lo que cambió es el período, la pestaña o la categoría.
  const ir = (siguiente) => router.replace(urlDeGastos({ ...ctx, ...siguiente }), { scroll: false });

  // El resumen mira TODO lo del período; el buscador solo achica lo que se lista.
  const calendario = calendarioDeGastos({ gastos: datos?.gastos || [], anteriores: anteriores?.gastos || [], filtro });
  const lista = gastosDeLaLista({ periodo: datos, anteriores, busqueda, contexto, resultado });
  const visibles = calendarioDeGastos({ gastos: lista.gastos, anteriores: lista.anteriores, filtro });
  const grupos = [visibles.anteriores, ...visibles.dias].filter(Boolean);
  const hayFilas = Boolean(calendario.anteriores || calendario.dias.length);
  const errorDeBusqueda = lista.enElServidor && resultado?.clave === clave ? resultado.error : "";
  const vacio = vacioDeLaLista({ busqueda, hayFilas, grupos, esperando: lista.esperando, error: errorDeBusqueda });

  return (
    <>
      <ChipsDePeriodo valor={unidad} onCambiar={(u) => ir({ unidad: u, desp: 0 })} deshabilitadas={CHIPS_APAGADOS} />

      <NavegadorDePeriodo
        titulo={descripcion.titulo}
        subtitulo={descripcion.subtitulo}
        puedeAvanzar={puedeAvanzarPagos(desp, filtro)}
        puedeRetroceder={puedeRetrocederPagos(desp, filtro)}
        onAtras={() => ir({ desp: desp - 1 })}
        onAdelante={() => ir({ desp: desp + 1 })}
      />

      <SunmiSelectorDeOpciones
        opciones={OPCIONES_FILTRO_CUENTAS}
        valor={filtro}
        onCambiar={(v) => ir({ estado: v })}
        etiqueta="Estado de los gastos"
      />

      <SunmiChipsFiltro
        opciones={categorias.map((c) => ({ clave: String(c.id), texto: c.nombre }))}
        valor={cat}
        onCambiar={(c) => ir({ cat: c ? Number(c) : null })}
      />

      {cargando && (
        <div className="py-12">
          <SunmiLoader />
        </div>
      )}

      {error && !cargando && (
        <SunmiAviso tono="danger" titulo="No se pudo cargar">
          {error}
        </SunmiAviso>
      )}

      {!cargando && !error && datos && (
        <>
          <ResumenDeGastos filtro={filtro} descripcion={descripcion} calendario={calendario} />

          {lista.incompleta && (
            <SunmiAviso tono="warning" titulo="Lista incompleta">
              Hay más gastos de los que se pueden mostrar juntos. Elegí un período más corto o una categoría
              para ver todos.
            </SunmiAviso>
          )}

          {datos.puedeCrear && (
            <SunmiButton color="primary" className="w-full" onClick={() => setNuevoAbierto(true)}>
              Nuevo gasto
            </SunmiButton>
          )}

          {hayFilas && (
            <SunmiInput
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar concepto, beneficiario o comprobante"
              aria-label="Buscar concepto, beneficiario o comprobante"
              className="w-full rounded-xl text-sm3"
            />
          )}

          {lista.esperando && (
            <div className="py-12">
              <SunmiLoader />
            </div>
          )}

          {errorDeBusqueda && (
            <SunmiAviso tono="danger" titulo="No se pudo buscar">
              {errorDeBusqueda}
            </SunmiAviso>
          )}

          {vacio === VACIO_DE_LA_LISTA.BUSQUEDA && (
            <div className="text-center py-12 sunmi-text-muted text-xs">Ningún gasto coincide con la búsqueda.</div>
          )}

          {!lista.esperando &&
            !errorDeBusqueda &&
            grupos.map((g) => (
              <DiaConBanda key={g.clave} titulo={g.titulo} dato={rotuloDeGastos(g.cantidad)} importe={formatearMoneda(g.importe)}>
                {g.gastos.map((gasto) => (
                  <FilaGasto
                    key={gasto.id}
                    gasto={gasto}
                    filtro={filtro}
                    hoy={hoy}
                    variasUbicaciones={Boolean(datos.variasUbicaciones)}
                    onAbrir={() => router.push(urlDeGasto(gasto.id, ctx))}
                  />
                ))}
              </DiaConBanda>
            ))}
        </>
      )}

      {datos?.puedeCrear && (
        <ModalNuevoGasto
          abierto={nuevoAbierto}
          categorias={categorias}
          ubicacion={datos.ubicacionOperada}
          onCerrar={() => setNuevoAbierto(false)}
          onCreado={() => {
            setNuevoAbierto(false);
            cargar();
          }}
        />
      )}
    </>
  );
}
