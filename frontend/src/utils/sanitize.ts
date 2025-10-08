// Input sanitization utilities
export const sanitizeInput = (input: string): string => {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove HTML-like brackets
    .slice(0, 2000); // Limit length to match backend
};

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
};

export const validateMessage = (text: string): boolean => {
  const sanitized = sanitizeInput(text);
  return sanitized.length > 0 && sanitized.length <= 2000;
};