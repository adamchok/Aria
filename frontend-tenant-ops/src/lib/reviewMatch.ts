import type { BankEntry, MatchResult, ReviewActionResponse } from '@/types/api';

/** Merge a review API response into the in-memory match for the drawer. */
export function mergeReviewResponse(
  match: MatchResult,
  response: ReviewActionResponse,
  selectedEntry?: BankEntry | null,
): MatchResult {
  return {
    ...match,
    status: response.status,
    human_reviewed: response.human_reviewed,
    review_notes: response.note ?? match.review_notes,
    bank_entry: response.bank_entry ?? selectedEntry ?? match.bank_entry,
  };
}
