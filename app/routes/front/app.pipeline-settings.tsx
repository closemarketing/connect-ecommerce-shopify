import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { ClientifyService, type ClientifyStage } from "~/services/clientify/pipeline.server";
import logger from "~/utils/logger.server";

// Definición de los 7 estados de Shopify con sus configuraciones por defecto
const SHOPIFY_ORDER_STATUSES = [
  { value: "pending", label: "Pendiente", probability: 3 },
  { value: "authorized", label: "Autorizado", probability: 5 },
  { value: "partially_paid", label: "Parcialmente pagado", probability: 6 },
  { value: "paid", label: "Pagado", probability: 10 },
  { value: "partially_refunded", label: "Parcialmente reembolsado", probability: 8 },
  { value: "refunded", label: "Reembolsado", probability: 7 },
  { value: "voided", label: "Anulado", probability: 1 },
];

// Loader: Obtener configuración actual
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    // Obtener credenciales de Clientify
    const clientifyCredentials = await db.integrationCredential.findFirst({
      where: {
        sessionId: shop,
        integration: { name: "clientify" },
        key: "apikey",
      },
    });

    if (!clientifyCredentials) {
      return { error: "No Clientify credentials configured" };
    }

    // Obtener shop record
    const shopRecord = await db.shop.findUnique({
      where: { domain: shop },
    });

    if (!shopRecord) {
      return { error: "Shop not found" };
    }

    // Obtener pipelines de Clientify
    const service = new ClientifyService(clientifyCredentials.value);
    const pipelines = await service.listPipelines();
    logger.info(`📋 Pipelines obtenidos: ${pipelines.length}`);

    // Obtener configuración actual para saber qué pipeline es el default
    const pipelineConfigs = await db.pipelineConfig.findMany({
      where: { shopId: shopRecord.id },
      include: {
        stageMappings: true,
      },
    });
    logger.info(`📋 Pipeline configs: ${pipelineConfigs.length}`);

    // Obtener stages del pipeline default (si existe)
    let stages: ClientifyStage[] = [];
    if (pipelineConfigs.length > 0 && pipelineConfigs[0].clientifyPipelineId) {
      const pipelineWithStages = await service.getPipeline(
        pipelineConfigs[0].clientifyPipelineId
      );
      stages = pipelineWithStages.stages || [];
      logger.info(`📋 Stages del pipeline ${pipelineConfigs[0].clientifyPipelineId}: ${stages.length}`);
    }

    return {
      pipelines,
      stages,
      pipelineConfigs,
      shopId: shopRecord.id,
    };
  } catch (error) {
    logger.error("Error loading pipeline configuration:", error);
    return {
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
};

// Action: Gestionar pipelines y stages
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    const formData = await request.formData();
    const action = formData.get("action") as string;

    // Obtener credenciales de Clientify
    const clientifyCredentials = await db.integrationCredential.findFirst({
      where: {
        sessionId: shop,
        integration: { name: "clientify" },
        key: "apikey",
      },
    });

    if (!clientifyCredentials) {
      return { error: "No Clientify credentials configured" };
    }

    // Obtener shop record
    const shopRecord = await db.shop.findUnique({
      where: { domain: shop },
    });

    if (!shopRecord) {
      return { error: "Shop not found" };
    }

    switch (action) {
      case "create_pipeline": {
        const name = formData.get("name") as string;

        if (!name) {
          return { error: "Pipeline name is required" };
        }

        // Crear pipeline en Clientify
        const service = new ClientifyService(clientifyCredentials.value);
        const pipeline = await service.createPipeline(name, shopRecord.id);

        return { success: true, pipeline };
      }

      case "set_default_pipeline": {
        const pipelineId = parseInt(formData.get("pipelineId") as string);
        const pipelineName = formData.get("pipelineName") as string;

        if (!pipelineId || !pipelineName) {
          return { error: "Pipeline ID and name are required" };
        }

        // Obtener el pipeline con sus stages actuales
        const service = new ClientifyService(clientifyCredentials.value);
        const pipelineWithStages = await service.getPipeline(pipelineId);
        const existingStages = pipelineWithStages.stages || [];
        
        logger.info(`📊 Pipeline ${pipelineId} tiene ${existingStages.length} stages existentes`);

        // Verificar si faltan stages para los 7 estados de Shopify
        const createdStages: ClientifyStage[] = [];
        
        for (let i = 0; i < SHOPIFY_ORDER_STATUSES.length; i++) {
          const statusConfig = SHOPIFY_ORDER_STATUSES[i];
          
          // Buscar si ya existe un stage con nombre similar
          const existingStage = existingStages.find((s: ClientifyStage) => 
            s.name.toLowerCase().includes(statusConfig.value.toLowerCase()) ||
            s.name.toLowerCase() === statusConfig.label.toLowerCase()
          );

          if (!existingStage) {
            logger.info(`📝 Creando stage para estado "${statusConfig.value}"...`);
            
            // Crear el stage
            const newStage = await service.createStage(
              pipelineId,
              statusConfig.label,
              shopRecord.id,
              existingStages.length + createdStages.length,
              statusConfig.probability
            );
            
            createdStages.push(newStage);
            logger.info(`✅ Stage "${statusConfig.label}" creado con ID ${newStage.id}`);
          } else {
            logger.info(`✓ Stage para "${statusConfig.value}" ya existe: ${existingStage.name} (ID: ${existingStage.id})`);
          }
        }

        // Obtener el pipeline actualizado con todos los stages
        const updatedPipeline = await service.getPipeline(pipelineId);
        const allStages = updatedPipeline.stages || [];

        // Desmarcar todos como default
        await db.pipelineConfig.updateMany({
          where: { shopId: shopRecord.id },
          data: { isDefault: false },
        });

        // Crear o actualizar pipeline config
        const pipelineConfig = await db.pipelineConfig.upsert({
          where: {
            shopId_clientifyPipelineId: {
              shopId: shopRecord.id,
              clientifyPipelineId: pipelineId,
            },
          },
          update: {
            isDefault: true,
            clientifyPipelineName: pipelineName,
          },
          create: {
            shopId: shopRecord.id,
            clientifyPipelineId: pipelineId,
            clientifyPipelineName: pipelineName,
            isDefault: true,
          },
          include: {
            stageMappings: true,
          },
        });

        // Auto-mapear los estados de Shopify a los stages correspondientes
        for (const statusConfig of SHOPIFY_ORDER_STATUSES) {
          // Buscar el stage correspondiente
          const matchingStage = allStages.find((s: ClientifyStage) => 
            s.name.toLowerCase().includes(statusConfig.value.toLowerCase()) ||
            s.name.toLowerCase() === statusConfig.label.toLowerCase()
          );

          if (matchingStage) {
            // Verificar si ya existe un mapeo
            const existingMapping = pipelineConfig.stageMappings.find(
              m => m.shopifyOrderStatus === statusConfig.value
            );

            if (!existingMapping) {
              logger.info(`🔗 Auto-mapeando "${statusConfig.value}" → "${matchingStage.name}"`);
              
              await db.orderStageMapping.create({
                data: {
                  pipelineConfigId: pipelineConfig.id,
                  shopifyOrderStatus: statusConfig.value,
                  clientifyStageId: matchingStage.id,
                  clientifyStageName: matchingStage.name,
                },
              });
            } else {
              logger.info(`✓ Mapeo para "${statusConfig.value}" ya existe`);
            }
          }
        }

        logger.info(`🎉 Pipeline configurado con ${createdStages.length} stages nuevos creados`);

        return { 
          success: true, 
          pipelineConfig,
          stagesCreated: createdStages.length,
          message: createdStages.length > 0 
            ? `Pipeline configurado correctamente. Se crearon ${createdStages.length} stages automáticamente.`
            : "Pipeline configurado correctamente."
        };
      }

      case "create_stage": {
        const pipelineId = parseInt(formData.get("pipelineId") as string);
        const name = formData.get("name") as string;
        const position = parseInt(formData.get("position") as string) || 0;
        const probability = parseInt(formData.get("probability") as string) || 1;

        if (!pipelineId || !name) {
          return { error: "Pipeline ID and stage name are required" };
        }

        // Crear stage en Clientify
        const service = new ClientifyService(clientifyCredentials.value);
        const stage = await service.createStage(
          pipelineId,
          name,
          shopRecord.id,
          position,
          probability
        );

        return { success: true, stage };
      }

      case "update_stage": {
        const stageId = parseInt(formData.get("stageId") as string);
        const name = formData.get("name") as string;
        const probability = parseInt(formData.get("probability") as string);

        if (!stageId || !name) {
          return { error: "Stage ID and name are required" };
        }

        // Actualizar stage en Clientify
        const service = new ClientifyService(clientifyCredentials.value);
        const stage = await service.updateStage(
          stageId,
          name,
          shopRecord.id,
          probability
        );

        return { success: true, stage };
      }

      case "map_order_status": {
        const pipelineConfigId = parseInt(formData.get("pipelineConfigId") as string);
        const shopifyOrderStatus = formData.get("shopifyOrderStatus") as string;
        const stageId = parseInt(formData.get("stageId") as string);
        const stageName = formData.get("stageName") as string;

        if (!pipelineConfigId || !shopifyOrderStatus || !stageId || !stageName) {
          return { error: "All fields are required" };
        }

        // Crear o actualizar mapping
        const mapping = await db.orderStageMapping.upsert({
          where: {
            pipelineConfigId_shopifyOrderStatus: {
              pipelineConfigId,
              shopifyOrderStatus,
            },
          },
          update: {
            clientifyStageId: stageId,
            clientifyStageName: stageName,
          },
          create: {
            pipelineConfigId,
            shopifyOrderStatus,
            clientifyStageId: stageId,
            clientifyStageName: stageName,
          },
        });

        return { success: true, mapping };
      }

      case "delete_mapping": {
        const mappingId = parseInt(formData.get("mappingId") as string);

        if (!mappingId) {
          return { error: "Mapping ID is required" };
        }

        await db.orderStageMapping.delete({
          where: { id: mappingId },
        });

        return { success: true };
      }

      default:
        return { error: "Invalid action" };
    }
  } catch (error) {
    logger.error("Error in pipeline action:", error);
    return {
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
};

export default function PipelineSettings() {
  return null; // Este componente solo maneja API, no renderiza UI
}
