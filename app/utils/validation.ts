import { z, type ZodIssue } from 'zod';

// Common validation schemas
export const shopSchema = z.string().min(1, 'Shop domain is required');
export const metafieldNamespaceSchema = z.string().regex(/^[a-zA-Z0-9_]+$/, 'Invalid namespace format');
export const metafieldKeySchema = z.string().regex(/^[a-zA-Z0-9_]+$/, 'Invalid key format');
export const metafieldValueSchema = z.string().min(1, 'Value is required');

// API request schemas
export const quickstartStepSchema = z.object({
  step: z.enum(['theme_installed', 'app_embedded', 'settings_configured', 'test_completed']),
  completed: z.boolean(),
});

export const stockAlertSettingsSchema = z.object({
  enabled: z.boolean(),
  threshold: z.number().min(1).max(1000),
  message: z.string().min(1).max(500),
  buttonText: z.string().min(1).max(50),
  buttonColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format'),
  textColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format'),
  position: z.enum(['top', 'bottom', 'center']),
  animation: z.enum(['slide', 'fade', 'bounce']),
});

export const metafieldUpdateSchema = z.object({
  namespace: metafieldNamespaceSchema,
  key: metafieldKeySchema,
  value: metafieldValueSchema,
  type: z.enum(['single_line_text_field', 'multi_line_text_field', 'number_integer', 'boolean']),
});

// Webhook validation schemas
export const webhookDataRequestSchema = z.object({
  shop_id: z.number(),
  shop_domain: z.string(),
  customer: z.object({
    id: z.number(),
    email: z.string().email().optional(),
  }),
});

export const webhookRedactSchema = z.object({
  shop_id: z.number(),
  shop_domain: z.string(),
});

// Utility functions
export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      const zodError = error as z.ZodError;
      const errorMessage = zodError.issues.map((err: ZodIssue) => `${err.path.join('.')}: ${err.message}`).join(', ');
      throw new Error(`Validation failed: ${errorMessage}`);
    }
    throw error;
  }
}

export function safeValidateInput<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  try {
    const result = schema.parse(data);
    return { success: true, data: result };
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      const zodError = error as z.ZodError;
      const errorMessage = zodError.issues.map((err: ZodIssue) => `${err.path.join('.')}: ${err.message}`).join(', ');
      return { success: false, error: `Validation failed: ${errorMessage}` };
    }
    return { success: false, error: 'Unknown validation error' };
  }
}
