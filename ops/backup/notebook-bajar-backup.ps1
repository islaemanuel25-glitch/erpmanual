# Baja el backup del día desde el VPS y lo distribuye a los destinos externos.
#
# Corre en la notebook por el Programador de tareas de Windows. Ver
# docs/RESTAURACION-BACKUP.md para el procedimiento de recuperación.
#
# ── POR QUÉ SE TIRA Y NO SE EMPUJA ──────────────────────────────────────────
# El VPS no guarda ninguna credencial hacia afuera. Si alguien lo compromete, se
# lleva la base pero NO los backups: no tiene con qué llegar a ellos. Si el VPS
# empujara, tendría que guardar la llave del lugar donde están las copias, que es
# justo lo que un atacante busca. Por eso el sentido del tráfico importa.
#
# ── LOS TRES DESTINOS ───────────────────────────────────────────────────────
#   1. Notebook  — el diario, siempre.
#   2. Disco externo — el diario, SI está conectado. Si no, se registra y sigue.
#   3. Repo git privado — solo semanal y mensual, CIFRADOS con gpg.
#
# Ninguna falla de un destino impide los otros: el objetivo es maximizar las
# copias que sí se pueden hacer, no abortar en la primera piedra.

[CmdletBinding()]
param(
  # Para probar sin esperar al domingo: fuerza el envío de semanal y mensual.
  [switch]$ForzarRepo,
  # No escribe en el repo ni en el disco: solo informa qué haría.
  [switch]$Simular
)

$ErrorActionPreference = "Stop"

# ── Configuración ───────────────────────────────────────────────────────────
$VPS          = "vps-erp"                                   # alias de ~/.ssh/config
$DIR_REMOTO   = "/srv/produccion/backups"
# Salen del perfil del usuario que corre la tarea, no de una ruta escrita a mano:
# este repositorio es público y el nombre de usuario del sistema no tiene por qué
# estar acá. `$env:USERPROFILE` resuelve a lo mismo en la máquina donde corre, así
# que la tarea programada sigue funcionando sin cambiarle nada.
$DIR_LOCAL    = Join-Path $env:USERPROFILE "Backups\erpazul"
$DIR_ESTADO   = Join-Path $env:USERPROFILE ".erpazul-backup"
$ARCHIVO_FRASE= Join-Path $DIR_ESTADO "frase-gpg.xml"
$LOG          = Join-Path $DIR_LOCAL "backup.log"
$ESTADO       = Join-Path $DIR_LOCAL "ESTADO.txt"
$REPO_LOCAL   = Join-Path $DIR_ESTADO "erpazul-backups"     # clon del repo privado
$REPO_REMOTO  = "https://github.com/islaemanuel25-glitch/erpazul-backups.git"

# Etiqueta del disco externo. Se busca por etiqueta y no por letra porque la
# letra cambia según qué haya enchufado antes.
$ETIQUETA_DISCO = "BACKUP-ERP"

New-Item -ItemType Directory -Path $DIR_LOCAL, $DIR_ESTADO -Force | Out-Null

# ── Ejecutables externos ────────────────────────────────────────────────────
# gpg NO está en el PATH de PowerShell: viene con Git para Windows y su carpeta
# (Git\usr\bin) no se agrega al PATH del sistema. Buscarlo con `gpg` a secas
# funciona en la terminal de Git Bash y falla en la tarea programada, que corre
# con el PATH de Windows. Se resuelve por ruta y se verifica al ARRANCAR, para
# que la falta se vea en la primera línea del log y no recién al ir a cifrar.
function ResolverEjecutable {
  param([string]$Nombre, [string[]]$Candidatos = @())
  $enPath = (Get-Command $Nombre -ErrorAction SilentlyContinue).Source
  if ($enPath) { return $enPath }
  foreach ($c in $Candidatos) { if (Test-Path $c) { return $c } }
  return $null
}

