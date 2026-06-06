export interface AuthTokenPayload {
  sub: string;
  account_type: string;
  player_id?: string;
  iat?: number;
  exp?: number;
}
