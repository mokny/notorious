/** Response shape of `GET /api/v1/objects/:objectId/blocks/rendered` - blockId -> field name -> template-rendered text, only for fields whose raw source actually contained `{{ }}`/`{% %}`/`{# #}` syntax. See modules/templates/renderer.ts on the server. */
export interface RenderedBlocksResponse {
  rendered: Record<string, Record<string, string>>;
}
