import prisma from "~/db.server";
import { OdooService } from "~/services/erp/odoo/odoo.service";

export interface OdooDashboardData {
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

export async function loadOdooDashboardData(
  shopDomain: string,
  shopId: number,
  shopifyProductCount: number,
): Promise<OdooDashboardData> {
  const [odooCounts, syncStats] = await Promise.all([
    fetchOdooProductCount(shopDomain),
    fetchOrderStats(shopId),
  ]);

  const { withSku, withoutSku } = odooCounts;

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

async function fetchOdooProductCount(shopDomain: string): Promise<{ withSku: number; withoutSku: number }> {
  try {
    const credRows = await prisma.integrationCredential.findMany({
      where: { sessionId: shopDomain, integration: { name: "odoo" } },
    });
    const creds = Object.fromEntries(credRows.map((r) => [r.key, r.value]));
    if (!creds.url || !creds.dbname || !creds.username || !creds.apikey) return { withSku: 0, withoutSku: 0 };

    const odoo = new OdooService({
      url:      creds.url,
      dbname:   creds.dbname,
      username: creds.username,
      apikey:   creds.apikey,
    });

    const [withSku, withoutSku] = await Promise.all([
      odoo.searchCount("product.template", [["active", "=", true], ["default_code", "!=", false]]),
      odoo.searchCount("product.template", [["active", "=", true], ["default_code", "=", false]]),
    ]);

    return { withSku, withoutSku };
  } catch {
    return { withSku: 0, withoutSku: 0 };
  }
}

async function fetchOrderStats(shopId: number) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [syncedCount, errorCount, lastSync, recentLogs] = await Promise.all([
    prisma.syncLog.count({
      where: { shopId, status: "SUCCESS", syncType: "ORDER", erpName: "odoo", createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.syncLog.count({
      where: { shopId, status: "ERROR", syncType: "ORDER", erpName: "odoo", createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.syncLog.findFirst({
      where:   { shopId, syncType: "ORDER", erpName: "odoo" },
      orderBy: { createdAt: "desc" },
      select:  { createdAt: true },
    }),
    prisma.syncLog.findMany({
      where:   { shopId, syncType: "ORDER", erpName: "odoo" },
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
    } catch {
      // requestData is best-effort context — ignore malformed JSON
    }

    return {
      id:           log.id,
      orderNumber,
      customerName,
      total,
      destination:  log.erpName ?? "Odoo",
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
