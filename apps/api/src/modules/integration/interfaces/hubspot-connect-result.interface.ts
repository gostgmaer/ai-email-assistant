export interface HubspotConnectResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  hubId?: string;
  accountName?: string;
}

export interface HubspotContactInput {
  email: string;
  firstName?: string;
  lastName?: string;
}