$GPG = ResolverEjecutable "gpg" @(
  "$env:ProgramFiles\Git\usr\bin\gpg.exe",
  "${env:ProgramFiles(x86)}\Git\usr\bin\gpg.exe",
  "$env:ProgramFiles\GnuPG\bin\gpg.exe",
  "$env:LOCALAPPDATA\Programs\Git\usr\bin\gpg.exe"
)
$SSH = ResolverEjecutable "ssh" @("$env:WINDIR\System32\OpenSSH\ssh.exe")
$SCP = ResolverEjecutable "scp" @("$env:WINDIR\System32\OpenSSH\scp.exe")
$GIT = ResolverEjecutable "git" @("$env:ProgramFiles\Git\cmd\git.exe")

# ── Log ─────────────────────────────────────────────────────────────────────
$script:lineas = @()
function Registrar {
  param([string]$Destino, [string]$Resultado, [string]$Detalle = "")
  $ts = Get-Date -Format "yyyy-MM-ddTHH:mm:ssK"
  $linea = "{0} | {1,-16} | {2,-24} | {3}" -f $ts, $Destino, $Resultado, $Detalle
  Add-Content -Path $LOG -Value $linea -Encoding UTF8
  $script:lineas += $linea
  Write-Host $linea
}

# Estado: una línea por destino con la ÚLTIMA copia exitosa. Se lee de un vistazo
# sin recorrer el historial. Un destino que dejó de funcionar se nota por la
# fecha vieja, aunque el log siga creciendo con corridas "exitosas" de los otros.
function ActualizarEstado {
  param([string]$Destino, [string]$Archivo)
  $mapa = @{}
  if (Test-Path $ESTADO) {
    foreach ($l in Get-Content $ESTADO -Encoding UTF8) {
      if ($l -match '^(\S+)\s*=\s*(.*)$') { $mapa[$Matches[1]] = $Matches[2] }
    }
  }
  $mapa[$Destino] = "{0} | {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm"), $Archivo
  $salida = @("# Ultima copia EXITOSA a cada destino. Si una fecha quedo vieja, ese destino dejo de funcionar.")
  foreach ($k in @("notebook", "disco_externo", "repo_git")) {
    $v = if ($mapa.ContainsKey($k)) { $mapa[$k] } else { "NUNCA" }
    $salida += ("{0,-14} = {1}" -f $k, $v)
  }
  Set-Content -Path $ESTADO -Value $salida -Encoding UTF8
}

# Ejecuta un programa externo y decide por su CÓDIGO DE SALIDA, no por si escribió
# en stderr.
#
# Windows PowerShell 5.1 convierte cada línea que un .exe manda a stderr en un
# registro de error, y con $ErrorActionPreference='Stop' eso aborta el script
# aunque el programa haya terminado bien. `git clone` informa su progreso por
# stderr, así que un clon exitoso se veía como una falla. Acá se baja la
# preferencia mientras corre el programa y se mira el código de salida, que es lo
# único que dice de verdad si funcionó.
function EjecutarNativo {
  param([string]$Programa, [string[]]$Argumentos, [string]$Descripcion)
  $previo = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $salida = & $Programa @Argumentos 2>&1
    $codigo = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previo
  }
  if ($codigo -ne 0) {
    $texto = ($salida | Out-String).Trim()
    throw ("{0} falló (código {1}): {2}" -f $Descripcion, $codigo, $texto)
  }
  return ($salida | Out-String).Trim()
}

function EjecutarSsh {
  param([string]$Comando)
  return EjecutarNativo $SSH @("-o", "ConnectTimeout=20", "-o", "BatchMode=yes", $VPS, $Comando) "ssh"
}

Registrar "corrida" "INICIO" ("simular={0} forzarRepo={1}" -f $Simular, $ForzarRepo)

# Si falta un ejecutable se dice ACÁ, no cuando se lo va a usar. gpg sobre todo:
# su ausencia solo se notaría los domingos, y como una línea de error perdida
# entre corridas exitosas de los otros destinos.
$faltan = @()
if (-not $SSH) { $faltan += "ssh" }
if (-not $SCP) { $faltan += "scp" }
if (-not $GIT) { $faltan += "git" }
if (-not $GPG) { $faltan += "gpg (viene con Git para Windows, en Git\usr\bin)" }
if ($faltan.Count -gt 0) {
  Registrar "corrida" "FALTAN PROGRAMAS" ($faltan -join ", ")
  throw ("No se puede continuar, faltan: {0}" -f ($faltan -join ", "))
}
Registrar "corrida" "PROGRAMAS OK" ("gpg={0}" -f $GPG)

