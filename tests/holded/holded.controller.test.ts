import { afterEach, describe, expect, it, vi } from "vitest";
import { HoldedController } from "../../app/services/erp/holded/holded.controller";

describe("HoldedController", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends document dates as YYYY-MM-DD", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{ id: "contact-1", email: "buyer@example.com" }],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "receipt-1" })));
    vi.stubGlobal("fetch", fetchMock);

    const controller = new HoldedController("test-key", { docType: "salesreceipt", autoApprove: false });
    const result = await controller.syncOrderToERP({
      id: "order-1",
      order_number: "#1001",
      created_at: "2026-08-30T10:14:45.571Z",
      customer: { first_name: "Test", last_name: "Buyer", email: "buyer@example.com" },
      billing_address: {},
      line_items: [{ title: "Test product", quantity: 1, price: "0.01" }],
    }, 1);

    expect(result).toMatchObject({ success: true, erpId: "receipt-1", documentType: "salesreceipt" });
    const payload = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(payload.date).toBe("2026-08-30");
  });
});
