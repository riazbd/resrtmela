-- The login codes a guest account was minted from. Nothing issues or reads
-- one any more (auth.service.ts lost requestOtp and verifyOtp), and the
-- accounts they minted are gone (20260911110000_no_guest_accounts).
--
-- Only the drop lives here, so baseline-db.mjs can mark this applied without
-- running it on a database that never had the table.
DROP TABLE IF EXISTS `otp_codes`;
