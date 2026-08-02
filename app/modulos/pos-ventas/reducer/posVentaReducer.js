import { combinarSubtotalFijado } from "@/lib/pos-ventas/lineaPorImporte";

// Estado inicial del reducer
export const initialState = {
  // Carrito
  carrito: [],
  
  // Forma de pago
  formaPago: "efectivo",
  
  // Cliente
  clienteSeleccionado: null,
  
  // Descuentos
  descuento: 0,
  descuentoInfo: null, // { tipo, valor }
  
  // Puntos de fidelidad
  puntosCanje: 0,
  descuentoPorPuntos: 0,
  saldoPuntos: 0,
  
  // Modales
  modalDescuento: false,
  modalCanjePuntos: false,
  modalEfectivo: null, // { total, formaPago } o null
  modalTicket: null, // venta data para ticket o null
  modalConfirmacion: null, // { mensaje, onConfirmar, onCancelar } o null
  
  // Estado de cobro
  cobrando: false,
};

// Action types
export const ActionTypes = {
  ADD_ITEM: "ADD_ITEM",
  ADD_SERVICIO: "ADD_SERVICIO",
  UPDATE_CANTIDAD: "UPDATE_CANTIDAD",
  REMOVE_ITEM: "REMOVE_ITEM",
  CLEAR_CART: "CLEAR_CART",
  SET_CLIENTE: "SET_CLIENTE",
  SET_DESCUENTO: "SET_DESCUENTO",
  REMOVE_DESCUENTO: "REMOVE_DESCUENTO",
  SET_PUNTOS: "SET_PUNTOS",
  REMOVE_PUNTOS: "REMOVE_PUNTOS",
  SET_FORMA_PAGO: "SET_FORMA_PAGO",
  SET_MODO_VENTA_LINEA: "SET_MODO_VENTA_LINEA",
  SET_COBRANDO: "SET_COBRANDO",
  OPEN_MODAL: "OPEN_MODAL",
  CLOSE_MODAL: "CLOSE_MODAL",
  SET_SALDO_PUNTOS: "SET_SALDO_PUNTOS",
  RESTORE_CART: "RESTORE_CART",
};

