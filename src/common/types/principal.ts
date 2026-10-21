import type { ObjectId } from 'mongodb';
import type { Role } from '../constants/roles.js';

/** The authenticated caller, attached to the request by the auth plugin. */
export interface Principal {
  userId: ObjectId;
  role: Role;
  sessionId: string;
}
