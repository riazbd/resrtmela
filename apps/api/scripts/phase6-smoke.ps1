# ResortHub Phase 6 E2E - notifications+dedupe, payment receipts,
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

# 5) desk payment settles the booking -> payment_receipt notification queued
# (the online gateway checkout this used to exercise via a guest login is gone
# — Task 4 removed guest payments outright, not just the OTP door to them — so
# this now proves the same receipt notification off a payment the desk takes)
$pay = Invoke-RestMethod -Method Post "$BASE/bookings/$($bk.id)/payments" -ContentType "application/json" -Headers $M -Body '{"amount":3000,"method":"CASH","note":"phase6 smoke"}'
Write-Host ("5. desk payment: paid=" + $pay.booking.paid + " due=" + $pay.booking.due + " state=" + $pay.booking.paymentState)

# 6) receipt notification queued
$feed2 = Invoke-RestMethod -Method Get "$BASE/notifications/recent?take=5" -Headers $M
$rc = $feed2 | Where-Object { $_.template -eq "payment_receipt" } | Select-Object -First 1
Write-Host ("6. receipt notification: " + ($rc -ne $null) + " to=" + $rc.to)

# 7) agent commission report (Rikan has imported bookings on resort 2 + smoke booking here)
$ag = Invoke-RestMethod -Method Post "$BASE/auth/login" -ContentType "application/json" -Body '{"phone":"8801700000002","password":"Password123!"}'
$A = @{ Authorization = "Bearer $($ag.accessToken)" }
$rep = Invoke-RestMethod -Method Get "$BASE/agents/me/report`?resortId=2" -Headers $A
Write-Host ("7. Rikan report r2: bookings=" + $rep.bookings + " rent=" + $rep.rent + " commission=" + $rep.commission + " (rate " + $rep.commissionRate + "%)")

# 8) staff source report
$src = Invoke-RestMethod -Method Get "$BASE/resorts/$rid/reports/sources" -Headers $M
Write-Host ("8. sources r1: " + (($src.rows | ForEach-Object { "$($_.source)=$($_.bookings)" }) -join ", "))

Write-Host ""
Write-Host "PHASE6 SMOKE COMPLETE"