# ── 1. Notebook: el diario ──────────────────────────────────────────────────
$nombreDiario = $null
try {
  $nombreDiario = EjecutarSsh "cat $DIR_REMOTO/ULTIMO_DIARIO.txt"
  if (-not $nombreDiario) { throw "el VPS no reporta ningún diario" }

  $destino = Join-Path $DIR_LOCAL $nombreDiario
  if (Test-Path $destino) {
    Registrar "notebook" "YA ESTABA" $nombreDiario
  } else {
    EjecutarNativo $SCP @("-o", "ConnectTimeout=20", "${VPS}:$DIR_REMOTO/$nombreDiario", $destino) "scp del diario" | Out-Null
  }

  # La verificación es el punto: sin esto solo sabemos que hay un archivo, no
  # que sea el mismo. Se compara contra el hash calculado EN EL SERVIDOR.
  $shaRemoto = (EjecutarSsh "sha256sum $DIR_REMOTO/$nombreDiario").Split(" ")[0]
  $shaLocal  = (Get-FileHash -Path $destino -Algorithm SHA256).Hash.ToLower()
  if ($shaLocal -ne $shaRemoto) {
    Remove-Item $destino -Force   # una copia que no verifica es peor que ninguna
    throw "SHA-256 NO COINCIDE (remoto=$shaRemoto local=$shaLocal). Copia descartada."
  }
  Registrar "notebook" "OK" ("{0} sha256={1}..." -f $nombreDiario, $shaLocal.Substring(0, 16))
  ActualizarEstado "notebook" $nombreDiario
} catch {
  Registrar "notebook" "ERROR" $_.Exception.Message
}

# ── 1.bis Notebook: el paquete de fotos de producto ─────────────────────────
#
# ── POR QUÉ BAJA A LA NOTEBOOK Y NO AL REPO GIT ─────────────────────────────
#
# El dump de la base pesa unos 2,7 MB y por eso el semanal y el mensual entran
# cifrados en un repo git. El paquete de fotos crece con el catálogo: a 300 KB
# por foto, dos mil productos son unos 600 MB. Git guarda todas las versiones
# para siempre, así que meterlo ahí es hacer crecer el repo sin techo y sin
# poder deshacerlo.
#
# Así que va a la notebook y al disco externo, que es donde ya va el diario. Es
# una copia menos que la base, y está dicho a propósito en DEC-0009.
#
# EL PAQUETE ES GRANDE Y SE BAJA ENTERO CADA VEZ QUE CAMBIA. Cuando el volumen no
# cambió, el VPS deja el mismo archivo por enlace duro y el nombre cambia igual
# —lleva la fecha—, así que acá se compara el HASH contra lo que ya se tiene
# antes de bajar: si es el mismo contenido, se copia local en vez de por la red.
$nombreFotos = $null
try {
  $nombreFotos = EjecutarSsh "cat $DIR_REMOTO/ULTIMO_FOTOS_DIARIO.txt"
  if (-not $nombreFotos) {
    # NO es un error: hasta que el volumen exista en producción, no hay paquete.
    # Un "no hay" registrado es información; una excepción sería ruido diario.
    Registrar "fotos_notebook" "SIN PAQUETE" "el VPS todavía no reporta ningún paquete de fotos"
  } else {
    $destinoFotos = Join-Path $DIR_LOCAL $nombreFotos
    $shaRemotoFotos = (EjecutarSsh "sha256sum $DIR_REMOTO/$nombreFotos").Split(" ")[0]

    if (Test-Path $destinoFotos) {
      Registrar "fotos_notebook" "YA ESTABA" $nombreFotos
    } else {
      # ── SI YA TENEMOS ESE CONTENIDO, NO SE BAJA DE NUEVO ──────────────────
      #
      # El VPS enlaza el paquete del día al anterior cuando nada cambió, pero le
      # pone nombre nuevo. Sin esto, se bajarían 600 MB por día para guardar el
      # mismo contenido con otro nombre.
      $yaLoTengo = Get-ChildItem -Path $DIR_LOCAL -Filter "fotos-diario-*.tar.gz" -ErrorAction SilentlyContinue |
        Where-Object { (Get-FileHash -Path $_.FullName -Algorithm SHA256).Hash.ToLower() -eq $shaRemotoFotos } |
        Select-Object -First 1
      if ($yaLoTengo) {
        Copy-Item $yaLoTengo.FullName $destinoFotos -Force
        Registrar "fotos_notebook" "SIN CAMBIOS" ("copiado de {0}" -f $yaLoTengo.Name)
      } else {
        EjecutarNativo $SCP @("-o", "ConnectTimeout=20", "${VPS}:$DIR_REMOTO/$nombreFotos", $destinoFotos) "scp del paquete de fotos" | Out-Null
      }
    }

    # La verificación es el punto, igual que con el dump: sin esto solo sabemos
    # que hay un archivo, no que sea el mismo.
    $shaLocalFotos = (Get-FileHash -Path $destinoFotos -Algorithm SHA256).Hash.ToLower()
    if ($shaLocalFotos -ne $shaRemotoFotos) {
      Remove-Item $destinoFotos -Force   # una copia que no verifica es peor que ninguna
      throw "SHA-256 NO COINCIDE en el paquete de fotos (remoto=$shaRemotoFotos local=$shaLocalFotos). Copia descartada."
    }
    Registrar "fotos_notebook" "OK" ("{0} sha256={1}..." -f $nombreFotos, $shaLocalFotos.Substring(0, 16))
    ActualizarEstado "fotos_notebook" $nombreFotos
  }
} catch {
  Registrar "fotos_notebook" "ERROR" $_.Exception.Message
}

