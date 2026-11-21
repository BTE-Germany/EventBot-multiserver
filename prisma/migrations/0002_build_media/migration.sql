-- YouTube / imgur links of a build
ALTER TABLE "Build" ADD COLUMN "media" TEXT[] DEFAULT ARRAY[]::TEXT[];
