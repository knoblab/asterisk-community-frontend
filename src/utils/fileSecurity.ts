/**
 * Secure File Attachment & Upload Validation Utilities
 * Hardened against RTL (Right-to-Left) override attacks, path traversal, double extension tricks,
 * and dangerous executables/scripts. Enforces 25MB file size limit.
 */

// Unicode Bidirectional Control Characters & Invisible Format Characters:
// U+061C: ARABIC LETTER MARK (ALM)
// U+200E: LEFT-TO-RIGHT MARK (LRM)
// U+200F: RIGHT-TO-LEFT MARK (RLM)
// U+202A: LEFT-TO-RIGHT EMBEDDING (LRE)
// U+202B: RIGHT-TO-LEFT EMBEDDING (RLE)
// U+202C: POP DIRECTIONAL FORMATTING (PDF)
// U+202D: LEFT-TO-RIGHT OVERRIDE (LRO)
// U+202E: RIGHT-TO-LEFT OVERRIDE (RLO)
// U+2066: LEFT-TO-RIGHT ISOLATE (LRI)
// U+2067: RIGHT-TO-LEFT ISOLATE (RLI)
// U+2068: FIRST STRONG ISOLATE (FSI)
// U+2069: POP DIRECTIONAL ISOLATE (PDI)
// U+200B-U+200D, U+FEFF: ZERO-WIDTH SPACES & BOM
export const BIDI_CONTROL_REGEX = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069\u200B-\u200D\uFEFF]/g;

export const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25MB Limit

export type FileCategory = 'image' | 'video' | 'audio' | 'file';

export type FileKind = 'pdf' | 'archive' | 'document' | 'audio' | 'video' | 'image' | 'file';

export const containsBidiOrRtl = (str?: string | null): boolean => {
  if (!str || typeof str !== 'string') return false;
  return /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069\u200B-\u200D\uFEFF]/.test(str);
};

export const removeBidiControlChars = (str?: string | null): string => {
  if (!str || typeof str !== 'string') return '';
  return str.replace(BIDI_CONTROL_REGEX, '');
};

// Dangerous executable & server script extensions that must NEVER be allowed
export const DANGEROUS_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.bash', '.ps1', '.psm1', '.msi', '.dll', '.com',
  '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh', '.mjs', '.cjs', '.jar', '.scr',
  '.pif', '.reg', '.hta', '.cpl', '.bin', '.apk', '.app', '.dmg', '.iso', '.img',
  '.sys', '.drv', '.php', '.php3', '.php4', '.php5', '.phtml', '.phar', '.asp',
  '.aspx', '.jsp', '.jspx', '.cgi', '.pl', '.py', '.pyw', '.rb', '.rbw', '.html',
  '.htm', '.xhtml', '.shtml', '.svg', '.xml', '.xsl', '.xslt', '.swf', '.htaccess',
  '.htpasswd', '.env', '.ini', '.config', '.lnk', '.desktop'
]);

