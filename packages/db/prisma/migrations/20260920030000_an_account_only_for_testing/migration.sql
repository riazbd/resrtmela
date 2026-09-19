-- An account the platform opened to try things with, rather than a customer.
--
-- Additive and nothing else: one column with a default, so every existing
-- tenant is a real one and no row is rewritten. Written by hand because
-- `prisma migrate dev` cannot replay this project's history in a shadow
-- database (see the memory note); `migrate deploy` needs no shadow and
-- applies it cleanly.
ALTER TABLE `tenants` ADD COLUMN `demo` BOOLEAN NOT NULL DEFAULT false;
