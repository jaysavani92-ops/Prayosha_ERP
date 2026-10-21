import { z } from 'zod';
import { passwordSchema, userDto, usernameSchema } from '../users/users.schema.js';

export const loginBody = z
  .object({
    username: usernameSchema,
    // Not the creation policy: existing credentials are verified as-is.
    password: z.string().min(1).max(128),
  })
  .strict();

export const changePasswordBody = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
  })
  .strict();

const accessTokenFields = {
  accessToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresAt: z.string().describe('Access token expiry (ISO 8601)'),
};

export const loginResponse = z.object({
  data: z.object({ ...accessTokenFields, user: userDto }),
});

export const refreshResponse = z.object({ data: z.object(accessTokenFields) });

export const meResponse = z.object({ data: userDto });

export type LoginBody = z.infer<typeof loginBody>;
export type ChangePasswordBody = z.infer<typeof changePasswordBody>;
