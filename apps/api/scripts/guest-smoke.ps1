# ResortHub Phase 4 E2E - guest app flow: OTP login, discover, availability,
# book (PENDING/APP), trips incl. imported history, cancel, conflicts. PS 5.1 ASCII.
$ErrorActionPreference = "Stop"
$BASE = "http://localhost:4000"
function Today([int]$off) { (Get-Date).ToUniversalTime().Date.AddDays($off).ToString("yyyy-MM-dd") }
$CI, $CO = (Today 1), (Today 3)   # tomorrow -> +3

# 1) OTP login (fresh guest)
$otp = Invoke-RestMethod -Method Post "$BASE/auth/otp/request" -ContentType "application/json" -Body '{"phone":"01812-345678"}'
$g = Invoke-RestMethod -Method Post "$BASE/auth/otp/verify" -ContentType "application/json" -Body (@{ phone="01812-345678"; code=$otp.devCode } | ConvertTo-Json -Compress)
$G = @{ Authorization = "Bearer $($g.accessToken)" }
Write-Host ("1. guest OTP login - role: " + $g.user.role)

# 2) discover
$resorts = Invoke-RestMethod -Method Get "$BASE/guest/resorts" -Headers $G
Write-Host ("2. discover: " + @($resorts).Count + " resorts -> " + (($resorts | ForEach-Object { $_.name }) -join " | "))

# 3) resort detail
$rid = $resorts[0].id
$detail = Invoke-RestMethod -Method Get "$BASE/guest/resorts/$rid" -Headers $G
$std = $detail.roomTypes | Select-Object -First 1
Write-Host ("3. detail: " + $detail.name + " - " + @($detail.roomTypes).Count + " types, " + @($detail.activities).Count + " activities; type '" + $std.name + "' from " + $std.priceFrom)

# 4) availability by type
$av = Invoke-RestMethod -Method Get "$BASE/guest/resorts/$rid/availability`?from=$CI&to=$CO" -Headers $G
Write-Host ("4. availability $CI..$CO : " + (($av | ForEach-Object { "$($_.name)=$($_.available)/$($_.total)@" + $_.pricePerNight }) -join " | "))

# 5) book 1 room of the standard type
$body = @{ resortId = $rid; items = @(@{ roomTypeId = $std.id; qty = 1 }); checkIn = $CI; checkOut = $CO; adults = 2; fullName = "Otp Guest" } | ConvertTo-Json -Compress -Depth 5
$trip = Invoke-RestMethod -Method Post "$BASE/guest/bookings" -ContentType "application/json" -Headers $G -Body $body
Write-Host ("5. booked " + $trip.code + " state=" + $trip.state + " paymentState=" + $trip.paymentState + " rent=" + $trip.rent + " due=" + $trip.due + " payIn=" + ($trip.payments | Measure-Object).Count)

# 6) trips list shows it (+ zero for fresh guest)
$trips = Invoke-RestMethod -Method Get "$BASE/guest/bookings" -Headers $G
Write-Host ("6. trips: " + @($trips).Count + " (first: " + $trips[0].code + ")")

# 7) guest cannot cancel after staff confirms
$mgr = Invoke-RestMethod -Method Post "$BASE/auth/login" -ContentType "application/json" -Body '{"phone":"8801700000001","password":"Password123!"}'
$M = @{ Authorization = "Bearer $($mgr.accessToken)" }
$conf = Invoke-RestMethod -Method Post "$BASE/bookings/$($trip.id)/transition" -ContentType "application/json" -Headers $M -Body '{"to":"CONFIRMED"}'
Write-Host ("7a. staff confirmed -> " + $conf.state)
try {
  Invoke-RestMethod -Method Post "$BASE/guest/bookings/$($trip.id)/cancel" -Headers $G | Out-Null
  Write-Host "7b. FAIL: guest cancelled a confirmed booking"
} catch {
  Write-Host ("7b. guest cancel blocked: " + (($_.ErrorDetails.Message | ConvertFrom-Json).message))
}

# 8) sold-out type guard: Family type (Kath Golap = 1 room). Book it as 2nd guest, then try again
$fam = $av | Where-Object { $_.name -like "*Family*" }
if ($fam) {
  $otp2 = Invoke-RestMethod -Method Post "$BASE/auth/otp/request" -ContentType "application/json" -Body '{"phone":"01912345678"}'
  $g2 = Invoke-RestMethod -Method Post "$BASE/auth/otp/verify" -ContentType "application/json" -Body (@{ phone="01912345678"; code=$otp2.devCode } | ConvertTo-Json -Compress)
  $G2 = @{ Authorization = "Bearer $($g2.accessToken)" }
  $b1 = @{ resortId = $rid; items = @(@{ roomTypeId = $fam.roomTypeId; qty = 1 }); checkIn = $CI; checkOut = $CO; adults = 2 } | ConvertTo-Json -Compress -Depth 5
  $t1 = Invoke-RestMethod -Method Post "$BASE/guest/bookings" -ContentType "application/json" -Headers $G2 -Body $b1
  Write-Host ("8a. second guest booked family room " + $t1.code)
  try {
    Invoke-RestMethod -Method Post "$BASE/guest/bookings" -ContentType "application/json" -Headers $G -Body $b1 | Out-Null
    Write-Host "8b. FAIL: booked a sold-out room"
  } catch {
    Write-Host ("8b. sold-out guard: " + (($_.ErrorDetails.Message | ConvertFrom-Json).message))
  }
}

# 9) guest cancels own PENDING booking (frees the room) then it becomes bookable again
$pending = Invoke-RestMethod -Method Get "$BASE/guest/bookings" -Headers $G2
$pend = $pending | Where-Object { $_.state -eq "PENDING" } | Select-Object -First 1
Invoke-RestMethod -Method Post "$BASE/guest/bookings/$($pend.id)/cancel" -Headers $G2 | Out-Null
Write-Host ("9. guest cancelled own PENDING " + $pend.code + " - nights freed")

# 10) imported history continuity: Asma Liza (phone from sheet) logs in via OTP
$otpA = Invoke-RestMethod -Method Post "$BASE/auth/otp/request" -ContentType "application/json" -Body '{"phone":"01748-839304"}'
$ga = Invoke-RestMethod -Method Post "$BASE/auth/otp/verify" -ContentType "application/json" -Body (@{ phone="01748-839304"; code=$otpA.devCode } | ConvertTo-Json -Compress)
$GA = @{ Authorization = "Bearer $($ga.accessToken)" }
$hist = Invoke-RestMethod -Method Get "$BASE/guest/bookings" -Headers $GA
Write-Host ("10. imported guest (Asma Liza) sees " + @($hist).Count + " past booking(s) incl. sheet history")

# 11) staff/agent endpoints reject guest tokens
try { Invoke-RestMethod -Method Get "$BASE/resorts/$rid/today" -Headers $G | Out-Null; Write-Host "11. FAIL: guest hit staff endpoint" }
catch { Write-Host ("11. staff endpoint blocked for guest: HTTP " + $_.Exception.Response.StatusCode.value__) }

Write-Host ""
Write-Host "GUEST SMOKE COMPLETE"
