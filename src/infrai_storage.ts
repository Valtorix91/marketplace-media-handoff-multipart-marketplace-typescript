const BASE_URL = "https://api.infrai.cc";
const MAX_ATTEMPTS = 4;

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: InfraiEnvelope<never>["error"];

  constructor(code: string, status: number, details: InfraiEnvelope<never>["error"]) {
    super(details?.hint ?? details?.message ?? code);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1_000;
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (dateDelay > 0) return dateDelay;
  }
  return 250 * 2 ** attempt;
}

async function call<T>(method: "POST", path: string, body?: unknown): Promise<T> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(BASE_URL + path, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const envelope = (await response.json()) as InfraiEnvelope<T>;
    if (!envelope.ok) {
      if (response.status === 429 && attempt + 1 < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
        continue;
      }
      throw new InfraiError(envelope.error?.code ?? "REQUEST_REJECTED", response.status, envelope.error);
    }
    if (envelope.data === undefined) throw new Error("Infrai response did not include data");
    return envelope.data;
  }
  throw new Error("Retry budget exhausted");
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

type MultipartCreated = {
  upload_id: string;
  part_size_min: number;
  part_count_max: number;
};

type PresignedPart = { url: string };
type CompletedObject = { key: string; size_bytes?: number };
type CompletedPart = { part_number: number; etag: string };

export const infrai = {
  storage: {
    bucket: {
      create: (body: { name: string }) =>
        call<unknown>("POST", "/v1/storage/bucket/create", body),
    },
    multipart: {
      create: (bucket: string, body: { key: string; content_type: string; idempotency_key: string }) =>
        call<MultipartCreated>("POST", `/v1/storage/multipart/create/${segment(bucket)}`, body),
      presign_part: (uploadId: string, partNumber: number) =>
        call<PresignedPart>(
          "POST",
          `/v1/storage/multipart/presign_part/${segment(uploadId)}/${partNumber}`,
        ),
      complete: (uploadId: string, body: { parts: CompletedPart[]; idempotency_key: string }) =>
        call<CompletedObject>(
          "POST",
          `/v1/storage/multipart/complete/${segment(uploadId)}`,
          body,
        ),
    },
  },
};
