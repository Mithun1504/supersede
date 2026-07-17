import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_UPLOAD_BYTES } from "@/modules/corpus";
import { signCorpusUpload } from "@/modules/corpus/uploads";

vi.mock("@/lib/storage/clients", () => ({
  getWorkingStorageClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/env/server", () => ({
  requireEnv: vi.fn(() => "test-bucket"),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(),
}));

describe("direct corpus upload signing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSignedUrl).mockResolvedValue(
      "https://storage.example/upload?X-Amz-SignedHeaders=content-length%3Bhost",
    );
  });

  it("signs the exact declared byte length into the PUT request", async () => {
    await signCorpusUpload({
      organizationId: "00000000-0000-4000-8000-000000000001",
      filename: "protocol.txt",
      mimeType: "text/plain",
      byteSize: 128,
    });

    const command = vi.mocked(getSignedUrl).mock.calls[0]?.[1];
    expect(command?.input).toMatchObject({ ContentLength: 128 });
  });

  it("rejects oversized metadata before issuing a signed URL", async () => {
    await expect(
      signCorpusUpload({
        organizationId: "00000000-0000-4000-8000-000000000001",
        filename: "protocol.txt",
        mimeType: "text/plain",
        byteSize: MAX_UPLOAD_BYTES + 1,
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it("fails closed if the storage signer omits the byte constraint", async () => {
    vi.mocked(getSignedUrl).mockResolvedValue(
      "https://storage.example/upload?X-Amz-SignedHeaders=host",
    );

    await expect(
      signCorpusUpload({
        organizationId: "00000000-0000-4000-8000-000000000001",
        filename: "protocol.txt",
        mimeType: "text/plain",
        byteSize: 128,
      }),
    ).rejects.toThrow("signed size constraint");
  });
});
