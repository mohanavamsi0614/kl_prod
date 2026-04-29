-- CreateTable
CREATE TABLE "file_shares" (
    "id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "shared_with_id" UUID NOT NULL,
    "shared_by_id" UUID NOT NULL,
    "permission" "FolderPermission" NOT NULL DEFAULT 'VIEW',
    "can_reshare" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "file_shares_file_id_idx" ON "file_shares"("file_id");

-- CreateIndex
CREATE INDEX "file_shares_shared_with_id_idx" ON "file_shares"("shared_with_id");

-- CreateIndex
CREATE UNIQUE INDEX "file_shares_file_id_shared_with_id_key" ON "file_shares"("file_id", "shared_with_id");

-- AddForeignKey
ALTER TABLE "file_shares" ADD CONSTRAINT "file_shares_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_shares" ADD CONSTRAINT "file_shares_shared_with_id_fkey" FOREIGN KEY ("shared_with_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_shares" ADD CONSTRAINT "file_shares_shared_by_id_fkey" FOREIGN KEY ("shared_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
