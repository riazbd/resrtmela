# ResortHub Phase 5 E2E - activities: schedules, recurrence, atomic capacity,
# staff + guest attach, release on cancel. PS 5.1 ASCII.
$ErrorActionPreference = "Stop"
$BASE = "http://localhost:4000"
function Today([int]$off) { (Get-Date).ToUniversalTime().Date.AddDays($off).ToString("yyyy-MM-dd") }

$mgr = Invoke-RestMethod -Method Post "$BASE/auth/login" -ContentType "application/json" -Body '{"phone":"8801700000001","password":"Password123!"}'
$M = @{ Authorization = "Bearer $($mgr.accessToken)" }
$rid = $mgr.user.resortIds[0]

# 1) create activity + weekly schedule (Fri + Sat)
$act = Invoke-RestMethod -Method Post "$BASE/resorts/$rid/activities" -ContentType "application/json" -Headers $M -Body '{"name":"Sunset River Cruise","category":"TOUR","basePrice":1200,"durationMin":90,"maxPerSlot":12}'
Invoke-RestMethod -Method Put "$BASE/activities/$($act.id)/schedules" -ContentType "application/json" -Headers $M -Body '{"rows":[{"weekday":5,"startTime":"16:00","endTime":"17:30","capacity":5},{"weekday":6,"startTime":"09:00","endTime":"10:30","capacity":8}]}' | Out-Null
Write-Host "1. activity created #$($act.id) + Fri/Sat schedule (caps 5/8)"

# 2) generate 14 days of slots
$gen = Invoke-RestMethod -Method Post "$BASE/activities/$($act.id)/generate" -ContentType "application/json" -Headers $M -Body (@{ from = (Today 0); to = (Today 14) } | ConvertTo-Json -Compress)
Write-Host ("2. generated " + $gen.created + " slots (matched " + $gen.matched + ", total " + $gen.totalSlots + ") - expect 4")

# 3) idempotent re-run creates 0 new
$gen2 = Invoke-RestMethod -Method Post "$BASE/activities/$($act.id)/generate" -ContentType "application/json" -Headers $M -Body (@{ from = (Today 0); to = (Today 14) } | ConvertTo-Json -Compress)
Write-Host ("3. re-run created " + $gen2.created + " (expect 0 - skipDuplicates)")

# 4) guest books a room trip
$otp = Invoke-RestMethod -Method Post "$BASE/auth/otp/request" -ContentType "application/json" -Body '{"phone":"01812-345678"}'
$g = Invoke-RestMethod -Method Post "$BASE/auth/otp/verify" -ContentType "application/json" -Body (@{ phone="01812-345678"; code=$otp.devCode } | ConvertTo-Json -Compress)
$G = @{ Authorization = "Bearer $($g.accessToken)" }
$detail = Invoke-RestMethod -Method Get "$BASE/guest/resorts/$rid" -Headers $G
$std = ($detail.roomTypes | Select-Object -First 1).id
$CI, $CO = (Today 1), (Today 3)
$av = Invoke-RestMethod -Method Get "$BASE/guest/resorts/$rid/availability`?from=$CI&to=$CO" -Headers $G
$pick = $av | Where-Object { $_.roomTypeId -eq $std } | Select-Object -First 1
$trip = Invoke-RestMethod -Method Post "$BASE/guest/bookings" -ContentType "application/json" -Headers $G -Body (@{ resortId=$rid; items=@(@{ roomTypeId=$std; qty=1 }); checkIn=$CI; checkOut=$CO; adults=2; fullName="Cruise Guest" } | ConvertTo-Json -Compress -Depth 5)
Write-Host ("4. guest trip " + $trip.code + " rent=" + $trip.rent + " due=" + $trip.due)

# 5) slots for guest app
$slots = Invoke-RestMethod -Method Get "$BASE/guest/activities/$($act.id)/slots`?days=14" -Headers $G
$slot = $slots[0]
Write-Host ("5. upcoming slots: " + @($slots).Count + " - first remaining=" + $slot.remaining)

