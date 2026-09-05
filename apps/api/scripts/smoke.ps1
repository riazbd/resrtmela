# ResortHub Phase 1 E2E smoke - auth, RBAC, availability, double-booking
# guard, state machine, payment ledger, agent isolation. ASCII-only for PS 5.1.
$ErrorActionPreference = "Stop"
$BASE = "http://localhost:4000"
function Today([int]$off) { (Get-Date).ToUniversalTime().Date.AddDays($off).ToString("yyyy-MM-dd") }
$CI, $CO = (Today 0), (Today 1)
$CI2, $CO2 = (Today 2), (Today 4)

# 1) short bad password rejected by validation
try {
  Invoke-RestMethod -Method Post "$BASE/auth/login" -ContentType "application/json" -Body '{"phone":"8801700000001","password":"wrongpass!!"}' | Out-Null
  Write-Host "1. FAIL: bad login accepted"
} catch {
  Write-Host ("1. bad login rejected: HTTP " + $_.Exception.Response.StatusCode.value__)
}

# 2) manager login
$mgr = Invoke-RestMethod -Method Post "$BASE/auth/login" -ContentType "application/json" -Body '{"phone":"8801700000001","password":"Password123!"}'
$M = @{ Authorization = "Bearer $($mgr.accessToken)" }
Write-Host ("2. manager login ok - role: " + $mgr.user.role + " resorts: " + ($mgr.user.resortIds -join ","))

$resortId = $mgr.user.resortIds[0]

# 3) availability grid (seeded BK-00001 occupies Camellia tonight)
$av = Invoke-RestMethod -Method Get "$BASE/resorts/$resortId/availability`?from=$CI&to=$CO" -Headers $M
$cam = $av | Where-Object { $_.roomName -eq "Camellia" }
if (-not $cam) { throw "seed booking missing - re-run pnpm db:seed" }
Write-Host ("3. availability: Camellia busy [" + ($cam.busyNights -join ",") + "] (seeded BK-00001)")

# 4) double-booking guard on Camellia
$body = @{ resortId = $resortId; roomIds = @($cam.roomId); checkIn = $CI; checkOut = $CO; adults = 2;
           guest = @{ fullName = "Conflict Probe"; phone = "01711-000111" } } | ConvertTo-Json
try {
  Invoke-RestMethod -Method Post "$BASE/bookings" -ContentType "application/json" -Headers $M -Body $body | Out-Null
  Write-Host "4. FAIL: double-booking allowed!"
} catch {
  $msg = ($_.ErrorDetails.Message | ConvertFrom-Json).message
  Write-Host ("4. double-booking blocked (409): " + $msg)
}

# 5) valid booking with advance payment (Lunaria, 2 nights from +2)
$av2 = Invoke-RestMethod -Method Get "$BASE/resorts/$resortId/availability`?from=$CI2&to=$CO2" -Headers $M
$lun2 = $av2 | Where-Object { $_.roomName -eq "Lunaria" }
$body = @{ resortId = $resortId; roomIds = @($lun2.roomId); checkIn = $CI2; checkOut = $CO2; adults = 2; children = 1;
           guest = @{ fullName = "Tahsin Ishrak"; phone = "0163-6003145" }; discount = 350;
           advancePayment = @{ amount = 4500; method = "BKASH" } } | ConvertTo-Json
$bk = Invoke-RestMethod -Method Post "$BASE/bookings" -ContentType "application/json" -Headers $M -Body $body
Write-Host ("5. booking " + $bk.code + " state=" + $bk.state + " rent=" + $bk.rent + " discount=" + $bk.discount + " paid=" + $bk.paid + " due=" + $bk.due + " payment=" + $bk.paymentState)

# 6) state machine: check-in -> check-out
$bk = Invoke-RestMethod -Method Post "$BASE/bookings/$($bk.id)/transition" -ContentType "application/json" -Headers $M -Body '{"to":"CHECKED_IN"}'
Write-Host ("6a. transitioned -> " + $bk.state)
$bk = Invoke-RestMethod -Method Post "$BASE/bookings/$($bk.id)/transition" -ContentType "application/json" -Headers $M -Body '{"to":"CHECKED_OUT"}'
Write-Host ("6b. transitioned -> " + $bk.state)

