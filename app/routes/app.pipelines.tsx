import { useState, useEffect } from "react";
import { useLoaderData, useFetcher, useNavigate, useRevalidator } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export { loader, action } from "./app.pipeline-settings";

const SHOPIFY_ORDER_STATUSES = [
  { value: "pending", label: "Pendiente" },
  { value: "authorized", label: "Autorizado" },
  { value: "partially_paid", label: "Parcialmente pagado" },
  { value: "paid", label: "Pagado" },
  { value: "partially_refunded", label: "Parcialmente reembolsado" },
  { value: "refunded", label: "Reembolsado" },
  { value: "voided", label: "Anulado" },
];

export default function PipelineConfiguration() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const revalidator = useRevalidator();

  const [selectedPipeline, setSelectedPipeline] = useState<number | null>(null);
  const [newPipelineName, setNewPipelineName] = useState("");
  const [newStageName, setNewStageName] = useState("");
  const [newStagePosition, setNewStagePosition] = useState(0);
  const [newStageProbability, setNewStageProbability] = useState(1);
  const [editingStage, setEditingStage] = useState<{id: number, name: string, probability: number} | null>(null);

  // Función para obtener color según probabilidad (1-10 = 10%-100%)
  const getProbabilityColor = (probability: number) => {
    if (probability <= 3) return '#D72C0D'; // Rojo (10-30%)
    if (probability <= 5) return '#FFA500'; // Naranja (40-50%)
    if (probability <= 7) return '#FFC453'; // Amarillo (60-70%)
    return '#008060'; // Verde (80-100%)
  };

  // Recargar datos cuando el fetcher complete una acción
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      revalidator.revalidate();
      // Limpiar campos después de una acción exitosa
      if (fetcher.data.success) {
        setNewPipelineName("");
        setNewStageName("");
        setEditingStage(null);
        
        // Mostrar mensaje de éxito si se crearon stages automáticamente
        if (fetcher.data.message) {
          alert(fetcher.data.message);
        }
      }
      // Mostrar error si hay
      if (fetcher.data.error) {
        alert(`Error: ${fetcher.data.error}`);
      }
    }
  }, [fetcher.state, fetcher.data]);

  if ('error' in data) {
    return (
      <s-page>
        <s-text slot="title" as="h1">Configuración de Pipelines</s-text>
        <s-card>
          <s-banner tone="critical">
            <p>{data.error}</p>
          </s-banner>
        </s-card>
      </s-page>
    );
  }

  const { pipelines, stages, pipelineConfigs } = data;
  const defaultConfig = pipelineConfigs.find(c => c.isDefault);
  const selectedPipelineStages = selectedPipeline
    ? stages.filter(s => s.pipeline.includes(`/${selectedPipeline}/`))
    : [];

  // Debug: log pipelines data
  useEffect(() => {
    console.log("🔍 Pipelines en componente:", pipelines);
    console.log("🔍 Total de pipelines:", pipelines?.length);
    console.log("🔍 Stages en componente:", stages);
    console.log("🔍 Data completa:", data);
  }, [pipelines, stages, data]);

  const createPipeline = () => {
    if (!newPipelineName.trim()) {
      alert("Por favor ingresa un nombre para el pipeline");
      return;
    }

    if (!confirm(`¿Crear pipeline "${newPipelineName}" en Clientify?`)) {
      return;
    }

    const formData = new FormData();
    formData.append("action", "create_pipeline");
    formData.append("name", newPipelineName);

    fetcher.submit(formData, { method: "post" });
  };

  const setDefaultPipeline = (pipelineId: number, pipelineName: string) => {
    if (!confirm(`¿Establecer "${pipelineName}" como pipeline por defecto?\n\nSi el pipeline no tiene los 7 stages necesarios para los estados de Shopify, se crearán automáticamente.`)) {
      return;
    }

    const formData = new FormData();
    formData.append("action", "set_default_pipeline");
    formData.append("pipelineId", pipelineId.toString());
    formData.append("pipelineName", pipelineName);

    fetcher.submit(formData, { method: "post" });
  };

  const createStage = () => {
    if (!defaultConfig || !newStageName.trim()) {
      alert("Debes establecer un pipeline por defecto primero e ingresar un nombre para la etapa");
      return;
    }

    if (!confirm(`¿Crear stage "${newStageName}" en el pipeline "${defaultConfig.clientifyPipelineName}"?`)) {
      return;
    }

    const formData = new FormData();
    formData.append("action", "create_stage");
    formData.append("pipelineId", defaultConfig.clientifyPipelineId.toString());
    formData.append("name", newStageName);
    formData.append("position", newStagePosition.toString());
    formData.append("probability", newStageProbability.toString());

    fetcher.submit(formData, { method: "post" });
  };

  const updateStage = () => {
    if (!editingStage) return;
    
    if (!confirm(`¿Actualizar stage "${editingStage.name}"?`)) {
      return;
    }

    const formData = new FormData();
    formData.append("action", "update_stage");
    formData.append("stageId", editingStage.id.toString());
    formData.append("name", editingStage.name);
    formData.append("probability", editingStage.probability.toString());

    fetcher.submit(formData, { method: "post" });
  };

  const mapOrderStatus = (shopifyStatus: string, stageId: number, stageName: string) => {
    if (!defaultConfig) {
      alert("Primero establece un pipeline por defecto");
      return;
    }

    if (!confirm(`¿Asignar estado "${SHOPIFY_ORDER_STATUSES.find(s => s.value === shopifyStatus)?.label}" a la etapa "${stageName}"?`)) {
      return;
    }

    const formData = new FormData();
    formData.append("action", "map_order_status");
    formData.append("pipelineConfigId", defaultConfig.id.toString());
    formData.append("shopifyOrderStatus", shopifyStatus);
    formData.append("stageId", stageId.toString());
    formData.append("stageName", stageName);

    fetcher.submit(formData, { method: "post" });
  };

  return (
    <s-page>
      <s-text slot="title" as="h1">Configuración de Pipelines</s-text>
      <s-text slot="subtitle" as="p">
        Configura cómo se sincronizarán las órdenes de Shopify con los pipelines de Clientify
      </s-text>

      {/* PASO 1: Seleccionar o Crear Pipeline */}
      <s-card>
        <s-text variant="headingMd" as="h2">1. Seleccionar Pipeline</s-text>
        <s-block-stack gap="400">
          <s-text as="p">
            Pipeline actual: {defaultConfig ? <strong>{defaultConfig.clientifyPipelineName}</strong> : <em>Ninguno</em>}
          </s-text>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
              Pipelines disponibles en Clientify
            </label>
            <select
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '4px',
                border: '1px solid #c4cdd5',
                fontSize: '14px'
              }}
              value={selectedPipeline?.toString() || ""}
              onChange={(e) => setSelectedPipeline(parseInt(e.target.value))}
            >
              <option value="">Seleccionar...</option>
              {pipelines && pipelines.length > 0 ? (
                pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {defaultConfig?.clientifyPipelineId === p.id ? "(actual)" : ""}
                  </option>
                ))
              ) : (
                <option value="" disabled>No hay pipelines disponibles</option>
              )}
            </select>
          </div>

          {pipelines && pipelines.length === 0 && (
            <s-banner tone="warning">
              <p>No se encontraron pipelines en Clientify. Crea uno nuevo a continuación.</p>
            </s-banner>
          )}

          {selectedPipeline && (
            <s-button
              onClick={() => {
                const pipeline = pipelines.find(p => p.id === selectedPipeline);
                if (pipeline) setDefaultPipeline(pipeline.id, pipeline.name);
              }}
            >
              Establecer como pipeline por defecto
            </s-button>
          )}

          <s-divider />

          <s-text variant="headingSm" as="h3">Crear Nuevo Pipeline</s-text>
          <s-inline-stack gap="200" blockAlign="end">
            <div style={{ flex: 1 }}>
              <s-text-field
                label="Nombre del pipeline"
                value={newPipelineName}
                onChange={(e) => setNewPipelineName(e.currentTarget.value)}
                placeholder="Ej: Ventas Shopify"
              />
            </div>
            <s-button onClick={createPipeline} variant="primary">
              Crear Pipeline
            </s-button>
          </s-inline-stack>
        </s-block-stack>
      </s-card>

      {/* PASO 2: Mapear Estados de Shopify a Stages */}
      {defaultConfig && (
        <s-card>
          <s-text variant="headingMd" as="h2">2. Mapear Estados de Pedidos</s-text>
          <s-block-stack gap="400">
            <s-banner tone="info">
              <p><strong>Pipeline: {defaultConfig.clientifyPipelineName}</strong></p>
              <p>Los estados de Shopify se han mapeado automáticamente a los stages correspondientes. Puedes cambiar estos mapeos si lo necesitas.</p>
            </s-banner>

            <s-divider />

            {(() => {
              const pipelineStages = stages.filter(s =>
                s.pipeline.includes(`/${defaultConfig.clientifyPipelineId}/`)
              );

              if (pipelineStages.length === 0) {
                return (
                  <s-banner tone="warning">
                    <p><strong>Este pipeline no tiene stages.</strong></p>
                    <p>Selecciona nuevamente el pipeline para que se creen automáticamente los 7 stages necesarios.</p>
                  </s-banner>
                );
              }

              return (
                <>
                  <s-text variant="headingSm" as="h3">Mapeos Actuales</s-text>
                  {SHOPIFY_ORDER_STATUSES.map((status) => {
                    const mapping = defaultConfig.stageMappings.find(
                      m => m.shopifyOrderStatus === status.value
                    );

                    return (
                      <s-inline-stack key={status.value} gap="200" blockAlign="center">
                        <div style={{ minWidth: "200px" }}>
                          <s-text as="span" fontWeight="medium">{status.label}</s-text>
                          <s-text as="p" tone="subdued" variant="bodySm">({status.value})</s-text>
                        </div>
                        <div style={{ fontSize: "20px", color: "#8c9196" }}>→</div>
                        <select
                          style={{
                            padding: '0.5rem',
                            borderRadius: '4px',
                            border: '1px solid #c4cdd5',
                            fontSize: '14px',
                            minWidth: '250px'
                          }}
                          value={mapping?.clientifyStageId?.toString() || ""}
                          onChange={(e) => {
                            const stageId = parseInt(e.target.value);
                            const stage = pipelineStages.find(s => s.id === stageId);
                            if (stage) {
                              mapOrderStatus(status.value, stage.id, stage.name);
                            }
                          }}
                        >
                          <option value="">-- Seleccionar stage --</option>
                          {pipelineStages.map((stage) => (
                            <option key={stage.id} value={stage.id}>
                              {stage.name} (Prob: {stage.probability * 10}%)
                            </option>
                          ))}
                        </select>
                        {mapping && (
                          <s-text as="span" tone="success" variant="headingMd">✓</s-text>
                        )}
                      </s-inline-stack>
                    );
                  })}
                </>
              );
            })()}
          </s-block-stack>
        </s-card>
      )}

      {/* PASO 3: Gestión de Stages */}
      {defaultConfig && (
        <s-card>
          <s-text variant="headingMd" as="h2">3. Gestión de Stages</s-text>
          <s-block-stack gap="400">
            <s-text as="p" tone="subdued">
              Si no existe el stage que necesitas, créalo aquí:
            </s-text>
            <s-inline-stack gap="200" blockAlign="end">
              <div style={{ flex: 1 }}>
                <s-text-field
                  label="Nombre del stage"
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.currentTarget.value)}
                  placeholder="Ej: Pedido recibido"
                />
              </div>
              <s-text-field
                label="Posición"
                type="number"
                value={newStagePosition.toString()}
                onChange={(e) => setNewStagePosition(parseInt(e.currentTarget.value) || 0)}
                style={{ width: '100px' }}
              />
              <div style={{ minWidth: '180px' }}>
                <s-text-field
                  label="Probabilidad (1-10)"
                  type="number"
                  value={newStageProbability.toString()}
                  onChange={(e) => setNewStageProbability(parseInt(e.currentTarget.value) || 1)}
                  min="1"
                  max="10"
                />
                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ flex: 1, height: '8px', backgroundColor: '#e3e3e3', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ 
                      width: `${newStageProbability * 10}%`, 
                      height: '100%', 
                      backgroundColor: getProbabilityColor(newStageProbability), 
                      transition: 'all 0.3s' 
                    }}></div>
                  </div>
                  <s-text as="span" tone="subdued">{newStageProbability * 10}%</s-text>
                </div>
              </div>
              <s-button onClick={createStage} variant="primary">
                Crear Stage
              </s-button>
            </s-inline-stack>

            <s-divider />

            {(() => {
              const pipelineStages = stages.filter(s =>
                s.pipeline.includes(`/${defaultConfig.clientifyPipelineId}/`)
              );

              return (
                <>
                  <s-text variant="headingSm" as="h3">Stages Disponibles ({pipelineStages.length})</s-text>
                  <s-data-table>
                    <table>
                      <thead>
                        <tr>
                          <th>Nombre</th>
                          <th>Posición</th>
                          <th>Probabilidad</th>
                          <th style={{ width: '100px' }}>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pipelineStages.map((stage) => {
                          const isEditing = editingStage?.id === stage.id;
                          
                          return (
                            <tr key={stage.id}>
                              <td>
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={editingStage.name}
                                    onChange={(e) => setEditingStage({...editingStage, name: e.target.value})}
                                    style={{
                                      padding: '6px',
                                      borderRadius: '4px',
                                      border: '1px solid #c4cdd5',
                                      width: '100%'
                                    }}
                                  />
                                ) : (
                                  stage.name
                                )}
                              </td>
                              <td>{stage.position}</td>
                              <td>
                                {isEditing ? (
                                  <div>
                                    <input
                                      type="number"
                                      min="1"
                                      max="10"
                                      value={editingStage.probability}
                                      onChange={(e) => setEditingStage({...editingStage, probability: parseInt(e.target.value) || 1})}
                                      style={{
                                        padding: '6px',
                                        borderRadius: '4px',
                                        border: '1px solid #c4cdd5',
                                        width: '60px',
                                        marginBottom: '8px'
                                      }}
                                    />
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                      <div style={{ minWidth: '120px', height: '8px', backgroundColor: '#e3e3e3', borderRadius: '4px', overflow: 'hidden' }}>
                                        <div style={{ 
                                          width: `${editingStage.probability * 10}%`, 
                                          height: '100%', 
                                          backgroundColor: getProbabilityColor(editingStage.probability),
                                          transition: 'all 0.3s'
                                        }}></div>
                                      </div>
                                      <span style={{ minWidth: '50px', fontSize: '13px', color: '#666' }}>
                                        {editingStage.probability * 10}%
                                      </span>
                                    </div>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ minWidth: '120px', height: '8px', backgroundColor: '#e3e3e3', borderRadius: '4px', overflow: 'hidden' }}>
                                      <div style={{ 
                                        width: `${(stage.probability || 0) * 10}%`, 
                                        height: '100%', 
                                        backgroundColor: getProbabilityColor(stage.probability || 0) 
                                      }}></div>
                                    </div>
                                    <span style={{ minWidth: '50px', fontSize: '13px', color: '#666' }}>
                                      {stage.probability ? `${stage.probability * 10}%` : 'N/A'}
                                    </span>
                                  </div>
                                )}
                              </td>
                              <td>
                                {isEditing ? (
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <s-button size="sm" onClick={updateStage}>
                                      ✓
                                    </s-button>
                                    <s-button size="sm" onClick={() => setEditingStage(null)}>
                                      ✕
                                    </s-button>
                                  </div>
                                ) : (
                                  <s-button 
                                    size="sm" 
                                    onClick={() => setEditingStage({
                                      id: stage.id,
                                      name: stage.name,
                                      probability: stage.probability || 1
                                    })}
                                  >
                                    Editar
                                  </s-button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </s-data-table>
                </>
              );
            })()}
          </s-block-stack>
        </s-card>
      )}

      {!defaultConfig && (
        <s-card>
          <s-banner tone="info">
            <p><strong>Siguiente paso:</strong> Selecciona un pipeline arriba y establécelo como predeterminado para continuar con la configuración.</p>
          </s-banner>
        </s-card>
      )}
    </s-page>
  );
}
