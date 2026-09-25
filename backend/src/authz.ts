/**
 * Who may act on which farm.
 *
 * Kept as pure functions so the rules are asserted in tests rather than trusted to a reading of a
 * route handler. Each of these guards a key to somebody's records.
 */

/**
 * Whether a caller may issue a recovery code for a phone number.
 *
 * Covers farmers who have not paid yet, who have a backup but no row in `farms`. For those, the
 * agent has to be the one the farmer's own phone names in its backups (`installs.agent_code`). A
 * referral is not enough: anybody can file one for any number, and a recovery code opens that
 * farmer's records.
 */
export function mayRecoverPhone(args: {
  isAdmin: boolean;
  callerAgentCode: string | null;
  farmAgentCode: string | null;
  installAgentCodes: (string | null)[];
}): boolean {
  if (args.isAdmin) return true;
  if (!args.callerAgentCode) return false;
  if (args.farmAgentCode) return args.farmAgentCode === args.callerAgentCode;
  return args.installAgentCodes.some((code) => code === args.callerAgentCode);
}
