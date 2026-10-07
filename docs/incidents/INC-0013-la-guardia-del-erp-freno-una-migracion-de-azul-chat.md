# INC-0013 — La guardia del ERP frenó una migración de Azul Chat

**Estado:** arreglado en `lib/deploy/proyectoDelComando.mjs`, sin desplegar. No
hubo daño: la guardia frenó (falla cerrado) y la migración de Azul Chat se aplicó
después, con autorización manual, y anduvo.
**Cuándo:** 2026-10-07, en el deploy de Azul Chat de `a3ae370` a `3d8b849`.
**Alcance:** cualquier `prisma migrate deploy` de un proyecto que no sea el ERP,
corrido desde una sesión de Claude Code de este repo.

## Lo que pasó

El deploy de Azul Chat se hizo desde una sesión de este repo. Su única migración
pendiente era `20261007120000_eventos_ingesta_y_lectura`, en la base de Azul Chat
—otro PostgreSQL, otro repo—. El hook `scripts/hook-guardia-migraciones.mjs`
intercepta todo `migrate deploy` que pase por la herramienta Bash, y lo tomó como
del ERP: corrió `scripts/clasificar-migraciones.mjs --vps`, que calcula el rango
del ERP desde la imagen que atiende `erpazul_app` (`25172fe`) hasta el HEAD del
checkout del ERP. Salió INDETERMINADO y frenó. Se terminó con
`DEPLOY_MIGRACION_AUTORIZADA=1`. **Verificado en código:** el clasificador corre
siempre dentro del checkout del ERP, sobre las migraciones del ERP. Con el ERP en
producción en el mismo commit que su HEAD, el rango es degenerado y sale
INDETERMINADO —reproducido con `--desde 25172fe`—. **Inferido:** que el motivo
impreso ese día fuera ése; desde la nube no se ve la salida del VPS.

## Por qué era un falso positivo

El rango y las migraciones que mira el clasificador son los del ERP. No dicen nada
de la base de Azul Chat. Frenar estuvo bien —no se sabía qué entraba—, pero por un
motivo ajeno, y la única salida fue la autorización manual: la puerta que no
tiene que volverse un paso del procedimiento.

## El arreglo

La guardia identifica primero de qué proyecto es el `migrate deploy`, por dos
señales que tienen que coincidir: el directorio de despliegue
(`/srv/produccion/erpazul` o `/srv/produccion/azul-chat`, o el directorio de
trabajo de la sesión si el comando no nombra ninguno y no va por `ssh`) y el
servicio de Compose que migra (`app` o `azul-chat-app`).

- Azul Chat identificado: no se clasifica con el rango del ERP; pasa avisando y
  deja rastro.
- ERP, o desconocido: la guardia del ERP entera, igual que antes.
- Ambiguo: se rechaza, también con autorización manual.

Además, el clasificador se niega a correr en un árbol que no sea el del ERP, y la
autorización manual exige exactamente `1`. Los candados y sus contrapruebas están
en `lib/deploy/proyectoDelComando.test.mjs`; el procedimiento, en el skill
`/deploy`, "Qué proyecto se migra".

## Lo que queda

Azul Chat no tiene un clasificador de compatibilidad propio como el del ERP. Si
lo necesita, va en su repo y con su SHA productivo, no copiando éste.
