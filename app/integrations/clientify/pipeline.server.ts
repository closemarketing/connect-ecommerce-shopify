import logger from "../../utils/logger.server";
import { createSyncLog } from "../../services/logging/sync-logger.server";

const CLIENTIFY_API_URL = "https://api.clientify.net/v1";

export interface ClientifyPipeline {
  id: number;
  url: string;
  name: string;
  stages?: ClientifyStage[];
}

export interface ClientifyStage {
  id: number;
  url: string;
  pipeline: string;
  name: string;
  position: number;
  probability: number;
}

/**
 * Obtiene todos los pipelines de Clientify
 */
export async function listClientifyPipelines(apiKey: string): Promise<ClientifyPipeline[]> {
  try {
    const response = await fetch(`${CLIENTIFY_API_URL}/deals/pipelines/`, {
      method: "GET",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Error al obtener pipelines: ${response.statusText}`);
    }

    const data = await response.json();
    logger.info(`✅ ${data.results?.length || 0} pipelines obtenidos de Clientify`);
    return data.results || [];
  } catch (error) {
    logger.error("❌ Error al obtener pipelines de Clientify:", error);
    throw error;
  }
}

/**
 * Crea un nuevo pipeline en Clientify
 */
export async function createClientifyPipeline(
  apiKey: string, 
  name: string,
  shopId: number
): Promise<ClientifyPipeline> {
  const body = { 
    name,
    stages: [],
    is_default: false
  };
  const url = `${CLIENTIFY_API_URL}/deals/pipelines/`;
  
  try {
    logger.info(`🔄 Intentando crear pipeline "${name}" en Clientify...`);
    logger.debug(`URL: ${url}`);
    logger.debug(`Body:`, body);
    logger.debug(`API Key (primeros 10 chars): ${apiKey.substring(0, 10)}...`);
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    logger.info(`Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      const errorText = await response.text();
      
      logger.error(`❌ Error creando pipeline.`);
      logger.error(`Status: ${response.status} ${response.statusText}`);
      logger.error(`Content-Type: ${contentType}`);
      logger.error(`Response (primeros 500 chars):`, errorText.substring(0, 500));
      
      // Guardar log de error
      logger.info(`💾 Guardando log de error en BD... (shopId: ${shopId})`);
      try {
        await createSyncLog({
          shopId,
          syncType: "PIPELINE",
          shopifyId: `pipeline-${name}`,
          status: "ERROR",
          method: "POST",
          url,
          errorMessage: `Status ${response.status}: ${errorText.substring(0, 500)}`,
          requestData: body,
        });
        logger.info(`✅ Log de error guardado`);
      } catch (logError) {
        logger.error(`❌ Error guardando log:`, logError);
      }
      
      // Si es HTML, probablemente es un 404, 403 o endpoint incorrecto
      if (contentType?.includes('text/html') || errorText.includes('<!DOCTYPE') || errorText.includes('<html')) {
        throw new Error(`El endpoint de pipelines retornó HTML en lugar de JSON. Posiblemente el método POST no está permitido o la autenticación falló. Status: ${response.status}`);
      }
      
      // Intentar parsear el error como JSON
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(`Error de Clientify: ${JSON.stringify(errorJson)}`);
      } catch {
        throw new Error(`Error ${response.status}: ${errorText}`);
      }
    }

    const pipeline = await response.json();
    logger.info(`✅ Pipeline "${name}" creado en Clientify con ID: ${pipeline.id}`);
    
    // Guardar log exitoso
    logger.info(`💾 Guardando log exitoso en BD... (shopId: ${shopId})`);
    try {
      await createSyncLog({
        shopId,
        syncType: "PIPELINE",
        shopifyId: `pipeline-${name}`,
        externalId: pipeline.id.toString(),
        status: "SUCCESS",
        method: "POST",
        url,
        requestData: body,
        responseData: pipeline,
      });
      logger.info(`✅ Log exitoso guardado`);
    } catch (logError) {
      logger.error(`❌ Error guardando log:`, logError);
    }
    
    return pipeline;
  } catch (error) {
    logger.error(`❌ Error al crear pipeline "${name}":`, error);
    
    // Si no se guardó antes, guardar log de error
    logger.info(`💾 Guardando log de excepción en BD... (shopId: ${shopId})`);
    try {
      await createSyncLog({
        shopId,
        syncType: "PIPELINE",
        shopifyId: `pipeline-${name}`,
        status: "ERROR",
        method: "POST",
        url,
        errorMessage: error instanceof Error ? error.message : String(error),
        requestData: body,
      });
      logger.info(`✅ Log de excepción guardado`);
    } catch (logError) {
      logger.error(`❌ Error guardando log de excepción:`, logError);
    }
    
    throw error;
  }
}

