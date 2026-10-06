/**
 * The indexed view of groups, contributions, payouts and transactions.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT
 * These reads come from `susu-api`, which serves the `susu-indexer`'s tables. The
 * index is derived from the chain and lags it by up to one indexing run, so a
 * value here is a *report* of what the contracts did, not the contracts' current
 * state.
 *
 * That distinction decides where each read belongs. Discovery — "which groups
 * exist", "which ones am I in" — can only come from an index: the chain has no
 * way to list groups belonging to an address, and finding them by walking every
 * id is a scan that is wrong at any real size. State that a decision depends on —
 * "may I contribute", "is this round payable" — is read from the contract, by
 * `lib/susu`, because a stale answer there would prompt a signature the contract
 * then refuses.
 *
 * So: this module answers "what does the protocol say happened", never "what
 * should I sign".
 *
 * MONEY IS BASE UNITS, AS A STRING
 * Every amount is an integer count of the token's smallest unit, carried as a
 * string. The API selects these columns with `::text` for exactly this reason —
 * `numeric` does not survive a trip through a JavaScript number — and parsing one
 * into a number here would undo that at the last step. Formatting is
 * `formatUsdc`'s job.
 */
import { z } from 'zod';
import { apiRequest, apiRequestPage, type ApiPage } from './client';
import { getAccessToken } from './token';

/** The statuses the contract uses. Not an open set: the API rejects others. */
export const groupStatusSchema = z.enum(['open', 'active', 'completed']);
export type GroupStatus = z.infer<typeof groupStatusSchema>;

export const groupSummarySchema = z.object({
  contractId: z.string(),
  factoryContractId: z.string(),
  /** The factory's sequential id, unique per factory. */
  groupId: z.number(),
  creator: z.string(),
  /** The SAC the group settles in — recorded, not assumed to be USDC. */
  token: z.string(),
  /** Base units, as a string. */
  contributionAmount: z.string(),
  memberCapacity: z.number(),
  createdLedger: z.number(),
  status: groupStatusSchema,
  memberCount: z.number(),
  currentRound: z.number(),
  completedRounds: z.number(),
  /** Base units, as a string. */
  contributedTotal: z.string(),
  paidOutTotal: z.string(),
  feeTotal: z.string(),
  /** The highest ledger any of this group's events came from; 0 before any. */
  lastEventLedger: z.number(),
});
export type GroupSummary = z.infer<typeof groupSummarySchema>;

export const groupMemberSchema = z.object({
  member: z.string(),
  /** 1-based join order, as the contract assigned it. */
  position: z.number(),
  joinedLedger: z.number(),
});
export type GroupMember = z.infer<typeof groupMemberSchema>;

export const groupRoundSchema = z.object({
  round: z.number(),
  contributionCount: z.number(),
  /** Base units contributed this round, as a string. */
  contributed: z.string(),
  /** Base units paid out, or `null` if the round has not paid. */
  payout: z.string().nullable(),
  recipient: z.string().nullable(),
  fee: z.string().nullable(),
});
export type GroupRound = z.infer<typeof groupRoundSchema>;

export const groupDetailSchema = groupSummarySchema.extend({
  members: z.array(groupMemberSchema),
  rounds: z.array(groupRoundSchema),
});
export type GroupDetail = z.infer<typeof groupDetailSchema>;

export const contributionRecordSchema = z.object({
  eventIdentity: z.string(),
  member: z.string(),
  round: z.number(),
  /** Base units, as a string. */
  amount: z.string(),
  ledger: z.number(),
  txHash: z.string(),
});
export type ContributionRecord = z.infer<typeof contributionRecordSchema>;

export const payoutRecordSchema = z.object({
  eventIdentity: z.string(),
  recipient: z.string(),
  round: z.number(),
  /** Base units, net of the protocol fee, as a string. */
  recipientAmount: z.string(),
  ledger: z.number(),
  txHash: z.string(),
});
export type PayoutRecord = z.infer<typeof payoutRecordSchema>;

export const activityRecordSchema = z.object({
  eventIdentity: z.string(),
  name: z.string(),
  ledger: z.number(),
  txIndex: z.number(),
  eventIndex: z.number(),
  txHash: z.string(),
  /** The decoded fields, exactly as the indexer's decoder produced them. */
  payload: z.unknown(),
});
export type ActivityRecord = z.infer<typeof activityRecordSchema>;

export const transactionEventSchema = z.object({
  eventIdentity: z.string(),
  /** The decoded event name. */
  name: z.string(),
  /** The contract that emitted it, so a multi-contract transaction reads. */
  contractId: z.string(),
  eventIndex: z.number(),
  payload: z.unknown(),
});
export type TransactionEvent = z.infer<typeof transactionEventSchema>;

export const transactionReceiptSchema = z.object({
  txHash: z.string(),
  ledger: z.number(),
  txIndex: z.number(),
  /** In the order the contract emitted them. */
  events: z.array(transactionEventSchema),
});
export type TransactionReceipt = z.infer<typeof transactionReceiptSchema>;

export type ListGroupsQuery = {
  readonly status?: GroupStatus;
  readonly member?: string;
  readonly creator?: string;
  readonly limit?: number;
  readonly offset?: number;
};

/**
 * Removes absent filters rather than serialising them.
 *
 * `?member=undefined` would fail the API's address check and turn "no filter"
 * into a 400, which is a confusing way to say "I did not ask for one".
 */
function queryString(params: Readonly<Record<string, string | number | undefined>>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded === '' ? '' : `?${encoded}`;
}

function pageParams(page: { limit?: number; offset?: number }): {
  limit: number | undefined;
  offset: number | undefined;
} {
  return { limit: page.limit, offset: page.offset };
}

