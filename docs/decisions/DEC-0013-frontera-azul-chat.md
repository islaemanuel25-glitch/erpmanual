# DEC-0013 — Azul Chat entra al ERP por una frontera propia, cerrada y de solo lectura

**Fecha:** 2026-10-06
**Estado:** VIGENTE. Tandas 1 a 3 desplegadas en producción (`06cc951`, con la
migración `20261006120000_vinculo_integracion`), la integración apagada por no
tener `AZUL_CHAT_INTEGRACION_SECRET` configurado. La tanda 4 —el canje del
código por un token de delegación, `mi_alcance` y el botón del ERP, con la
migración `20261006150000_delegacion_integracion`— está en código y SIN
desplegar (ver "El canje y la delegación", abajo). **La tanda 4 reemplaza el
contrato de delegación de las tandas 2 y 3**: el código del vínculo ya no viaja
en las consultas.
**Alcance:** cómo una aplicación externa (Azul Chat) le pide datos al ERP en
nombre de una persona.

## Contexto

Azul Chat va a ser una aplicación independiente. El ERP sigue siendo la fuente
de verdad de usuarios, roles, locales y ventas, y Azul Chat no tiene acceso a
su base. La primera capacidad es `ventas_resumen`, sin IA.

Lo que el ERP tenía para autenticar es todo de PERSONAS en un navegador: el JWT
de `erpazul_sesion` firmado con `AUTH_SECRET` (`lib/auth.js`), con los permisos
congelados por ocho horas; la cookie de contexto operativo
(`lib/contexto.js`); el grupo activo del admin, que `grupo-activo/set` deja
elegir sin restricción; y los vouchers del POS offline, que también firman con
`AUTH_SECRET` (`verificarTokenIgnorandoVencimiento`, `lib/auth.js:35`). Darle cualquiera de esas cosas a una
aplicación le daba el ERP entero, y filtrarlas filtraba todas las sesiones.

## Decisión

Seis pasos separados, cada uno en su pieza de `lib/integraciones/azul-chat/`:

1. **La aplicación** se autentica con un secreto propio,
   `AZUL_CHAT_INTEGRACION_SECRET`, firmando cada solicitud con HMAC-SHA256 sobre
   aplicación, marca de tiempo y cuerpo crudo, con ventana de 300 s
   (`autenticacionAplicacion.js`). Sin secreto, con uno de menos de 32
   caracteres o con uno igual a `AUTH_SECRET`, la integración se apaga.
2. **El cuerpo** tiene forma cerrada —`capacidad`, `delegacion.token`,
   `alcance.grupoId`/`localId` (solo en capacidades sobre un local),
   `parametros`— y una clave de más lo rechaza (`atender.js`). No hay dónde
   poner un endpoint, SQL, una consulta ni un `usuarioId`.
3. **La capacidad** está en un catálogo congelado (`capacidades.js`). Hoy:
   `ventas_resumen`, que pide `reportes.ver`, el mismo permiso que el reporte
   del ERP del que sale; y `mi_alcance` (tanda 4), sin permiso propio.
4. **La delegación** (desde la tanda 4): la persona en cuyo nombre se pregunta
   SALE del token de delegación —es el dueño del vínculo que se canjeó—. Hasta
   la tanda 3 viajaba un `usuarioId` que Azul Chat afirmaba y la puerta
   comparaba con el código del vínculo.
5. **La autorización** se decide contra la base EN ESE MOMENTO
   (`autorizacion.js`): usuario existente y activo, rol actual con el permiso
   (vía `checkPerm`), local con grupo real igual al pedido, y local dentro del
   alcance actual —su local fijo si no es admin; el grupo de su local fijo si
   es admin con local; cualquiera si es admin sin local, como en el ERP—.
6. **La capacidad se ejecuta** con el alcance AUTORIZADO, no con el pedido.

`ventas_resumen` no tiene fórmula propia: el `where` comercial del período, el
`select`, el total y el desglose salieron de
`app/api/reportes-ventas/general/route.js` a `lib/reportes-ventas/resumenVentas.js`
y el reporte pasó a consumirlos.

## Motivo

El de cada paso está escrito en la cabecera de su archivo. El de fondo: la
aplicación no debe poder más que la persona en su propio ERP, y lo que la
persona puede se mira hoy, no en el login.

