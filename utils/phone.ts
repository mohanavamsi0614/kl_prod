import { parsePhoneNumber } from "libphonenumber-js";

export type PhoneValidationResult = 
    | { success: true; normalized: string }
    | { success: false; error: string };

/**
 * Validates and normalizes a phone number to E.164 format.
 * 
 * @param phone - The phone number to validate (can include country code)
 * @returns Object with success status and normalized phone or error message
 * 
 * @example
 * const result = normalizePhoneNumber("+1 (555) 123-4567");
 * if (result.success) {
 *   console.log(result.normalized); // "+15551234567"
 * } else {
 *   console.log(result.error); // Error message
 * }
 */
export function normalizePhoneNumber(phone: string): PhoneValidationResult {
    try {
        const phoneNumber = parsePhoneNumber(phone);
        
        if (!phoneNumber || !phoneNumber.isValid()) {
            return { success: false, error: "Invalid phone number format" };
        }
        
        // Extract national number and validate length (7-15 digits per E.164 spec)
        const nationalNumber = phoneNumber.nationalNumber;
        if (nationalNumber.length < 7 || nationalNumber.length > 15) {
            return { 
                success: false, 
                error: "Phone number must be 7-15 digits after country code" 
            };
        }
        
        return { 
            success: true, 
            normalized: phoneNumber.format('E.164') 
        };
    } catch (error) {
        return { success: false, error: "Invalid phone number format" };
    }
}
