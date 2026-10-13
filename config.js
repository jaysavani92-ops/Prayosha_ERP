import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.38.4/+esm';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.18';

// ==========================================
// 1. PRIMARY SUPABASE CONFIGURATION
// ==========================================
export const SUPABASE_URL = 'https://lmzowftkbjdzqmmgxcrf.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_ey0ZqXs2eGyaJ5y1ZWtrnA_Rul705D0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==========================================
// 2. OFFSHORE DATABASE (TELEMETRY & AUDIT VAULT)
// ==========================================
export const ROKDU_SUPABASE_URL = 'https://mvbeaovwgodghgumltxr.supabase.co';
export const ROKDU_SUPABASE_ANON_KEY = 'sb_publishable_yh39iD8o60tmdlbv4RU6nw_kNstlhGv';

export const rokduSupabase = createClient(ROKDU_SUPABASE_URL, ROKDU_SUPABASE_ANON_KEY);

// ==========================================
// 3. CLOUDFLARE R2 CONFIGURATION
// ==========================================
export const R2_ENDPOINT = 'https://fbfcd5f694d5a76bbc3d9f0226a9e47c.r2.cloudflarestorage.com';
export const R2_ACCESS_KEY_ID = '54aa02b0716423008cf69a17d96c9dde';
export const R2_SECRET_ACCESS_KEY = '9e10b9b5318a2cd375636cf44c18b9f0f5ab16a598cb3222ad61b0a81d9a6f68';

export const R2_BUCKET_NAME = 'prayosha-media-vault';
export const R2_PUBLIC_URL = 'https://pub-7b98029994144de2a8a4e2ac9b19d9f2.r2.dev';

// Zero-dependency native browser AWS S3 signer
const r2 = new AwsClient({
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
});

// Backward-compatibility class
export class PutObjectCommand {
    constructor(input) {
        this.input = input;
    }
}

// Backward-compatible r2Client wrapper
export const r2Client = {
    async send(command) {
        const { Bucket, Key, Body, ContentType } = command?.input || command || {};
        const uploadUrl = `${R2_ENDPOINT}/${Bucket || R2_BUCKET_NAME}/${Key}`;
        try {
            const response = await r2.fetch(uploadUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': ContentType || (Body && Body.type) || 'application/octet-stream'
                },
                body: Body
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`R2 Upload Error (${response.status}): ${errText}`);
            }
            return response;
        } catch (err) {
            console.error('[r2Client.send Error]:', err);
            throw err;
        }
    }
};

// ==========================================
// 4. R2 UPLOAD HELPER FUNCTION (FAIL-SAFE & RESILIENT)
// ==========================================
export async function uploadToR2(file, folderPath) {
    if (!file) return null;
    
    // Create unique filename
    const fileExtension = file.name.split('.').pop();
    const uniqueFileName = `${folderPath}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExtension}`;
    const uploadUrl = `${R2_ENDPOINT}/${R2_BUCKET_NAME}/${uniqueFileName}`;

    try {
        const response = await r2.fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': file.type || 'application/octet-stream',
            },
            body: file,
        });

        if (!response.ok) {
            const errText = await response.text();
            console.warn(`[R2 Upload Non-Fatal Warning (${response.status})]: ${errText}`);
            return null;
        }

        return `${R2_PUBLIC_URL}/${uniqueFileName}`;
    } catch (error) {
        // Log clean warning without throwing so that calling forms (like create-project)
        // do not crash and can successfully complete primary Supabase database insertions.
        console.warn("[R2 Storage Warning]: Photo upload could not complete due to CORS or storage policy. Proceeding to save project architecture without photo.", error);
        return null;
    }
}

// ==========================================
// 5. GLOBAL CONFIGURATION & RUNTIME BRIDGES
// ==========================================
export const CONFIG = {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    ROKDU_SUPABASE_URL,
    ROKDU_SUPABASE_ANON_KEY,
    R2_ENDPOINT,
    R2_BUCKET_NAME,
    R2_PUBLIC_URL
};

// Attach to window for global browser availability
if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
    window.SUPABASE_URL = SUPABASE_URL;
    window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
    window.ROKDU_SUPABASE_URL = ROKDU_SUPABASE_URL;
    window.ROKDU_SUPABASE_ANON_KEY = ROKDU_SUPABASE_ANON_KEY;
    window.supabaseClient = supabase;
    window.rokduClient = rokduSupabase;
    window.uploadToR2 = uploadToR2;
}

export default {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    ROKDU_SUPABASE_URL,
    ROKDU_SUPABASE_ANON_KEY,
    supabase,
    rokduSupabase,
    uploadToR2,
    r2Client,
    CONFIG
};