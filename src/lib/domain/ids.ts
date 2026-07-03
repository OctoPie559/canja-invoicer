import { uuidv7 } from "uuidv7";

/**
 * All primary keys are UUIDv7 (time-sortable), never auto-increment integers
 * (PROJECT_BRIEF.md §5.2). Invoice display numbers are a separate per-org
 * sequential column and never come from here.
 */
export function newId(): string {
  return uuidv7();
}
