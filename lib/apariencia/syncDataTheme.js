// lib/apariencia/syncDataTheme.js
//
// Sincronizador PURO de `<html data-theme>` con "saltar el primer sync".
//
// El primer valor de data-theme lo dejan, ANTES de React, el <script> de
// pre-hidratación (preferencia personal del dispositivo) o el SSR (tema
// institucional del local). En el PRIMER sync del provider NO se debe reescribir:
// hacerlo pisaría ese valor con el tema efectivo aún sin resolver (institucional
// sembrado) y produciría el flash B → A → B (personal → institucional → personal).
// A partir del segundo sync se aplica el tema efectivo ante cambios reales.
//
// Es un factory stateful pero PURO (sin React ni DOM): recibe `aplicar(themeKey)`
// y devuelve `sync(themeKey)`. Testeable sin navegador.

export function crearSyncDataTheme(aplicar) {
  let primero = true;
  return function sync(themeKey) {
    if (primero) {
      primero = false;
      return false; // no se escribió: se respeta el valor de <script>/SSR
    }
    aplicar(themeKey);
    return true;
  };
}