## Consecuencias

- Un permiso quitado o un usuario desactivado dejan de valer en la próxima
  solicitud, sin esperar a que venza ningún token.
- **Riesgo aceptado de V1** (decidido por Emanuel el 2026-10-06): no se
  guardan las firmas vistas, así que una solicitud capturada se puede repetir
  dentro de los 300 s. Con capacidades de solo lectura eso repite una
  consulta y nada más, y el cupo acota cuántas veces. Confirmado de nuevo al
  abrir la ruta HTTP (tanda 3): sigue sin persistencia anti-repetición. **Cuando exista una capacidad que escriba, esto NO
  alcanza**: hará falta idempotencia y protección contra repetición antes de
  habilitarla.
- **Cerrado en la tanda 2: el vínculo.** Ni el secreto de la aplicación ni un
  `usuarioId` alcanzan: la persona tiene que haber autorizado a Azul Chat desde
  su sesión del ERP (`POST /api/integraciones/azul-chat/vinculo/autorizar`), que
  le muestra una vez un código al azar; el ERP guarda solo su SHA-256 en
  `VinculoIntegracion`. El vínculo es una condición MÁS: no reemplaza permiso,
  actividad ni alcance, que se siguen releyendo en cada consulta.
  **Superado en la tanda 4:** en las tandas 2 y 3 ese código viajaba en CADA
  consulta, junto al `usuarioId` — era una contraseña permanente que Azul Chat
  tenía que guardar recuperable. Ver "El canje y la delegación".
- **Quién autoriza y quién revoca.** Autoriza solo la persona, para sí misma:
  el código se le muestra a quien autoriza, así que autorizar por otro sería
  quedarse con su identidad. Revoca la persona misma, o quien hoy puede darla
  de baja (`autorizarGestionUsuarios` + `dentroDeAlcance`, la regla de
  `/api/usuarios/eliminar/[id]`): revocar corta menos que dar de baja.
  Revocar es el rollback: el vínculo no se borra ni se edita, lo garantiza un
  trigger.
- **Admin global:** sin local fijo consulta cualquier grupo y local que el ERP
  le deja elegir; con local fijo, el grupo de ese local. Confirmado por
  Emanuel el 2026-10-06: Azul Chat no tiene un modelo territorial propio.

## La ruta HTTP (tanda 3)

`POST /api/integraciones/azul-chat/consultar`, la única. Server-to-server: no
lee cookies ni `Authorization`, no contesta CORS, toda respuesta va con
`Cache-Control: no-store` y `X-Content-Type-Options: nosniff`. Solo exporta
POST; el resto lo contesta Next con 405.

- **Cabeceras:** `Content-Type: application/json` (a lo sumo
  `; charset=utf-8`), `x-erp-integracion-aplicacion: azul-chat`,
  `x-erp-integracion-marca: <segundos Unix>`, `x-erp-integracion-firma: <hex>`.
- **Firma:** HMAC-SHA256 con `AZUL_CHAT_INTEGRACION_SECRET` sobre los bytes
  `"v1\n" + aplicacion + "\n" + marca + "\n"` seguidos de los BYTES del cuerpo
  tal como viajan. La ruta lee el cuerpo como bytes (`cuerpoHttp.js`), sin
  `req.json()` ni `req.text()`, y la firma se verifica sobre esos bytes antes
  de decodificarlos.
- **Cuerpo:** máximo 4096 bytes (por `Content-Length` y por lo que llega), UTF-8
  estricto, y JSON CANÓNICO: `JSON.stringify(JSON.parse(cuerpo)) === cuerpo`.
  Es lo que produce `JSON.stringify` del lado de Azul Chat, y cierra las claves
  repetidas y cualquier diferencia entre parsers: no se puede firmar una cosa
  y ejecutar otra.
