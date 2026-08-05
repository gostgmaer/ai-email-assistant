import { UserModel } from '../../generated/prisma/models';

export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
  avatar: string | null;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Strips passwordHash (and anything else sensitive) before a User is serialized to a client. */
export function toPublicUser(user: UserModel): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatar: user.avatar,
    emailVerifiedAt: user.emailVerifiedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
