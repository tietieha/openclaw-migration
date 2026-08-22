$ErrorActionPreference = 'Stop'

# Get crumb
$crumbData = Invoke-RestMethod -Uri 'http://10.11.107.186:8080/jenkins/crumbIssuer/api/json' -UseBasicParsing -TimeoutSec 15
$crumbField = $crumbData.crumbRequestField
$crumb = $crumbData.crumb
Write-Output "CRUMB_FIELD=$crumbField"
Write-Output "CRUMB=$crumb"

# Trigger rebuild of MSDK with parameters
$params = "branch=cbt1%2F20260812_msdk&configbranch=cbt1%2F20260812_1805&version=0.1.0001.0&packageType=2&sdkDefine=MSDK_SDK&channelType=1&sdkEnvironmentType=1&buildType=0&isLuaEncryptByteCode=True&showWaterMask=True&dolphinChannel=3&enablePuffer=False&processImages=False&analyzeAssetDupeDependencies=False&mapleRegion=7000&dolphinRegion=7000&log=False&gm=True"
$headers = @{ "$crumbField" = "$crumb" }
$url = "http://10.11.107.186:8080/jenkins/job/Homm_Release_Android_MSDK/buildWithParameters?$params"

$response = Invoke-WebRequest -Uri $url -Method Post -Headers $headers -UseBasicParsing -TimeoutSec 15
Write-Output "TRIGGER_STATUS=$($response.StatusCode)"
Write-Output "LOCATION=$($response.Headers['Location'])"
