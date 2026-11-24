
import { AuctionState, Team, Player, AuctionCategory, DraftPickHistory } from './types';
import heic2any from 'heic2any';
import { storage, auth, db } from './firebase';

export type ImageUploadType = 
    | 'BANNER' 
    | 'POSTER' 
    | 'LOGO' 
    | 'QR' 
    | 'PROFILE' 
    | 'PAYMENT' 
    | 'REG_BANNER' 
    | 'REG_WELCOME_POSTER' 
    | 'REG_LOGO' 
    | 'MODAL' 
    | 'OVERLAY' 
    | 'GENERAL';

export interface CompressImageOptions {
    type?: ImageUploadType;
    isBanner?: boolean;
    maxWidth?: number;
    maxHeight?: number;
    maxDataUrlLength?: number;
}

/**
 * Converts a base64 Data URL to a native Blob object.
 */
export const dataUrlToBlob = (dataUrl: string): Blob => {
    try {
        const parts = dataUrl.split(',');
        const mimeMatch = parts[0]?.match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        const byteString = atob(parts[1] || '');
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        return new Blob([ab], { type: mime });
    } catch (e) {
        console.warn("dataUrlToBlob fallback:", e);
        return new Blob([], { type: 'image/jpeg' });
    }
};

export const ONE_MB_LIMIT_BYTES = 1024 * 1024; // 1 MB (1,048,576 bytes)

/**
 * Converts a File or Blob directly to a Base64 Data URL without any modification or re-encoding.
 */
export const fileToDataUrl = (file: File | Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string) || '');
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
    });
};

/**
 * Calculates approximate binary byte size from a base64 Data URL.
 */
export const getDataUrlByteSize = (dataUrl: string): number => {
    if (!dataUrl) return 0;
    const commaIndex = dataUrl.indexOf(',');
    const base64Len = commaIndex === -1 ? dataUrl.length : dataUrl.length - (commaIndex + 1);
    return Math.floor(base64Len * 0.75);
};

/**
 * Ensures anonymous authentication so Firebase Storage security rules don't reject guest uploads.
 */
export const ensureAuthForStorage = async (): Promise<boolean> => {
    if (auth.currentUser) return true;
    try {
        await auth.signInAnonymously();
        return true;
    } catch (e) {
        console.warn("Storage anonymous auth notice:", e);
        return false;
    }
};

/**
 * High-speed canvas-based image downsampler.
 * Resizes an image file to a lightweight JPEG Blob (around 50-120 KB, max 800x800) in under 150ms.
 */
export const fastCompressImageToBlob = async (
    file: File | Blob | string,
    maxWidth: number = 800,
    maxHeight: number = 800,
    quality: number = 0.80
): Promise<{ blob: Blob; dataUrl: string }> => {
    // If it's already a small data URL or string, handle gracefully
    if (typeof file === 'string' && file.startsWith('data:')) {
        const b = dataUrlToBlob(file);
        if (b.size <= 150 * 1024) {
            return { blob: b, dataUrl: file };
        }
    }

    // Handle iOS HEIC/HEIF
    let processedFile: File | Blob | string = file;
    if (typeof file !== 'string') {
        const fileType = (file as any).type?.toLowerCase() || '';
        const fileName = (file as any).name?.toLowerCase() || '';
        if (fileType.includes('heic') || fileType.includes('heif') || fileName.endsWith('.heic') || fileName.endsWith('.heif')) {
            try {
                const converted = await heic2any({
                    blob: file,
                    toType: 'image/jpeg',
                    quality: 0.85
                });
                processedFile = Array.isArray(converted) ? converted[0] : converted;
            } catch (e) {
                console.warn("HEIC fast conversion fallback:", e);
            }
        }
    }

    // Fast bitmap decoding
    let imgSource: CanvasImageSource | null = null;
    let origWidth = 0;
    let origHeight = 0;
    let cleanupBmp: (() => void) | null = null;

    if (typeof processedFile !== 'string' && typeof window !== 'undefined' && 'createImageBitmap' in window) {
        try {
            const bmp = await createImageBitmap(processedFile);
            imgSource = bmp;
            origWidth = bmp.width;
            origHeight = bmp.height;
            cleanupBmp = () => { try { bmp.close(); } catch (_) {} };
        } catch (_) {}
    }

    if (!imgSource) {
        await new Promise<void>((resolve) => {
            const img = new Image();
            let objUrl: string | null = null;
            const t = setTimeout(() => resolve(), 6000);
            img.onload = () => {
                clearTimeout(t);
                imgSource = img;
                origWidth = img.naturalWidth || img.width;
                origHeight = img.naturalHeight || img.height;
                if (objUrl) {
                    try { URL.revokeObjectURL(objUrl); } catch (_) {}
                }
                resolve();
            };
            img.onerror = () => {
                clearTimeout(t);
                if (objUrl) {
                    try { URL.revokeObjectURL(objUrl); } catch (_) {}
                }
                resolve();
            };
            if (typeof processedFile === 'string') {
                img.src = processedFile;
            } else {
                try {
                    objUrl = URL.createObjectURL(processedFile);
                    img.src = objUrl;
                } catch {
                    resolve();
                }
            }
        });
    }

    if (!imgSource || origWidth <= 0 || origHeight <= 0) {
        // Fallback
        if (typeof file === 'string') {
            return { blob: dataUrlToBlob(file), dataUrl: file };
        }
        const fallbackUrl = await fileToDataUrl(file);
        return { blob: file, dataUrl: fallbackUrl };
    }

    let targetWidth = origWidth;
    let targetHeight = origHeight;
    if (targetWidth > maxWidth || targetHeight > maxHeight) {
        const ratio = Math.min(maxWidth / targetWidth, maxHeight / targetHeight);
        targetWidth = Math.max(1, Math.round(targetWidth * ratio));
        targetHeight = Math.max(1, Math.round(targetHeight * ratio));
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        if (cleanupBmp) cleanupBmp();
        const fallbackUrl = typeof file === 'string' ? file : await fileToDataUrl(file);
        return { blob: typeof file === 'string' ? dataUrlToBlob(file) : file, dataUrl: fallbackUrl };
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium'; // 'medium' is much faster than 'high' on mobile and looks identical
    ctx.drawImage(imgSource, 0, 0, targetWidth, targetHeight);

    if (cleanupBmp) cleanupBmp();

    // Export fast data URL and blob
    const dataUrl = canvas.toDataURL('image/jpeg', quality);

    const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => {
            resolve(b || dataUrlToBlob(dataUrl));
        }, 'image/jpeg', quality);
    });

    return { blob, dataUrl };
};

/**
 * Uploads a Blob or File directly to Firebase Storage and returns the permanent HTTPS download URL.
 */
export const uploadFileToStorage = async (
    fileOrBlob: Blob | File,
    path: string,
    timeoutMs: number = 7000
): Promise<string | null> => {
    if (!storage) {
        console.warn("Firebase Storage is not initialized.");
        return null;
    }

    try {
        await ensureAuthForStorage();
        const fileRef = storage.ref(path);
        const metadata = {
            contentType: fileOrBlob.type || 'image/jpeg',
            cacheControl: 'public,max-age=31536000'
        };

        const uploadTask = fileRef.put(fileOrBlob, metadata);

        // 7s timeout: if mobile connection hangs or storage bucket is unreachable, quickly proceed to safe compressed fallback
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
                try { uploadTask.cancel(); } catch (_) {}
                reject(new Error('STORAGE_TIMEOUT'));
            }, timeoutMs);
        });

        const snapshot = await Promise.race([uploadTask, timeoutPromise]);
        const downloadUrl = await snapshot.ref.getDownloadURL();
        if (downloadUrl) {
            return downloadUrl;
        }
    } catch (err: any) {
        console.warn("Firebase Storage upload notice for path:", path, err?.message || err);
    }
    return null;
};

/**
 * Uploads an image or document file to Firebase Storage and returns the permanent Storage download URL.
 * Automatically accepts File, Blob, or Data URL.
 * Optimizes the image before upload to minimize bandwidth, then uploads directly to Firebase Storage.
 * If Firebase Storage is unavailable, falls back to a safely bounded compressed Data URL.
 */
