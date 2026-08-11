// lib/compras-proveedor/comprobante/lector/index.js
//
// EL ÚNICO LUGAR DESDE DONDE SE PIDE UN LECTOR.
//
// El registro de `contrato.js` se llena por efecto de importar cada
// implementación. Eso tiene una trampa conocida: si la ruta importara
// `elegirLector` de `contrato.js` directamente, el registro estaría VACÍO —
// nadie habría importado `gemini.js`— y el módulo diría "no hay ningún lector
// configurado" con la configuración perfectamente puesta. Un fallo que se lee
// como un problema de configuración y no lo es.
//
// Por eso las implementaciones se importan ACÁ, y todo el resto del módulo pide
// el lector desde este archivo. Agregar un proveedor es agregar un import más en
// esta lista: es el único paso que hay que recordar, y está en un solo lugar.

import "./gemini.js";

export {
  elegirLector,
  lectoresRegistrados,
  registrarLector,
  normalizarLectura,
  lecturaUtilizable,
  queHacerLectura,
  MOTIVO_LECTURA,
} from "./contrato.js";

export { pasarPorLaPuerta, verificarCoherenciaDeLineas, ESTADO } from "./puerta.js";