- **Respuesta pública** (`respuestaPublica.js`): 200 `{ ok, datos }`; 400
  SOLICITUD_INVALIDA, PERIODO_INVALIDO o PERIODO_DEMASIADO_LARGO; 401
  SOLICITUD_NO_AUTENTICADA (firma, marca o aplicación, sin distinguir); 403
  CAPACIDAD_NO_DISPONIBLE, VINCULO_NO_VALIDO (sin delegación, revocado o
  usuario inexistente: idénticos, para no enumerar), CODIGO_NO_VALIDO (solo en
  el canje, tanda 4) o NO_AUTORIZADO
  (inactivo, sin permiso, fuera de alcance, grupo o local manipulado); 413;
  415; 429 LIMITE_EXCEDIDO con `Retry-After`; 500 ERROR_AL_CALCULAR con una
  `referencia` que también queda en el log; 503 INTEGRACION_NO_DISPONIBLE (sin
  secreto, corto o igual a `AUTH_SECRET`, sin decir cuál). El código interno
  detallado queda en el log, nunca en la respuesta.
- **Cupo V1** (`limitador.js`): en memoria del proceso, ventana fija de un
  minuto, 30 por aplicación y delegación (desde la tanda 4; antes, por
  `usuarioId`) y 120 por aplicación. Cuenta después de
  la firma y antes de la base. No es el limitador del login, que decide otra
  cosa (perdona aciertos) y vive adentro de su ruta.
- **Solo lectura:** la prueba de base saca una huella de TODAS las tablas antes
  y después de 41 respuestas —válidas, rechazadas y diez concurrentes— y tiene
  que ser idéntica.
- **Sin timeout propio:** el repo no tiene una convención para cortar
  consultas Prisma; el costo lo acota el período de hasta 31 días de un solo
  local.

## El canje y la delegación (tanda 4)

**Por qué.** Con el contrato de las tandas 2 y 3, Azul Chat no podía armar una
sesión propia sin inventar identidad: el código no decía de quién era (la
persona tenía que escribir su `usuarioId`), comprobarlo exigía correr una
consulta de ventas sobre un local que Azul Chat no conocía, y había que
guardarlo recuperable porque viajaba en cada consulta. Aprobado por Emanuel el
2026-10-06: código humano temporal, canje por un token propio, tabla separada,
y `mi_alcance` en la misma tanda.

**Tres cosas distintas:**

- **La autorización humana** — `VinculoIntegracion`, sin cambios de esquema:
  la persona, desde su sesión del ERP, autoriza a Azul Chat. Volver a autorizar
  revoca la anterior.
- **El código de canje** — credencial HUMANA. Es el código que `autorizar`
  devuelve una vez (`codigoCanje`, con `venceEn`), `vin1_` + 32 bytes al azar.
  El ERP guarda solo su SHA-256, en `VinculoIntegracion.codigoHash` como antes.
  Vale **10 minutos** desde `autorizadoEn` (`VIDA_CODIGO_CANJE_MS`) y **un
  solo canje**. No sirve para consultar.
- **El token de delegación** — credencial de MÁQUINA. `del1_` + 32 bytes al
  azar, generado solo al canjear y entregado solo al backend de Azul Chat. El
  ERP guarda solo su SHA-256 en `DelegacionIntegracion.tokenHash`. Delega
  IDENTIDAD y nada más: no congela rol, permisos, local ni grupo.

**`POST /api/integraciones/azul-chat/vinculo/canjear`** — de servidor a
servidor, con los mismos bordes que `consultar` (misma firma HMAC, JSON
canónico, 4096 bytes, `application/json`, sin cookies ni CORS, `no-store`,
`nosniff`). Cuerpo: exactamente `{ "codigo": "vin1_…" }` — sin `usuarioId`: la
identidad sale del vínculo que el código encuentra. Éxito:
`{ ok: true, datos: { usuarioId, vinculoId, tokenDelegacion, autorizadoEn,
canjeadoEn } }`, sin rol ni permisos. Código inexistente, mal escrito,
vencido, usado, de un vínculo revocado o de una persona inactiva: **403
CODIGO_NO_VALIDO**, idénticos byte a byte. Cupo: 20 canjes por minuto y por
aplicación, en memoria.

**Lo que garantiza la base** (migración `20261006150000_delegacion_integracion`):
`vinculoId` único —un código se canjea UNA vez, también con canjes
simultáneos; la contraprueba sin el índice dejó ganar a los cinco canjes
concurrentes—; un trigger BEFORE INSERT que bloquea el vínculo `FOR SHARE` y
rechaza un vínculo revocado o autorizado hace más de 10 minutos (reloj de la
base, en UTC) y pone `canjeadoEn`; un trigger que impide editar o borrar una
delegación; `tokenHash` único con CHECK de SHA-256 en hex. El trigger de
`VinculoIntegracion` no se tocó.