// Whitelist of allowed extensions, MIME types, and categories
export const ALLOWED_EXTENSIONS_MAP: Record<string, { mime: string; category: FileCategory }> = {
  // Images
  '.jpg': { mime: 'image/jpeg', category: 'image' },
  '.jpeg': { mime: 'image/jpeg', category: 'image' },
  '.png': { mime: 'image/png', category: 'image' },
  '.gif': { mime: 'image/gif', category: 'image' },
  '.webp': { mime: 'image/webp', category: 'image' },
  // Videos
  '.mp4': { mime: 'video/mp4', category: 'video' },
  '.webm': { mime: 'video/webm', category: 'video' },
  '.ogg': { mime: 'video/ogg', category: 'video' },
  // Documents
  '.pdf': { mime: 'application/pdf', category: 'file' },
  '.txt': { mime: 'text/plain', category: 'file' },
  '.csv': { mime: 'text/csv', category: 'file' },
  '.doc': { mime: 'application/msword', category: 'file' },
  '.docx': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', category: 'file' },
  '.xls': { mime: 'application/vnd.ms-excel', category: 'file' },
  '.xlsx': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', category: 'file' },
  '.ppt': { mime: 'application/vnd.ms-powerpoint', category: 'file' },
  '.pptx': { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', category: 'file' },
  '.hwp': { mime: 'application/x-hwp', category: 'file' },
  '.hwpx': { mime: 'application/hwp+zip', category: 'file' },
  // Archives
  '.zip': { mime: 'application/zip', category: 'file' },
  '.7z': { mime: 'application/x-7z-compressed', category: 'file' },
  '.tar': { mime: 'application/x-tar', category: 'file' },
  '.gz': { mime: 'application/gzip', category: 'file' },
  // Audio
  '.mp3': { mime: 'audio/mpeg', category: 'audio' },
  '.wav': { mime: 'audio/wav', category: 'audio' },
  '.m4a': { mime: 'audio/mp4', category: 'audio' },
  '.flac': { mime: 'audio/flac', category: 'audio' },
  '.aac': { mime: 'audio/aac', category: 'audio' },
  '.opus': { mime: 'audio/opus', category: 'audio' },
};

/**
 * Returns a detailed classification for rendering custom file attachment UI cards with specific SVG icons.
 */
export const getFileKind = (filenameOrUrl?: string | null): FileKind => {
  if (!filenameOrUrl || typeof filenameOrUrl !== 'string') return 'file';
  const clean = filenameOrUrl.split('?')[0].split('#')[0].toLowerCase();
  const dotIdx = clean.lastIndexOf('.');
  const ext = dotIdx !== -1 ? clean.slice(dotIdx) : '';

  if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) return 'image';
  if (['.mp4', '.webm', '.mov'].includes(ext)) return 'video';
  if (['.mp3', '.wav', '.m4a', '.flac', '.aac', '.opus'].includes(ext)) return 'audio';
  if (ext === '.pdf') return 'pdf';
  if (['.zip', '.7z', '.tar', '.gz', '.rar'].includes(ext)) return 'archive';
  if (['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.hwp', '.hwpx', '.txt', '.csv'].includes(ext)) return 'document';
  return 'file';
};

/**
 * Checks for double extension attacks where an executable extension is disguised before the final extension.
 * e.g., "document.exe.pdf", "shell.php.zip", "test.bat.png"
 * Normalizes Unicode (NFKC) and trims dot-separated segments before checking.
 */
export const hasDangerousIntermediateExt = (filename: string): boolean => {
  if (!filename || typeof filename !== 'string') return false;
  const normalized = filename.normalize('NFKC');
  const parts = normalized.toLowerCase().split('.').map((part) => part.trim());
  for (let i = 1; i < parts.length - 1; i++) {
    const ext = '.' + parts[i];
    if (DANGEROUS_EXTENSIONS.has(ext)) {
      return true;
    }
  }
  return false;
};

export const DANGEROUS_MIME_TYPES = new Set([
  'image/svg+xml',
  'text/html',
  'application/xhtml+xml',
  'application/javascript',
  'text/javascript',
  'application/x-javascript',
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-executable',
  'application/x-sh',
  'application/x-shellscript',
  'text/xml',
  'application/xml',
]);

const ALLOWED_MIME_ALIASES: Record<string, string[]> = {
  '.zip': ['application/x-zip-compressed', 'multipart/x-zip'],
  '.gz': ['application/x-gzip'],
  '.mp3': ['audio/mp3'],
  '.wav': ['audio/x-wav', 'audio/wave'],
  '.m4a': ['audio/x-m4a', 'audio/m4a'],
  '.flac': ['audio/x-flac'],
  '.aac': ['audio/x-aac'],
  '.ogg': ['audio/ogg', 'application/ogg'],
  '.opus': ['audio/ogg'],
  '.csv': ['application/vnd.ms-excel', 'text/plain'],
  '.hwp': ['application/haansofthwp', 'application/vnd.hancom.hwp'],
  '.hwpx': ['application/vnd.hancom.hwpx', 'application/zip'],
};