// Reducer
export function posVentaReducer(state, action) {
  switch (action.type) {
    case ActionTypes.ADD_ITEM: {
      // `subtotalFijado`: importe tecleado por el cajero en una línea POR PESO
      // (modo "POR PRECIO" del ModalPesoKg). Cuando viene, ese importe ES el
      // total de la línea y no se re-deriva del peso redondeado. Null/ausente en
      // todo lo demás (peso ingresado a mano, unidad, pack, bulto).
      const { producto, cantidadInicial, subtotalFijado } = action.payload;
      const esKg = producto.unidadMedida === "kg";
      const cantAdd = cantidadInicial ?? 1;
      const idx = state.carrito.findIndex(
        (item) => item.productoBaseId === producto.productoBaseId
      );

      if (idx >= 0) {
        // Item existente: incrementar cantidad y moverlo al principio
        const previo = state.carrito[idx];
        const nuevo = { ...previo };
        if (esKg) {
          // Kg: sumar el peso ingresado (puede ser decimal)
          nuevo.cantidad = Math.round((nuevo.cantidad + cantAdd) * 1000) / 1000;
        } else {
          nuevo.cantidad += cantAdd;
        }
        // Si alguna de las dos cargas fue por importe, el total de la línea pasa
        // a ser la SUMA de lo que mostró cada una. Si ninguna lo fue, la línea
        // sigue derivándose del peso (comportamiento actual, intacto).
        const fijadoFusion = combinarSubtotalFijado(previo, {
          precio: previo.precio,
          cantidad: cantAdd,
          subtotalFijado: subtotalFijado ?? null,
        });
        if (fijadoFusion != null) nuevo.subtotalFijado = fijadoFusion;
        const resto = state.carrito.filter((_, i) => i !== idx);
        return { ...state, carrito: [nuevo, ...resto] };
      }

      return {
        ...state,
        carrito: [
          {
            productoBaseId: producto.productoBaseId,
            nombre: producto.nombre,
            precio: producto.precioVenta,
            cantidad: cantAdd,
            stockMax: producto.stock,
            modoSalida: producto.modoSalidaDefault || "UNIDAD",
            precioVentaUnitario: producto.precioVentaUnitario ?? producto.precioVenta,
            precioVentaBulto: producto.precioVentaBulto ?? producto.precioVenta,
            unidadMedida: producto.unidadMedida || "unidad",
            // Venta por remanente (solo depósito + pack): factor real y modo elegido por línea.
            // Escalas REALES tal como las devuelve la API (fuente autoritativa). El toggle
            // solo elige cuál usar; NO re-deriva. La API ya aplicó la lista de precios del
            // cliente en cada escala (bulto y unidad), respetando la lista igual que la venta
            // normal. El unitario parte de precio_venta ÷ factor_pack (= "Venta unitario ref."
            // de Productos) con la lista aplicada en escala unitaria, no dividiendo el pack.
            factorPack: Number(producto.factorPack) || 1,
            modoVentaLinea: "NORMAL", // "NORMAL" (formato pack) | "UNIDAD_REMANENTE" (unidad suelta)
            precioVentaFormatoDepositoReal:
              producto.precioVentaFormatoDepositoReal ?? producto.precioVentaBulto ?? producto.precioVenta,
            precioVentaUnitarioReal:
              producto.precioVentaUnitarioReal ?? producto.precioVentaUnitario ?? producto.precioVenta,
            precioCostoFormatoDepositoReal:
              producto.precioCostoFormatoDepositoReal ?? producto.precioCostoBulto ?? producto.precioCosto ?? 0,
            precioCostoUnitarioReal:
              producto.precioCostoUnitarioReal ?? producto.precioCostoUnitario ?? producto.precioCosto ?? 0,
            // Trazabilidad de lista de precios (Etapa 4) — capturada al momento de agregar
            listaPrecioId: producto.aplicacionLista?.listaPrecioId ?? null,
            listaPrecioNombre: producto.aplicacionLista?.listaPrecioNombre ?? null,
            tipoPrecioAplicado: producto.aplicacionLista?.tipoPrecioAplicado ?? "PRECIO_VENTA",
            margenAplicado: producto.aplicacionLista?.margenAplicado ?? null,
            precioCosto: producto.precioCosto ?? 0,
            // Importe fijado por el cajero (línea de peso cargada POR PRECIO).
            subtotalFijado: subtotalFijado ?? null,
          },
          ...state.carrito,
        ],
      };
    }

    case ActionTypes.ADD_SERVICIO: {
      // Servicio de importe variable: SIEMPRE una línea nueva (nunca fusiona con
      // otra carga del mismo producto). Cantidad fija = 1, clave única de carrito.
      // Dos cargas iguales = dos líneas independientes. El precio es el total final
      // (importe + recargo) ya calculado; el backend lo recalcula server-side.
      const { servicio } = action.payload;
      return {
        ...state,
        carrito: [
          {
            claveCarrito: servicio.claveCarrito,
            productoBaseId: servicio.productoBaseId,
            nombre: servicio.nombre,
            precio: servicio.precioFinal,
            cantidad: 1,
            esServicio: true,
            importeBaseServicio: servicio.importeBaseServicio,
            recargoServicioPct: servicio.recargoServicioPct,
            recargoServicioImporte: servicio.recargoServicioImporte,
            precioCosto: servicio.importeBaseServicio,
            // No controla stock ni lista.
            stockMax: Infinity,
            listaPrecioId: null,
            tipoPrecioAplicado: "PRECIO_VENTA",
            margenAplicado: null,
          },
          ...state.carrito,
        ],
      };
    }

    case ActionTypes.UPDATE_CANTIDAD: {
      // Editar la cantidad a mano es pasar a "el PESO manda": el importe que se
      // había tecleado deja de tener sentido (era el de otro peso) y la línea
      // vuelve a cobrarse como precio × cantidad.
      const { idx, nuevaCantidad } = action.payload;
      const next = [...state.carrito];
      next[idx] = { ...next[idx], cantidad: nuevaCantidad, subtotalFijado: null };
      return { ...state, carrito: next };
    }

    case ActionTypes.REMOVE_ITEM: {
      const { idx } = action.payload;
      return {
        ...state,
        carrito: state.carrito.filter((_, i) => i !== idx),
      };
    }

    case ActionTypes.CLEAR_CART: {
      return {
        ...state,
        carrito: [],
        descuento: 0,
        descuentoInfo: null,
        clienteSeleccionado: null,
        puntosCanje: 0,
        descuentoPorPuntos: 0,
      };
    }

    case ActionTypes.SET_CLIENTE: {
      return {
        ...state,
        clienteSeleccionado: action.payload,
      };
    }

    case ActionTypes.SET_DESCUENTO: {
      const { montoDescuento, tipo, valor } = action.payload;
      return {
        ...state,
        descuento: montoDescuento,
        descuentoInfo: { tipo, valor },
        modalDescuento: false,
      };
    }

    case ActionTypes.REMOVE_DESCUENTO: {
      return {
        ...state,
        descuento: 0,
        descuentoInfo: null,
        modalDescuento: false,
      };
    }

    case ActionTypes.SET_PUNTOS: {
      const { puntosCanje, descuentoPorPuntos, saldoPuntos } = action.payload;
      return {
        ...state,
        puntosCanje,
        descuentoPorPuntos,
        saldoPuntos: saldoPuntos !== undefined ? saldoPuntos : state.saldoPuntos,
        modalCanjePuntos: false,
      };
    }

    case ActionTypes.REMOVE_PUNTOS: {
      return {
        ...state,
        puntosCanje: 0,
        descuentoPorPuntos: 0,
        modalCanjePuntos: false,
      };
    }

    case ActionTypes.SET_SALDO_PUNTOS: {
      return {
        ...state,
        saldoPuntos: action.payload,
      };
    }

    case ActionTypes.SET_FORMA_PAGO: {
      return {
        ...state,
        formaPago: action.payload,
      };
    }

    case ActionTypes.SET_MODO_VENTA_LINEA: {
      // Cambia el modo de venta de una línea entre formato pack (NORMAL) y
      // unidad suelta (UNIDAD_REMANENTE). Ajusta precio y costo a la escala
      // correspondiente. El descuento de stock real lo recalcula el backend
      // contra la DB; acá solo afecta lo que se muestra y cobra.
      const { idx, modo } = action.payload;
      const item = state.carrito[idx];
      if (!item) return state;
      const factorPack = Number(item.factorPack) || 1;
      const next = [...state.carrito];

      if (modo === "UNIDAD_REMANENTE") {
        // Precio/costo unitario REAL del producto (con la lista del cliente ya
        // aplicada por la API en escala unitaria). FALLBACK LEGACY: si el ítem no
        // trae el campo real (cola offline vieja), recién ahí se divide bulto ÷ factor.
        const precioUnit =
          item.precioVentaUnitarioReal != null
            ? item.precioVentaUnitarioReal
            : factorPack > 1
              ? Math.round(((item.precioVentaFormatoDepositoReal ?? item.precio ?? 0) / factorPack) * 100) / 100
              : (item.precioVentaFormatoDepositoReal ?? item.precio ?? 0);
        const costoUnit =
          item.precioCostoUnitarioReal != null
            ? item.precioCostoUnitarioReal
            : factorPack > 1
              ? Math.round(((item.precioCostoFormatoDepositoReal ?? item.precioCosto ?? 0) / factorPack) * 100) / 100
              : (item.precioCostoFormatoDepositoReal ?? item.precioCosto ?? 0);
        next[idx] = {
          ...item,
          modoVentaLinea: "UNIDAD_REMANENTE",
          precio: precioUnit,
          precioCosto: costoUnit,
          cantidad: 1, // la cantidad pasa a significar unidades reales
          subtotalFijado: null, // cambia la escala: el importe anterior ya no aplica
        };
      } else {
        next[idx] = {
          ...item,
          modoVentaLinea: "NORMAL",
          // Formato depósito: el MISMO precio/costo que cobra hoy la venta normal.
          precio: item.precioVentaFormatoDepositoReal ?? item.precio,
          precioCosto: item.precioCostoFormatoDepositoReal ?? item.precioCosto ?? 0,
          cantidad: 1, // la cantidad vuelve a significar packs/bultos/cajones
          subtotalFijado: null, // cambia la escala: el importe anterior ya no aplica
        };
      }
      return { ...state, carrito: next };
    }

    case ActionTypes.SET_COBRANDO: {
      return {
        ...state,
        cobrando: action.payload,
      };
    }

    case ActionTypes.OPEN_MODAL: {
      const { modal, data } = action.payload;
      return {
        ...state,
        [modal]: data !== undefined ? data : true,
      };
    }

    case ActionTypes.CLOSE_MODAL: {
      const { modal } = action.payload;
      const resetValue = modal === "modalEfectivo" || modal === "modalTicket" || modal === "modalConfirmacion" 
        ? null 
        : false;
      return {
        ...state,
        [modal]: resetValue,
      };
    }

    case ActionTypes.RESTORE_CART: {
      return {
        ...state,
        carrito: action.payload.carrito || [],
        clienteSeleccionado: action.payload.clienteSeleccionado || null,
        descuento: action.payload.descuento || 0,
        descuentoInfo: action.payload.descuentoInfo || null,
        formaPago: action.payload.formaPago || "efectivo",
        puntosCanje: action.payload.puntosCanje || 0,
        descuentoPorPuntos: action.payload.descuentoPorPuntos || 0,
      };
    }

    default:
      return state;
  }
}