**Repetición del canje.** La misma solicitud firmada, repetida dentro de los
300 s del HMAC, NO produce un segundo token: el segundo intento choca contra
el índice único y sale CODIGO_NO_VALIDO. Por eso para el canje —que crea una
credencial— el riesgo aceptado de V1 (sin registro de firmas vistas) sigue
acotado: repetir el canje no repite su efecto.

**`consultar` desde la tanda 4:** `delegacion: { token }`. La puerta busca la
delegación por el hash del token con su vínculo, exige que sea de esta
aplicación y que el vínculo esté vigente, y lee AL DUEÑO DEL VÍNCULO. Un
`usuarioId` en el cuerpo es una clave de más (400). Después relee, como
siempre, usuario, actividad, rol, permisos, local, grupo y alcance. El cupo
cuenta por delegación (el hash del token). Token inexistente, de otra
aplicación, mal escrito o de un vínculo revocado: 403 VINCULO_NO_VALIDO.

**Revocación.** La delegación no tiene estado propio: vale mientras su vínculo
esté vigente. Revocar —la persona o quien la puede dar de baja— o volver a
autorizar invalida el token en la próxima consulta, sin depender de que Azul
Chat lo borre. Canje y revocación a la vez: gane quien gane, el token que
resulte no autentica (ejercido en la prueba de base, con los dos órdenes).

**`mi_alcance`** — capacidad de solo lectura, SIN permiso propio (lo mismo que
el ERP le muestra a cualquiera con sesión en `contexto-activo/get` y
`grupos/opciones`) y SIN `alcance` en el cuerpo: lo decide el ERP. Devuelve
`{ capacidad, version: 1, usuario: { id, nombre }, alcance: { modo
(LOCAL | GRUPO + grupoId | GLOBAL | NINGUNO) }, locales: [{ id, nombre,
grupoId, esDeposito, activo }] }`. Sale de la MISMA regla que la puerta
(`alcanceTerritorial` + `localEnAlcance` en `autorizacion.js`), con el grupo
de `getGrupoIdDeLocal`: lo que lista es exactamente lo que `ventas_resumen`
acepta, incluido un depósito en dos grupos (se informa con su grupo real, el
que acepta la puerta). Sirve para armar la interfaz; NO reemplaza la
autorización de cada capacidad.

**El botón del ERP.** "Vincular Azul Chat" en el menú de la persona
(`components/Header.jsx`), sin permiso: abre `ModalVincularAzulChat`, que llama
a `autorizar` con la sesión, muestra el código una vez con su hora de
vencimiento y un botón para copiarlo, y permite desvincular (`revocar`). El
código vive solo en la memoria del componente: ni URL, ni almacenamiento del
navegador, ni consola; cerrar lo olvida y recargar no lo recupera. `autorizar`
y `revocar` usan la cookie de sesión, que es SameSite=Lax.

**Lo que no hace, y queda anotado:** si la respuesta del canje se pierde, el
código ya está usado y el token también: la persona genera otro código. El
cupo del canje es uno solo por aplicación —quien mande muchos canjes malos
puede demorar los buenos un minuto—; el límite por persona/IP le toca al
backend de Azul Chat.

## Evidencia

- `lib/integraciones/azul-chat/` y `lib/integraciones/vinculos/`, con sus
  candados `*.test.mjs`; `components/integraciones/vincularAzulChat.test.mjs`.
- `prisma/migrations/20261006120000_vinculo_integracion/migration.sql` y
  `prisma/migrations/20261006150000_delegacion_integracion/migration.sql`.
- `scripts/pruebas-db/azulChatVentasResumen.mjs`: la integración contra el
  handler real del reporte en PostgreSQL, con ventas creadas por
  `/api/pos-ventas/crear`, una corrección por su ruta y una anulación por
  `revertirVenta`.
- `lib/ventas/filtroVentaComercial.test.mjs`, candado 5-13.bis: el envoltorio
  del filtro tiene que devolver `whereVentaComercial(...)`.