/**
 * Obtiene un pipeline específico con sus stages
 */
export async function getClientifyPipeline(apiKey: string, pipelineId: number): Promise<ClientifyPipeline> {
  try {
    const response = await fetch(`${CLIENTIFY_API_URL}/deals/pipelines/${pipelineId}/`, {
      method: "GET",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Error al obtener pipeline ${pipelineId}: ${response.statusText}`);
    }

    const pipeline = await response.json();
    logger.info(`✅ Pipeline ${pipelineId} obtenido con ${pipeline.stages?.length || 0} stages`);
    return pipeline;
  } catch (error) {
    logger.error(`❌ Error al obtener pipeline ${pipelineId}:`, error);
    throw error;
  }
}

/**
 * Obtiene todos los stages de Clientify (maneja paginación)
 * @deprecated Usar getClientifyPipeline() para obtener stages de un pipeline específico
 */
export async function listClientifyStages(apiKey: string): Promise<ClientifyStage[]> {
  try {
    let allStages: ClientifyStage[] = [];
    let nextUrl: string | null = `${CLIENTIFY_API_URL}/deals/pipelines/stages/`;
    
    while (nextUrl) {
      const response = await fetch(nextUrl, {
        method: "GET",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Error al obtener stages: ${response.statusText}`);
      }

      const data = await response.json();
      allStages = allStages.concat(data.results || []);
      nextUrl = data.next; // URL de la siguiente página o null si no hay más
      
      logger.debug(`📄 Página obtenida: ${data.results?.length || 0} stages, siguiente: ${nextUrl ? 'Sí' : 'No'}`);
    }
    
    logger.info(`✅ ${allStages.length} stages obtenidos de Clientify (total con paginación)`);
    return allStages;
  } catch (error) {
    logger.error("❌ Error al obtener stages de Clientify:", error);
    throw error;
  }
}

/**
 * Crea un nuevo stage en un pipeline de Clientify
 */
export async function createClientifyStage(
  apiKey: string,
  pipelineId: number,
  name: string,
  shopId: number,
  position: number = 1,
  probability: number = 0
): Promise<ClientifyStage> {
  const body = {
    name,
    position,
    probability,
    pipeline: `${CLIENTIFY_API_URL}/deals/pipelines/${pipelineId}/`,
  };
  const url = `${CLIENTIFY_API_URL}/deals/pipelines/stages/`;
  
  try {
    logger.info(`🔄 Creando stage "${name}" en pipeline ${pipelineId}...`);
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      const errorText = await response.text();
      
      logger.error(`❌ Error creando stage: ${response.status} - ${errorText}`);
      
      // Guardar log de error
      logger.info(`💾 Guardando log de error en BD... (shopId: ${shopId})`);
      try {
        await createSyncLog({
          shopId,
          syncType: "STAGE",
          shopifyId: `stage-${pipelineId}-${name}`,
          status: "ERROR",
          method: "POST",
          url,
          errorMessage: `Status ${response.status}: ${errorText}`,
          requestData: body,
        });
        logger.info(`✅ Log de error guardado`);
      } catch (logError) {
        logger.error(`❌ Error guardando log:`, logError);
      }
      
      throw new Error(`Error al crear stage: ${response.statusText}`);
    }

    const stage = await response.json();
    logger.info(`✅ Stage "${name}" creado con ID: ${stage.id}`);
    
    // Guardar log exitoso
    logger.info(`💾 Guardando log exitoso en BD... (shopId: ${shopId})`);
    try {
      await createSyncLog({
        shopId,
        syncType: "STAGE",
        shopifyId: `stage-${pipelineId}-${name}`,
        clientifyId: stage.id,
        status: "SUCCESS",
        method: "POST",
        url,
        requestData: body,
        responseData: stage,
      });
      logger.info(`✅ Log exitoso guardado`);
    } catch (logError) {
      logger.error(`❌ Error guardando log:`, logError);
    }
    
    return stage;
  } catch (error) {
    logger.error(`❌ Error al crear stage:`, error);
    
    // Si no se guardó antes, guardar log de error
    logger.info(`💾 Guardando log de excepción en BD... (shopId: ${shopId})`);
    try {
      await createSyncLog({
        shopId,
        syncType: "STAGE",
        shopifyId: `stage-${pipelineId}-${name}`,
        status: "ERROR",
        method: "POST",
        url,
        errorMessage: error instanceof Error ? error.message : String(error),
        requestData: body,
      });
      logger.info(`✅ Log de excepción guardado`);
    } catch (logError) {
      logger.error(`❌ Error guardando log de excepción:`, logError);
    }
    
    throw error;
  }
}

