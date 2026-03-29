// Specialized Storage for Large File Muxing (Cobalt-inspired)
// Uses Origin Private File System (OPFS) to bypass RAM limits

export class OPFSStorage {
  constructor(root, handle, accessHandle, writable) {
    this.root = root;
    this.handle = handle;
    this.accessHandle = accessHandle; // For SyncAccess (Workers)
    this.writable = writable; // For WritableStream (Main Thread)
    this.filename = handle.name;
  }

  static async init(filename, useSync = false) {
    if (!navigator.storage?.getDirectory) {
      throw new Error("OPFS not supported");
    }

    try {
      const root = await navigator.storage.getDirectory();
      const processingDir = await root.getDirectoryHandle("nexstream-processing", { create: true });
      
      const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${filename}`;
      const handle = await processingDir.getFileHandle(uniqueName, { create: true });
      
      let accessHandle = null;
      let writable = null;

      // createSyncAccessHandle is only available in workers
      if (useSync && handle.createSyncAccessHandle) {
        accessHandle = await handle.createSyncAccessHandle();
      } else {
        writable = await handle.createWritable();
      }

      return new OPFSStorage(processingDir, handle, accessHandle, writable);
    } catch (err) {
      console.error("[OPFS] Init failed:", err);
      return null;
    }
  }

  write(chunk, offset = null) {
    if (this.accessHandle) {
      // Low-level synchronous write (Critical for FFmpeg headers)
      this.accessHandle.write(chunk, { at: offset ?? undefined });
    } else if (this.writable) {
      // Async path for high-level streams
      return this.writable.write(chunk);
    }
  }

  async close() {
    try {
      if (this.accessHandle) {
        await this.accessHandle.flush();
        await this.accessHandle.close();
        this.accessHandle = null;
      }
      if (this.writable) {
        await this.writable.close();
        this.writable = null;
      }
    } catch (e) {
      // ignore close errors
    }
  }

  async getFile() {
    await this.close();
    return await this.handle.getFile();
  }

  async delete() {
    try {
      await this.close();
      await this.root.removeEntry(this.filename);
    } catch (e) {
      // ignore if already deleted
    }
  }

  static async clearAll() {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry("nexstream-processing", { recursive: true });
    } catch (e) {}
  }
}
