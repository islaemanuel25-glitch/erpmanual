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
  UPDATE_CANTIDAD: "UPDATE_CANTIDAD",
  REMOVE_ITEM: "REMOVE_ITEM",
  CLEAR_CART: "CLEAR_CART",
  SET_CLIENTE: "SET_CLIENTE",
  SET_DESCUENTO: "SET_DESCUENTO",
  REMOVE_DESCUENTO: "REMOVE_DESCUENTO",
  SET_PUNTOS: "SET_PUNTOS",
  REMOVE_PUNTOS: "REMOVE_PUNTOS",
  SET_FORMA_PAGO: "SET_FORMA_PAGO",
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
      const { producto, cantidadInicial } = action.payload;
      const esKg = producto.unidadMedida === "kg";
      const cantAdd = cantidadInicial ?? 1;
      const idx = state.carrito.findIndex(
        (item) => item.productoBaseId === producto.productoBaseId
      );

      if (idx >= 0) {
        const next = [...state.carrito];
        const nuevo = { ...next[idx] };
        if (esKg) {
          // Kg: sumar el peso ingresado (puede ser decimal)
          nuevo.cantidad = Math.round((nuevo.cantidad + cantAdd) * 1000) / 1000;
        } else {
          nuevo.cantidad += cantAdd;
        }
        next[idx] = nuevo;
        return { ...state, carrito: next };
      }

      return {
        ...state,
        carrito: [
          ...state.carrito,
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
            // Trazabilidad de lista de precios (Etapa 4) — capturada al momento de agregar
            listaPrecioId: producto.aplicacionLista?.listaPrecioId ?? null,
            listaPrecioNombre: producto.aplicacionLista?.listaPrecioNombre ?? null,
            tipoPrecioAplicado: producto.aplicacionLista?.tipoPrecioAplicado ?? "PRECIO_VENTA",
            margenAplicado: producto.aplicacionLista?.margenAplicado ?? null,
            precioCosto: producto.precioCosto ?? 0,
          },
        ],
      };
    }

    case ActionTypes.UPDATE_CANTIDAD: {
      const { idx, nuevaCantidad } = action.payload;
      const next = [...state.carrito];
      next[idx] = { ...next[idx], cantidad: nuevaCantidad };
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



