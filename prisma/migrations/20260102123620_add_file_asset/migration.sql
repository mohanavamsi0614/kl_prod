-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "google_calendar_event_id" VARCHAR(255),
ADD COLUMN     "is_recurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recurrence_count" INTEGER,
ADD COLUMN     "recurrence_end" TIMESTAMPTZ,
ADD COLUMN     "recurring_parent_id" UUID,
ADD COLUMN     "rrule" VARCHAR(500);

-- CreateTable
CREATE TABLE "file_assets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "file_name" VARCHAR(500) NOT NULL,
    "s3_key" VARCHAR(1000) NOT NULL,
    "url" VARCHAR(2000) NOT NULL,
    "folder" VARCHAR(500),
    "mime_type" VARCHAR(100),
    "size" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "file_assets_user_id_idx" ON "file_assets"("user_id");

-- CreateIndex
CREATE INDEX "file_assets_folder_idx" ON "file_assets"("folder");

-- CreateIndex
CREATE INDEX "file_assets_s3_key_idx" ON "file_assets"("s3_key");

-- CreateIndex
CREATE INDEX "tasks_google_calendar_event_id_idx" ON "tasks"("google_calendar_event_id");

-- CreateIndex
CREATE INDEX "tasks_recurring_parent_id_idx" ON "tasks"("recurring_parent_id");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_recurring_parent_id_fkey" FOREIGN KEY ("recurring_parent_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
