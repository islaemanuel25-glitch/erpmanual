"use client";

import { useRef, useState, useEffect, useCallback, memo } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCampoBusquedaVoz from "@/components/sunmi/SunmiCampoBusquedaVoz";
import { showError } from "@/components/sunmi/SunmiToast";
import { fromUnidades } from "@/lib/conversiones/stock";
import { textoDeStockEnTresNiveles } from "@/lib/stock/presentacion";
import { rankearProductos } from "@/lib/pos-ventas/rankearProductos";
import {
  ENTER,
  LECTURA,
  clasificarEnter,
  decidirLectura,
  sumarCodigoNoEncontrado,
  avisarErrorDeLectura,
  crearManejadorDeRafaga,
  MENSAJE_CURSOR_EN_CANTIDAD,
} from "@/lib/pos-ventas/lecturaEscaner";
import AvisoProductoNoEncontrado from "@/components/pos-ventas/AvisoProductoNoEncontrado";
const DEFAULT_SEARCH_API = "/api/pos-ventas/buscar-producto";
const NO_DISPONIBLE_MSG = "Producto no disponible para la venta";

function labelFormato(unidad) {
  switch (unidad) {
    case "cajon": return "cajones";
    case "pack": return "packs";
    default: return "formatos";
  }
}

function BuscadorProductos({
  localId,
  clienteId = null,
  onAgregar,
  apiPath,
  esDeposito = false,
  wrapCard = true,
  mostrarStock = true,
  // El aviso bloqueante de "producto no encontrado" al escanear. Lo pide solo
  // el POS de venta, donde un código perdido es un producto sin cobrar; ofertas
  // y combos usan este mismo buscador y siguen como estaban.
  avisarNoEncontrado = false,
  // El suelto como un resultado más ("Camel Yellow 20 · suelto", tercer nivel
  // de empaque). Lo pide solo el POS de venta: en ofertas, combos y el consumo
  // del personal un suelto no se puede elegir.
  conSueltos = false,
}) {
  const searchApi = apiPath || DEFAULT_SEARCH_API;
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [queryInterpretada, setQueryInterpretada] = useState(null);
  const debounceRef = useRef(null);
  const lastKeyTime = useRef(0);
  const scanBuffer = useRef("");
  // Los códigos leídos que no encontraron producto; vacío es aviso cerrado. El
  // ref espeja el estado para `handleKeyDown`, que decide al leer.
  const [codigosNoEncontrados, setCodigosNoEncontrados] = useState([]);
  const avisoAbiertoRef = useRef(false);
  // El renglón del aviso cuando no es "no encontrado": null es el de siempre.
  const [mensajeAviso, setMensajeAviso] = useState(null);

  const abrirAvisoNoEncontrado = (codigo, mensaje = null) => {
    // El texto es el de quien ABRE el aviso: un "no encontrado" que llega en
    // vuelo con el aviso abierto se suma a los códigos y no le cambia el texto.
    if (!avisoAbiertoRef.current) setMensajeAviso(mensaje);
    avisoAbiertoRef.current = true;
    scanBuffer.current = "";
    setQuery("");
    setResultados([]);
    setQueryInterpretada(null);
    setCodigosNoEncontrados((previos) => sumarCodigoNoEncontrado(previos, codigo));
    avisarErrorDeLectura();
  };

  const alEntenderAviso = () => {
    avisoAbiertoRef.current = false;
    scanBuffer.current = "";
    setCodigosNoEncontrados([]);
    setMensajeAviso(null);
    inputRef.current?.focus();
  };

  // Autofocus al montar
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ── EL LECTOR EN CUALQUIER CAMPO DE LA PANTALLA QUE NO SEA ESTE ──────────
  //
  // Con el cursor en la cantidad de un renglón, el lector escribía el código
  // ahí adentro. Se escucha la pantalla entera —`window`, en captura— y el
  // Enter que cierra una ráfaga del lector en otro campo no agrega nada: el
  // campo vuelve a lo que tenía, sale el mismo aviso de "no encontrado" con el
  // texto de la cantidad, y el foco vuelve acá para el próximo escaneo. El
  // criterio y el porqué están en `lib/pos-ventas/lecturaEscaner.js`.
  //
  // Solo con `avisarNoEncontrado`, que es el POS de venta: ofertas y combos
  // usan este buscador y siguen como estaban. El foco va en la tarea siguiente
  // para que el campo pierda el foco con su valor ya devuelto: su `onBlur`
  // normaliza con el valor del último dibujo.
  useEffect(() => {
    if (!avisarNoEncontrado) return undefined;
    const alTeclear = crearManejadorDeRafaga({
      buscador: () => inputRef.current,
      avisoAbierto: () => avisoAbiertoRef.current,
      alEscanearFueraDelBuscador: ({ codigo }) => {
        abrirAvisoNoEncontrado(codigo, MENSAJE_CURSOR_EN_CANTIDAD);
        setTimeout(() => inputRef.current?.focus(), 0);
      },
    });
    window.addEventListener("keydown", alTeclear, true);
    return () => window.removeEventListener("keydown", alTeclear, true);
    // `abrirAvisoNoEncontrado` solo usa setters y refs: la del primer dibujo sirve.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avisarNoEncontrado]);

  // Buscar productos
  const buscar = useCallback(
    async (texto, autoAdd = false, fromVoice = false) => {
      if (!texto.trim() || !localId) {
        setResultados([]);
        return;
      }
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("q", texto);
        params.set("localId", String(localId));
        if (clienteId != null) params.set("clienteId", String(clienteId));
        if (fromVoice) params.set("fromVoice", "true");
        if (conSueltos) params.set("conSueltos", "1");
        const res = await fetch(`${searchApi}?${params.toString()}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (data.ok) {
          const items = rankearProductos(data.items || [], texto);
          // El backend devuelve queryInterpretada solo en fromVoice cuando la
          // transcripción no coincide con ninguna palabra real del catálogo.
          setQueryInterpretada(
            fromVoice && data.queryInterpretada ? data.queryInterpretada : null
          );

          // Código exacto (propio de esta ubicación, principal o secundario)
          // agrega. En el POS (`estricto`) una lectura del escáner que no es
          // exacta abre el aviso, sea un resultado, varios o ninguno; en
          // ofertas y combos el resultado único sigue agregando. La decisión es
          // de `lib/pos-ventas/lecturaEscaner.js`.
          const decision = decidirLectura({ items, texto, autoAdd, estricto: avisarNoEncontrado });
          if (decision.tipo === LECTURA.NO_DISPONIBLE) {
            showError(NO_DISPONIBLE_MSG);
            setResultados(items);
            return;
          }
          if (decision.tipo === LECTURA.AGREGAR) {
            onAgregar(decision.producto);
            setQuery("");
            setResultados([]);
            setQueryInterpretada(null);
            inputRef.current?.focus();
            return;
          }
          if (decision.tipo === LECTURA.NO_ENCONTRADO && avisarNoEncontrado) {
            abrirAvisoNoEncontrado(decision.codigo);
            return;
          }

          setResultados(items);
        }
      } catch (err) {
        console.error("Error buscando:", err);
      } finally {
        setLoading(false);
      }
    },
    [localId, clienteId, onAgregar, searchApi, avisarNoEncontrado, conSueltos]
  );

  // ── LA VOZ Y EL CAMPO SE FUERON AL KIT ────────────────────────────────────
  //
  // El reconocimiento, el idioma, el botón del micrófono y el "Escuchando..."
  // vivían acá adentro, y este era el ÚNICO lugar del ERP que los tenía. Ahora
  // son `SunmiCampoBusquedaVoz`, que usan este buscador y el de Productos.
  //
  // Lo que quedó de este lado es lo que NO es compartible: el escáner, el
  // auto-agregado por código exacto, el ranking y `fromVoice`. Por eso la pieza
  // avisa la voz por `onVoz` y no por `onChange` — acá dictar y teclear hacen
  // cosas distintas, y en Productos hacen la misma.
  const alDictar = (transcripcion) => {
    setQuery(transcripcion);
    buscar(transcripcion, false, true);
  };

  // Deteccion de scanner: Enter rapido (<200ms entre teclas)
  const handleKeyDown = (e) => {
    const now = Date.now();
    const diff = now - lastKeyTime.current;
    lastKeyTime.current = now;

    if (e.key === "Escape") {
      setQuery("");
      setResultados([]);
      setQueryInterpretada(null);
      inputRef.current?.focus();
      return;
    }

    // Con el aviso de "no encontrado" abierto no se lee nada. El aviso ya se
    // traga el teclado; esto es la segunda llave por si una tecla se cuela.
    if (avisoAbiertoRef.current) {
      e.preventDefault();
      scanBuffer.current = "";
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();

      // Cancelar debounce pendiente para evitar doble agregado
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }

      const tipoEnter = clasificarEnter({
        avisoAbierto: avisoAbiertoRef.current,
        msDesdeUltimaTecla: diff,
        buffer: scanBuffer.current,
      });
      if (tipoEnter === ENTER.IGNORAR) return;

      // Scanner: caracteres rapidos + Enter
      if (tipoEnter === ENTER.ESCANER) {
        setQuery(scanBuffer.current);
        buscar(scanBuffer.current, true);
        scanBuffer.current = "";
        return;
      }

      // Enter normal: agregar primer resultado o buscar
      if (resultados.length > 0) {
        if (resultados[0].disponibleParaVenta === false) {
          showError(NO_DISPONIBLE_MSG);
          scanBuffer.current = "";
          return;
        }
        onAgregar(resultados[0]);
        setQuery("");
        setResultados([]);
        setQueryInterpretada(null);
        inputRef.current?.focus();
      } else if (query.trim()) {
        buscar(query);
      }
      scanBuffer.current = "";
      return;
    }

    // Acumular buffer del scanner
    if (e.key.length === 1) {
      if (diff > 500) scanBuffer.current = "";
      scanBuffer.current += e.key;
    }
  };

  // Debounce en escritura manual
  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    // Escritura manual descarta la interpretación previa de voz.
    setQueryInterpretada(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    // Si vacío, limpiar resultados al instante
    if (!val.trim()) {
      setResultados([]);
      return;
    }

    debounceRef.current = setTimeout(() => {
      buscar(val);
    }, 300);
  };

  // Agregar producto y limpiar
  const handleAgregar = (producto) => {
    if (producto?.disponibleParaVenta === false) {
      showError(NO_DISPONIBLE_MSG);
      return;
    }
    onAgregar(producto);
    setQuery("");
    setResultados([]);
    setQueryInterpretada(null);
    inputRef.current?.focus();
  };

  const contenido = (
    <>
      {/* Input con boton de voz — la pieza es del kit, ver el comentario de
          `alDictar`. "Buscando..." va por la ranura para conservar el orden de
          los renglones exactamente como estaba. */}
      <SunmiCampoBusquedaVoz
        inputRef={inputRef}
        id="buscar-producto"
        placeholder="Codigo o nombre del producto..."
        value={query}
        onChange={(texto) => handleChange({ target: { value: texto } })}
        onVoz={alDictar}
        onEscuchandoChange={setEscuchando}
        onKeyDown={handleKeyDown}
        autoFocus
        avisoDeEstado={
          loading ? <div className="text-xs pos-text-muted mt-2">Buscando...</div> : null
        }
      />

      {!loading && !escuchando && queryInterpretada && resultados.length > 0 && (
        <div className="text-[11px] pos-text-muted mt-2 italic">
          Interpretado como: <span className="font-semibold not-italic">{queryInterpretada.toUpperCase()}</span>
        </div>
      )}

      {/* Resultados */}
      {resultados.length > 0 && (
        <div className="mt-2 space-y-1 max-h-60 overflow-y-auto">
          {resultados.map((p) => {
            const noDisponible = p.disponibleParaVenta === false;
            let stockNode = null;
            if (mostrarStock) {
              const factorPack = Number(p.factorPack) || 1;
              const mostrarDesglose =
                esDeposito && factorPack > 1 && p.unidadMedida !== "kg" && !p.esFiambreFijo;
              // Con sueltos, el stock se escribe en tres niveles ("9 atados y
              // 15 sueltos"); sin ellos es null y sigue el texto de siempre.
              const tresNiveles = textoDeStockEnTresNiveles(p, esDeposito);
              if (p.sinStock && p.disponibleParaVenta === false) {
                stockNode = <span className="pos-text-danger font-semibold">Sin stock</span>;
              } else if (tresNiveles !== null) {
                stockNode = <span>Stock: {tresNiveles}</span>;
              } else if (mostrarDesglose) {
                const { bultos, sueltas } = fromUnidades({ unidades: Number(p.stock), factorPack });
                stockNode = (
                  <span>Stock: {bultos} {labelFormato(p.unidadMedida)} x{factorPack} + {sueltas} uds</span>
                );
              } else {
                stockNode = (
                  <span>Stock: {p.unidadMedida === "kg" ? `${Number(p.stock).toFixed(3)} kg` : p.stock}</span>
                );
              }
            }
            return (
              <div
                // El gemelo " · suelto" es el mismo producto: la clave lo distingue.
                key={p.esSuelto ? `${p.productoBaseId}-suelto` : p.productoBaseId}
                onClick={() => handleAgregar(p)}
                className={`flex items-center justify-between gap-2 px-2 py-2 rounded-lg pos-bg-surface-interactive transition cursor-pointer ${noDisponible ? "opacity-60" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{p.nombre}</div>
                  <div className="text-[11px] pos-text-muted">
                    {p.codigoBarra && (
                      <span className={mostrarStock ? "mr-3" : undefined}>Cod: {p.codigoBarra}</span>
                    )}
                    {stockNode}
                  </div>
                </div>
                <div className="text-sm font-semibold pos-text-accent shrink-0">
                  {p.esServicioImporteVariable
                    ? "Importe variable"
                    : `$${Number(p.precioVenta).toLocaleString("es-AR", {
                        minimumFractionDigits: 2,
                      })}`}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && !escuchando && query.trim() && resultados.length === 0 && (
        <div className="text-xs pos-text-muted mt-2">
          No se encontraron productos.
        </div>
      )}

      <AvisoProductoNoEncontrado codigos={codigosNoEncontrados} onEntendido={alEntenderAviso} mensaje={mensajeAviso} />
    </>
  );

  return wrapCard ? <SunmiCard className="p-2 lg:p-3">{contenido}</SunmiCard> : contenido;
}

export default memo(BuscadorProductos);
