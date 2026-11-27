<#
  EVIDENCIA DE LA API REST de Dulce Arte (JWT + JSON + CRUD completo + persistencia en RDS).

  Hace, a través de la API Gateway (HTTPS):
    1. /api/salud/ (público)                      -> el backend responde JSON
    2. /api/rutas/ sin token                      -> 401 (autenticación obligatoria)
    3. Login JWT como Repartidor                  -> access + refresh (se muestra el contenido del token)
    4. Token falso                                -> 401
    5. Pantalla de otro rol (Bodega)              -> 403 (autorización por rol)
    6. CREATE  POST   /api/rutas/                 -> 201
    7. READ    GET    /api/rutas/<id>/            -> 200
    8. UPDATE  PATCH  /api/rutas/<id>/            -> 200
    9. LIST    GET    /api/rutas/                 -> 200
       (pausa: aquí se comprueba en la EC2 que el registro está guardado en RDS)
   10. DELETE  DELETE /api/rutas/<id>/            -> 204
   11. READ de nuevo                              -> 404 (ya no existe)

  La contraseña se escribe al ejecutar (no queda en el código ni en el archivo de evidencia).

  Uso (PowerShell, en la carpeta del proyecto):
    powershell -ExecutionPolicy Bypass -File scripts\evidencia_api.ps1
#>
param(
    [string]$Api = "https://kh6uimo2ob.execute-api.us-east-1.amazonaws.com"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Net.Http

$cliente = New-Object System.Net.Http.HttpClient
$cliente.Timeout = [TimeSpan]::FromSeconds(30)
$salida = Join-Path (Get-Location) ("evidencia_api_{0}.txt" -f (Get-Date -Format "yyyyMMdd_HHmmss"))
$lineas = New-Object System.Collections.Generic.List[string]

function Escribir($texto, $color = "Gray") { Write-Host $texto -ForegroundColor $color; $lineas.Add($texto) }

function Llamar($metodo, $ruta, $datos = $null, $token = $null) {
    $peticion = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::new($metodo), "$Api$ruta")
    $peticion.Headers.Add("Accept", "application/json")
    if ($token) { $peticion.Headers.Add("Authorization", "Bearer $token") }
    if ($null -ne $datos) {
        $json = $datos | ConvertTo-Json -Compress
        $peticion.Content = New-Object System.Net.Http.StringContent($json, [Text.Encoding]::UTF8, "application/json")
    }
    $r = $cliente.SendAsync($peticion).Result
    $texto = $r.Content.ReadAsStringAsync().Result
    return [pscustomobject]@{ Codigo = [int]$r.StatusCode; Texto = $texto }
}

function Paso($numero, $titulo, $metodo, $ruta, $esperado, $resp, $ocultar = $false) {
    $ok = $resp.Codigo -eq $esperado
    $marca = if ($ok) { "OK " } else { "REVISAR" }
    Escribir ""
    Escribir ("[{0}] {1}" -f $numero, $titulo) "Cyan"
    Escribir ("    {0} {1}" -f $metodo, $ruta)
    Escribir ("    Respuesta HTTP {0} (esperado {1})  {2}" -f $resp.Codigo, $esperado, $marca) ($(if ($ok) { "Green" } else { "Red" }))
    if (-not $ocultar -and $resp.Texto) {
        $t = $resp.Texto
        if ($t.Length -gt 400) { $t = $t.Substring(0, 400) + " ..." }
        Escribir "    JSON: $t"
    }
}

function Corto($token) { if (-not $token) { return "" }; return $token.Substring(0, 20) + "..." + $token.Substring($token.Length - 10) }

function PayloadJwt($token) {
    $parte = $token.Split(".")[1].Replace("-", "+").Replace("_", "/")
    while ($parte.Length % 4) { $parte += "=" }
    return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($parte))
}

Escribir ("=" * 74)
Escribir "EVIDENCIA API REST - Dulce Arte" "Yellow"
Escribir ("Fecha:   {0}" -f (Get-Date -Format "dd-MM-yyyy HH:mm:ss"))
Escribir "API:     $Api  (API Gateway, HTTPS)"
Escribir ("=" * 74)

$usuario = Read-Host "Usuario con rol Repartidor"
$segura = Read-Host "Contraseña" -AsSecureString
$clave = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura))

