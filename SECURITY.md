# Security

## Reporting

Do not include secrets, credentials, API keys, tokens, customer data, or sensitive
operational details in public issues, pull requests, commits, screenshots, or
logs.

Until a dedicated intake path is defined, report security concerns to the
repository maintainers through the approved private project communication
channel.

## Safe Handling Expectations

- Keep test data synthetic unless an approved data-handling process exists.
- Store no secrets in git.
- Use local environment variables or approved secret stores for future runtime
  configuration.
- Do not commit generated files that contain machine-specific or sensitive
  content.
- Treat security findings as review blockers until triaged.

## Current State

This repository contains foundation scaffolding only. It does not claim a
production security boundary, certification status, or compliance status.
