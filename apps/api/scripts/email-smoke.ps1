$ErrorActionPreference = "Stop"
$BASE = "http://localhost:4000"
function Today([int]$off) { (Get-Date).ToUniversalTime().Date.AddDays($off).ToString("yyyy-MM-dd") }

$mgr = Invoke-RestMethod -Method Post "$BASE/auth/login" -ContentType "application/json" -Body '{"phone":"8801700000001","password":"Password123!"}'
$M = @{ Authorization = "Bearer $($mgr.accessToken)" }
$rid = $mgr.user.resortIds[0]
$rooms = Invoke-RestMethod -Method Get "$BASE/resorts/$rid/rooms" -Headers $M
$lun = ($rooms | Where-Object { $_.name -eq "Lunaria" }).id
$cam = ($rooms | Where-Object { $_.name -eq "Camellia" }).id

# 1) booking with guest email
$bk = Invoke-RestMethod -Method Post "$BASE/bookings" -ContentType "application/json" -Headers $M -Body (@{
  resortId=$rid; roomIds=@($lun); checkIn=(Today 5); checkOut=(Today 6); adults=2
  guest=@{ fullName="Email Probe"; phone="01822-333444"; email="guest@example.com" }
} | ConvertTo-Json -Compress -Depth 5)
Write-Host ("1. " + $bk.code + " guest email=" + $bk.guest.email)

# 2) dispatch sends EMAIL confirmation
$disp = Invoke-RestMethod -Method Post "$BASE/notifications/dispatch" -ContentType "application/json" -Headers $M -Body '{"sweeps":1}'
Write-Host ("2. dispatch sent=" + $disp.sent)

# 3) feed shows EMAIL channel
$feed = Invoke-RestMethod -Method Get "$BASE/notifications/recent?take=6" -Headers $M
$conf = $feed | Where-Object { $_.template -eq "booking_confirmed" -and $_.to -eq "guest@example.com" } | Select-Object -First 1
Write-Host ("3. " + $conf.template + " channel=" + $conf.channel + " to=" + $conf.to + " sent=" + $conf.sent)

# 4) email-invoice
$inv = Invoke-RestMethod -Method Post "$BASE/bookings/$($bk.id)/email-invoice" -Headers $M
Write-Host ("4. email-invoice to=" + $inv.to + " sent=" + $inv.sent)

# 5) no-email booking falls back to SMS channel
$bk2 = Invoke-RestMethod -Method Post "$BASE/bookings" -ContentType "application/json" -Headers $M -Body (@{
  resortId=$rid; roomIds=@($cam); checkIn=(Today 5); checkOut=(Today 6); adults=2
  guest=@{ fullName="No Email"; phone="01700-999888" }
} | ConvertTo-Json -Compress -Depth 5)
$null = Invoke-RestMethod -Method Post "$BASE/notifications/dispatch" -ContentType "application/json" -Headers $M -Body '{"sweeps":1}'
$feed2 = Invoke-RestMethod -Method Get "$BASE/notifications/recent?take=4" -Headers $M
$c2 = $feed2 | Where-Object { $_.template -eq "booking_confirmed" -and $_.to -like "*999888*" } | Select-Object -First 1
Write-Host ("5. fallback channel=" + $c2.channel + " to=" + $c2.to)

Write-Host ""
Write-Host "EMAIL E2E COMPLETE"