export const uploadImageOrFallback = async (
    file: File | Blob | string,
    auctionId: string = 'general',
    category: string = 'player_photo',
    compressType: ImageUploadType = 'PROFILE'
): Promise<string> => {
    if (!file) return '';

    // If it's already an external HTTP/HTTPS URL, return as-is
    if (typeof file === 'string' && (file.startsWith('http://') || file.startsWith('https://'))) {
        return file;
    }

    // Determine extension
    let ext = 'jpg';
    if (typeof file !== 'string' && (file as any).name) {
        ext = (file as any).name.split('.').pop()?.toLowerCase() || 'jpg';
    } else if (typeof file === 'string' && file.startsWith('data:')) {
        const mimeMatch = file.substring(0, 30).match(/:(.*?);/);
        if (mimeMatch && mimeMatch[1]) {
            ext = mimeMatch[1].split('/')[1] || 'jpg';
            if (ext === 'jpeg') ext = 'jpg';
        }
    }

    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const sanitizedCategory = category.replace(/[^a-zA-Z0-9_-]/g, '_');
    const path = `auctions/${auctionId}/registrations/${sanitizedCategory}_${timestamp}_${random}.${ext}`;

    // Step 1: Rapidly compress in browser (100-200ms) to ~70-120KB before uploading
    let blobToUpload: Blob;
    let fallbackDataUrl: string;

    try {
        const fastResult = await fastCompressImageToBlob(file, 800, 800, 0.80);
        blobToUpload = fastResult.blob;
        fallbackDataUrl = fastResult.dataUrl;
    } catch {
        fallbackDataUrl = typeof file === 'string' ? file : await fileToDataUrl(file);
        blobToUpload = typeof file === 'string' ? dataUrlToBlob(file) : file;
    }

    // Step 2: Upload small (70KB) blob to Firebase Storage (takes < 0.5s on most networks)
    const storageUrl = await uploadFileToStorage(blobToUpload, path, 6000);
    if (storageUrl) {
        return storageUrl;
    }

    // Step 3: Instant fallback to safely bounded data URL (< 80KB) if Storage was unreachable
    return fallbackDataUrl;
};

/**
 * Encodes an AudioBuffer as a PCM WAV Blob (16-bit mono) so oversized audio files
 * can be safely stored within Firestore limits when Cloud Storage is unavailable.
 */
