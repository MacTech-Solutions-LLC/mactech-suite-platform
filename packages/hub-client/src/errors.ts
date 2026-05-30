import type { HubAuthoritySnapshot } from "./types";

export class HubAccessDeniedError extends Error {
  constructor(
    message: string,
    public readonly snapshot: HubAuthoritySnapshot,
  ) {
    super(message);
    this.name = "HubAccessDeniedError";
  }
}

export class HubUnavailableError extends Error {
  constructor(message: string, public readonly causeStatus?: number) {
    super(message);
    this.name = "HubUnavailableError";
  }
}

export class HubContractValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HubContractValidationError";
  }
}

export class HubServiceAuthError extends Error {
  constructor(message: string, public readonly causeStatus?: number) {
    super(message);
    this.name = "HubServiceAuthError";
  }
}
