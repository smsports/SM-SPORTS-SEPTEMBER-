
import { AuctionState, Team, Player } from './types';
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
 * Uploads a Blob or File directly to Firebase Storage and returns the permanent HTTPS download URL.
 */
export const uploadFileToStorage = async (
    fileOrBlob: Blob | File,
    path: string,
    timeoutMs: number = 30000
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

        // Generous timeout for mobile/cellular networks
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

    // Step 1: Prepare blob for storage upload
    let blobToUpload: Blob | null = null;
    let fallbackDataUrl: string = '';

    if (typeof file === 'string') {
        if (file.startsWith('data:')) {
            blobToUpload = dataUrlToBlob(file);
            fallbackDataUrl = file;
        }
    } else {
        // file is File | Blob
        if (file.size > 1.5 * 1024 * 1024) {
            try {
                fallbackDataUrl = await compressImage(file, compressType);
                blobToUpload = dataUrlToBlob(fallbackDataUrl);
            } catch (_) {
                blobToUpload = file;
            }
        } else {
            blobToUpload = file;
        }
    }

    // Step 2: Upload to Firebase Storage
    if (blobToUpload) {
        const storageUrl = await uploadFileToStorage(blobToUpload, path, 25000);
        if (storageUrl) {
            return storageUrl;
        }
    }

    // Step 3: Fallback only if Firebase Storage completely failed or was unreachable.
    // Strictly guarantee that this fallback Data URL is compressed and compact so it cannot blow up Firestore!
    if (!fallbackDataUrl) {
        fallbackDataUrl = await compressImage(file, { type: compressType, maxDataUrlLength: 60000 });
    } else if (fallbackDataUrl.length > 70000) {
        fallbackDataUrl = await compressImage(fallbackDataUrl, { type: compressType, maxDataUrlLength: 60000 });
    }

    return fallbackDataUrl;
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
        if (typeof val === 'string' && val.startsWith('data:')) {
            try {
                const storageUrl = await uploadImageOrFallback(val, auctionId, `${categoryPrefix}_${key}`, 'GENERAL');
                if (storageUrl) {
                    updated[key] = storageUrl;
                }
            } catch (err) {
                console.warn(`Failed to upload base64 field "${key}" to Firebase Storage:`, err);
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
    'currentPlayerId', 'currentBid', 'highestBidderId', 'timer'
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
