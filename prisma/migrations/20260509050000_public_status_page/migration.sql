-- Slice 11: public status page. AppRegistry gains two opt-in columns
-- so an admin can choose which apps appear on the public status page
-- and (optionally) override the display name shown to the public.
--
-- Defaults: publicStatusVisible=false → nothing leaks until an admin
-- explicitly opts an app in. publicStatusName is null → fall back to
-- AppRegistry.name when rendering.

ALTER TABLE "AppRegistry" ADD COLUMN IF NOT EXISTS "publicStatusVisible" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AppRegistry" ADD COLUMN IF NOT EXISTS "publicStatusName" TEXT;

CREATE INDEX IF NOT EXISTS "AppRegistry_publicStatusVisible_idx" ON "AppRegistry"("publicStatusVisible");
