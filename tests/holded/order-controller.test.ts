import { describe, it, expect, beforeEach, vi } from "vitest";
import { HoldedController } from "../../app/services/erp/holded/holded.controller";
import prismaMock from "../../app/db.server";
import { mockShopifyOrder } from "../fixtures/shopify-order.mock";

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../../app/db.server", () => ({
  default: {
    syncLog: { findFirst: vi.fn() },
  },
}));

const mockService = {
  searchContacts:     vi.fn(),
  createContact:       vi.fn(),
  createInvoice:       vi.fn(),
  createSalesReceipt:  vi.fn(),
  createSalesOrder:    vi.fn(),
  createWaybill:       vi.fn(),
  approveDocument:     vi.fn(),
  listProducts:        vi.fn(),
};

vi.mock("../../app/services/erp/holded/holded.service", async () => {
  const actual = await vi.importActual<typeof import("../../app/services/erp/holded/holded.service")>(
    "../../app/services/erp/holded/holded.service",
  );
  return {
    ...actual,
    HoldedService: vi.fn().mockImplementation(() => mockService),
  };
});

// ── Setup ─────────────────────────────────────────────────────────────────────

const SHOP_ID = 1;

function orderWithVat(vat?: string) {
  return { ...mockShopifyOrder, billing_address: { ...mockShopifyOrder.billing_address, vat } };
}

beforeEach(() => {
  vi.clearAllMocks();
  (prismaMock.syncLog.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  mockService.searchContacts.mockResolvedValue([]);
  mockService.createContact.mockResolvedValue({ id: "contact-1" });
  mockService.createInvoice.mockResolvedValue({ id: "inv-1" });
  mockService.createSalesReceipt.mockResolvedValue({ id: "receipt-1" });
  mockService.createSalesOrder.mockResolvedValue({ id: "order-1" });
  mockService.createWaybill.mockResolvedValue({ id: "waybill-1" });
  mockService.approveDocument.mockResolvedValue(undefined);
  mockService.listProducts.mockResolvedValue({ items: [] });
});

describe("HoldedController.syncOrderToERP — smart doc type resolution", () => {
  it("creates a salesreceipt when the customer has no VAT/NIF", async () => {
    const controller = new HoldedController("key", { docType: "smart", autoApprove: false });
    const result = await controller.syncOrderToERP(orderWithVat(undefined), SHOP_ID);

    expect(result.success).toBe(true);
    expect(result.docType).toBe("salesreceipt");
    expect(mockService.createSalesReceipt).toHaveBeenCalledTimes(1);
    expect(mockService.createInvoice).not.toHaveBeenCalled();
  });

  it("creates an invoice when the customer has a VAT/NIF", async () => {
    const controller = new HoldedController("key", { docType: "smart", autoApprove: false });
    const result = await controller.syncOrderToERP(orderWithVat("B12345678"), SHOP_ID);

    expect(result.success).toBe(true);
    expect(result.docType).toBe("invoice");
    expect(mockService.createInvoice).toHaveBeenCalledTimes(1);
    expect(mockService.createSalesReceipt).not.toHaveBeenCalled();
  });
});

describe("HoldedController.syncOrderToERP — explicit doc types", () => {
  it.each([
    ["invoice", "createInvoice"],
    ["salesreceipt", "createSalesReceipt"],
    ["salesorder", "createSalesOrder"],
    ["waybill", "createWaybill"],
  ] as const)("routes docType=%s to service.%s", async (type, method) => {
    const controller = new HoldedController("key", { docType: type, autoApprove: false });
    const result = await controller.syncOrderToERP(orderWithVat(undefined), SHOP_ID);

    expect(result.success).toBe(true);
    expect(result.docType).toBe(type);
    expect(mockService[method]).toHaveBeenCalledTimes(1);
  });

  it("approves the document when autoApprove is true", async () => {
    const controller = new HoldedController("key", { docType: "invoice", autoApprove: true });
    const result = await controller.syncOrderToERP(orderWithVat("B1"), SHOP_ID);

    expect(result.success).toBe(true);
    expect(mockService.approveDocument).toHaveBeenCalledWith("invoice", "inv-1");
  });

  it("does not approve the document when autoApprove is false", async () => {
    const controller = new HoldedController("key", { docType: "invoice", autoApprove: false });
    await controller.syncOrderToERP(orderWithVat("B1"), SHOP_ID);

    expect(mockService.approveDocument).not.toHaveBeenCalled();
  });
});

describe("HoldedController.syncOrderToERP — duplicate-document guard", () => {
  it("returns the existing sync without calling Holded again when already synced", async () => {
    (prismaMock.syncLog.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      externalId:   "inv-existing",
      responseData: JSON.stringify({ docType: "invoice" }),
    });

    const controller = new HoldedController("key", { docType: "smart", autoApprove: false });
    const result = await controller.syncOrderToERP(orderWithVat("B1"), SHOP_ID);

    expect(result).toEqual({
      success:   true,
      erpId:     "inv-existing",
      shopifyId: String(mockShopifyOrder.id),
      action:    "skipped",
      docType:   "invoice",
    });
    expect(mockService.createInvoice).not.toHaveBeenCalled();
    expect(mockService.createSalesReceipt).not.toHaveBeenCalled();
    expect(mockService.createContact).not.toHaveBeenCalled();
  });

  it("proceeds normally when no prior successful sync exists", async () => {
    (prismaMock.syncLog.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const controller = new HoldedController("key", { docType: "invoice", autoApprove: false });
    const result = await controller.syncOrderToERP(orderWithVat("B1"), SHOP_ID);

    expect(result.action).toBe("created");
    expect(mockService.createInvoice).toHaveBeenCalledTimes(1);
  });

  it("tolerates a log row whose responseData predates the docType field", async () => {
    (prismaMock.syncLog.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      externalId:   "inv-existing",
      responseData: JSON.stringify({ erpId: "inv-existing" }), // no docType key
    });

    const controller = new HoldedController("key", { docType: "smart", autoApprove: false });
    const result = await controller.syncOrderToERP(orderWithVat("B1"), SHOP_ID);

    expect(result.success).toBe(true);
    expect(result.action).toBe("skipped");
    expect(result.docType).toBeUndefined();
  });
});

describe("HoldedController.syncOrderToERP — error handling", () => {
  it("returns success=false with the error message when Holded API calls fail", async () => {
    mockService.createInvoice.mockRejectedValue(new Error("Holded API 500: boom"));

    const controller = new HoldedController("key", { docType: "invoice", autoApprove: false });
    const result = await controller.syncOrderToERP(orderWithVat("B1"), SHOP_ID);

    expect(result.success).toBe(false);
    expect(result.error).toContain("boom");
  });
});
