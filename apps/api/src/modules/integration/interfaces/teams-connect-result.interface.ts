export interface TeamsConnectResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  tenantId?: string;
  organizationName?: string;
}

export interface TeamsChannel {
  teamId: string;
  teamName: string;
  id: string;
  name: string;
}