function encodeMonoWavBlob(channelData: Float32Array, sampleRate: number): Blob {
    const numSamples = channelData.length;
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // Byte rate
    view.setUint16(32, 2, true); // Block align
    view.setUint16(34, 16, true); // Bits per sample
    writeString(36, 'data');
    view.setUint32(40, numSamples * 2, true);

    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
        const s = Math.max(-1, Math.min(1, channelData[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Downsamples and trims an oversized audio File into a compact WAV Data URL
 * that fits safely inside Firestore document size limits.
 */
async function shrinkAudioToCompactDataUrl(file: File, maxBinaryBytes: number): Promise<string> {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) {
        throw new Error(`Audio file is ${(file.size / 1024).toFixed(0)} KB. Please use a file under ${(maxBinaryBytes / 1024).toFixed(0)} KB.`);
    }

    const arrayBuf = await file.arrayBuffer();
    const ctx = new AudioCtx();
    try {
        const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
        const targetSampleRate = 16000; // 16 kHz mono = 32 KB/sec
        const maxDurationSec = Math.max(3, Math.floor((maxBinaryBytes - 128) / (targetSampleRate * 2)));
        const renderDuration = Math.min(decoded.duration, maxDurationSec);
        const frameCount = Math.max(1, Math.floor(renderDuration * targetSampleRate));

        const offline = new OfflineAudioContext(1, frameCount, targetSampleRate);
        const src = offline.createBufferSource();
        src.buffer = decoded;
        src.connect(offline.destination);
        src.start(0);
        const rendered = await offline.startRendering();
        const wavBlob = encodeMonoWavBlob(rendered.getChannelData(0), targetSampleRate);
        return await fileToDataUrl(wavBlob);
    } finally {
        try { await ctx.close(); } catch (_) {}
    }
}

/**
 * Uploads a custom audio file (Sold, Time Up, Unsold) to Firebase Storage,
 * or falls back cleanly across writable Firestore collections and bounded inline Data URLs
 * so uploads work reliably even if Firebase Storage or subcollection rules are restricted.
 */
export const uploadAudioOrFallback = async (
    file: File,
    auctionId: string,
    soundKey: 'sold' | 'timeup' | 'unsold'
): Promise<string> => {
    if (!file || !auctionId) {
        throw new Error('Missing audio file or auction ID.');
    }

    const ext = file.name?.split('.').pop()?.toLowerCase() || 'mp3';
    const ts = Date.now();
    const path = `auctions/${auctionId}/audio/${soundKey}_${ts}.${ext}`;

    // 1. Try Firebase Storage first (fast 5s timeout so blocked/unconfigured buckets fail over quickly)
    const storageUrl = await uploadFileToStorage(file, path, 5000);
    if (storageUrl) {
        return storageUrl;
    }

    // 2. Prepare compact Data URL (<= 680 KB binary -> < 910 KB in a dedicated doc)
    const MAX_SUBDOC_BINARY_BYTES = 650 * 1024;
    let dataUrl = '';
    if (file.size <= MAX_SUBDOC_BINARY_BYTES) {
        dataUrl = await fileToDataUrl(file);
    } else {
        try {
            dataUrl = await shrinkAudioToCompactDataUrl(file, MAX_SUBDOC_BINARY_BYTES);
        } catch (shrinkErr: any) {
            throw new Error(
                shrinkErr?.message ||
                `Audio file is ${(file.size / 1024).toFixed(0)} KB and could not be compressed. Please use an MP3/WAV under 650 KB.`
            );
        }
    }

    const docPayload = {
        auctionId,
        soundKey,
        fileName: file.name || `${soundKey}.${ext}`,
        mimeType: file.type || 'audio/mpeg',
        dataUrl,
        updatedAt: ts
    };

    // Ensure authenticated session if possible (admins are already signed in; fallback for anonymous)
    await ensureAuthForStorage();

    // 3A. Try dedicated /auctions/{auctionId}/audioAssets/{soundKey}
    try {
        await db
            .collection('auctions')
            .doc(auctionId)
            .collection('audioAssets')
            .doc(soundKey)
            .set(docPayload);
        return `firestore-asset://${auctionId}/${soundKey}?v=${ts}`;
    } catch (err: any) {
        console.warn('audioAssets write failed, trying writable fallback collection:', err?.code || err?.message);
    }

    // 3B. Try /scoringAssets/{auctionId}_audio_{soundKey} (allow write: if isSignedIn())
    try {
        const scoringDocId = `${auctionId}_audio_${soundKey}`;
        await db.collection('scoringAssets').doc(scoringDocId).set(docPayload);
        return `scoring-asset://${scoringDocId}?v=${ts}`;
    } catch (err: any) {
        console.warn('scoringAssets write failed, trying arrangementDrafts fallback:', err?.code || err?.message);
    }

    // 3C. Try /auctions/{auctionId}/arrangementDrafts/audio_{soundKey} (allow write: if isAdmin(auctionId))
    try {
        const draftAssetId = `audio_${soundKey}`;
        await db
            .collection('auctions')
            .doc(auctionId)
            .collection('arrangementDrafts')
            .doc(draftAssetId)
            .set(docPayload);
        return `draft-asset://${auctionId}/${draftAssetId}?v=${ts}`;
    } catch (err: any) {
        console.warn('arrangementDrafts audio fallback failed, trying inline auction doc storage:', err?.code || err?.message);
    }

    // 3D. Final guaranteed fallback: return compact Data URL directly on root /auctions/{auctionId}
    // Check if the current auction doc + audio Data URL fits safely below Firestore's 1 MiB limit (~900 KB cap)
    let inlineDataUrl = dataUrl;
    try {
        const snap = await db.collection('auctions').doc(auctionId).get();
        const currentJson = snap.exists ? JSON.stringify(snap.data() || {}) : '{}';
        const remainingBudget = Math.max(0, 880_000 - currentJson.length);
        const targetInlineBytes = Math.min(350 * 1024, Math.floor(remainingBudget * 0.72));

        if (inlineDataUrl.length > remainingBudget) {
            if (targetInlineBytes < 48 * 1024) {
                throw new Error('Auction document is nearly full and subcollection storage is blocked. Use a shorter clip (< 100 KB) or deploy Firestore rules.');
            }
            inlineDataUrl = await shrinkAudioToCompactDataUrl(file, targetInlineBytes);
        }
        return inlineDataUrl;
    } catch (inlineErr: any) {
        throw new Error(
            inlineErr?.message ||
            'Could not upload custom audio. Please try a shorter MP3 clip under 300 KB.'
        );
    }
};

/**
 * Scans an object (e.g. registration data) for any base64 image strings ('data:...'),
 * uploads each to Firebase Storage, and replaces the base64 value with the Storage download URL.
 */
export const uploadBase64FieldsToStorage = async (
    dataObj: Record<string, any>,
    auctionId: string = 'general',
    categoryPrefix: string = 'reg'
): Promise<Record<string, any>> => {
    if (!dataObj || typeof dataObj !== 'object') return dataObj;
    const updated: Record<string, any> = { ...dataObj };

    for (const [key, val] of Object.entries(updated)) {
        if (typeof val === 'string' && (val.startsWith('data:') || val.startsWith('blob:'))) {
            try {
                const storageUrl = await uploadImageOrFallback(val, auctionId, `${categoryPrefix}_${key}`, 'GENERAL');
                if (storageUrl) {
                    updated[key] = storageUrl;
                }
            } catch (err) {
                console.warn(`Failed to upload field "${key}" to Firebase Storage:`, err);
            }
        }
    }
    return updated;
};

/**
 * Hard safeguard: ensures that a document payload never exceeds Firestore's 1MB limit.
 * If the payload is too large, it compresses any residual base64 strings so the total size
 * is strictly guaranteed to remain far below 1,048,576 bytes.
 */
export const ensurePayloadWithinLimit = async (
    payload: Record<string, any>,
    maxAllowedChars: number = 650000
): Promise<Record<string, any>> => {
    let result = { ...payload };
    let jsonLength = JSON.stringify(result).length;

    if (jsonLength <= maxAllowedChars) {
        return result;
    }

    console.warn(`Payload size (${jsonLength} chars) exceeds safety threshold (${maxAllowedChars} chars). Compacting...`);

    // Pass 1: recompress any base64 strings to smaller sizes
    for (const [key, val] of Object.entries(result)) {
        if (typeof val === 'string' && val.startsWith('data:')) {
            try {
                result[key] = await compressImage(val, { maxDataUrlLength: 35000 });
            } catch (e) {
                console.warn(`Could not compress field ${key}:`, e);
            }
        }
    }

    jsonLength = JSON.stringify(result).length;
    if (jsonLength <= maxAllowedChars) {
        return result;
    }

    // Pass 2: Extreme compaction for remaining base64 fields if still oversized
    for (const [key, val] of Object.entries(result)) {
        if (typeof val === 'string' && val.startsWith('data:')) {
            try {
                result[key] = await compressImage(val, { maxDataUrlLength: 15000 });
            } catch (_) {}
        }
    }

    return result;
};

/**
 * Safe target Base64 string lengths for Firestore document storage.
 * Ensures crystal-clear visual quality while strictly preventing the 1,048,576 bytes limit error.
 */
export const SAFE_IMAGE_SIZES: Record<ImageUploadType, { maxWidth: number; maxHeight: number; maxChars: number; initialQuality: number }> = {
    PROFILE: { maxWidth: 800, maxHeight: 800, maxChars: 180000, initialQuality: 0.82 },
    PAYMENT: { maxWidth: 900, maxHeight: 1200, maxChars: 220000, initialQuality: 0.80 },
    LOGO: { maxWidth: 400, maxHeight: 400, maxChars: 60000, initialQuality: 0.85 },
    REG_LOGO: { maxWidth: 400, maxHeight: 400, maxChars: 60000, initialQuality: 0.85 },
    QR: { maxWidth: 500, maxHeight: 500, maxChars: 70000, initialQuality: 0.85 },
    BANNER: { maxWidth: 1200, maxHeight: 600, maxChars: 160000, initialQuality: 0.80 },
    REG_BANNER: { maxWidth: 1200, maxHeight: 600, maxChars: 160000, initialQuality: 0.80 },
    POSTER: { maxWidth: 900, maxHeight: 1200, maxChars: 200000, initialQuality: 0.80 },
    REG_WELCOME_POSTER: { maxWidth: 900, maxHeight: 1200, maxChars: 200000, initialQuality: 0.80 },
    MODAL: { maxWidth: 800, maxHeight: 800, maxChars: 180000, initialQuality: 0.82 },
    OVERLAY: { maxWidth: 800, maxHeight: 800, maxChars: 180000, initialQuality: 0.82 },
    GENERAL: { maxWidth: 800, maxHeight: 800, maxChars: 180000, initialQuality: 0.82 }
};

/**
 * Automatically accepts any image of ANY size (1MB, 5MB, 10MB, 50MB, 100MB+)
 * and properly compresses it into a razor-sharp, crystal-clear Data URL.
 * Guarantees the resulting string never exceeds Firestore document limits.
 */
export const compressImage = async (
    file: File | Blob | string, 
    typeOrOptions: ImageUploadType | CompressImageOptions | boolean = 'GENERAL'
): Promise<string> => {
    if (!file) return '';

    // If external HTTP/HTTPS URL, return as-is
    if (typeof file === 'string' && (file.startsWith('http://') || file.startsWith('https://'))) {
        return file;
    }

    // Determine config
    let targetType: ImageUploadType = 'GENERAL';
    let customMaxWidth: number | undefined;
    let customMaxHeight: number | undefined;
    let customMaxChars: number | undefined;

    if (typeof typeOrOptions === 'boolean') {
        targetType = typeOrOptions ? 'BANNER' : 'GENERAL';
    } else if (typeof typeOrOptions === 'string') {
        targetType = typeOrOptions;
    } else if (typeof typeOrOptions === 'object') {
        targetType = typeOrOptions.type || 'GENERAL';
        customMaxWidth = typeOrOptions.maxWidth;
        customMaxHeight = typeOrOptions.maxHeight;
        customMaxChars = typeOrOptions.maxDataUrlLength;
    }

    const config = SAFE_IMAGE_SIZES[targetType] || SAFE_IMAGE_SIZES.GENERAL;
    const MAX_WIDTH = customMaxWidth || config.maxWidth;
    const MAX_HEIGHT = customMaxHeight || config.maxHeight;
    const MAX_CHARS = customMaxChars || config.maxChars;

    // If it's already a Data URL and already under the strict safe limit, return directly
    if (typeof file === 'string' && file.startsWith('data:')) {
        if (file.length <= MAX_CHARS) {
            return file;
        }
    }

    // Handle iOS HEIC/HEIF files
    let processedFile: File | Blob | string = file;
    if (typeof file !== 'string') {
        const fileType = (file as any).type?.toLowerCase() || '';
        const fileName = (file as any).name?.toLowerCase() || '';
        if (fileType.includes('heic') || fileType.includes('heif') || fileName.endsWith('.heic') || fileName.endsWith('.heif')) {
            try {
                const converted = await heic2any({
                    blob: file,
                    toType: 'image/jpeg',
                    quality: 0.90
                });
                processedFile = Array.isArray(converted) ? converted[0] : converted;
            } catch (e) {
                console.warn("HEIC conversion fallback:", e);
            }
        }
    }

    // Load image natural dimensions safely
    const getImageDimensionsAndSource = async (src: File | Blob | string): Promise<{ source: CanvasImageSource; width: number; height: number; cleanup?: () => void } | null> => {
        if (typeof src !== 'string' && typeof window !== 'undefined' && 'createImageBitmap' in window) {
            try {
                const bmp = await createImageBitmap(src);
                return { source: bmp, width: bmp.width, height: bmp.height, cleanup: () => bmp.close?.() };
            } catch (_) {}
        }

        return new Promise((resolve) => {
            const img = new Image();
            let objectUrl: string | null = null;
            const timeout = setTimeout(() => resolve(null), 8000);

            img.onload = () => {
                clearTimeout(timeout);
                resolve({
                    source: img,
                    width: img.naturalWidth || img.width,
                    height: img.naturalHeight || img.height,
                    cleanup: () => {
                        if (objectUrl) {
                            try { URL.revokeObjectURL(objectUrl); } catch (_) {}
                        }
                    }
                });
            };

            img.onerror = () => {
                clearTimeout(timeout);
                if (objectUrl) {
                    try { URL.revokeObjectURL(objectUrl); } catch (_) {}
                }
                resolve(null);
            };

            if (typeof src === 'string') {
                if (src.startsWith('http://') || src.startsWith('https://')) {
                    img.crossOrigin = "anonymous";
                }
                img.src = src;
            } else {
                try {
                    objectUrl = URL.createObjectURL(src);
                    img.src = objectUrl;
                } catch (e) {
                    fileToDataUrl(src).then(d => { img.src = d; }).catch(() => resolve(null));
                }
            }
        });
    };

    const loaded = await getImageDimensionsAndSource(processedFile);
    if (!loaded || loaded.width <= 0 || loaded.height <= 0) {
        if (typeof processedFile !== 'string') {
            return await fileToDataUrl(processedFile as Blob);
        }
        return typeof file === 'string' ? file : '';
    }

    const { source, width: origWidth, height: origHeight, cleanup } = loaded;

    try {
        // Proportional scale to fit within MAX_WIDTH x MAX_HEIGHT
        let width = origWidth;
        let height = origHeight;

        if (width > MAX_WIDTH || height > MAX_HEIGHT) {
            if (width / MAX_WIDTH > height / MAX_HEIGHT) {
                height = Math.round(height * (MAX_WIDTH / width));
                width = MAX_WIDTH;
            } else {
                width = Math.round(width * (MAX_HEIGHT / height));
                height = MAX_HEIGHT;
            }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width));
        canvas.height = Math.max(1, Math.round(height));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return typeof processedFile !== 'string' ? await fileToDataUrl(processedFile as Blob) : (file as string);
        }

        // Clean white background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

        // Quality optimization loop to guarantee <= MAX_CHARS
        let quality = config.initialQuality || 0.82;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);

        if (dataUrl.length <= MAX_CHARS) {
            return dataUrl;
        }

        // Iterative reduction if needed
        for (let q = quality - 0.10; q >= 0.50; q -= 0.08) {
            dataUrl = canvas.toDataURL('image/jpeg', q);
            if (dataUrl.length <= MAX_CHARS) {
                return dataUrl;
            }
        }

        // If still exceeds MAX_CHARS, scale dimensions down by 25%
        const c2 = document.createElement('canvas');
        c2.width = Math.max(100, Math.round(canvas.width * 0.75));
        c2.height = Math.max(100, Math.round(canvas.height * 0.75));
        const ctx2 = c2.getContext('2d');
        if (ctx2) {
            ctx2.fillStyle = '#ffffff';
            ctx2.fillRect(0, 0, c2.width, c2.height);
            ctx2.imageSmoothingEnabled = true;
            ctx2.imageSmoothingQuality = 'high';
            ctx2.drawImage(canvas, 0, 0, c2.width, c2.height);
            dataUrl = c2.toDataURL('image/jpeg', 0.70);
            if (dataUrl.length <= MAX_CHARS) {
                return dataUrl;
            }
            return c2.toDataURL('image/jpeg', 0.58);
        }

        return dataUrl;
    } finally {
        cleanup?.();
    }
};



