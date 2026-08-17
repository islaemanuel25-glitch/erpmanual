// scripts/test/registrar.mjs
//
// Engancha el resolutor de alias en el cargador de módulos de node. Va con
// `--import`, que corre ANTES de que se cargue el primer archivo de test — que es
// justamente lo que hace falta, porque el problema es de resolución de imports.
//
// Se pasa con ruta RELATIVA: `node --import ./scripts/test/registrar.mjs`. Con una
// ruta absoluta de Windows, node lee `C:` como si fuera un protocolo y falla con
// `ERR_UNSUPPORTED_ESM_URL_SCHEME ... Received protocol 'c:'`, un mensaje que no
// nombra la causa. Ya costó una corrida.

import { register } from "node:module";

register("./resolutorAlias.mjs", import.meta.url);
