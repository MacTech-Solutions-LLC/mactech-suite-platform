# AI Classification Policy

The NVIDIA-hosted developer endpoint is an external development inference service.

| Classification | Hosted developer inference |
|---|---|
| PUBLIC | Allowed when AI and classification policy are enabled |
| INTERNAL | Allowed only when explicitly configured and synthetic/approved |
| FCI | Blocked before provider call |
| CUI | Blocked before provider call |
| EXPORT_CONTROLLED | Blocked before provider call |
| SECRET | Blocked before provider call |
| UNKNOWN | Blocked before provider call |

The server is authoritative. The UI warning and selector are advisory copies of the policy, not enforcement. The content gate also detects and redacts obvious private keys, bearer/session tokens, NVIDIA/GitHub/AWS key forms, password assignments, and database connection strings. Detection supplements classification; it does not upgrade controlled content into allowed content.

Blocked attempts generate sanitized audit metadata and never invoke the provider. Customer-sensitive proposal data, personal information not required for a task, and any real controlled record remain outside this MVP.