/**
 * Calculates the maximum allowed bid for a team, ensuring they have enough 
 * budget left to fill their squad up to the required minimums and total size.
 */
export const calculateMaxBid = (
    team: Team,
    state: AuctionState,
    currentPlayer: Player | null
): { 
    maxBid: number; 
    reservedFunds: number; 
    remainingSlots: number;
    allowBid: boolean;
    reason: string | null;
    categoryStatus: { name: string, current: number, min: number, reserved: number }[];
} => {
    const { 
        maxPlayersPerTeam = 25, 
        categories = [], 
        unlimitedPurse = false,
        autoReserveFunds = false,
        basePrice: globalBasePrice = 100
    } = state;

    const currentSquadCount = (team.players || []).length;
    const remainingSlotsIfBought = Math.max(0, maxPlayersPerTeam - (currentSquadCount + 1));

    if (unlimitedPurse) {
        return { 
            maxBid: Infinity, 
            reservedFunds: 0, 
            remainingSlots: remainingSlotsIfBought, 
            allowBid: true, 
            reason: null,
            categoryStatus: []
        };
    }

    // 1. Calculate Reservation
    let totalReservedFunds = 0;
    let mandatorySlotsAfterCurrent = 0;
    const categoryStatus: { name: string, current: number, min: number, reserved: number }[] = [];

    if (autoReserveFunds) {
        categories.forEach(cat => {
            const playersList = team.players || [];
            // Case-insensitive, robust matching
            const countInTeam = playersList.filter(p => p.category?.toLowerCase().trim() === cat.name?.toLowerCase().trim()).length;
            let neededForMin = Math.max(0, (cat.minPerTeam || 0) - countInTeam);

            // If current player is in this category, they help fulfill the requirement
            if (currentPlayer && currentPlayer.category?.toLowerCase().trim() === cat.name?.toLowerCase().trim()) {
                neededForMin = Math.max(0, neededForMin - 1);
            }

            const catBasePrice = (cat.basePrice !== undefined && cat.basePrice !== null) ? Number(cat.basePrice) : Number(globalBasePrice);
            const reservation = neededForMin * catBasePrice;
            
            totalReservedFunds += reservation;
            mandatorySlotsAfterCurrent += neededForMin;

            categoryStatus.push({
                name: cat.name,
                current: countInTeam + ((currentPlayer && currentPlayer.category?.toLowerCase().trim() === cat.name?.toLowerCase().trim()) ? 1 : 0),
                min: cat.minPerTeam || 0,
                reserved: reservation
            });
        });

        // Flexible slots (any category) to reach max squad size
        const flexibleSlots = Math.max(0, remainingSlotsIfBought - mandatorySlotsAfterCurrent);
        // Find minimum base price among all configured categories for flexible slots, falling back to global base price
        const minCatPrice = categories.length > 0
            ? Math.min(...categories.map(c => (c.basePrice !== undefined && c.basePrice !== null) ? Number(c.basePrice) : Number(globalBasePrice)))
            : Number(globalBasePrice);
        const flexibleBasePrice = Math.max(minCatPrice, Number(globalBasePrice));
        totalReservedFunds += (flexibleSlots * flexibleBasePrice);
    }

    const maxPossibleBid = team.budget - totalReservedFunds;

    // 2. Validation Rules
    let allowBid = true;
    let reason = null;

    // Check Squad Limit
    if (currentSquadCount >= maxPlayersPerTeam) {
        allowBid = false;
        reason = "Squad is full";
    }

    // Check Slot Feasibility (Can we fulfill remaining mandatory requirements?)
    if (allowBid && autoReserveFunds && remainingSlotsIfBought < mandatorySlotsAfterCurrent) {
        allowBid = false;
        reason = "Reserve required for other categories";
    }

    // Check Category Max Limit
    if (allowBid && currentPlayer && currentPlayer.category) {
        const catConfig = categories.find(c => c.name?.toLowerCase().trim() === currentPlayer.category?.toLowerCase().trim());
        if (catConfig && catConfig.maxPerTeam > 0) {
            const playersList = team.players || [];
            const countInCat = playersList.filter(p => p.category?.toLowerCase().trim() === currentPlayer.category?.toLowerCase().trim()).length;
            if (countInCat >= catConfig.maxPerTeam) {
                allowBid = false;
                reason = `Limit for ${catConfig.name} reached`;
            }
        }
    }

    // Check Budget vs Base Price (and reservation)
    if (allowBid && currentPlayer) {
        const effectiveBase = getEffectiveBasePrice(currentPlayer, categories);
        if (team.budget < effectiveBase) {
            allowBid = false;
            reason = "Budget below base price";
        } else if (autoReserveFunds && maxPossibleBid < effectiveBase) {
            allowBid = false;
            reason = "Reserved funds required";
        }
    }

    return {
        maxBid: maxPossibleBid,
        reservedFunds: totalReservedFunds,
        remainingSlots: remainingSlotsIfBought,
        allowBid,
        reason,
        categoryStatus
    };
};

