export interface PendingExploreEventChoice {
  choiceId: string;
  description: string;
  label: string;
  rewardPreview: string;
}

export interface PendingExploreEvent {
  choices: PendingExploreEventChoice[];
  description: string;
  eventId: string;
  title: string;
}

export function buildExploreEventCommand(eventId: string, choiceId: string) {
  return `奇遇 ${eventId} ${choiceId}`;
}

export function pendingExploreEventsFromCommandState(state: unknown): PendingExploreEvent[] {
  const stateRecord = asRecord(state);
  const result = asRecord(stateRecord?.result);
  if (!result) {
    return [];
  }

  return pendingExploreEventsFromValues([result.event, ...asArray(result.events)]);
}

export function pendingExploreEventsFromValues(values: unknown[]): PendingExploreEvent[] {
  const eventIds = new Set<string>();
  const events: PendingExploreEvent[] = [];

  for (const value of values) {
    const event = normalizePendingExploreEvent(value);
    if (!event || eventIds.has(event.eventId)) {
      continue;
    }
    eventIds.add(event.eventId);
    events.push(event);
  }

  return events;
}

export function mergePendingExploreEvents(
  current: PendingExploreEvent[],
  next: PendingExploreEvent[],
): PendingExploreEvent[] {
  const events = new Map(current.map((event) => [event.eventId, event]));
  for (const event of next) {
    events.set(event.eventId, event);
  }
  return [...events.values()];
}

export function exploreEventIdFromCommandState(state: unknown): string | null {
  const stateRecord = asRecord(state);
  const result = asRecord(stateRecord?.result);
  const event = asRecord(result?.event);
  return pickText(event?.event_id) || null;
}

function normalizePendingExploreEvent(value: unknown): PendingExploreEvent | null {
  const record = asRecord(value);
  if (!record || pickText(record.status) !== "pending") {
    return null;
  }

  const eventId = pickText(record.event_id);
  const choices = asArray(record.choices)
    .map(normalizePendingExploreEventChoice)
    .filter((choice): choice is PendingExploreEventChoice => choice !== null);
  if (!eventId || choices.length === 0) {
    return null;
  }

  return {
    choices,
    description: pickText(record.description),
    eventId,
    title: pickText(record.title) || "未知奇遇",
  };
}

function normalizePendingExploreEventChoice(value: unknown): PendingExploreEventChoice | null {
  const record = asRecord(value);
  const choiceId = pickText(record?.choice_id);
  if (!choiceId) {
    return null;
  }

  return {
    choiceId,
    description: pickText(record?.description),
    label: pickText(record?.label) || choiceId,
    rewardPreview: pickText(record?.reward_preview),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number") {
      return String(value);
    }
  }
  return "";
}
