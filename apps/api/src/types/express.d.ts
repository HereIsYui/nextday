declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      accountId?: string;
      playerId?: string;
      startedAt?: number;
      authPayload?: {
        sub: string;
        account_type: string;
        player_id?: string;
      };
    }
  }
}

export {};