/**
 * Actualiza un stage existente en Clientify
 */
export async function updateClientifyStage(
  apiKey: string,
  stageId: number,
  name: string,
  shopId: number,
  probability?: number
): Promise<ClientifyStage> {
  const body: any = { name };
  if (probability !== undefined) {
    body.probability = probability;
  }
  const url = `${CLIENTIFY_API_URL}/deals/pipelines/stages/${stageId}/`;
  
  try {
    logger.info(`🔄 Actualizando stage ${stageId} "${name}"...`);
    
    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`❌ Error actualizando stage: ${response.status} - ${errorText}`);
      
      // Guardar log de error
      logger.info(`💾 Guardando log de error en BD... (shopId: ${shopId})`);
      try {
        await createSyncLog({
          shopId,
          syncType: "STAGE",
          shopifyId: `stage-update-${stageId}`,
          status: "ERROR",
          method: "PATCH",
          url,
          errorMessage: `Status ${response.status}: ${errorText}`,
          requestData: body,
        });
        logger.info(`✅ Log de error guardado`);
      } catch (logError) {
        logger.error(`❌ Error guardando log:`, logError);
      }
      
      throw new Error(`Error al actualizar stage: ${response.statusText}`);
    }

    const stage = await response.json();
    logger.info(`✅ Stage ${stageId} actualizado`);
    
    // Guardar log exitoso
    logger.info(`💾 Guardando log exitoso en BD... (shopId: ${shopId})`);
    try {
      await createSyncLog({
        shopId,
        syncType: "STAGE",
        shopifyId: `stage-update-${stageId}`,
        clientifyId: stage.id,
        status: "SUCCESS",
        method: "PATCH",
        url,
        requestData: body,
        responseData: stage,
      });
      logger.info(`✅ Log exitoso guardado`);
    } catch (logError) {
      logger.error(`❌ Error guardando log:`, logError);
    }
    
    return stage;
  } catch (error) {
    logger.error(`❌ Error al actualizar stage:`, error);
    
    // Guardar log de excepción
    logger.info(`💾 Guardando log de excepción en BD... (shopId: ${shopId})`);
    try {
      await createSyncLog({
        shopId,
        syncType: "STAGE",
        shopifyId: `stage-update-${stageId}`,
        status: "ERROR",
        method: "PATCH",
        url,
        errorMessage: error instanceof Error ? error.message : String(error),
        requestData: body,
      });
      logger.info(`✅ Log de excepción guardado`);
    } catch (logError) {
      logger.error(`❌ Error guardando log de excepción:`, logError);
    }
    
    throw error;
  }
}

/**
 * Obtiene stages de un pipeline específico
 */
export async function getStagesByPipeline(apiKey: string, pipelineId: number): Promise<ClientifyStage[]> {
  const allStages = await listClientifyStages(apiKey);
  const pipelineUrl = `${CLIENTIFY_API_URL}/deals/pipelines/${pipelineId}/`;
  
  return allStages.filter(stage => stage.pipeline === pipelineUrl);
}

/**
 * Verifica si un pipeline con el mismo nombre ya existe
 */
export async function pipelineExists(apiKey: string, name: string): Promise<ClientifyPipeline | null> {
  const pipelines = await listClientifyPipelines(apiKey);
  return pipelines.find(p => p.name.toLowerCase() === name.toLowerCase()) || null;
}
