/*
  Warnings:

  - You are about to drop the column `due_time` on the `tasks` table. All the data in the column will be lost.
  - You are about to drop the column `recurrence` on the `tasks` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "tasks" DROP COLUMN "due_time",
DROP COLUMN "recurrence",
ADD COLUMN     "priority" VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "recurrence_interval" VARCHAR(20),
ADD COLUMN     "reminder_time" TIMESTAMPTZ;
