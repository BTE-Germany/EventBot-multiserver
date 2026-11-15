// Image storage. Azure Blob Storage when configured (connection string in .env,
// container and CDN URL in the dashboard), otherwise Discord's own URLs are kept.
const crypto = require("crypto");

function createStorageService({ connectionString, settings, log }) {
  let current = { container: null, client: null };

  async function container() {
    if (!connectionString) return null;
    const { storage } = await settings.get();
    if (!storage.container || !storage.cdnUrl) return null;
    if (current.container !== storage.container) {
      const { BlobServiceClient } = require("@azure/storage-blob");
      current = {
        container: storage.container,
        client: BlobServiceClient.fromConnectionString(connectionString).getContainerClient(storage.container),
      };
    }
    return { client: current.client, storage };
  }

  const publicPrefix = (storage) => `${storage.cdnUrl.replace(/\/$/, "")}/${storage.container}/`;

  return {
    async isConfigured() {
      return Boolean(await container());
    },
    // Returns the public URL or null when storage is not configured / failed
    async upload(prefix, buffer, { extension = "webp", contentType = "image/webp" } = {}) {
      const target = await container();
      if (!target) return null;
      try {
        const name = `${prefix}/${crypto.randomUUID()}.${extension}`;
        await target.client.getBlockBlobClient(name).uploadData(buffer, {
          blobHTTPHeaders: { blobContentType: contentType },
        });
        return publicPrefix(target.storage) + name;
      } catch (err) {
        log?.error("Upload failed:", err.message);
        return null;
      }
    },
    async remove(url) {
      const target = await container();
      if (!target || !url?.startsWith(publicPrefix(target.storage))) return;
      await target.client
        .deleteBlob(url.slice(publicPrefix(target.storage).length), { deleteSnapshots: "include" })
        .catch((err) => log?.warn(`Could not delete ${url}:`, err.message));
    },
    async clear() {
      const target = await container();
      if (!target) return { deleted: 0, configured: false };
      let deleted = 0;
      for await (const blob of target.client.listBlobsFlat()) {
        if (target.storage.keepPrefix && blob.name.startsWith(target.storage.keepPrefix)) continue;
        await target.client.deleteBlob(blob.name, { deleteSnapshots: "include" });
        deleted++;
      }
      return { deleted, configured: true };
    },
  };
}

// Downloads submitted screenshots, converts them on the worker pool and stores them
function createImageService({ storage, pool, log, fetchImpl = fetch, maxImages = 3 }) {
  async function storeOne(prefix, attachment) {
    try {
      const res = await fetchImpl(attachment.url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const original = new Uint8Array(await res.arrayBuffer());
      let data;
      let options;
      try {
        const converted = await pool.run("convertImage", { data: original }, [original.buffer]);
        data = Buffer.from(converted.buffer, converted.byteOffset, converted.byteLength);
        options = { extension: "webp", contentType: "image/webp" };
      } catch (err) {
        // Unsupported image: keep the original rather than losing the submission
        log?.warn("Image conversion failed, storing original:", err.message);
        const again = await fetchImpl(attachment.url);
        data = Buffer.from(await again.arrayBuffer());
        const extension = (attachment.name?.match(/\.([a-z0-9]+)$/i)?.[1] || "png").toLowerCase();
        options = { extension, contentType: attachment.contentType || "application/octet-stream" };
      }
      return await storage.upload(prefix, data, options);
    } catch (err) {
      log?.warn("Image could not be stored:", err.message);
      return null;
    }
  }

  return {
    maxImages,
    // Converts in parallel on the pool; Discord URLs are the fallback
    async storeAll(prefix, attachments) {
      const list = attachments.slice(0, maxImages);
      if (!(await storage.isConfigured())) return { urls: list.map((a) => a.url), allStored: false, storageEnabled: false };
      const stored = await Promise.all(list.map((a) => storeOne(prefix, a)));
      return {
        urls: stored.map((url, i) => url || list[i].url),
        allStored: stored.every(Boolean),
        storageEnabled: true,
      };
    },
    removeAll: (urls) => Promise.all((urls || []).map((u) => storage.remove(u))),
  };
}

module.exports = { createStorageService, createImageService };