# ── 2. Disco externo: el diario, si está ────────────────────────────────────
# Todavía no existe el disco. Queda escrito para que sumarlo sea enchufarlo y
# ponerle la etiqueta, sin tocar este script.
try {
  $vol = Get-Volume -ErrorAction SilentlyContinue | Where-Object { $_.FileSystemLabel -eq $ETIQUETA_DISCO }
  if (-not $vol) {
    Registrar "disco_externo" "NO CONECTADO" ("no hay volumen con etiqueta '{0}'" -f $ETIQUETA_DISCO)
  } elseif (-not $nombreDiario) {
    Registrar "disco_externo" "OMITIDO" "no hubo diario que copiar"
  } else {
    $dirDisco = "{0}:\erpazul-backups" -f $vol.DriveLetter
    $origen   = Join-Path $DIR_LOCAL $nombreDiario
    if ($Simular) {
      Registrar "disco_externo" "SIMULADO" $dirDisco
    } else {
      New-Item -ItemType Directory -Path $dirDisco -Force | Out-Null
      Copy-Item $origen (Join-Path $dirDisco $nombreDiario) -Force
      $shaDisco = (Get-FileHash -Path (Join-Path $dirDisco $nombreDiario) -Algorithm SHA256).Hash.ToLower()
      $shaOrig  = (Get-FileHash -Path $origen -Algorithm SHA256).Hash.ToLower()
      if ($shaDisco -ne $shaOrig) { throw "SHA-256 no coincide tras copiar al disco" }
      Registrar "disco_externo" "OK" ("{0}\{1}" -f $dirDisco, $nombreDiario)
      ActualizarEstado "disco_externo" $nombreDiario

      # ── Y EL PAQUETE DE FOTOS, AL MISMO DISCO ────────────────────────────
      #
      # Va acá adentro y no en su propio bloque a propósito: si el disco no está,
      # el bloque entero ya se saltó y no hay que repetir esa comprobación. Y si
      # está, las dos cosas que hay que respaldar van juntas — un disco con la
      # base y sin las fotos es media restauración.
      if ($nombreFotos) {
        $origenFotos = Join-Path $DIR_LOCAL $nombreFotos
        if (Test-Path $origenFotos) {
          Copy-Item $origenFotos (Join-Path $dirDisco $nombreFotos) -Force
          $shaDiscoFotos = (Get-FileHash -Path (Join-Path $dirDisco $nombreFotos) -Algorithm SHA256).Hash.ToLower()
          $shaOrigFotos  = (Get-FileHash -Path $origenFotos -Algorithm SHA256).Hash.ToLower()
          if ($shaDiscoFotos -ne $shaOrigFotos) { throw "SHA-256 no coincide tras copiar las fotos al disco" }
          Registrar "fotos_disco_externo" "OK" ("{0}\{1}" -f $dirDisco, $nombreFotos)
          ActualizarEstado "fotos_disco_externo" $nombreFotos
        } else {
          Registrar "fotos_disco_externo" "OMITIDO" "el paquete de fotos no está en la notebook"
        }
      } else {
        Registrar "fotos_disco_externo" "OMITIDO" "no hubo paquete de fotos que copiar"
      }
    }
  }
} catch {
  Registrar "disco_externo" "ERROR" $_.Exception.Message
}

