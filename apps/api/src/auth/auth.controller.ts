import { Body, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import type {
  AuthMeResponse,
  GuestLoginRequest,
  LoginResponse,
  MockFishpiLoginRequest,
} from "@nextday/shared";
import type { Request } from "express";
import { AuthService } from "./auth.service";
import { BearerAuthGuard } from "./bearer-auth.guard";

@Controller("api/auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post("guest-login")
  guestLogin(@Body() body: GuestLoginRequest, @Req() request: Request): Promise<LoginResponse> {
    return this.authService.guestLogin(body ?? {}, request);
  }

  @Post("mock-fishpi-login")
  mockFishpiLogin(
    @Body() body: MockFishpiLoginRequest,
    @Req() request: Request,
  ): Promise<LoginResponse> {
    return this.authService.mockFishpiLogin(body, request);
  }

  @Get("me")
  @UseGuards(BearerAuthGuard)
  me(@Req() request: Request): Promise<AuthMeResponse> {
    return this.authService.getMe(requireAccountId(request));
  }
}

function requireAccountId(request: Request): string {
  if (!request.accountId) {
    throw new Error("缺少账号上下文");
  }

  return request.accountId;
}
