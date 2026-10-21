import { z } from 'zod';
import { ROLES } from '../../common/constants/roles.js';
import { paginationQuery } from '../../common/http/schemas.js';
import { USER_STATUSES } from './users.types.js';

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,32}$/, 'Username must be 3-32 characters: letters, digits, dot, dash, underscore');

/**
 * Password policy. The current frontend uses 4-digit PINs; this API requires
 * at least 8 characters. See docs/security-checklist.md before relaxing it.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

export const roleSchema = z.enum(ROLES);
export const userStatusSchema = z.enum(USER_STATUSES);

export const userDto = z
  .object({
    id: z.string(),
    username: z.string(),
    displayName: z.string(),
    role: roleSchema,
    status: userStatusSchema,
    lastLoginAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: 'User' });

export const createUserBody = z
  .object({
    username: usernameSchema,
    displayName: z.string().trim().min(1).max(100),
    role: roleSchema,
    password: passwordSchema,
  })
  .strict()
  .refine((value) => value.password.toLowerCase() !== value.username, {
    message: 'Password must not equal the username',
    path: ['password'],
  });

export const updateUserBody = z
  .object({
    displayName: z.string().trim().min(1).max(100).optional(),
    role: roleSchema.optional(),
    status: userStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field to update' });

export const resetPasswordBody = z.object({ newPassword: passwordSchema }).strict();

export const listUsersQuery = paginationQuery
  .extend({ role: roleSchema.optional(), status: userStatusSchema.optional() })
  .strict();

export type CreateUserInput = z.infer<typeof createUserBody>;
export type UpdateUserInput = z.infer<typeof updateUserBody>;
export type ListUsersQuery = z.infer<typeof listUsersQuery>;