# 6) staff attaches 3 seats -> remaining 5->2, due grows by 3600
Invoke-RestMethod -Method Post "$BASE/bookings/$($trip.id)/activities" -ContentType "application/json" -Headers $M -Body (@{ slotId = $slot.id; qty = 3 } | ConvertTo-Json -Compress) | Out-Null
$slotAfter = (Invoke-RestMethod -Method Get "$BASE/resorts/$rid/activities/$($act.id)/slots`?from=$(Today 0)&to=$(Today 14)&futureOnly=true" -Headers $M) | Where-Object { $_.id -eq $slot.id }
$d = Invoke-RestMethod -Method Get "$BASE/guest/bookings/$($trip.id)" -Headers $G
Write-Host ("6. staff +3 seats -> remaining=" + $slotAfter.remaining + " (expect 2) | trip due=" + $d.due + " (expect " + ($trip.rent + 3600) + ")")

# 7) guest adds 2 seats -> sold out
Invoke-RestMethod -Method Post "$BASE/guest/bookings/$($trip.id)/activities" -ContentType "application/json" -Headers $G -Body (@{ slotId = $slot.id; qty = 2 } | ConvertTo-Json -Compress) | Out-Null
$full = (Invoke-RestMethod -Method Get "$BASE/resorts/$rid/activities/$($act.id)/slots`?from=$(Today 0)&to=$(Today 14)&futureOnly=true" -Headers $M) | Where-Object { $_.id -eq $slot.id }
Write-Host ("7. guest +2 -> remaining=" + $full.remaining + " (expect 0)")

# 8) overbook rejected atomically
$otp2 = Invoke-RestMethod -Method Post "$BASE/auth/otp/request" -ContentType "application/json" -Body '{"phone":"01912345678"}'
$g2 = Invoke-RestMethod -Method Post "$BASE/auth/otp/verify" -ContentType "application/json" -Body (@{ phone="01912345678"; code=$otp2.devCode } | ConvertTo-Json -Compress)
$G2 = @{ Authorization = "Bearer $($g2.accessToken)" }
$t2 = Invoke-RestMethod -Method Post "$BASE/guest/bookings" -ContentType "application/json" -Headers $G2 -Body (@{ resortId=$rid; items=@(@{ roomTypeId=$std; qty=1 }); checkIn=$CI; checkOut=$CO; adults=2 } | ConvertTo-Json -Compress -Depth 5)
try {
  Invoke-RestMethod -Method Post "$BASE/guest/bookings/$($t2.id)/activities" -ContentType "application/json" -Headers $G2 -Body (@{ slotId = $slot.id; qty = 1 } | ConvertTo-Json -Compress) | Out-Null
  Write-Host "8. FAIL: overbooked a full slot"
} catch {
  Write-Host ("8. sold-out slot rejected: " + (($_.ErrorDetails.Message | ConvertFrom-Json).message))
}

# 9) guest removes their 2 seats -> back to 2 remaining
$det = Invoke-RestMethod -Method Get "$BASE/guest/bookings/$($trip.id)" -Headers $G
$actItem = $det.activities | Where-Object { $_.name -eq "Sunset River Cruise" } | Select-Object -Last 1
Invoke-RestMethod -Method Delete "$BASE/guest/bookings/$($trip.id)/activities/$($actItem.itemId)" -Headers $G | Out-Null
$after = (Invoke-RestMethod -Method Get "$BASE/resorts/$rid/activities/$($act.id)/slots`?from=$(Today 0)&to=$(Today 14)&futureOnly=true" -Headers $M) | Where-Object { $_.id -eq $slot.id }
Write-Host ("9. guest removed seats -> remaining=" + $after.remaining + " (expect 2)")

# 10) cancelling the room booking releases staff's 3 seats -> 5
Invoke-RestMethod -Method Post "$BASE/bookings/$($trip.id)/transition" -ContentType "application/json" -Headers $M -Body '{"to":"CANCELLED"}' | Out-Null
$released = (Invoke-RestMethod -Method Get "$BASE/resorts/$rid/activities/$($act.id)/slots`?from=$(Today 0)&to=$(Today 14)&futureOnly=true" -Headers $M) | Where-Object { $_.id -eq $slot.id }
Write-Host ("10. booking cancelled -> remaining=" + $released.remaining + " (expect 5 - staff seats released)")

# 11) guest cannot touch staff-only manager endpoints
try { Invoke-RestMethod -Method Post "$BASE/activities/$($act.id)/generate" -ContentType "application/json" -Headers $G -Body '{"from":"2026-09-01","to":"2026-09-30"}' | Out-Null; Write-Host "11. FAIL" }
catch { Write-Host ("11. guest blocked from generate: HTTP " + $_.Exception.Response.StatusCode.value__) }

Write-Host ""
Write-Host "ACTIVITY SMOKE COMPLETE"
