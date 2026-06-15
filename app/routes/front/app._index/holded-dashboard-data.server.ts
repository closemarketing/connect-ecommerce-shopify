import prisma from "~/db.server";
import { HoldedService } from "~/services/erp/holded/holded.service";

export interface HoldedDashboardData {
  products: {
    inShopify:          number;
    availableInERP:     number;
    availableInERPSku:  number;
    withoutSku:         number;
    toImport:           number;
    notInAPI:           number;
  };
  orders: {
    synced:   number;
    errors:   number;
    pending:  number;
    lastSync: string | null;
  };
  recentOrders: Array<{
    id:           number;
    orderNumber:  string;
    customerName: string;
    total:        string;
    destination:  string;
    status:       string;
    errorMessage: string | null;
    createdAt:    string;
  }>;
}

export async function loadHoldedDashboardData(
  shopDomain: string,
  shopId: number,
  shopifyProductCount: number,
): Promise<HoldedDashboardData> {
  const [holdedCounts, syncStats] = await Promise.all([
    fetchHoldedProductCount(shopDomain),
    fetchOrderStats(shopId),
  ]);

  const { withSku, withoutSku } = holdedCounts;

  return {
    products: {
      inShopify:         shopifyProductCount,
      availableInERP:    withSku + withoutSku,
      availableInERPSku: withSku,
      withoutSku,
      toImport:          Math.max(0, withSku - shopifyProductCount),
      notInAPI:          Math.max(0, shopifyProductCount - withSku),
    },
    orders: syncStats.orders,
    recentOrders: syncStats.recentOrders,
  };
}

async function fetchHoldedProductCount(shopDomain: string): Promise<{ withSku: number; withoutSku: number }> {
  try {
    const credRows = await prisma.integrationCredential.findMany({
      where: { sessionId: shopDomain, integration: { name: "holded" } },
    });
    const apikey = credRows.find((r) => r.key === "apikey")?.value;
    if (!apikey) return { withSku: 0, withoutSku: 0 };

    const svc = new HoldedService(apikey);
    let withSku = 0;
    let withoutSku = 0;
    let cursor: string | undefined;
    do {
      const page = await svc.listProducts(100, cursor);
      for (const p of page.items ?? []) {
        if (p.archived) continue;
        if (p.sku?.trim()) withSku++;
        else withoutSku++;
      }
      cursor = page.has_more ? page.cursor : undefined;
    } while (cursor);
    return { withSku, withoutSku };
  } catch {
    return { withSku: 0, withoutSku: 0 };
  }
}

async function fetchOrderStats(shopId: number) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [syncedCount, errorCount, lastSync, recentLogs] = await Promise.all([
    prisma.syncLog.count({
      where: { shopId, status: "SUCCESS", syncType: "ORDER", createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.syncLog.count({
      where: { shopId, status: "ERROR", syncType: "ORDER", createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.syncLog.findFirst({
      where:   { shopId, syncType: "ORDER" },
      orderBy: { createdAt: "desc" },
      select:  { createdAt: true },
    }),
    prisma.syncLog.findMany({
      where:   { shopId, syncType: "ORDER" },
      orderBy: { createdAt: "desc" },
      take:    10,
      select:  {
        id:           true,
        shopifyId:    true,
        status:       true,
        errorMessage: true,
        createdAt:    true,
        erpName:      true,
        requestData:  true,
      },
    }),
  ]);

  const recentOrders = recentLogs.map((log) => {
    let customerName = "—";
    let orderNumber  = log.shopifyId ?? "—";
    let total        = "—";

    try {
      const req = log.requestData ? JSON.parse(log.requestData) : null;
      if (req) {
        const customer = req.customer;
        if (customer) {
          customerName = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || customerName;
        }
        if (req.order_number || req.name) orderNumber = `#${req.order_number ?? req.name}`;
        if (req.total_price) total = `€${parseFloat(req.total_price).toFixed(2)}`;
      }
    } catch {}

    return {
      id:           log.id,
      orderNumber,
      customerName,
      total,
      destination:  log.erpName ?? "Holded",
      status:       log.status,
      errorMessage: log.errorMessage,
      createdAt:    log.createdAt.toISOString(),
    };
  });

  return {
    orders: {
      synced:   syncedCount,
      errors:   errorCount,
      pending:  0,
      lastSync: lastSync ? lastSync.createdAt.toISOString() : null,
    },
    recentOrders,
  };
}