# 1. Salud
$r = Llamar "GET" "/api/salud/"
Paso 1 "Backend en línea (público)" "GET" "/api/salud/" 200 $r

# 2. Sin token
$r = Llamar "GET" "/api/rutas/"
Paso 2 "Sin token JWT no se puede consultar la API" "GET" "/api/rutas/" 401 $r

# 3. Login
$r = Llamar "POST" "/api/auth/token/" @{ username = $usuario; password = $clave }
$clave = $null
Paso 3 "Login: el backend entrega tokens JWT" "POST" "/api/auth/token/" 200 $r $true
if ($r.Codigo -ne 200) { Escribir "    No se pudo iniciar sesión: $($r.Texto)" "Red"; $lineas | Out-File $salida -Encoding UTF8; exit 1 }
$login = $r.Texto | ConvertFrom-Json
$access = $login.access
Escribir ("    access  (30 min): {0}" -f (Corto $access))
Escribir ("    refresh (8 h):    {0}" -f (Corto $login.refresh))
Escribir ("    usuario: {0}   rol: {1}" -f $login.usuario.username, $login.usuario.rol)
Escribir ("    Contenido (payload) del access token: {0}" -f (PayloadJwt $access))
Escribir "    (El token va firmado con HS256: si se modifica, la firma deja de coincidir.)"

# 4. Token falso
$r = Llamar "GET" "/api/rutas/" $null "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoxfQ.firma-falsa"
Paso 4 "Token manipulado o falso es rechazado" "GET" "/api/rutas/" 401 $r

# 5. Autorización por rol
$r = Llamar "GET" "/api/pantallas/bodega/" $null $access
Paso 5 "Autenticado, pero sin permiso: el Repartidor no puede ver Bodega" "GET" "/api/pantallas/bodega/" 403 $r

# 6. CREATE
$nombre = "Ruta prueba EVA4 {0}" -f (Get-Date -Format "HHmmss")
$nueva = @{ nombre = $nombre; fecha = (Get-Date -Format "yyyy-MM-dd"); observaciones = "Creada por el script de evidencia" }
$r = Llamar "POST" "/api/rutas/" $nueva $access
Paso 6 "CREATE: crear una ruta de reparto" "POST" "/api/rutas/" 201 $r
if ($r.Codigo -ne 201) { $lineas | Out-File $salida -Encoding UTF8; exit 1 }
$id = ($r.Texto | ConvertFrom-Json).id

# 7. READ
$r = Llamar "GET" "/api/rutas/$id/" $null $access
Paso 7 "READ: consultar la ruta creada" "GET" "/api/rutas/$id/" 200 $r

# 8. UPDATE
$r = Llamar "PATCH" "/api/rutas/$id/" @{ observaciones = "Actualizada por el script de evidencia" } $access
Paso 8 "UPDATE: modificar las observaciones" "PATCH" "/api/rutas/$id/" 200 $r

# 9. LIST
$r = Llamar "GET" "/api/rutas/" $null $access
Paso 9 "LIST: listar todas las rutas" "GET" "/api/rutas/" 200 $r $true
$lista = $r.Texto | ConvertFrom-Json
$cantidad = if ($lista.results) { $lista.results.Count } else { @($lista).Count }
Escribir "    Rutas en la lista: $cantidad (incluye la ruta id=$id)"

Escribir ""
Escribir ("-" * 74) "Yellow"
Escribir "PAUSA - Comprueba ahora en la EC2 backend que la ruta id=$id está guardada en RDS." "Yellow"
Escribir "Cuando termines, vuelve aquí y presiona Enter para ELIMINARLA." "Yellow"
Escribir ("-" * 74) "Yellow"
[void](Read-Host)

# 10. DELETE
$r = Llamar "DELETE" "/api/rutas/$id/" $null $access
Paso 10 "DELETE: eliminar la ruta" "DELETE" "/api/rutas/$id/" 204 $r

# 11. READ tras borrar
$r = Llamar "GET" "/api/rutas/$id/" $null $access
Paso 11 "La ruta ya no existe" "GET" "/api/rutas/$id/" 404 $r

Escribir ""
Escribir ("=" * 74)
Escribir "Fin de la evidencia." "Yellow"
$lineas | Out-File -FilePath $salida -Encoding UTF8
Write-Host "Resultado guardado en: $salida" -ForegroundColor Green
$cliente.Dispose()
