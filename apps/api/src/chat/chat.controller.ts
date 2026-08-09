import { Body, Controller, Get, Inject, Post, Query, Req, UseGuards } from "@nestjs/common";
import type {
  WorldChatListResponse,
  WorldChatMessageState,
  WorldChatSendRequest,
} from "@nextday/shared";
import type { Request } from "express";
import { BearerAuthGuard } from "../auth/bearer-auth.guard";
import { ChatService } from "./chat.service";

@Controller("api/chat")
@UseGuards(BearerAuthGuard)
export class ChatController {
  constructor(@Inject(ChatService) private readonly chatService: ChatService) {}

  @Get("messages")
  messages(
    @Query("map_id") mapId: string | undefined,
    @Query("after") after: string | undefined,
    @Query("limit") limit: string | undefined,
    @Req() request: Request,
  ): Promise<WorldChatListResponse> {
    return this.chatService.list(requireAccountId(request), { after, limit, mapId });
  }

  @Post("messages")
  send(
    @Body() body: WorldChatSendRequest,
    @Req() request: Request,
  ): Promise<WorldChatMessageState> {
    const idempotencyKey = request.header("Idempotency-Key");
    if (!idempotencyKey) throw new Error("缺少幂等键");
    return this.chatService.send({ accountId: requireAccountId(request), body, idempotencyKey });
  }
}

function requireAccountId(request: Request): string {
  if (!request.accountId) throw new Error("缺少账号上下文");
  return request.accountId;
}
