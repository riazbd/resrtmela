# Retired — the guest app

This was the guest-facing Expo app. On 2026-09-11 the platform became
business-to-business: it sells to resorts and to travel agencies, and a guest
is a record in a resort's register, not an account holder. See
`docs/superpowers/specs/2026-09-11-two-sided-platform-design.md`.

The code is kept because deleting it buys nothing and git remembers either way.
It is out of the build pipeline and nothing here is maintained. Do not import
from it, and do not treat anything in it as a description of the current API —
the endpoints it calls were removed in the same phase that retired it.
