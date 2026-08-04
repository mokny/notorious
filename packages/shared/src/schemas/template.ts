/** Response shape of `GET /api/v1/objects/:objectId/blocks/rendered` - blockId -> field name -> template-rendered text, only for fields whose raw source actually contained `{{ }}`/`{% %}`/`{# #}` syntax. See modules/templates/renderer.ts on the server. */
export interface RenderedBlocksResponse {
  rendered: Record<string, Record<string, string>>;
}

/** One property the template autocomplete can suggest after `object.`/`objects.<slug>.` for a given object type. */
export interface TemplateAutocompleteProperty {
  key: string;
  name: string;
  type: string;
}

/** One object type's key/name plus its properties - see `GET /api/v1/workspaces/:workspaceId/templates/autocomplete-schema` (modules/templates/routes.ts) and TemplateSuggestion.ts on the web side. */
export interface TemplateAutocompleteObjectType {
  id: string;
  key: string;
  name: string;
  properties: TemplateAutocompleteProperty[];
}

export interface TemplateAutocompleteSchemaResponse {
  objectTypes: TemplateAutocompleteObjectType[];
}
