import { UserModel } from '../../generated/prisma/models';

export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
  avatar: string | null;
  jobTitle: string | null;
  companyName: string | null;
  timezone: string;
  digestHour: number;
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
    jobTitle: user.jobTitle,
    companyName: user.companyName,
    timezone: user.timezone,
    digestHour: user.digestHour,
    emailVerifiedAt: user.emailVerifiedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
