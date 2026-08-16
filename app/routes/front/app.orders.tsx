import { redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";

/**
 * Entry point for the "Sincronizar con Holded" admin_link extension
 * (extensions/holded-order-link) on the order detail page in Shopify admin.
 *
 * Shopify appends the resource id as a query param when the merchant clicks
 * an admin_link — it does not support templating the id into the target
 * path — so this route reads it back and forwards to the real order page.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const rawId =
    url.searchParams.get("id") ??
    url.searchParams.get("ids[]") ??
    url.searchParams.get("resourceId") ??
    "";

  const numericId = rawId.replace(/^gid:\/\/shopify\/Order\//, "").trim();

  if (!numericId) {
    return Response.json({ error: "No se recibió el ID del pedido." }, { status: 400 });
  }

  throw redirect(`/app/orders/${numericId}${url.search}`);
};
