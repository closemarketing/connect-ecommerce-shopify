import { useState, useEffect } from "react";
import {
  useActionData,
  useLoaderData,
  useSubmit,
  useNavigation,
  useNavigate,
  useParams,
  Link,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

import db from "../db.server";
import { getQRCode, validateQRCode } from "../models/QRCode.server";

export async function loader({ request, params }) {
  const { admin } = await authenticate.admin(request);

  if (params.id === "new") {
    return {
      destination: "product",
      title: "",
    };
  }

  return await getQRCode(Number(params.id), admin.graphql);
}

export async function action({ request, params }) {
  const { session, redirect } = await authenticate.admin(request);
  const { shop } = session;

  /** @type {any} */
  const data = {
    ...Object.fromEntries(await request.formData()),
    shop,
  };

  if (data.action === "delete") {
    await db.qRCode.delete({ where: { id: Number(params.id) } });
    return redirect("/app");
  }

  const errors = validateQRCode(data);

  if (errors) {
    return { errors };
  }

  const qrCode =
    params.id === "new"
      ? await db.qRCode.create({ data })
      : await db.qRCode.update({ where: { id: Number(params.id) }, data });

  return redirect(`/app/qrcodes/${qrCode.id}`);
}

export default function QRCodeForm() {
  const errors = useActionData()?.errors || {};

  const qrCode = useLoaderData();
  const [formState, setFormState] = useState(() => ({
    ...qrCode,
    destination: qrCode.destination || "product",
  }));
  const [cleanFormState, setCleanFormState] = useState(() => ({
    ...qrCode,
    destination: qrCode.destination || "product",
  }));
  const isDirty = JSON.stringify(formState) !== JSON.stringify(cleanFormState);

  const nav = useNavigation();
  const isSaving =
    nav.state === "submitting" && nav.formData?.get("action") !== "delete";
  const isDeleting =
    nav.state === "submitting" && nav.formData?.get("action") === "delete";

  const navigate = useNavigate();
  const params = useParams();
  const shopify = useAppBridge();

  async function selectProduct() {
    const products = await window.shopify.resourcePicker({
      type: "product",
      action: "select", // customized action verb, either 'select' or 'add',
    });

    if (products) {
      const { images, id, variants, title, handle } = products[0];

      setFormState({
        ...formState,
        productId: id,
        productVariantId: variants[0].id,
        productTitle: title,
        productHandle: handle,
        productAlt: images[0]?.altText,
        productImage: images[0]?.originalSrc,
      });
    }
  }

  const submit = useSubmit();
  function handleSave() {
    const data = {
      title: formState.title,
      productId: formState.productId,
      productVariantId: formState.productVariantId,
      productHandle: formState.productHandle,
      destination: formState.destination,
    };

    setCleanFormState({ ...formState });
    submit(data, { method: "post" });
  }

  useEffect(() => {
    const initialState = {
      ...qrCode,
      destination: qrCode.destination || "product",
    };
    setFormState(initialState);
    setCleanFormState(initialState);
  }, [qrCode]);

  useEffect(() => {
    if (isDirty) {
      shopify.saveBar.show("save-bar");
    } else {
      shopify.saveBar.hide("save-bar");
    }
  }, [isDirty, shopify]);

  return (
    <s-page>
      <s-link slot="back-action" url="/app">
        QR codes
      </s-link>
      <s-text slot="title" variant="headingLg" as="h1">
        {params.id === "new" ? "Create" : "Edit"} QR code
      </s-text>
      {isDeleting && (
        <s-banner slot="banner" tone="warning">
          Deleting QR code...
        </s-banner>
      )}
      <s-grid columns={{ xs: 1, md: "2fr 1fr" }} gap="large-500">
        <s-section>
          <s-box paddingBlockEnd="large-400">
            <s-stack gap="large-500">
              <s-text-field
                label="Title"
                value={formState.title}
                onInput={(e) =>
                  setFormState({ ...formState, title: e.target.value })
                }
                error={errors.title}
                details="Only store staff can see this title"
              />

              <s-stack gap="base">
                <s-text variant="headingMd" as="h2">
                  Product
                </s-text>
                {formState.productId ? (
                  <s-stack gap="base">
                    <s-clickable onClick={selectProduct}>
                      <s-box
                        borderRadius="base"
                        borderColor="border"
                        borderStyle="solid"
                        borderWidth="025"
                        padding="base"
                      >
                        <s-stack gap="base" alignment="center">
                          {formState.productImage && (
                            <s-image
                              source={formState.productImage}
                              alt={formState.productAlt}
                              aspectRatio="1/1"
                              width="50px"
                            />
                          )}
                          <s-stack gap="none">
                            <s-text fontWeight="bold">
                              {formState.productTitle}
                            </s-text>
                          </s-stack>
                        </s-stack>
                      </s-box>
                    </s-clickable>
                  </s-stack>
                ) : (
                  <s-stack gap="base">
                    <s-button onClick={selectProduct}>Select product</s-button>
                    {errors.productId && (
                      <s-banner tone="critical">{errors.productId}</s-banner>
                    )}
                  </s-stack>
                )}

                <s-select
                  label="Destination"
                  value={formState.destination || "product"}
                  onInput={(e) =>
                    setFormState({ ...formState, destination: e.target.value })
                  }
                  error={errors.destination}
                  details="Where should the QR code take customers?"
                >
                  <option value="product">Product page</option>
                  <option value="cart">Checkout</option>
                </s-select>
                {qrCode.destinationUrl && (
                  <s-link url={qrCode.destinationUrl} target="_blank">
                    Go to destination URL
                  </s-link>
                )}
              </s-stack>
            </s-stack>
          </s-box>
        </s-section>
        <s-box slot="aside" as="aside">
          <s-section>
            <s-stack gap="large-500">
              <s-text variant="headingMd" as="h2">
                QR code
              </s-text>
              {qrCode?.image ? (
                <s-image source={qrCode.image} alt="QR Code" />
              ) : (
                <s-box
                  padding="large-500"
                  borderRadius="base"
                  background="bg-surface-secondary"
                >
                  <s-stack gap="base" alignment="center">
                    <s-text tone="subdued" alignment="center">
                      Your QR code will appear here after you save
                    </s-text>
                  </s-stack>
                </s-box>
              )}
              <s-stack gap="base">
                {qrCode?.image && (
                  <>
                    <s-button
                      url={`/qrcodes/${qrCode.id}`}
                      target="_blank"
                      fullWidth
                    >
                      Go to public URL
                    </s-button>
                    <s-button
                      onClick={() => {
                        const link = document.createElement("a");
                        link.href = qrCode.image;
                        link.download = `qr-code-${qrCode.id}.png`;
                        link.click();
                      }}
                      fullWidth
                    >
                      Download
                    </s-button>
                  </>
                )}
                {params.id !== "new" && (
                  <s-button
                    tone="critical"
                    variant="secondary"
                    onClick={() => {
                      submit({ action: "delete" }, { method: "post" });
                    }}
                    loading={isDeleting}
                    fullWidth
                  >
                    Delete QR code
                  </s-button>
                )}
              </s-stack>
            </s-stack>
          </s-section>
        </s-box>
      </s-grid>
      <ui-save-bar id="save-bar">
        <button slot="save-action" variant="primary" onClick={handleSave} disabled={isSaving}>
          Save
        </button>
        <button slot="discard-action" onClick={() => setFormState(cleanFormState)}>
          Discard
        </button>
      </ui-save-bar>
    </s-page>
  );
}

export { boundary };