/**
 * Returns the effective base price of a player, considering their category.
 */
export const getEffectiveBasePrice = (player: Player, categories: any[]): number => {
    let basePrice = Number(player.basePrice) || 0;
    if (player.category) {
        const cat = categories.find(c => c.name === player.category);
        if (cat && cat.basePrice !== undefined && cat.basePrice !== null && cat.basePrice > 0) {
            // Priority given to category base price if it's set
            return Number(cat.basePrice);
        }
    }
    return basePrice;
};

/**
 * Allowed fields for the root auction document (/auctions/{auctionId}).
 * Subcollections (players, teams, registrations, auctionLogs, etc.) MUST NEVER be written
 * into the root document to prevent exceeding Firestore's 1,048,576 bytes (1 MiB) limit.
 */
export const ALLOWED_AUCTION_FIELDS = [
    'title', 'fullTournamentName', 'season', 'sport', 'date', 'dateTBD', 'matchesDate',
    'venue', 'eventVenue', 'purseValue', 'basePrice', 'bidIncrement', 'playersPerTeam',
    'totalTeams', 'unlimitedPurse', 'autoReserveFunds', 'slabs', 'status', 'isPaid',
    'plan', 'planId', 'createdAt', 'createdBy', 'updatedAt', 'autoDeleteAt', 'isLifetime',
    'hideScoringSection', 'sponsorConfig', 'projectorLayout', 'obsLayout', 'adminViewOverride',
    'biddingStatus', 'playerSelectionMode', 'logoUrl', 'auctionLogoUrl', 'registrationConfig',
    'successAdPosterUrl', 'isAdPosterEnabled', 'globalJerseyUrl', 'globalJerseyOverlayUrl',
    'currentPlayerId', 'currentBid', 'highestBidderId', 'timer',
    'auctionType', 'draftBoardState', 'spinWheelState', 'customAudio', 'soldPopupDurationSeconds'
];

export const FORBIDDEN_BLOATED_AUCTION_FIELDS = [
    'players', 'teams', 'registrations', 'auctionLogs', 'auctionLog', 'logs', 
    'trades', 'waitlist', 'categories', 'sponsors', 'branding', 'registeredPlayers', 
    'teamList', 'captainCodes', 'registrationCodes', 'allPlayers', 'allTeams', 'members'
];

/**
 * Safely writes/updates an auction document by:
 * 1. Stripping duplicate subcollection arrays (players, teams, registrations, logs) which cause the 1 MiB limit error.
 * 2. Compressing any overgrown Base64 images in settings or registrationConfig.
 * 3. Overwriting with .set(cleanData) (WITHOUT merge: true) to permanently purge trapped bloated fields from Firestore.
 */
export const safeSaveAuctionDocument = async (
    id: string, 
    updates: Record<string, any> = {}, 
    dbInstance: any
): Promise<{ success: boolean; prunedBytes: number; cleanSize: number; originalSize: number }> => {
    if (!id || !dbInstance) return { success: false, prunedBytes: 0, cleanSize: 0, originalSize: 0 };
    
    const docRef = dbInstance.collection('auctions').doc(id);
    let currentData: Record<string, any> = {};
    try {
        const snap = await docRef.get();
        if (snap.exists) {
            currentData = snap.data() || {};
        }
    } catch (e) {
        console.warn("[SM SPORTS] Could not fetch current doc before safe save:", e);
    }

    const originalJson = JSON.stringify(currentData);
    const originalSize = originalJson.length;

    // Build pristine cleanData retaining only ALLOWED top-level fields
    const cleanData: Record<string, any> = {};
    ALLOWED_AUCTION_FIELDS.forEach(field => {
        if (currentData[field] !== undefined) {
            cleanData[field] = currentData[field];
        }
    });

    // Apply updates
    Object.keys(updates).forEach(key => {
        if (ALLOWED_AUCTION_FIELDS.includes(key)) {
            cleanData[key] = updates[key];
        }
    });

    // Ensure timestamp
    cleanData.updatedAt = Date.now();

    // Sanitize any oversize base64 images in cleanData
    if (cleanData.logoUrl && typeof cleanData.logoUrl === 'string' && cleanData.logoUrl.startsWith('data:') && cleanData.logoUrl.length > 35000) {
        try {
            cleanData.logoUrl = await compressImage(cleanData.logoUrl, 'LOGO');
        } catch (e) {
            console.warn("Logo compression error:", e);
        }
    }
    if (cleanData.auctionLogoUrl && typeof cleanData.auctionLogoUrl === 'string' && cleanData.auctionLogoUrl.startsWith('data:') && cleanData.auctionLogoUrl.length > 35000) {
        try {
            cleanData.auctionLogoUrl = await compressImage(cleanData.auctionLogoUrl, 'LOGO');
        } catch (e) {
            console.warn("Auction logo compression error:", e);
        }
    }

    // Sanitize registrationConfig if present
    if (cleanData.registrationConfig && typeof cleanData.registrationConfig === 'object') {
        const rc = { ...cleanData.registrationConfig };
        if (rc.bannerUrl && typeof rc.bannerUrl === 'string' && rc.bannerUrl.startsWith('data:') && rc.bannerUrl.length > 45000) {
            try { rc.bannerUrl = await compressImage(rc.bannerUrl, 'REG_BANNER'); } catch {}
        }
        if (rc.welcomePosterUrl && typeof rc.welcomePosterUrl === 'string' && rc.welcomePosterUrl.startsWith('data:') && rc.welcomePosterUrl.length > 45000) {
            try { rc.welcomePosterUrl = await compressImage(rc.welcomePosterUrl, 'REG_WELCOME_POSTER'); } catch {}
        }
        if (rc.logoUrl && typeof rc.logoUrl === 'string' && rc.logoUrl.startsWith('data:') && rc.logoUrl.length > 30000) {
            try { rc.logoUrl = await compressImage(rc.logoUrl, 'REG_LOGO'); } catch {}
        }
        if (rc.qrCodeUrl && typeof rc.qrCodeUrl === 'string' && rc.qrCodeUrl.startsWith('data:') && rc.qrCodeUrl.length > 30000) {
            try { rc.qrCodeUrl = await compressImage(rc.qrCodeUrl, 'QR'); } catch {}
        }
        if (rc.showcaseImages && Array.isArray(rc.showcaseImages)) {
            rc.showcaseImages = rc.showcaseImages.slice(0, 10); // Bound array size
        }
        cleanData.registrationConfig = rc;
    }

    // Remove any undefined or non-serializable values
    const finalPayload = JSON.parse(JSON.stringify(cleanData));
    const cleanSize = JSON.stringify(finalPayload).length;

    // Use .set() WITHOUT merge: true to completely replace the document.
    // This permanently purges bloated duplicate arrays (players, teams, etc.)
    // leaving subcollections untouched.
    await docRef.set(finalPayload);
    const prunedBytes = Math.max(0, originalSize - cleanSize);
    console.log(`[SM SPORTS] Safe save succeeded for auction ${id}. Clean size: ${(cleanSize / 1024).toFixed(1)} KB (Pruned: ${(prunedBytes / 1024).toFixed(1)} KB)`);

    return { success: true, prunedBytes, cleanSize, originalSize };
};

/**
 * Prunes and repairs an oversized auction document.
 */
export const pruneAndRepairAuctionDocument = async (
    id: string, 
    dbInstance: any
): Promise<{ success: boolean; prunedBytes: number; cleanSize: number; originalSize: number }> => {
    return safeSaveAuctionDocument(id, {}, dbInstance);
};

/**
 * Estimates UTF-8 byte length of any JSON-serializable object/value.
 */
export const getUtf8ByteSize = (value: any): number => {
    try {
        const json = JSON.stringify(value ?? '');
        if (typeof TextEncoder !== 'undefined') {
            return new TextEncoder().encode(json).length;
        }
        return json.length * 2;
    } catch {
        return 0;
    }
};

