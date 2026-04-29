-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "first_name" VARCHAR(255) NOT NULL,
    "last_name" VARCHAR(255),
    "email" VARCHAR(255),
    "whatsapp_phone" VARCHAR(50) NOT NULL,
    "password_hash" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "service" VARCHAR(50) NOT NULL,
    "account_email" VARCHAR(255) NOT NULL,
    "encrypted_access_token" TEXT NOT NULL,
    "encrypted_refresh_token" TEXT,
    "granted_scopes" TEXT,
    "category" VARCHAR(50) DEFAULT 'Personal',
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_auth_identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "provider_uid" VARCHAR(255) NOT NULL,
    "identity_data" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_auth_identities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_whatsapp_phone_key" ON "users"("whatsapp_phone");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_whatsapp_phone_idx" ON "users"("whatsapp_phone");

-- CreateIndex
CREATE UNIQUE INDEX "service_tokens_user_id_service_account_email_key" ON "service_tokens"("user_id", "service", "account_email");

-- CreateIndex
CREATE INDEX "user_auth_identities_provider_provider_uid_idx" ON "user_auth_identities"("provider", "provider_uid");

-- CreateIndex
CREATE UNIQUE INDEX "user_auth_identities_provider_provider_uid_key" ON "user_auth_identities"("provider", "provider_uid");

-- AddForeignKey
ALTER TABLE "service_tokens" ADD CONSTRAINT "service_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_auth_identities" ADD CONSTRAINT "user_auth_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