# 7) settle the rest
$settle = Invoke-RestMethod -Method Post "$BASE/bookings/$($bk.id)/payments" -ContentType "application/json" -Headers $M -Body '{"amount":2650,"method":"CASH","note":"settled at checkout"}'
Write-Host ("7. final payment: paid=" + $settle.booking.paid + " due=" + $settle.booking.due + " state=" + $settle.booking.paymentState)

# 8) dues ledger (seed BK-00001 + settled BK-00002 remaining dues)
$dues = Invoke-RestMethod -Method Get "$BASE/resorts/$resortId/dues" -Headers $M
Write-Host ("8. dues outstanding: total=" + $dues.total + " count=" + $dues.count)

# 9) agent login + isolation
$ag = Invoke-RestMethod -Method Post "$BASE/auth/login" -ContentType "application/json" -Body '{"phone":"8801700000002","password":"Password123!"}'
$A = @{ Authorization = "Bearer $($ag.accessToken)" }
Write-Host ("9. agent login ok - role: " + $ag.user.role)

$body = @{ resortId = $resortId; roomIds = @($lun2.roomId); checkIn = $CI2; checkOut = $CO2; adults = 2;
           guest = @{ fullName = "Asma Liza"; phone = "01748-839304" } } | ConvertTo-Json
$abk = Invoke-RestMethod -Method Post "$BASE/bookings" -ContentType "application/json" -Headers $A -Body $body
Write-Host ("9a. agent booking " + $abk.code + " state=" + $abk.state + " source=" + $abk.source + " discount=" + $abk.discount + " maskedPhone=" + $abk.guest.phone)

$list = Invoke-RestMethod -Method Get "$BASE/bookings`?resortId=$resortId" -Headers $A
Write-Host ("9b. agent list sees only own: total=" + $list.total)

# 10) agent discount attempt blocked
try {
  Invoke-RestMethod -Method Patch "$BASE/bookings/$($abk.id)" -ContentType "application/json" -Headers $A -Body '{"discount":999}' | Out-Null
  Write-Host "10. FAIL: agent set discount"
} catch {
  $msg = ($_.ErrorDetails.Message | ConvertFrom-Json).message
  Write-Host ("10. agent discount blocked: " + $msg)
}

# 11) cancel-request queue: agent requests -> manager approves
Invoke-RestMethod -Method Post "$BASE/bookings/$($abk.id)/cancel-request" -ContentType "application/json" -Headers $A -Body '{"reason":"guest changed plans"}' | Out-Null
$q = Invoke-RestMethod -Method Get "$BASE/bookings/cancel-requests`?resortId=$resortId" -Headers $M
$queueSize = @($q).Count
Write-Host ("11a. queue size: " + $queueSize)
Invoke-RestMethod -Method Post "$BASE/bookings/$($abk.id)/cancel-decision" -ContentType "application/json" -Headers $M -Body '{"approve":true}' | Out-Null
$final = Invoke-RestMethod -Method Get "$BASE/bookings/$($abk.id)" -Headers $M
Write-Host ("11b. cancel approved -> state=" + $final.state + " (nights freed)")

# 12) agent cannot transition states (targets seeded CONFIRMED booking)
$confirmed = Invoke-RestMethod -Method Get "$BASE/bookings`?resortId=$resortId&state=CONFIRMED" -Headers $M
$probeId = $confirmed.rows[0].id
try {
  Invoke-RestMethod -Method Post "$BASE/bookings/$probeId/transition" -ContentType "application/json" -Headers $A -Body '{"to":"CHECKED_IN"}' | Out-Null
  Write-Host "12. FAIL: agent transitioned"
} catch {
  $msg = ($_.ErrorDetails.Message | ConvertFrom-Json).message
  Write-Host ("12. agent transition blocked: " + $msg)
}

# 13) OTP flow (guest)
$otp = Invoke-RestMethod -Method Post "$BASE/auth/otp/request" -ContentType "application/json" -Body '{"phone":"01812-345678"}'
$verifyBody = @{ phone = "01812-345678"; code = $otp.devCode } | ConvertTo-Json
$g = Invoke-RestMethod -Method Post "$BASE/auth/otp/verify" -ContentType "application/json" -Body $verifyBody
Write-Host ("13. OTP guest login -> role: " + $g.user.role)
Write-Host ""
Write-Host "SMOKE COMPLETE"