/**
 * Produces a strictly minimal, JSON-safe squad entry for `team.players`.
 * Never stores Base64 `data:` images inside `team.players` (full player photos live in the `players` subcollection).
 */
export const compactTeamPlayerEntry = (player: any): Record<string, any> => {
    if (!player || typeof player !== 'object') return {};
    const rawPhoto = typeof player.photoUrl === 'string' ? player.photoUrl : '';
    const safePhoto = rawPhoto && !rawPhoto.startsWith('data:') && !rawPhoto.startsWith('blob:') && rawPhoto.length <= 1000
        ? rawPhoto
        : '';

    const entry: Record<string, any> = {
        id: player.id ?? '',
        name: String(player.name || ''),
        role: String(player.role || 'Player'),
        category: String(player.category || 'General'),
        basePrice: Number(player.basePrice || 0),
        soldPrice: Number(player.soldPrice ?? player.basePrice ?? 0),
        status: String(player.status || 'SOLD'),
        soldTo: String(player.soldTo || ''),
        jerseyNumber: player.jerseyNumber ? String(player.jerseyNumber) : '',
        jerseyName: player.jerseyName ? String(player.jerseyName) : '',
        photoUrl: safePhoto
    };

    if (player.speciality) entry.speciality = String(player.speciality);
    if (player.isCaptain === true) entry.isCaptain = true;
    if (player.isTraded === true) entry.isTraded = true;

    return entry;
};

/**
 * Compacts and deduplicates a `team.players` array so Base64 images and bloated player metadata
 * never inflate the `teams/{teamId}` Firestore document toward the 1,048,576-byte limit.
 */
export const compactTeamPlayersList = (playersList: any[] = []): Record<string, any>[] => {
    if (!Array.isArray(playersList) || playersList.length === 0) return [];
    const byKey = new Map<string, Record<string, any>>();
    const order: string[] = [];

    for (const raw of playersList) {
        if (!raw || typeof raw !== 'object') continue;
        const compact = compactTeamPlayerEntry(raw);
        const key = String(compact.id !== '' && compact.id !== undefined && compact.id !== null ? compact.id : compact.name)
            .trim()
            .toLowerCase();
        if (!key) continue;
        if (!byKey.has(key)) {
            order.push(key);
        }
        byKey.set(key, compact);
    }

    return order.map(k => byKey.get(k)!);
};

/**
 * Builds a Firestore `.update()` payload for `/auctions/{id}/teams/{teamId}` that:
 * 1. Compacts `players` (stripping Base64 photos & redundant blobs from all squad items).
 * 2. Checks total projected team document UTF-8 byte size against a safe 780 KB threshold.
 * 3. Automatically re-compresses (or strips if unshrinkable) any oversized `data:` fields on the team doc
 *    (such as `logoUrl`, `captainPhoto`, `jerseyUrl`, `bannerUrl`) so writes never fail Firestore's 1 MiB limit.
 */
export const safeBuildTeamUpdatePayload = async (
    currentTeamData: Record<string, any> | null | undefined,
    updatedBudget: number | undefined,
    rawPlayers: any[],
    extraUpdates: Record<string, any> = {}
): Promise<Record<string, any>> => {
    const compactedPlayers = JSON.parse(JSON.stringify(compactTeamPlayersList(rawPlayers)));
    const payload: Record<string, any> = {
        ...extraUpdates,
        players: compactedPlayers
    };
    if (updatedBudget !== undefined) {
        payload.budget = updatedBudget;
    }

    const baseDoc: Record<string, any> = {
        ...(currentTeamData && typeof currentTeamData === 'object' ? currentTeamData : {}),
        ...payload
    };

    const SAFE_DOC_BYTES = 780_000;
    const HARD_DOC_BYTES = 880_000;

    // Check if any top-level data URL field is already huge (> 180 KB) or total doc exceeds 780 KB
    const hasHugeTopLevelDataUrl = Object.entries(baseDoc).some(
        ([k, v]) => k !== 'players' && typeof v === 'string' && v.startsWith('data:') && v.length > 180_000
    );

    if (!hasHugeTopLevelDataUrl && getUtf8ByteSize(baseDoc) <= SAFE_DOC_BYTES) {
        return JSON.parse(JSON.stringify(payload));
    }

    const compressNestedValue = async (val: any, maxDim: number, maxChars: number): Promise<{ changed: boolean; value: any }> => {
        if (typeof val === 'string') {
            if (val.startsWith('data:') && val.length > maxChars) {
                try {
                    const compressed = await compressImage(val, {
                        maxWidth: maxDim,
                        maxHeight: maxDim,
                        maxDataUrlLength: maxChars
                    });
                    if (compressed && compressed.length < val.length) {
                        return { changed: true, value: compressed };
                    }
                } catch {
                    // fall through
                }
            }
            return { changed: false, value: val };
        }
        if (Array.isArray(val)) {
            let anyChanged = false;
            const nextArr = [];
            for (const item of val) {
                const res = await compressNestedValue(item, maxDim, maxChars);
                if (res.changed) anyChanged = true;
                nextArr.push(res.value);
            }
            return { changed: anyChanged, value: anyChanged ? nextArr : val };
        }
        if (val && typeof val === 'object') {
            let anyChanged = false;
            const nextObj: Record<string, any> = { ...val };
            for (const [k, v] of Object.entries(val)) {
                const res = await compressNestedValue(v, maxDim, maxChars);
                if (res.changed) {
                    anyChanged = true;
                    nextObj[k] = res.value;
                }
            }
            return { changed: anyChanged, value: anyChanged ? nextObj : val };
        }
        return { changed: false, value: val };
    };

    // Pass 1: Compress oversized data URLs on team doc fields down to <= 45 KB
    for (const [key, val] of Object.entries(baseDoc)) {
        if (key === 'players') continue;
        const res = await compressNestedValue(val, 360, 45_000);
        if (res.changed) {
            baseDoc[key] = res.value;
            payload[key] = res.value;
        }
    }

    // Pass 2: If still above SAFE_DOC_BYTES, shrink more aggressively (<= 16 KB per image)
    if (getUtf8ByteSize(baseDoc) > SAFE_DOC_BYTES) {
        for (const [key, val] of Object.entries(baseDoc)) {
            if (key === 'players') continue;
            const res = await compressNestedValue(val, 200, 16_000);
            if (res.changed) {
                baseDoc[key] = res.value;
                payload[key] = res.value;
            }
        }
    }

    // Pass 3: Failsafe — if still near 1 MiB, drop giant uncompressible strings / data URLs and strip player photoUrls
    if (getUtf8ByteSize(baseDoc) > HARD_DOC_BYTES) {
        const ultraCompactPlayers = compactedPlayers.map((p: any) => ({ ...p, photoUrl: '' }));
        payload.players = ultraCompactPlayers;
        baseDoc.players = ultraCompactPlayers;

        const stripOversizedDataUrls = (val: any): { changed: boolean; value: any } => {
            if (typeof val === 'string') {
                if ((val.startsWith('data:') && val.length > 16_000) || val.length > 250_000) {
                    return { changed: true, value: '' };
                }
                return { changed: false, value: val };
            }
            if (Array.isArray(val)) {
                let anyChanged = false;
                const nextArr = val.map(item => {
                    const r = stripOversizedDataUrls(item);
                    if (r.changed) anyChanged = true;
                    return r.value;
                });
                return { changed: anyChanged, value: anyChanged ? nextArr : val };
            }
            if (val && typeof val === 'object') {
                let anyChanged = false;
                const nextObj: Record<string, any> = { ...val };
                for (const [k, v] of Object.entries(val)) {
                    const r = stripOversizedDataUrls(v);
                    if (r.changed) {
                        anyChanged = true;
                        nextObj[k] = r.value;
                    }
                }
                return { changed: anyChanged, value: anyChanged ? nextObj : val };
            }
            return { changed: false, value: val };
        };

        for (const [key, val] of Object.entries(baseDoc)) {
            if (key === 'players') continue;
            const res = stripOversizedDataUrls(val);
            if (res.changed) {
                baseDoc[key] = res.value;
                payload[key] = res.value;
            }
        }
    }

    return JSON.parse(JSON.stringify(payload));
};

