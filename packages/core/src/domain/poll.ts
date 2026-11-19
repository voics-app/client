import type { Poll, PollResults } from '../contracts/rest';

/** Global counts and viewer selections have independent monotonic versions. */
export function mergePoll(previous: Poll | undefined, incoming: Poll): Poll {
  const old = previous?.results;
  const next = incoming.results;
  if (!old || !next) return { ...incoming, results: next ?? old };
  const global = BigInt(next.version) >= BigInt(old.version) ? next : old;
  const viewer = next.vote_version !== undefined && (old.vote_version === undefined || BigInt(next.vote_version) >= BigInt(old.vote_version)) ? next : old;
  return { ...incoming, results: { ...global, vote_version: viewer.vote_version, answer_counts: global.answer_counts.map((count) => ({ ...count, me_voted: viewer.answer_counts.find((v) => v.id === count.id)?.me_voted })) } };
}

export function pollEventResults(results: PollResults, currentUser: boolean, voteVersion: string, answers: number[]): PollResults {
  if (!currentUser) return results;
  return { ...results, vote_version: voteVersion, answer_counts: results.answer_counts.map((count) => ({ ...count, me_voted: answers.includes(count.id) })) };
}
