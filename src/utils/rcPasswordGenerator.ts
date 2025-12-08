import { encryptData } from "../utils/emailHashPasswordGenerator";

/**
 * Validates password as per Sunbird requirements
 */
export function isSunbirdPasswordValid(password: string): boolean {
    const minLength = password.length >= 8;
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[@#$%^&*!~?._+\-]/.test(password);

    return minLength && hasUppercase && hasLowercase && hasNumber && hasSpecial;
}

/**
 * Generates a compliant fallback password if encrypted password fails validation
 */
export function generateFallbackPassword(firstName: string, phone: string): string {
    // Remove non-letters & take prefix for consistency
    const prefix = firstName.replace(/[^a-zA-Z]/g, "").slice(0, 3) || "User";
    return `${prefix}@${phone.slice(-4)}Ab`; // Always satisfies policy
}

/**
 * Returns a valid password for Sunbird user creation
 * Priority: encrypted password → fallback compliant password
 */
export function getRCPassword(userData: { firstName: string; phone: string }): string {
    // Step 1: Generate encrypted password based on phone
    let password = encryptData(userData.phone);

    // Step 2: If encrypted password does NOT satisfy policy, switch to fallback
    if (!isSunbirdPasswordValid(password)) {
        password = generateFallbackPassword(userData.firstName, userData.phone);
    }

    return password;
}
