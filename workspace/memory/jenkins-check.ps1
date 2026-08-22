$ErrorActionPreference = 'Stop'
$result = @{}

try {
    $msdk = Invoke-RestMethod -Uri 'http://10.11.107.186:8080/jenkins/job/Homm_Release_Android_MSDK/lastBuild/api/json' -UseBasicParsing -TimeoutSec 15
    $result['msdk_number']    = $msdk.number
    $result['msdk_building']  = $msdk.building
    $result['msdk_result']    = $msdk.result
    $result['msdk_timestamp'] = $msdk.timestamp
    $result['msdk_duration']  = $msdk.duration
    $params = $msdk.actions | Where-Object { $_.parameters } | Select-Object -First 1 -ExpandProperty parameters
    $paramStr = ($params | ForEach-Object { [uri]::EscapeDataString($_.name) + '=' + [uri]::EscapeDataString([string]$_.value) }) -join '&'
    $result['msdk_params'] = $paramStr
} catch {
    $result['msdk_error'] = $_.Exception.Message
}

try {
    $once = Invoke-RestMethod -Uri 'http://10.11.107.186:8080/jenkins/job/Homm_Release_Android_Once/lastBuild/api/json' -UseBasicParsing -TimeoutSec 15
    $result['once_number']    = $once.number
    $result['once_building']  = $once.building
    $result['once_result']    = $once.result
    $result['once_timestamp'] = $once.timestamp
    $result['once_duration']  = $once.duration
    $params2 = $once.actions | Where-Object { $_.parameters } | Select-Object -First 1 -ExpandProperty parameters
    $paramStr2 = ($params2 | ForEach-Object { [uri]::EscapeDataString($_.name) + '=' + [uri]::EscapeDataString([string]$_.value) }) -join '&'
    $result['once_params'] = $paramStr2
} catch {
    $result['once_error'] = $_.Exception.Message
}

$result | ConvertTo-Json