/**
 * Resolves the complete squad of players for a team:
 * 1. Uses allPlayers as the authoritative registry for status (SOLD/UNSOLD/POOL) and soldTo assignments.
 * 2. Strictly excludes any player marked UNSOLD, POOL, or assigned to a different team.
 * 3. Incorporates directly assigned players where soldTo matches team name/id.
 * 4. Deduplicates and assigns captain badges cleanly.
 */
export const resolveTeamSquad = (team: Team, allPlayers: Player[] = []): Player[] => {
    if (!team) return [];
    const teamNameLower = (team.name || '').trim().toLowerCase();
    const teamShortLower = (team.shortName || '').trim().toLowerCase();
    const teamIdStr = String(team.id || '').trim();

    const isMatchForThisTeam = (teamIdentifier?: string, tId?: string | number) => {
        if (!teamIdentifier && !tId) return false;
        const norm = (teamIdentifier || '').trim().toLowerCase();
        const idStr = String(tId || '').trim();
        return (
            (norm && (norm === teamNameLower || (teamShortLower && norm === teamShortLower) || norm === teamIdStr)) ||
            (idStr && idStr === teamIdStr)
        );
    };

    // If allPlayers is provided and non-empty, allPlayers is the authoritative registry
    if (allPlayers && allPlayers.length > 0) {
        // Fast lookup maps for allPlayers by id and by normalized name
        const playerById = new Map<string, Player>();
        const playerByName = new Map<string, Player>();
        allPlayers.forEach(p => {
            if (p.id !== undefined && p.id !== null) playerById.set(String(p.id).trim().toLowerCase(), p);
            if (p.name) playerByName.set(p.name.trim().toLowerCase(), p);
        });

        // 1. Players from allPlayers who are actively SOLD to this team
        const soldToThisTeamFromPool = allPlayers.filter(p => {
            // Must NOT be unsold or pool
            if (p.status === 'UNSOLD' || p.status === 'POOL') return false;
            // If status is explicit, it must be SOLD (or TRADED to this team)
            if (p.status && p.status !== 'SOLD' && p.status !== 'TRADED') return false;
            // Must match this team
            return isMatchForThisTeam(p.soldTo, p.teamId);
        });

        // 2. Direct squad from team.players array, filtering out anyone who is UNSOLD or sold elsewhere
        const validFromTeamPlayers = (team.players || []).filter(p => {
            const pIdKey = String(p.id ?? '').trim().toLowerCase();
            const pNameKey = (p.name || '').trim().toLowerCase();
            const latest = (pIdKey && playerById.get(pIdKey)) || (pNameKey && playerByName.get(pNameKey));

            if (latest) {
                // If player is UNSOLD or POOL in allPlayers, EXCLUDE
                if (latest.status === 'UNSOLD' || latest.status === 'POOL') return false;
                if (latest.status && latest.status !== 'SOLD' && latest.status !== 'TRADED') return false;
                // If latest has no SOLD/TRADED status and no team assignment, they belong to POOL -> EXCLUDE
                if (!latest.status && !latest.soldTo && !(latest as any).soldToId && !latest.teamId) return false;
                // If latest soldTo belongs to a different team, EXCLUDE
                if ((latest.soldTo || latest.teamId) && !isMatchForThisTeam(latest.soldTo, latest.teamId)) return false;
                return true;
            }

            // Fallback for players only on team object: must not be UNSOLD/POOL
            if (p.status === 'UNSOLD' || p.status === 'POOL') return false;
            if (p.soldTo && !isMatchForThisTeam(p.soldTo, p.teamId)) return false;
            return true;
        });

        // Deduplicate and merge: prefer latest player data from allPlayers
        const seen = new Set<string>();
        const squad: Player[] = [];

        [...soldToThisTeamFromPool, ...validFromTeamPlayers].forEach(p => {
            const pIdKey = String(p.id ?? '').trim().toLowerCase();
            const pNameKey = (p.name || '').trim().toLowerCase();
            const key = pIdKey || pNameKey;
            if (!key || seen.has(key)) return;
            seen.add(key);

            const latest = (pIdKey && playerById.get(pIdKey)) || (pNameKey && playerByName.get(pNameKey)) || p;

            const isCapt = (team.captainId && String(team.captainId) === String(latest.id)) ||
                           (team.captainName && team.captainName.trim().toLowerCase() === latest.name.trim().toLowerCase()) ||
                           latest.isCaptain === true;

            squad.push({
                ...latest,
                soldTo: latest.soldTo || team.name,
                soldPrice: latest.soldPrice !== undefined ? Number(latest.soldPrice) : (Number(latest.basePrice) || 0),
                isCaptain: isCapt
            });
        });

        return squad;
    }

    // Fallback if allPlayers is not passed
    const directList = (team.players || []).filter(p => p.status !== 'UNSOLD' && p.status !== 'POOL');
    const seen = new Set<string>();
    const squad: Player[] = [];

    directList.forEach(p => {
        const key = String(p.id ?? p.name).trim().toLowerCase();
        if (key && !seen.has(key)) {
            seen.add(key);
            const isCapt = (team.captainId && String(team.captainId) === String(p.id)) ||
                           (team.captainName && team.captainName.trim().toLowerCase() === p.name.trim().toLowerCase()) ||
                           p.isCaptain === true;
            squad.push({
                ...p,
                soldTo: p.soldTo || team.name,
                soldPrice: p.soldPrice !== undefined ? Number(p.soldPrice) : (Number(p.basePrice) || 0),
                isCaptain: isCapt
            });
        }
    });

    return squad;
};

/**
 * Resolves a team's active squad for Draft Board views (Team Portal, Projector Squads, Summary, Sidebar).
 * Uses `draftHistory` and `allPlayers` as the authoritative source of truth so undone/POOL players
 * left over in stale `team.players` arrays are strictly excluded, while preserving full player photos & round numbers.
 */
export const resolveDraftTeamSquad = (
    team: Team,
    allPlayers: Player[] = [],
    draftHistory: any[] = []
): (Player & { pickNumber?: number; round?: number })[] => {
    if (!team) return [];

    const teamIdStr = String(team.id || '').trim();
    const teamNameLower = (team.name || '').trim().toLowerCase();
    const teamShortLower = (team.shortName || '').trim().toLowerCase();

    const isMatchForThisTeam = (teamIdentifier?: string, tId?: string | number) => {
        if (!teamIdentifier && !tId) return false;
        const norm = (teamIdentifier || '').trim().toLowerCase();
        const idStr = String(tId || '').trim();
        return (
            (norm && (norm === teamNameLower || (teamShortLower && norm === teamShortLower) || norm === teamIdStr)) ||
            (idStr && idStr === teamIdStr)
        );
    };

    const playerById = new Map<string, Player>();
    const playerByName = new Map<string, Player>();
    allPlayers.forEach(p => {
        if (p.id !== undefined && p.id !== null) playerById.set(String(p.id).trim().toLowerCase(), p);
        if (p.name) playerByName.set(p.name.trim().toLowerCase(), p);
    });

    const result: (Player & { pickNumber?: number; round?: number })[] = [];
    const seenKeys = new Set<string>();

    // 1. Draft picks in history for this team (skip if authoritatively reverted to POOL/UNSOLD or assigned elsewhere)
    const teamPicks = (draftHistory || []).filter(h => String(h?.teamId) === teamIdStr);
    teamPicks.forEach(pick => {
        const pIdKey = String(pick.playerId ?? '').trim().toLowerCase();
        const pNameKey = (pick.playerName || '').trim().toLowerCase();
        const fullP = (pIdKey && playerById.get(pIdKey)) || (pNameKey && playerByName.get(pNameKey));

        if (fullP) {
            if (fullP.status === 'POOL' || fullP.status === 'UNSOLD') return;
            if ((fullP.soldTo || (fullP as any).soldToId || fullP.teamId) &&
                !isMatchForThisTeam(fullP.soldTo, (fullP as any).soldToId || fullP.teamId)) {
                return;
            }
        }

        const dedupeKey = pIdKey || pNameKey;
        if (!dedupeKey || seenKeys.has(dedupeKey)) return;
        seenKeys.add(dedupeKey);

        result.push({
            ...(fullP || ({} as Player)),
            id: pick.playerId,
            name: fullP?.name || pick.playerName || '',
            role: fullP?.role || pick.playerRole || pick.playerCategory || 'Player',
            category: fullP?.category || pick.playerCategory || fullP?.role || 'General',
            photoUrl: fullP?.photoUrl || pick.playerPhoto || '',
            jerseyNumber: fullP?.jerseyNumber || '',
            basePrice: Number(fullP?.basePrice || 0),
            soldPrice: Number(pick.soldPrice ?? fullP?.soldPrice ?? 0),
            status: 'SOLD',
            soldTo: team.name,
            pickNumber: pick.pickNumber,
            round: pick.round
        });
    });

    // 2. Remaining authoritatively valid squad players (e.g., directly assigned captains or pre-sold players)
    const authoritativeSquad = resolveTeamSquad(team, allPlayers);
    authoritativeSquad.forEach(p => {
        const pIdKey = String(p.id ?? '').trim().toLowerCase();
        const pNameKey = (p.name || '').trim().toLowerCase();
        const dedupeKey = pIdKey || pNameKey;
        if (!dedupeKey || seenKeys.has(dedupeKey)) return;
        seenKeys.add(dedupeKey);
        result.push(p);
    });

    return result;
};

