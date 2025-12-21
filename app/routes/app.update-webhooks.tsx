import { type LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import shopify from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  try {
    const response = await shopify.registerWebhooks({ session });
    
    console.log("✅ Webhooks registration response:", response);
    
    return Response.json({ 
      success: true, 
      message: "Webhooks actualizados correctamente",
      response 
    });
  } catch (error: any) {
    console.error("❌ Error registering webhooks:", error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
};