/**
 * Lists groups, optionally filtered.
 *
 * `member` is how a caller asks for one account's groups. It is resolved by the
 * API against the indexed membership rows, which is the only place that mapping
 * exists.
 */
export async function listGroups(
  query: ListGroupsQuery = {},
  signal?: AbortSignal,
): Promise<ApiPage<GroupSummary>> {
  const search = queryString({
    status: query.status,
    member: query.member,
    creator: query.creator,
    ...pageParams(query),
  });
  return apiRequestPage<GroupSummary>(`groups${search}`, {
    ...(signal ? { signal } : {}),
    schema: groupSummarySchema,
  });
}

/**
 * Reads one group, including its members and per-round totals.
 *
 * Answers 404 for a group the index has never seen — which includes an address
 * that is not a group at all. Callers that need to distinguish "unknown" from
 * "known but empty" can, but for rendering either is a dead end.
 */
export async function getGroup(contractId: string, signal?: AbortSignal): Promise<GroupDetail> {
  return apiRequest<GroupDetail>(`groups/${encodeURIComponent(contractId)}`, {
    ...(signal ? { signal } : {}),
    schema: groupDetailSchema,
  });
}

/** Lists the contribution events recorded for one group, oldest round first. */
export async function listContributions(
  contractId: string,
  page: { limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<ApiPage<ContributionRecord>> {
  const search = queryString(pageParams(page));
  return apiRequestPage<ContributionRecord>(
    `groups/${encodeURIComponent(contractId)}/contributions${search}`,
    {
      ...(signal ? { signal } : {}),
      schema: contributionRecordSchema,
    },
  );
}

/** Lists the payouts recorded for one group, oldest round first. */
export async function listPayouts(
  contractId: string,
  page: { limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<ApiPage<PayoutRecord>> {
  const search = queryString(pageParams(page));
  return apiRequestPage<PayoutRecord>(`groups/${encodeURIComponent(contractId)}/payouts${search}`, {
    ...(signal ? { signal } : {}),
    schema: payoutRecordSchema,
  });
}

/** Lists every decoded event recorded for one group, in ledger order. */
export async function listActivity(
  contractId: string,
  page: { limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<ApiPage<ActivityRecord>> {
  const search = queryString(pageParams(page));
  return apiRequestPage<ActivityRecord>(
    `groups/${encodeURIComponent(contractId)}/activity${search}`,
    {
      ...(signal ? { signal } : {}),
      schema: activityRecordSchema,
    },
  );
}

/**
 * Reads the protocol's record of one transaction.
 *
 * EVENTUAL, AND THE CALLER MUST KNOW IT
 * The indexer runs on a schedule, so for a transaction that was just confirmed
 * this answers 404 until the next run reaches it. A 404 therefore means *either*
 * "no Susu contract was touched" or "not indexed yet", and a screen polling after
 * a submission must keep polling rather than reporting that nothing happened.
 * `isRetryableApiError` is false for 404 in general, so a poller here decides for
 * itself; see `useTransactionReceipt`.
 */
export async function getTransactionReceipt(
  txHash: string,
  signal?: AbortSignal,
): Promise<TransactionReceipt> {
  return apiRequest<TransactionReceipt>(`transactions/${encodeURIComponent(txHash)}`, {
    ...(signal ? { signal } : {}),
    schema: transactionReceiptSchema,
  });
}

/** Whether a string is a 32-byte transaction hash, as the RPC reports it. */
export function looksLikeTransactionHash(value: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(value);
}

/** What the API reports about a claim: the address, and when it lapses. */
export const registeredGroupSchema = z.object({
  contractId: z.string(),
  /** ISO 8601. After this, only the index can vouch for the address. */
  expiresAt: z.string(),
});
export type RegisteredGroup = z.infer<typeof registeredGroupSchema>;

/**
 * Tells the API that an address the chain has just produced is a group.
 *
 * WHY THIS CALL EXISTS
 * A group's address is the hash of its own deployment, so the API learns groups by
 * watching the Factory emit them — which the indexer does on a schedule. Between a
 * creator's confirmation and the next indexing run the address is real and unknown
 * to the API, and creating an invite is refused for a group the API cannot find. So
 * a creator would create a group and be unable to invite anyone to it, which is the
 * middle of the document's core journey.
 *
 * This does not create anything. The group was created by the transaction that
 * deployed it; what is registered is that the address is known, for a bounded
 * window. Nothing financial reads it, and the index supersedes it.
 *
 * The claim is tied to the caller's session and cannot be made anonymously, which
 * is why it takes a token.
 */
export async function registerGroup(contractId: string, token: string): Promise<RegisteredGroup> {
  return apiRequest<RegisteredGroup>('groups', {
    method: 'POST',
    token,
    body: { contractId },
    schema: registeredGroupSchema,
  });
}

/**
 * The same claim, for a caller that must not fail.
 *
 * Called after a group is confirmed, on a path whose success the user is entitled
 * to regardless of whether this call works. Everything here is a reason the
 * registration may legitimately not happen: nobody is signed in, the API is down,
 * the session expired, or the account is holding its few live registrations.
 *
 * None of those is worth an error message, because the consequence is only a wait.
 * The group exists on chain, the index will report it within one run, and until
 * then the invite panel says the group is not known yet — which is true. So the
 * result is a boolean for callers that want to say something, not a thrown error.
 */
export async function registerGroupQuietly(contractId: string): Promise<boolean> {
  const token = await getAccessToken();
  if (token === undefined) return false;

  try {
    await registerGroup(contractId, token);
    return true;
  } catch {
    return false;
  }
}
