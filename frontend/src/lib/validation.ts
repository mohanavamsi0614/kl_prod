/**
 * Filename validation utilities for Productivity storage
 * Validates filenames on both frontend and backend
 */

// Characters that are not allowed in filenames
const INVALID_CHARS = ['?', '*', ':', '"', '<', '>', '|', '\\', '/'];

// Regex pattern for invalid characters
const INVALID_CHARS_REGEX = /[?*:"<>|\\\/]/;

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates a filename for invalid characters
 * @param fileName - The filename to validate
 * @returns ValidationResult with isValid flag and optional error message
 */
export function validateFileName(fileName: string): ValidationResult {
  if (!fileName || typeof fileName !== 'string') {
    return {
      isValid: false,
      error: 'Filename is required'
    };
  }

  const trimmedName = fileName.trim();

  if (trimmedName.length === 0) {
    return {
      isValid: false,
      error: 'Filename cannot be empty'
    };
  }

  if (trimmedName.length > 255) {
    return {
      isValid: false,
      error: 'Filename is too long (max 255 characters)'
    };
  }

  // Check for invalid characters
  if (INVALID_CHARS_REGEX.test(trimmedName)) {
    const foundChars = INVALID_CHARS.filter(char => trimmedName.includes(char));
    return {
      isValid: false,
      error: `Filename contains invalid characters: ${foundChars.join(' ')}`
    };
  }

  // Check for leading/trailing dots or spaces
  if (trimmedName.startsWith('.') || trimmedName.endsWith('.')) {
    return {
      isValid: false,
      error: 'Filename cannot start or end with a dot'
    };
  }

  // Check for reserved names (Windows compatibility)
  const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
  
  const nameWithoutExt = trimmedName.split('.')[0].toUpperCase();
  if (reservedNames.includes(nameWithoutExt)) {
    return {
      isValid: false,
      error: 'This filename is reserved by the system'
    };
  }

  return { isValid: true };
}

/**
 * Validates a folder name for invalid characters
 * @param folderName - The folder name to validate
 * @returns ValidationResult with isValid flag and optional error message
 */
export function validateFolderName(folderName: string): ValidationResult {
  const result = validateFileName(folderName);
  
  if (!result.isValid) {
    return {
      ...result,
      error: result.error?.replace('Filename', 'Folder name')
    };
  }

  return result;
}

/**
 * Validates a URL for upload from URL feature
 * @param url - The URL to validate
 * @returns ValidationResult with isValid flag and optional error message
 */
export function validateUploadUrl(url: string): ValidationResult {
  if (!url || typeof url !== 'string') {
    return {
      isValid: false,
      error: 'URL is required'
    };
  }

  const trimmedUrl = url.trim();

  if (trimmedUrl.length === 0) {
    return {
      isValid: false,
      error: 'URL cannot be empty'
    };
  }

  try {
    const parsed = new URL(trimmedUrl);
    
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return {
        isValid: false,
        error: 'Only HTTP and HTTPS URLs are supported'
      };
    }

    // Warn about Google Docs/Sheets/Slides URLs
    const googleDocsPatterns = [
      /docs\.google\.com\/document/,
      /docs\.google\.com\/spreadsheets/,
      /docs\.google\.com\/presentation/,
      /drive\.google\.com\/file/,
    ];

    for (const pattern of googleDocsPatterns) {
      if (pattern.test(trimmedUrl)) {
        return {
          isValid: false,
          error: 'Google Docs/Sheets/Slides cannot be imported directly. Please download the file first and upload it.'
        };
      }
    }

    return { isValid: true };
  } catch {
    return {
      isValid: false,
      error: 'Invalid URL format'
    };
  }
}

/**
 * Get list of invalid characters for display purposes
 */
export function getInvalidCharsList(): string {
  return INVALID_CHARS.join(' ');
}
