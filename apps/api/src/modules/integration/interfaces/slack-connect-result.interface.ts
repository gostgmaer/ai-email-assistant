export interface SlackConnectResult {
  accessToken: string;
  workspaceId?: string;
  workspaceName?: string;
}

export interface SlackChannel {
  id: string;
  name: string;
}