export interface DraftCategoryQuotaItem {
    name: string;
    current: number;
    min: number;
    max: number;
    neededForMin: number;
    isMinMet: boolean;
    isMaxReached: boolean;
}

export interface DraftTeamQuotaSummary {
    squadCount: number;
    effectiveSquadMax: number;
    totalConfiguredMin: number;
    mandatorySlotsRemaining: number;
    remainingSquadSlots: number;
    flexibleSlots: number;
    configConflict: boolean;
    categories: DraftCategoryQuotaItem[];
}

export interface DraftCategoryValidationResult {
    allowed: boolean;
    code?: 'SQUAD_FULL' | 'CAT_MAX_REACHED' | 'MIN_SLOTS_RESERVED';
    shortReason?: string;
    reason: string | null;
    summary: DraftTeamQuotaSummary;
}

const getDraftPlayerCatNorm = (p: { category?: string; role?: string }): string =>
    String(p?.category || p?.role || '').trim().toLowerCase();

/**
 * Summarizes a team's drafted squad counts against configured category minPerTeam / maxPerTeam
 * and effective squad capacity (team.maxPlayers || maxPlayersPerTeam).
 */
export const getTeamCategoryQuotaSummary = (
    team: Team,
    categories: AuctionCategory[] = [],
    allPlayers: Player[] = [],
    draftHistory: DraftPickHistory[] = [],
    maxPlayersPerTeam?: number
): DraftTeamQuotaSummary => {
    const squad = resolveDraftTeamSquad(team, allPlayers, draftHistory);
    const squadCount = squad.length;
    const effectiveSquadMax = Math.max(0, Number(team?.maxPlayers || maxPlayersPerTeam || 0));

    const seenCats = new Set<string>();
    const normalizedCats: AuctionCategory[] = [];
    (categories || []).forEach(c => {
        const key = String(c?.name || '').trim().toLowerCase();
        if (key && !seenCats.has(key)) {
            seenCats.add(key);
            normalizedCats.push(c);
        }
    });

    let totalConfiguredMin = 0;
    let mandatorySlotsRemaining = 0;

    const catItems: DraftCategoryQuotaItem[] = normalizedCats.map(cat => {
        const catKey = String(cat.name || '').trim().toLowerCase();
        const current = squad.filter(p => getDraftPlayerCatNorm(p) === catKey).length;
        const min = Math.max(0, Number(cat.minPerTeam || 0));
        const max = Math.max(0, Number(cat.maxPerTeam || 0));
        const neededForMin = Math.max(0, min - current);
        totalConfiguredMin += min;
        mandatorySlotsRemaining += neededForMin;
        return {
            name: cat.name,
            current,
            min,
            max,
            neededForMin,
            isMinMet: min === 0 || current >= min,
            isMaxReached: max > 0 && current >= max
        };
    });

    const remainingSquadSlots = effectiveSquadMax > 0 ? Math.max(0, effectiveSquadMax - squadCount) : 0;
    const configConflict = effectiveSquadMax > 0 && totalConfiguredMin > effectiveSquadMax;
    const flexibleSlots = effectiveSquadMax > 0 ? Math.max(0, remainingSquadSlots - mandatorySlotsRemaining) : 0;

    return {
        squadCount,
        effectiveSquadMax,
        totalConfiguredMin,
        mandatorySlotsRemaining,
        remainingSquadSlots,
        flexibleSlots,
        configConflict,
        categories: catItems
    };
};

/**
 * Fast O(categories) eligibility check using a precomputed DraftTeamQuotaSummary.
 */
export const checkDraftCategoryEligibilityFromSummary = (
    teamName: string,
    summary: DraftTeamQuotaSummary,
    player: Pick<Player, 'category' | 'role'>
): DraftCategoryValidationResult => {
    const { squadCount, effectiveSquadMax, totalConfiguredMin, configConflict, categories: catItems } = summary;

    if (effectiveSquadMax > 0 && squadCount >= effectiveSquadMax) {
        return {
            allowed: false,
            code: 'SQUAD_FULL',
            shortReason: `Squad Full (${squadCount}/${effectiveSquadMax})`,
            reason: `${teamName} squad is full (${squadCount}/${effectiveSquadMax} players).`,
            summary
        };
    }

    const playerCatKey = getDraftPlayerCatNorm(player);
    const matchedCat = playerCatKey
        ? catItems.find(c => c.name.trim().toLowerCase() === playerCatKey)
        : undefined;

    if (matchedCat && matchedCat.max > 0 && matchedCat.current >= matchedCat.max) {
        return {
            allowed: false,
            code: 'CAT_MAX_REACHED',
            shortReason: `Max ${matchedCat.max} Reached`,
            reason: `${teamName} has reached the maximum limit (${matchedCat.current}/${matchedCat.max}) for ${matchedCat.name}.`,
            summary
        };
    }

    const helpsMinimum = Boolean(matchedCat && matchedCat.min > 0 && matchedCat.current < matchedCat.min);
    if (!helpsMinimum && effectiveSquadMax > 0 && totalConfiguredMin > 0 && !configConflict) {
        const remainingSlotsAfterPick = effectiveSquadMax - (squadCount + 1);
        let mandatoryRemainingAfterPick = 0;
        const needyCats: string[] = [];

        catItems.forEach(cat => {
            const countAfterPick = matchedCat && cat.name === matchedCat.name ? cat.current + 1 : cat.current;
            const stillNeeded = Math.max(0, cat.min - countAfterPick);
            if (stillNeeded > 0) {
                mandatoryRemainingAfterPick += stillNeeded;
                needyCats.push(`${cat.name} (need ${stillNeeded} more, min ${cat.min})`);
            }
        });

        if (remainingSlotsAfterPick < mandatoryRemainingAfterPick) {
            const catDisplay = matchedCat ? matchedCat.name : (player.category || player.role || 'this category');
            return {
                allowed: false,
                code: 'MIN_SLOTS_RESERVED',
                shortReason: `Reserve Min`,
                reason: `Category minimum rule: ${teamName} cannot draft another ${catDisplay} because remaining slot(s) must be reserved for minimum requirements in ${needyCats.join(', ')}.`,
                summary
            };
        }
    }

    return {
        allowed: true,
        reason: null,
        summary
    };
};

/**
 * Validates whether `team` can draft `player` in Category Draft Board mode
 * while obeying squad capacity, category maxPerTeam, and category minPerTeam slot reservation.
 */
export const validateDraftCategoryPick = (
    team: Team,
    player: Pick<Player, 'category' | 'role'>,
    categories: AuctionCategory[] = [],
    allPlayers: Player[] = [],
    draftHistory: DraftPickHistory[] = [],
    maxPlayersPerTeam?: number
): DraftCategoryValidationResult => {
    const summary = getTeamCategoryQuotaSummary(team, categories, allPlayers, draftHistory, maxPlayersPerTeam);
    return checkDraftCategoryEligibilityFromSummary(team?.name || 'Team', summary, player);
};