$fraseTmp = $null   # se usa en el finally; puede fallar antes de asignarla
$fraseTmp = $null   # se usa en el finally: puede fallar antes de asignarla
# ── 3. Repo git privado: semanal y mensual, CIFRADOS ────────────────────────
# El diario NO va al repo: git guarda todas las versiones para siempre y un .gz
# no comprime más, así que subir 365 por año lo haría crecer sin freno.
try {
  $hoy = Get-Date
  $tocaSemanal = ($hoy.DayOfWeek -eq [DayOfWeek]::Sunday) -or $ForzarRepo
  $tocaMensual = ($hoy.Day -eq 1) -or $ForzarRepo

  if (-not ($tocaSemanal -or $tocaMensual)) {
    Registrar "repo_git" "NO CORRESPONDE" "solo domingos (semanal) y día 1 (mensual)"
  } else {
    if (-not (Test-Path $ARCHIVO_FRASE)) { throw "falta la frase gpg en $ARCHIVO_FRASE (ver docs/RESTAURACION-BACKUP.md)" }

    if (-not (Test-Path (Join-Path $REPO_LOCAL ".git"))) {
      Registrar "repo_git" "CLONANDO" $REPO_REMOTO
      if (-not $Simular) {
        EjecutarNativo $GIT @("clone", $REPO_REMOTO, $REPO_LOCAL) "git clone (revisa que el repo exista y tengas acceso)" | Out-Null
      }
    }

    # Identidad del commit, LOCAL a este clon. Esta máquina no tiene identidad
    # global de git —el repo del ERP usa la suya propia—, así que un clon recién
    # hecho no puede commitear: git corta con "Author identity unknown". Se
    # configura acá y no a mano para que después de un formateo el primer intento
    # funcione, en vez de fallar una vez y obligar a averiguar por qué.
    if (-not $Simular -and (Test-Path (Join-Path $REPO_LOCAL ".git"))) {
      Push-Location $REPO_LOCAL
      try {
        EjecutarNativo $GIT @("config", "user.name", "emanuel") "git config user.name" | Out-Null
        EjecutarNativo $GIT @("config", "user.email", "emanuel@erpmanual.local") "git config user.email" | Out-Null
      } finally { Pop-Location }
    }

    # La frase sale del archivo DPAPI y se le pasa a gpg por --passphrase-file.
    #
    # NO se usa --passphrase-fd 0: canalizar una cadena de PowerShell a la
    # entrada estándar de un ejecutable nativo no cierra el descriptor, y gpg
    # queda esperando para siempre. Probado: cuelga sin timeout ni mensaje.
    #
    # Tampoco --passphrase a secas: los argumentos de un proceso los puede leer
    # cualquier otro proceso de la máquina.
    #
    # El archivo temporal vive en el perfil del usuario, con permisos solo para
    # él, y se borra en el finally aunque gpg falle.
    $sec   = Import-Clixml $ARCHIVO_FRASE
    $frase = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
               [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
    $fraseTmp = Join-Path $DIR_ESTADO ".frase.tmp"
    [System.IO.File]::WriteAllText($fraseTmp, $frase, [System.Text.UTF8Encoding]::new($false))
    $aclF = Get-Acl $fraseTmp
    $aclF.SetAccessRuleProtection($true, $false)
    $aclF.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
      $env:USERNAME, "FullControl", "Allow")))
    Set-Acl $fraseTmp $aclF

    $subidos = @()
    foreach ($serie in @("semanal", "mensual")) {
      if ($serie -eq "semanal" -and -not $tocaSemanal) { continue }
      if ($serie -eq "mensual" -and -not $tocaMensual) { continue }

      $puntero = "ULTIMO_" + $serie.ToUpper() + ".txt"
      $nombre  = EjecutarSsh "cat $DIR_REMOTO/$puntero"
      if (-not $nombre) { Registrar "repo_git" "SIN $serie" "el VPS todavía no generó ninguno"; continue }

      $tmp = Join-Path $env:TEMP $nombre
      EjecutarNativo $SCP @("-o", "ConnectTimeout=20", "${VPS}:$DIR_REMOTO/$nombre", $tmp) "scp del $serie" | Out-Null

      $shaRem = (EjecutarSsh "sha256sum $DIR_REMOTO/$nombre").Split(" ")[0]
      $shaLoc = (Get-FileHash -Path $tmp -Algorithm SHA256).Hash.ToLower()
      if ($shaLoc -ne $shaRem) { Remove-Item $tmp -Force; throw "SHA-256 no coincide en el $serie" }

      $cifrado = Join-Path $REPO_LOCAL "$nombre.gpg"
      if ($Simular) {
        Registrar "repo_git" "SIMULADO" "$nombre.gpg"
      } else {
        New-Item -ItemType Directory -Path $REPO_LOCAL -Force | Out-Null
        EjecutarNativo $GPG @("--batch", "--yes", "--quiet", "--symmetric", "--cipher-algo", "AES256", "--passphrase-file", $fraseTmp, "--pinentry-mode", "loopback", "--output", $cifrado, $tmp) "gpg al cifrar $nombre" | Out-Null
        $subidos += "$nombre.gpg"
      }
      Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    }

    if ($subidos.Count -gt 0 -and -not $Simular) {
      Push-Location $REPO_LOCAL
      try {
        EjecutarNativo $GIT @("add", "--", "*.gpg") "git add" | Out-Null
        $hay = EjecutarNativo $GIT @("status", "--porcelain") "git status"
        if ($hay) {
          EjecutarNativo $GIT @("commit", "-m", ("backup cifrado {0}: {1}" -f (Get-Date -Format "yyyy-MM-dd"), ($subidos -join ", "))) "git commit" | Out-Null
          EjecutarNativo $GIT @("push", "--set-upstream", "origin", "HEAD") "git push" | Out-Null
          Registrar "repo_git" "OK" ($subidos -join ", ")
          ActualizarEstado "repo_git" ($subidos -join ", ")
        } else {
          Registrar "repo_git" "SIN CAMBIOS" "los archivos ya estaban subidos"
        }
      } finally { Pop-Location }
    }
  }
} catch {
  Registrar "repo_git" "ERROR" $_.Exception.Message
} finally {
  # La frase temporal se borra pase lo que pase: si gpg falló, si scp falló, o si
  # alguien cortó la corrida. Nunca debe quedar en disco entre corridas.
  if ($fraseTmp -and (Test-Path $fraseTmp)) {
    Remove-Item -LiteralPath $fraseTmp -Force -ErrorAction SilentlyContinue
  }
  if ($fraseTmp -and (Test-Path $fraseTmp)) { Registrar "repo_git" "AVISO" "no se pudo borrar la frase temporal" }
}

Registrar "corrida" "FIN" ""
Write-Host ""
Write-Host "--- ESTADO ---"
if (Test-Path $ESTADO) { Get-Content $ESTADO | Write-Host }
