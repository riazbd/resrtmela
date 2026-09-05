# ResortHub Phase 6 E2E - notifications+dedupe, online checkout lifecycle,
# commission reports, audit trail. PS 5.1 ASCII.
$ErrorActionPreference = "Stop"
$BASE = "http://localhost:4000"
function Today([int]$off) { (Get-Date).ToUniversalTime().Date.AddDays($off).ToString("yyyy-MM-dd") }

$mgr = Invoke-RestMethod -Method Post "$BASE/auth/login" -ContentType "application/json" -Body '{"phone":"8801700000001","password":"Password123!"}'
$M = @{ Authorization = "Bearer $($mgr.accessToken)" }
$rid = $mgr.user.resortIds[0]

# 1) staff creates booking -> CONFIRMED -> booking_confirmed notification queued
$rooms = Invoke-RestMethod -Method Get "$BASE/resorts/$rid/rooms" -Headers $M
$lun = ($rooms | Where-Object { $_.name -eq "Lunaria" }).id
$CI, $CO = (Today 2), (Today 4)
$bk = Invoke-RestMethod -Method Post "$BASE/bookings" -ContentType "application/json" -Headers $M -Body (@{ resortId=$rid; roomIds=@($lun); checkIn=$CI; checkOut=$CO; adults=2; guest=@{ fullName="Notify Probe"; phone="01899-112233" } } | ConvertTo-Json -Compress -Depth 5)
Write-Host ("1. booking " + $bk.code + " state=" + $bk.state)

# 2) dispatcher tick sends it (console provider) + sweep may add D-1 reminders
$disp = Invoke-RestMethod -Method Post "$BASE/notifications/dispatch" -ContentType "application/json" -Headers $M -Body '{"sweeps":2}'
Write-Host ("2. dispatch: sent=" + $disp.sent + " swept=" + $disp.swept + " failed=" + $disp.failed)

# 3) notification feed shows the sent confirmation
$feed = Invoke-RestMethod -Method Get "$BASE/notifications/recent?take=10" -Headers $M
$conf = $feed | Where-Object { $_.template -eq "booking_confirmed" } | Select-Object -First 1
Write-Host ("3. feed has booking_confirmed: sent=" + $conf.sent + " to=" + $conf.to)

# 4) dedupe: second dispatch sends nothing new for the same booking
$disp2 = Invoke-RestMethod -Method Post "$BASE/notifications/dispatch" -ContentType "application/json" -Headers $M -Body '{"sweeps":1}'
Write-Host ("4. re-dispatch sent=" + $disp2.sent + " (0 new confirms expected)")

# 5) guest checkout lifecycle (bKash mock)
$otp = Invoke-RestMethod -Method Post "$BASE/auth/otp/request" -ContentType "application/json" -Body '{"phone":"01812-345678"}'
$g = Invoke-RestMethod -Method Post "$BASE/auth/otp/verify" -ContentType "application/json" -Body (@{ phone="01812-345678"; code=$otp.devCode } | ConvertTo-Json -Compress)
$G = @{ Authorization = "Bearer $($g.accessToken)" }
$std = ((Invoke-RestMethod -Method Get "$BASE/guest/resorts/$rid" -Headers $G).roomTypes | Select-Object -First 1).id
$trip = Invoke-RestMethod -Method Post "$BASE/guest/bookings" -ContentType "application/json" -Headers $G -Body (@{ resortId=$rid; items=@(@{ roomTypeId=$std; qty=1 }); checkIn=(Today 5); checkOut=(Today 6); adults=2 } | ConvertTo-Json -Compress -Depth 5)
$co = Invoke-RestMethod -Method Post "$BASE/bookings/$($trip.id)/checkout" -ContentType "application/json" -Headers $G -Body '{"method":"BKASH","amount":3000}'
Write-Host ("5. checkout intent " + $co.providerRef + " -> " + $co.checkoutUrl)

# 6) overpay rejected
try { Invoke-RestMethod -Method Post "$BASE/bookings/$($trip.id)/checkout" -ContentType "application/json" -Headers $G -Body '{"method":"BKASH","amount":999999}' | Out-Null; Write-Host "6. FAIL" }
catch { Write-Host ("6. overpay blocked: " + (($_.ErrorDetails.Message | ConvertFrom-Json).message)) }

# 7) gateway confirms -> ledger payment + PAID/PARTIAL state
$pay = Invoke-RestMethod -Method Post "$BASE/mock-checkout/$($co.providerRef)/confirm" -ContentType "application/json" -Headers $G -Body '{"trxId":"bkash-demo-777"}'
Write-Host ("7. confirmed: status=" + $pay.status + " bookingState=" + $pay.booking.paymentState + " paid=" + $pay.booking.paid)

# 8) double-confirm rejected
try { Invoke-RestMethod -Method Post "$BASE/mock-checkout/$($co.providerRef)/confirm" -ContentType "application/json" -Headers $G -Body '{}' | Out-Null; Write-Host "8. FAIL: double confirm" }
catch { Write-Host ("8. replay blocked: " + (($_.ErrorDetails.Message | ConvertFrom-Json).message)) }

# 9) receipt notification queued
$feed2 = Invoke-RestMethod -Method Get "$BASE/notifications/recent?take=5" -Headers $M
$rc = $feed2 | Where-Object { $_.template -eq "payment_receipt" } | Select-Object -First 1
Write-Host ("9. receipt notification: " + ($rc -ne $null) + " to=" + $rc.to)

# 10) agent commission report (Rikan has imported bookings on resort 2 + smoke booking here)
$ag = Invoke-RestMethod -Method Post "$BASE/auth/login" -ContentType "application/json" -Body '{"phone":"8801700000002","password":"Password123!"}'
$A = @{ Authorization = "Bearer $($ag.accessToken)" }
$rep = Invoke-RestMethod -Method Get "$BASE/agents/me/report`?resortId=2" -Headers $A
Write-Host ("10. Rikan report r2: bookings=" + $rep.bookings + " rent=" + $rep.rent + " commission=" + $rep.commission + " (rate " + $rep.commissionRate + "%)")

# 11) staff source report
$src = Invoke-RestMethod -Method Get "$BASE/resorts/$rid/reports/sources" -Headers $M
Write-Host ("11. sources r1: " + (($src.rows | ForEach-Object { "$($_.source)=$($_.bookings)" }) -join ", "))

# 12) guest blocked from reports
try { Invoke-RestMethod -Method Get "$BASE/resorts/$rid/reports/agents" -Headers $G | Out-Null; Write-Host "12. FAIL" }
catch { Write-Host ("12. guest reports blocked: HTTP " + $_.Exception.Response.StatusCode.value__) }

Write-Host ""
Write-Host "PHASE6 SMOKE COMPLETE"
