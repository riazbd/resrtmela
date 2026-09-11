# ResortHub Phase 5 E2E - activities: schedules, recurrence, atomic capacity,
# staff attach, release on cancel. PS 5.1 ASCII.
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

# 4) desk booking (manager) - takes a free room for the guest, no self-service
# (skips OUT_OF_SERVICE rooms too, same rule as agency-guests.service.ts:192 -
# a room off the market for repairs is not a free room just because nobody has booked it)
$CI, $CO = (Today 1), (Today 3)
$av = Invoke-RestMethod -Method Get "$BASE/resorts/$rid/availability`?from=$CI&to=$CO" -Headers $M
$free = ($av | Where-Object { $_.busyNights.Count -eq 0 -and $_.status -ne "OUT_OF_SERVICE" })[0]
$body = @{ resortId = $rid; roomIds = @($free.roomId); checkIn = $CI; checkOut = $CO; adults = 2;
           guest = @{ fullName = "Cruise Booking" } } | ConvertTo-Json
$trip = Invoke-RestMethod -Method Post "$BASE/bookings" -ContentType "application/json" -Headers $M -Body $body
Write-Host ("4. desk booking " + $trip.code + " rent=" + $trip.rent + " due=" + $trip.due)

# 5) staff attaches 3 seats -> remaining 5->2, due grows by 3600
$slots = Invoke-RestMethod -Method Get "$BASE/resorts/$rid/activities/$($act.id)/slots`?from=$(Today 0)&to=$(Today 14)&futureOnly=true" -Headers $M
$slot = $slots[0]
Invoke-RestMethod -Method Post "$BASE/bookings/$($trip.id)/activities" -ContentType "application/json" -Headers $M -Body (@{ slotId = $slot.id; qty = 3 } | ConvertTo-Json -Compress) | Out-Null
$slotAfter = (Invoke-RestMethod -Method Get "$BASE/resorts/$rid/activities/$($act.id)/slots`?from=$(Today 0)&to=$(Today 14)&futureOnly=true" -Headers $M) | Where-Object { $_.id -eq $slot.id }
$d = Invoke-RestMethod -Method Get "$BASE/bookings/$($trip.id)" -Headers $M
Write-Host ("5. staff +3 seats -> remaining=" + $slotAfter.remaining + " (expect 2) | trip due=" + $d.due + " (expect " + ($trip.rent + 3600) + ")")

# 6-7) a slot sells out and the next booking is refused - atomic capacity guard.
# No integration spec covers this end-to-end: activities-schedule.spec.ts only
# unit-tests remainingSeats() arithmetic, and tenant-isolation.spec.ts only
# proves a slot from another tenant is refused, not that a sold-out slot from
# your own tenant is. This script is the only thing that exercises the actual
# race-safe UPDATE in takeSeats() against a slot that is genuinely full.

# 6) a second desk booking takes the slot's last 2 seats -> sold out
$av2 = Invoke-RestMethod -Method Get "$BASE/resorts/$rid/availability`?from=$CI&to=$CO" -Headers $M
$free2 = ($av2 | Where-Object { $_.busyNights.Count -eq 0 -and $_.status -ne "OUT_OF_SERVICE" })[0]
$body2 = @{ resortId = $rid; roomIds = @($free2.roomId); checkIn = $CI; checkOut = $CO; adults = 2;
            guest = @{ fullName = "Second Cruise Booking" } } | ConvertTo-Json
$trip2 = Invoke-RestMethod -Method Post "$BASE/bookings" -ContentType "application/json" -Headers $M -Body $body2
Invoke-RestMethod -Method Post "$BASE/bookings/$($trip2.id)/activities" -ContentType "application/json" -Headers $M -Body (@{ slotId = $slot.id; qty = 2 } | ConvertTo-Json -Compress) | Out-Null
$soldOut = (Invoke-RestMethod -Method Get "$BASE/resorts/$rid/activities/$($act.id)/slots`?from=$(Today 0)&to=$(Today 14)&futureOnly=true" -Headers $M) | Where-Object { $_.id -eq $slot.id }
Write-Host ("6. second booking " + $trip2.code + " +2 seats -> remaining=" + $soldOut.remaining + " (expect 0 - sold out)")

# 7) a third attach on the same sold-out slot is refused
try {
  Invoke-RestMethod -Method Post "$BASE/bookings/$($trip2.id)/activities" -ContentType "application/json" -Headers $M -Body (@{ slotId = $slot.id; qty = 1 } | ConvertTo-Json -Compress) | Out-Null
  Write-Host "7. FAIL: overbooked a full slot"
} catch {
  $msg = ($_.ErrorDetails.Message | ConvertFrom-Json).message
  $stillSoldOut = (Invoke-RestMethod -Method Get "$BASE/resorts/$rid/activities/$($act.id)/slots`?from=$(Today 0)&to=$(Today 14)&futureOnly=true" -Headers $M) | Where-Object { $_.id -eq $slot.id }
  Write-Host ("7. sold-out slot rejected (" + $_.Exception.Response.StatusCode.value__ + "): " + $msg + " | remaining=" + $stillSoldOut.remaining + " (expect 0)")
}

# 8) cancelling the first room booking releases only its 3 seats -> 3
# (trip2's 2 seats are still attached, so this does not empty the slot - it
# was full at 5/5 after step 6, and cancelling trip's 3 brings it to 2/5 booked)
Invoke-RestMethod -Method Post "$BASE/bookings/$($trip.id)/transition" -ContentType "application/json" -Headers $M -Body '{"to":"CANCELLED"}' | Out-Null
$released = (Invoke-RestMethod -Method Get "$BASE/resorts/$rid/activities/$($act.id)/slots`?from=$(Today 0)&to=$(Today 14)&futureOnly=true" -Headers $M) | Where-Object { $_.id -eq $slot.id }
Write-Host ("8. booking cancelled -> remaining=" + $released.remaining + " (expect 3 - trip's seats released, trip2's 2 still held)")

Write-Host ""
Write-Host "ACTIVITY SMOKE COMPLETE"
