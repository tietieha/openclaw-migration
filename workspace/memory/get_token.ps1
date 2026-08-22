$appId = "cli_aaf1497789b89cdc"
$appSecret = "jEGsMQ…NcYf"
$body = "{`"app_id`":`"$appId`",`"app_secret`":`"$appSecret`"}"
$tk = Invoke-RestMethod -Uri "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal" -Method Post -Body $body -ContentType "application/json"
Write-Output $tk.tenant_access_token
