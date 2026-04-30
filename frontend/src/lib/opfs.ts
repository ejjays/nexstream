// large file storage
// bypass ram limits

export class OPFSStorage {
  private root: FileSystemDirectoryHandle;
  private handle: FileSystemFileHandle;
  private accessHandle: any; // For SyncAccess (Workers)
  private writable: any; // For WritableStream (Main Thread)
  public filename: string;

  constructor(
    root: FileSystemDirectoryHandle, 
    handle: FileSystemFileHandle, 
    accessHandle: any, 
    writable: any
  ) {
    this.root = root;
    this.handle = handle;
    this.accessHandle = accessHandle;
    this.writable = writable;
    this.filename = handle.name;
  }

  static async init(filename: string, useSync = false): Promise<OPFSStorage | null> {
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

      // sync access worker
      if (useSync && (handle as any).createSyncAccessHandle) {
        accessHandle = await (handle as any).createSyncAccessHandle();
      } else {
        writable = await (handle as any).createWritable();
      }

      return new OPFSStorage(processingDir, handle, accessHandle, writable);
    } catch (err) {
      console.error("[OPFS] Init failed:", err);
      return null;
    }
  }

  write(chunk: any, offset: number | null = null) {
    if (this.accessHandle) {
      // sync header write
      return this.accessHandle.write(chunk, { at: offset !== null ? offset : undefined });
    } else if (this.writable) {
      // async stream write
      if (offset !== null) {
        return this.writable.write({ type: 'write', position: offset, data: chunk });
      }
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
      // ignore delete errors
    }
  }

  static async clearAll() {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry("nexstream-processing", { recursive: true });
    } catch (e) {}
  }
}
