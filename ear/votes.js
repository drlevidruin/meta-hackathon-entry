export function defaultVotes(env = process.env) {
  const votes = Number(env.EAR_VOTES);
  return Number.isInteger(votes) && votes >= 1 && votes <= 5 ? votes : 3;
}