export const isMimeAllowedForExtension = (ext: string, rawMime: string): boolean => {
  const normalizedMime = rawMime.split(';')[0].trim().toLowerCase();
  if (!normalizedMime || DANGEROUS_MIME_TYPES.has(normalizedMime)) {
    return false;
  }
  const allowed = ALLOWED_EXTENSIONS_MAP[ext];
  if (!allowed) return false;
  if (normalizedMime === allowed.mime) return true;
  const aliases = ALLOWED_MIME_ALIASES[ext];
  return Array.isArray(aliases) ? aliases.includes(normalizedMime) : false;
};

export const escapeMarkdownLabel = (label: string): string => {
  if (!label || typeof label !== 'string') return '';
  return label.replace(/([\\[\]()])/g, '\\$1');
};

export const escapeMarkdownUrl = (url: string): string => {
  if (!url || typeof url !== 'string') return '';
  return url
    .trim()
    .replace(/\s+/g, '%20')
    .replace(/\[/g, '%5B')
    .replace(/\]/g, '%5D')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29');
};

/**
 * Aggressively sanitizes original client filename for display and download.
 * Removes all RTL/Bidi characters, control characters, path traversal tokens, and OS-forbidden symbols.
 */
export const sanitizeOriginalFilename = (rawName: string): string => {
  if (!rawName || typeof rawName !== 'string') return 'attachment';
  // Unicode NFKC normalization
  let clean = rawName.normalize('NFKC');
  // Strip Bidi/RTL characters
  clean = clean.replace(BIDI_CONTROL_REGEX, '');
  // Strip control chars & null bytes
  clean = clean.replace(/[\x00-\x1F\x7F]/g, '');
  // Strip directory separators, path traversal, windows illegal chars
  clean = clean.replace(/[/\\:*?"<>|]/g, '_');
  // Strip leading and trailing dots and spaces
  clean = clean.replace(/^[.\s]+|[.\s]+$/g, '');
  // Limit max length
  if (clean.length > 100) {
    const dotIdx = clean.lastIndexOf('.');
    const ext = dotIdx !== -1 ? clean.slice(dotIdx) : '';
    clean = clean.slice(0, Math.max(1, 100 - ext.length)) + ext;
  }
  return clean || 'attachment';
};

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  category?: FileCategory;
  kind?: FileKind;
  ext?: string;
  sanitizedName?: string;
}

/**
 * Validates file before upload on the client side.
 */
export const validateUploadFile = (
  file: { name: string; size: number; type?: string }
): FileValidationResult => {
  if (!file || typeof file.name !== 'string' || !file.name.trim()) {
    return { valid: false, error: '유효한 파일이 아닙니다.' };
  }

  // 1. Check size bounds (> 0 and <= 25MB)
  if (typeof file.size !== 'number' || !Number.isFinite(file.size) || file.size <= 0) {
    return { valid: false, error: '빈 파일(0바이트)은 업로드할 수 없습니다.' };
  }

  if (file.size > MAX_ATTACHMENT_SIZE) {
    return { valid: false, error: '파일 크기는 최대 25MB 이하만 업로드 가능합니다.' };
  }

  // 2. Check for RTL/Bidirectional Override characters in raw filename
  if (containsBidiOrRtl(file.name)) {
    return { valid: false, error: '파일명에 허용되지 않는 특수문자(RTL 제어 문자)가 포함되어 있습니다.' };
  }

  // Normalize Unicode (NFKC) and trim before path/extension checks
  const normalizedName = file.name.normalize('NFKC').trim();

  // 3. Check for path traversal and null bytes (on both raw and NFKC-normalized names)
  const hasTraversal = (name: string) =>
    name.includes('..') ||
    name.includes('/') ||
    name.includes('\\') ||
    name.includes('\0');

  if (hasTraversal(file.name) || hasTraversal(normalizedName)) {
    return { valid: false, error: '파일명에 허용되지 않는 경로 탐색 문자가 포함되어 있습니다.' };
  }

  // 4. Check for double extension disguised attacks (e.g. evil.exe.pdf, malware.php.zip)
  if (hasDangerousIntermediateExt(normalizedName)) {
    return { valid: false, error: '다중 확장자를 사용한 실행 파일 위장 시도가 감지되었습니다.' };
  }

  const dotIdx = normalizedName.lastIndexOf('.');
  const rawExt = dotIdx !== -1 ? normalizedName.slice(dotIdx).trim().toLowerCase() : '';

  // 5. Check against dangerous blacklist
  if (DANGEROUS_EXTENSIONS.has(rawExt)) {
    return { valid: false, error: '보안 정책상 실행 파일이나 스크립트 파일은 업로드할 수 없습니다.' };
  }

  // 6. Check against allowed whitelist
  const allowed = ALLOWED_EXTENSIONS_MAP[rawExt];
  if (!allowed) {
    return {
      valid: false,
      error: `지원되지 않는 파일 형식입니다 (${rawExt || '확장자 없음'}). 사진, 동영상(MP4, WebM), 오디오(MP3, WAV), PDF, ZIP 등 일반 문서/압축/미디어 파일만 가능합니다.`,
    };
  }

  // 7. Validate declared MIME type when non-empty
  if (typeof file.type === 'string' && file.type.trim() !== '') {
    if (!isMimeAllowedForExtension(rawExt, file.type)) {
      return {
        valid: false,
        error: `파일 확장자(${rawExt})와 MIME 형식(${file.type})이 일치하지 않거나 허용되지 않습니다.`,
      };
    }
  }

  const sanitizedName = sanitizeOriginalFilename(normalizedName);

  return {
    valid: true,
    category: allowed.category,
    kind: getFileKind(normalizedName),
    ext: rawExt,
    sanitizedName,
  };
};

export const ALLOWED_AI_RASTER_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

export const ALLOWED_AI_DATA_URL_REGEX = /^data:image\/(?:jpeg|png|gif|webp);base64,/i;

export const MAX_AI_DIRECT_IMAGE_SIZE = 5 * 1024 * 1024;

export interface AiImageValidationResult {
  valid: boolean;
  error?: string;
  sanitizedName?: string;
}

/**
 * Validates raster-only direct image attachments for AI chat prompts,
 * rejecting SVG and non-raster image MIMEs to match backend validateDirectImageDataUrl.
 */
export const validateDirectAiImageFile = (
  file: { name: string; size: number; type?: string }
): AiImageValidationResult => {
  const normalizedMime = (file.type || '').split(';')[0].trim().toLowerCase();
  if (normalizedMime === 'image/svg+xml' || !ALLOWED_AI_RASTER_MIMES.has(normalizedMime)) {
    return {
      valid: false,
      error: '지원되지 않는 이미지 형식입니다. JPG, PNG, GIF, WebP 이미지만 첨부할 수 있습니다.',
    };
  }
  const validation = validateUploadFile({
    name: file.name || `image.${normalizedMime.split('/')[1] || 'png'}`,
    size: file.size,
    type: normalizedMime,
  });
  if (!validation.valid || validation.category !== 'image') {
    return {
      valid: false,
      error: validation.error || '유효한 이미지 파일이 아닙니다.',
    };
  }
  if (file.size > MAX_AI_DIRECT_IMAGE_SIZE) {
    return {
      valid: false,
      error: '이미지는 최대 5MB까지 첨부할 수 있습니다.',
    };
  }
  return {
    valid: true,
    sanitizedName: validation.sanitizedName || 'image.png',
  };
};
