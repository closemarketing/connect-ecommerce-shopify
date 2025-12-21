import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query getProducts {
        products(first: 50) {
          edges {
            node {
              id
              title
              handle
              status
              createdAt
              totalInventory
              variants(first: 1) {
                edges {
                  node {
                    id
                    price
                    inventoryQuantity
                  }
                }
              }
              featuredImage {
                url
                altText
              }
            }
          }
        }
      }
    `
  );

  const responseJson = await response.json();
  console.log("Products response:", responseJson);
  const products = responseJson.data?.products?.edges?.map((edge: any) => edge.node) || [];

  return {
    products,
  };
}

function truncate(str: string, { length = 30 } = {}) {
  if (!str) return "";
  if (str.length <= length) return str;
  return str.slice(0, length) + "…";
}

const EmptyProductsState = () => (
  <s-section accessibilityLabel="Empty state section">
    <s-grid gap="base" justifyItems="center" paddingBlock="large-400">
      <s-box maxInlineSize="200px" maxBlockSize="200px">
        <s-image
          aspectRatio="1/0.5"
          src="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          alt="A stylized graphic representing products"
        />
      </s-box>
      <s-stack gap="large-200" alignment="center">
        <s-heading>No products found</s-heading>
        <s-paragraph tone="subdued" alignment="center">
          Create products in your store to see them here.
        </s-paragraph>
      </s-stack>
    </s-grid>
  </s-section>
);

const ProductsTable = ({ products }: { products: any[] }) => (
  <s-section>
    <div style={{ width: "100%", overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #e0e0e0" }}>
            <th style={{ padding: "12px", textAlign: "left", fontWeight: 600 }}>Image</th>
            <th style={{ padding: "12px", textAlign: "left", fontWeight: 600 }}>Product</th>
            <th style={{ padding: "12px", textAlign: "left", fontWeight: 600 }}>Status</th>
            <th style={{ padding: "12px", textAlign: "left", fontWeight: 600 }}>Inventory</th>
            <th style={{ padding: "12px", textAlign: "left", fontWeight: 600 }}>Price</th>
            <th style={{ padding: "12px", textAlign: "left", fontWeight: 600 }}>Created</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
              <td style={{ padding: "12px" }}>
                {product.featuredImage ? (
                  <img 
                    src={product.featuredImage.url} 
                    alt={product.featuredImage.altText || product.title}
                    style={{ width: "40px", height: "40px", objectFit: "cover", borderRadius: "4px" }}
                  />
                ) : (
                  <div style={{ width: "40px", height: "40px", backgroundColor: "#f0f0f0", borderRadius: "4px" }} />
                )}
              </td>
              <td style={{ padding: "12px" }}>
                <div>
                  <div style={{ fontWeight: 500 }}>{product.title}</div>
                  <div style={{ fontSize: "12px", color: "#666" }}>{product.handle}</div>
                </div>
              </td>
              <td style={{ padding: "12px" }}>
                <s-badge tone={product.status === "ACTIVE" ? "success" : "info"}>
                  {product.status.toLowerCase()}
                </s-badge>
              </td>
              <td style={{ padding: "12px" }}>
                {product.totalInventory !== null ? product.totalInventory : "N/A"}
              </td>
              <td style={{ padding: "12px" }}>
                {product.variants.edges[0]?.node?.price 
                  ? `$${product.variants.edges[0].node.price}` 
                  : "N/A"}
              </td>
              <td style={{ padding: "12px", color: "#666", fontSize: "14px" }}>
                {new Date(product.createdAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </s-section>
);

export default function Products() {
  const { products } = useLoaderData<typeof loader>();

  return (
    <s-page>
      <s-text slot="title" variant="headingLg" as="h1">
        Products
      </s-text>
      <s-text slot="subtitle" variant="bodyMd" as="p">
        View all products from your Shopify store ({products.length} products)
      </s-text>

      {products.length === 0 ? (
        <EmptyProductsState />
      ) : (
        <ProductsTable products={products} />
      )}
    </s-page>
  );
}

export { boundary };
