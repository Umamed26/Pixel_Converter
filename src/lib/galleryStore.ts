// 图廊存储：使用 IndexedDB 保存本地生成图片。/ Gallery store: persist generated images in IndexedDB.

const GALLERY_DB_NAME = "pixel_workshop_gallery_v1";
const GALLERY_STORE_NAME = "images";
const GALLERY_DB_VERSION = 1;

/**
 * 图廊记录实体。/ Gallery record entity.
 */
export interface GalleryImageRecord {
  id: string;
  name: string;
  createdAt: string;
  width: number;
  height: number;
  blob: Blob;
}

/**
 * 保存图像入库的输入参数。/ Input payload for persisting one image.
 */
interface SaveGalleryImageInput {
  name: string;
  width: number;
  height: number;
  blob: Blob;
}

/**
 * 打开图廊 IndexedDB 并在需要时完成表结构升级。/ Open gallery IndexedDB and run schema upgrade when needed.
 * @returns 数据库连接 / Opened database connection.
 */
function openGalleryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexeddb_unavailable"));
      return;
    }

    const request = indexedDB.open(GALLERY_DB_NAME, GALLERY_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(GALLERY_STORE_NAME)) {
        db.createObjectStore(GALLERY_STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb_open_failed"));
  });
}

/**
 * 将 IndexedDB 请求包装为 Promise。/ Wrap an IndexedDB request into Promise.
 * @param request 原始请求对象 / Raw indexedDB request.
 * @returns 请求结果 / Request result.
 */
function runRequest<T = unknown>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb_request_failed"));
  });
}

/**
 * 生成轻量图片记录 ID。/ Generate lightweight image record id.
 * @returns 图廊记录 ID / Gallery record id.
 */
function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 保存单张图片到图廊。/ Persist one image into gallery.
 * @param input 图像元数据与二进制内容 / Image metadata and blob.
 * @returns 已保存记录 / Saved record.
 */
export async function saveGalleryImage(input: SaveGalleryImageInput): Promise<GalleryImageRecord> {
  const record: GalleryImageRecord = {
    id: createId(),
    name: input.name,
    createdAt: new Date().toISOString(),
    width: Math.max(1, Math.floor(input.width)),
    height: Math.max(1, Math.floor(input.height)),
    blob: input.blob,
  };

  const db = await openGalleryDb();
  try {
    const tx = db.transaction(GALLERY_STORE_NAME, "readwrite");
    const store = tx.objectStore(GALLERY_STORE_NAME);
    await runRequest(store.put(record));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("indexeddb_tx_failed"));
      tx.onabort = () => reject(tx.error ?? new Error("indexeddb_tx_aborted"));
    });
    return record;
  } finally {
    db.close();
  }
}

/**
 * 读取全部图廊图片并按创建时间倒序返回。/ Read all gallery images sorted by newest first.
 * @returns 图廊记录数组 / Gallery records.
 */
export async function listGalleryImages(): Promise<GalleryImageRecord[]> {
  const db = await openGalleryDb();
  try {
    const tx = db.transaction(GALLERY_STORE_NAME, "readonly");
    const store = tx.objectStore(GALLERY_STORE_NAME);
    const rows = await runRequest<GalleryImageRecord[]>(store.getAll());
    return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } finally {
    db.close();
  }
}

/**
 * 删除指定图廊图片。/ Delete one gallery image by id.
 * @param id 记录 ID / Record id.
 * @returns 无返回值 / No return value.
 */
export async function deleteGalleryImage(id: string): Promise<void> {
  const db = await openGalleryDb();
  try {
    const tx = db.transaction(GALLERY_STORE_NAME, "readwrite");
    const store = tx.objectStore(GALLERY_STORE_NAME);
    await runRequest(store.delete(id));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("indexeddb_tx_failed"));
      tx.onabort = () => reject(tx.error ?? new Error("indexeddb_tx_aborted"));
    });
  } finally {
    db.close();
  }
}

/**
 * 清空图廊全部图片。/ Clear all gallery images.
 * @returns 无返回值 / No return value.
 */
export async function clearGalleryImages(): Promise<void> {
  const db = await openGalleryDb();
  try {
    const tx = db.transaction(GALLERY_STORE_NAME, "readwrite");
    const store = tx.objectStore(GALLERY_STORE_NAME);
    await runRequest(store.clear());
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("indexeddb_tx_failed"));
      tx.onabort = () => reject(tx.error ?? new Error("indexeddb_tx_aborted"));
    });
  } finally {
    db.close();
  }
}
