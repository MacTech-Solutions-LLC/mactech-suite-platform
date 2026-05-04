/**
 * Constants shared between the /auditor-access UI, the server actions
 * that POST grants to the vault admin endpoint, and the API routes.
 */

/** Network classifications the auditor declares at request time. */
export const NETWORK_CLASSIFICATIONS = [
  {
    code: "private_residence",
    label: "Private residence",
    description:
      "Residential ISP (cable / fiber to a single household). You are the only subscriber on this public IP.",
    accepted: true,
  },
  {
    code: "office_known_static",
    label: "Office (known static IP)",
    description:
      "A static IP your organization has previously declared (corporate office, leased line, dedicated DC egress).",
    accepted: true,
  },
  {
    code: "cellular_carrier_cgnat",
    label: "Cellular tether or hotspot",
    description:
      "Phone tether or personal hotspot. Note: every major US carrier (T-Mobile, Verizon, AT&T, MVNOs) runs Carrier-Grade NAT — your apparent public IP is shared with hundreds of other subscribers in the same region. We treat this as narrowly shared, not private.",
    accepted: true,
  },
  {
    code: "unknown_or_shared",
    label: "Unknown or shared (hotel / conference / café / generic corporate)",
    description:
      "A public IP shared with strangers. We do not issue an IP grant in this case. Use the forward_auth path (coming soon) instead.",
    accepted: false,
  },
] as const;

export type NetworkClassificationCode = (typeof NETWORK_CLASSIFICATIONS)[number]["code"];

/** The classifications the vault admin endpoint will accept. */
export const ACCEPTED_NETWORK_CLASSIFICATIONS = NETWORK_CLASSIFICATIONS
  .filter((c) => c.accepted)
  .map((c) => c.code) as readonly Exclude<NetworkClassificationCode, "unknown_or_shared">[];

/** Default + max grant durations. The vault re-enforces these as a
 *  safety net so a misconfigured ICC can't accidentally issue indefinite
 *  access. Keep in sync with EnclaveWatchAppSettings.AllowlistAdmin.MaxGrantDuration. */
export const DURATION_OPTIONS = [
  { hours: 1, label: "1 hour" },
  { hours: 4, label: "4 hours (default)", default: true },
  { hours: 8, label: "8 hours" },
  { hours: 12, label: "12 hours" },
  { hours: 24, label: "24 hours (max)" },
] as const;

export const DEFAULT_GRANT_HOURS = 4;
export const MAX_GRANT_HOURS = 24;
/** When a grant has fewer minutes than this remaining, the page surfaces
 *  an "extend?" banner so the auditor isn't surprised by a 403 mid-review. */
export const EXTEND_BANNER_REMAINING_MINUTES = 30;
