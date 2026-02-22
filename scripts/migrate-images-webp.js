require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { BlobServiceClient } = require("@azure/storage-blob");
const sharp = require("sharp");

const prisma = new PrismaClient();

function getArgValue(flagLong, flagShort) {
  const args = process.argv.slice(2);
  const longIndex = args.indexOf(flagLong);
  if (longIndex !== -1 && args[longIndex + 1]) {
    return args[longIndex + 1];
  }

  const shortIndex = args.indexOf(flagShort);
  if (shortIndex !== -1 && args[shortIndex + 1]) {
    return args[shortIndex + 1];
  }

  return null;
}

function hasFlag(flagLong, flagShort) {
  const args = process.argv.slice(2);
  return args.includes(flagLong) || args.includes(flagShort);
}

function parseBuildIds(input) {
  if (!input || typeof input !== "string") {
    return null;
  }

  const ids = new Set();
  const segments = input
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const segment of segments) {
    if (segment.includes("-")) {
      const [startRaw, endRaw] = segment.split("-").map((value) => value.trim());
      const start = Number.parseInt(startRaw, 10);
      const end = Number.parseInt(endRaw, 10);

      if (!Number.isInteger(start) || !Number.isInteger(end) || start <= 0 || end <= 0) {
        throw new Error(`Invalid range segment: \"${segment}\"`);
      }

      const low = Math.min(start, end);
      const high = Math.max(start, end);
      for (let id = low; id <= high; id += 1) {
        ids.add(id);
      }
    } else {
      const id = Number.parseInt(segment, 10);
      if (!Number.isInteger(id) || id <= 0) {
        throw new Error(`Invalid ID segment: \"${segment}\"`);
      }
      ids.add(id);
    }
  }

  return Array.from(ids).sort((a, b) => a - b);
}

function toWebpBlobName(blobName) {
  const lastSlash = blobName.lastIndexOf("/");
  const folder = lastSlash === -1 ? "" : blobName.slice(0, lastSlash + 1);
  const fileName = lastSlash === -1 ? blobName : blobName.slice(lastSlash + 1);
  const dotIndex = fileName.lastIndexOf(".");
  const stem = dotIndex === -1 ? fileName : fileName.slice(0, dotIndex);
  return `${folder}${stem}.webp`;
}

function extractBlobNameFromUrl(imageUrl, containerName) {
  const url = new URL(imageUrl);
  const normalizedPath = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  const prefix = `${containerName}/`;
  if (!normalizedPath.startsWith(prefix)) {
    return null;
  }
  return normalizedPath.slice(prefix.length);
}

async function main() {
  const idsRaw = getArgValue("--ids", "-i");
  const limitRaw = getArgValue("--limit", "-l");
  const dryRun = hasFlag("--dry-run", "-d");
  const keepOriginal = hasFlag("--keep-original", "-k");

  const targetIds = parseBuildIds(idsRaw);
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : null;
  if (limitRaw && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error("--limit must be a positive integer");
  }

  if (!process.env.AZURE_STORAGE_CONNECTION_STRING) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is missing");
  }

  if (!process.env.CONTAINER_NAME) {
    throw new Error("CONTAINER_NAME is missing");
  }

  if (!process.env.CDN_URL) {
    throw new Error("CDN_URL is missing");
  }

  const containerName = process.env.CONTAINER_NAME;
  const baseCdnUrl = process.env.CDN_URL.replace(/\/+$/, "");

  const blobServiceClient = BlobServiceClient.fromConnectionString(
    process.env.AZURE_STORAGE_CONNECTION_STRING
  );
  const containerClient = blobServiceClient.getContainerClient(containerName);

  const where = targetIds ? { id: { in: targetIds } } : undefined;
  const builds = await prisma.build.findMany({
    where,
    orderBy: { id: "asc" },
    select: {
      id: true,
      images: true,
    },
    take: limit || undefined,
  });

  let touchedBuilds = 0;
  let convertedImages = 0;
  let skippedImages = 0;
  let failedImages = 0;

  console.log(
    `Scanning ${builds.length} builds (${dryRun ? "dry-run" : "apply"}, ${keepOriginal ? "keep originals" : "delete originals"})...`
  );

  for (const build of builds) {
    const images = Array.isArray(build.images) ? build.images : [];
    if (images.length === 0) {
      continue;
    }

    const updatedImages = [...images];
    const oldBlobNamesToDelete = [];
    let changed = false;

    for (let index = 0; index < images.length; index += 1) {
      const imageUrl = images[index];

      if (typeof imageUrl !== "string" || !imageUrl || imageUrl === "loading") {
        skippedImages += 1;
        continue;
      }

      let blobName;
      try {
        blobName = extractBlobNameFromUrl(imageUrl, containerName);
      } catch (error) {
        console.error(`Build #${build.id}: invalid image URL \"${imageUrl}\"`);
        failedImages += 1;
        continue;
      }

      if (!blobName) {
        console.error(`Build #${build.id}: URL does not match container \"${containerName}\" -> ${imageUrl}`);
        failedImages += 1;
        continue;
      }

      if (blobName.toLowerCase().endsWith(".webp")) {
        skippedImages += 1;
        continue;
      }

      const newBlobName = toWebpBlobName(blobName);
      const newUrl = `${baseCdnUrl}/${containerName}/${newBlobName}`;

      if (dryRun) {
        console.log(`[DRY RUN] Build #${build.id}: ${blobName} -> ${newBlobName}`);
        updatedImages[index] = newUrl;
        changed = true;
        convertedImages += 1;
        continue;
      }

      try {
        const response = await fetch(imageUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const sourceBuffer = Buffer.from(await response.arrayBuffer());
        const webpBuffer = await sharp(sourceBuffer, { failOn: "none" })
          .rotate()
          .webp({ lossless: true, effort: 6 })
          .toBuffer();

        const newBlobClient = containerClient.getBlockBlobClient(newBlobName);
        await newBlobClient.uploadData(webpBuffer, {
          blobHTTPHeaders: {
            blobContentType: "image/webp",
          },
        });

        updatedImages[index] = newUrl;
        oldBlobNamesToDelete.push(blobName);
        changed = true;
        convertedImages += 1;
      } catch (error) {
        failedImages += 1;
        console.error(`Build #${build.id}: failed to convert ${imageUrl}: ${error.message}`);
      }
    }

    if (!changed) {
      continue;
    }

    touchedBuilds += 1;

    if (dryRun) {
      continue;
    }

    await prisma.build.update({
      where: { id: build.id },
      data: {
        images: updatedImages,
      },
    });

    if (!keepOriginal) {
      for (const oldBlobName of oldBlobNamesToDelete) {
        try {
          await containerClient.deleteBlob(oldBlobName, { deleteSnapshots: "include" });
        } catch (error) {
          console.error(`Build #${build.id}: failed to delete old blob ${oldBlobName}: ${error.message}`);
        }
      }
    }

    console.log(`Build #${build.id}: migrated ${oldBlobNamesToDelete.length} image(s)`);
  }

  console.log("Migration finished.");
  console.log(`Touched builds: ${touchedBuilds}`);
  console.log(`Converted images: ${convertedImages}`);
  console.log(`Skipped images: ${skippedImages}`);
  console.log(`Failed images: ${failedImages}`);
}

main()
  .catch((error) => {
    console.error("Image migration failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
