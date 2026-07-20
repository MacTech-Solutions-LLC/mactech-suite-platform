# AI Provider Configuration

MacTech AI uses an `AiProvider` interface. `NvidiaAiProvider` implements NVIDIA's OpenAI-compatible `/v1/models` and `/v1/chat/completions` endpoints, including SSE streaming and normalized timeout, invalid-model, rejection, rate-limit, and availability errors. `MockAiProvider` is deterministic and only runs when `AI_DEVELOPMENT_MODE=true`.

Required controls:

```text
AI_ENABLED=false
AI_PROVIDER=mock
AI_EXTERNAL_INFERENCE_ENABLED=false
AI_DEVELOPMENT_MODE=false
NVIDIA_API_KEY=
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_CHAT_MODEL=
NVIDIA_EMBEDDING_MODEL=
AI_MAX_INPUT_CHARS=16000
AI_MAX_OUTPUT_TOKENS=1200
AI_REQUEST_TIMEOUT_MS=30000
AI_ALLOWED_CLASSIFICATIONS=PUBLIC,INTERNAL
AI_STORE_CONVERSATION_CONTENT=false
AI_AUDIT_RETENTION_DAYS=365
AI_MAX_RETRIEVAL_CHUNKS=5
```

`NVIDIA_API_KEY` is read only on the server. It is never returned by health/configuration routes and provider errors are normalized before they reach users. NVIDIA inference requires both `AI_PROVIDER=nvidia` and `AI_EXTERNAL_INFERENCE_ENABLED=true`; a configured key alone does not activate outbound inference.

To add a provider, implement `AiProvider`, keep provider-specific request/response parsing inside the adapter, and add a fail-closed selection branch in `createProvider`. Preserve cancellation, timeouts, safe errors, model validation, streaming, and tool-call parsing.

References: [NVIDIA NIM LLM API reference](https://docs.nvidia.com/nim/large-language-models/latest/api-reference.html) and [NVIDIA NIM quickstart](https://docs.nvidia.com/nim/large-language-models/latest/get-started/quickstart.html).
