import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../database/prisma.service";
import { AuthService } from "./auth.service";

@Injectable()
export class BearerAuthGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(request);
    const payload = this.authService.verifyToken(token);
    const account = await this.prisma.account.findUnique({
      where: { accountId: payload.sub },
      include: { player: true },
    });

    if (!account || account.status !== "normal") {
      throw new UnauthorizedException("账号不存在或不可用");
    }

    request.accountId = account.accountId;
    request.playerId = account.player?.playerId;
    request.authPayload = {
      sub: account.accountId,
      account_type: account.accountType,
      player_id: account.player?.playerId,
    };

    return true;
  }
}

function extractBearerToken(request: Request): string {
  const authorization = request.header("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new UnauthorizedException("需要登录后访问");
  }

  return authorization.slice("Bearer ".length).trim();
}
