/**
 * Who may act on which farm.
 *
 * Kept as pure functions so the rules are asserted in tests rather than trusted to a reading of a
 * route handler. Each of these guards a key to somebody's records.
 */

/**
 * Whether a caller may issue a recovery code for a farm.
 *
 * A recovery code unlocks that farm's whole backup: herd, customers and money. An admin may issue
 * one for anybody. An agent only for farms they signed, or anyone able to register as an agent could
 * read any farmer's records by knowing their phone number.
 */
export function mayRecoverFarm(args: {
  isAdmin: boolean;
  callerAgentCode: string | null;
  farmAgentCode: string | null;
}): boolean {
  if (args.isAdmin) return true;
  if (!args.callerAgentCode) return false;
  // A farm nobody signed is not an agent's to recover.
  if (!args.farmAgentCode) return false;
  return args.farmAgentCode === args.callerAgentCode;
}
