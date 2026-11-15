-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'RUNNING', 'ENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BuildStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'COMPLETE', 'REJECTED');

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "GuildConfig" (
    "id" BIGINT NOT NULL,
    "name" TEXT,
    "locale" TEXT,
    "submissionChannelId" BIGINT,
    "judgeChannelId" BIGINT,
    "leaderboardChannelId" BIGINT,
    "leaderboardMessageId" BIGINT,
    "announcementChannelId" BIGINT,
    "judgeRoleId" BIGINT,
    "messageSubmissions" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GuildConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "scoring" JSONB NOT NULL,
    "startAnnouncedAt" TIMESTAMPTZ(3),
    "endAnnouncedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT,
    "color" TEXT NOT NULL DEFAULT '#5865F2',
    "location" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventGuild" (
    "eventId" INTEGER NOT NULL,
    "guildId" BIGINT NOT NULL,
    "teamId" INTEGER,

    CONSTRAINT "EventGuild_pkey" PRIMARY KEY ("eventId","guildId")
);

-- CreateTable
CREATE TABLE "Judge" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "userId" BIGINT NOT NULL,
    "teamId" INTEGER,
    "displayName" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Judge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Participant" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "userId" BIGINT NOT NULL,
    "minecraftName" TEXT NOT NULL,
    "minecraftKey" TEXT NOT NULL,
    "teamId" INTEGER,
    "banned" BOOLEAN NOT NULL DEFAULT false,
    "points" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "termsVersion" TEXT,
    "termsAcceptedAt" TIMESTAMPTZ(3),
    "registeredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Build" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "participantId" INTEGER NOT NULL,
    "teamId" INTEGER,
    "builderId" BIGINT NOT NULL,
    "guildId" BIGINT,
    "location" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceLink" TEXT NOT NULL,
    "area" DOUBLE PRECISION,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "extraInfo" TEXT,
    "status" "BuildStatus" NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "rejectedBy" BIGINT,
    "override" JSONB,
    "basePoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "effort" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "detail" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Build_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" SERIAL NOT NULL,
    "buildId" INTEGER NOT NULL,
    "judgeId" BIGINT NOT NULL,
    "judgeName" TEXT,
    "slot" TEXT NOT NULL,
    "basePoints" DOUBLE PRECISION NOT NULL,
    "effort" DOUBLE PRECISION NOT NULL,
    "detail" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuildMessage" (
    "id" SERIAL NOT NULL,
    "buildId" INTEGER NOT NULL,
    "guildId" BIGINT NOT NULL,
    "channelId" BIGINT NOT NULL,
    "messageId" BIGINT NOT NULL,
    "kind" TEXT NOT NULL,

    CONSTRAINT "BuildMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventId" INTEGER,
    "type" TEXT NOT NULL,
    "buildId" INTEGER,
    "userId" BIGINT,
    "actor" TEXT,
    "points" DOUBLE PRECISION,
    "details" TEXT,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Team_eventId_name_key" ON "Team"("eventId", "name");

-- CreateIndex
CREATE INDEX "EventGuild_guildId_idx" ON "EventGuild"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "Judge_eventId_userId_key" ON "Judge"("eventId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Participant_eventId_userId_key" ON "Participant"("eventId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Participant_eventId_minecraftKey_key" ON "Participant"("eventId", "minecraftKey");

-- CreateIndex
CREATE INDEX "Build_eventId_status_idx" ON "Build"("eventId", "status");

-- CreateIndex
CREATE INDEX "Build_participantId_idx" ON "Build"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_buildId_judgeId_key" ON "Vote"("buildId", "judgeId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_buildId_slot_key" ON "Vote"("buildId", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "BuildMessage_buildId_channelId_key" ON "BuildMessage"("buildId", "channelId");

-- CreateIndex
CREATE INDEX "Activity_eventId_createdAt_idx" ON "Activity"("eventId", "createdAt");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventGuild" ADD CONSTRAINT "EventGuild_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventGuild" ADD CONSTRAINT "EventGuild_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Judge" ADD CONSTRAINT "Judge_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Judge" ADD CONSTRAINT "Judge_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Build" ADD CONSTRAINT "Build_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Build" ADD CONSTRAINT "Build_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Build" ADD CONSTRAINT "Build_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "Build"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildMessage" ADD CONSTRAINT "BuildMessage_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "Build"("id") ON DELETE CASCADE ON UPDATE CASCADE;

