Registrar la tarea programada de Windows
=========================================

Se corre una sola vez, en una terminal PowerShell del usuario emanuel. No hace
falta ser administrador: la tarea corre como tu propio usuario.

Si ya existe, la primera línea la borra para volver a crearla limpia.

    $script = "C:\Users\emanuel\Desktop\programas\programas\erpmanual\ops\backup\notebook-bajar-backup.ps1"
    $nombre = "ERP Azul - bajar backup"
    Unregister-ScheduledTask -TaskName $nombre -Confirm:$false -ErrorAction SilentlyContinue

    $accion = New-ScheduledTaskAction -Execute "powershell.exe" `
      -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$script`""
    $disparador = New-ScheduledTaskTrigger -Daily -At "10:00"
    $opciones = New-ScheduledTaskSettingsSet -StartWhenAvailable `
      -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries `
      -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName $nombre -Action $accion -Trigger $disparador `
      -Settings $opciones -Description "Baja el backup diario del VPS, verifica SHA-256 y distribuye a los destinos externos. Ver docs/RESTAURACION-BACKUP.md"


Por qué cada opción
-------------------

-StartWhenAvailable      Si la notebook estaba apagada a las 10:00, corre en
                         cuanto se enciende. Es el equivalente del
                         Persistent=true del timer del VPS.

-AllowStartIfOnBatteries Sin esto Windows saltea la tarea cuando la notebook
-DontStopIfGoingOnBatteries  está desenchufada, que es la mitad del tiempo.

-MultipleInstances IgnoreNew  Si una corrida quedó colgada, la siguiente no se
                         encima.


Comprobar que quedó bien
------------------------

    Get-ScheduledTaskInfo -TaskName "ERP Azul - bajar backup"

LastTaskResult 0 significa que la última corrida terminó bien. Ojo: el script
está hecho para NO fallar cuando un destino no está disponible —el disco externo
desconectado, por ejemplo—, así que el 0 no alcanza por sí solo. Lo que hay que
mirar es el estado:

    type C:\Users\emanuel\Backups\erpazul\ESTADO.txt

IMPORTANTE sobre el archivo .ps1
--------------------------------

Tiene que estar guardado en UTF-8 CON BOM. Windows PowerShell 5.1 lee los .ps1
sin BOM como ANSI, y los acentos de los mensajes salen rotos en el log. Si lo
editás con un editor que guarde sin BOM, se arregla así:

    $f = "C:\...\notebook-bajar-backup.ps1"
    $t = [System.IO.File]::ReadAllText($f, [System.Text.UTF8Encoding]::new($false))
    [System.IO.File]::WriteAllText($f, $t, [System.Text.UTF8Encoding]::new($true))
