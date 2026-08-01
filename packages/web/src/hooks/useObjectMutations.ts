import { useQueryClient } from "@tanstack/react-query";
import type { PropertyValue, Property } from "@notorious/shared";
import { objectApi } from "../lib/api/resources.js";

interface ObjectMutations {
  updateValue: (objectId: string, propertyKey: string, value: PropertyValue) => Promise<void>;
  addRelation: (objectId: string, property: Property, targetObjectId: string) => Promise<void>;
  removeRelation: (objectId: string, property: Property, targetObjectId: string) => Promise<void>;
}

/** Property-edit mutations shared by the object detail page and every view's inline cells. */
export function useObjectMutations(workspaceId: string): ObjectMutations {
  const queryClient = useQueryClient();

  async function invalidate(objectId: string) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["object", objectId] }),
      queryClient.invalidateQueries({ queryKey: ["viewResults"] }),
      queryClient.invalidateQueries({ queryKey: ["objects", workspaceId] }),
      queryClient.invalidateQueries({ queryKey: ["recentEdits", workspaceId] }),
      // A property value can feed a template (`object.properties.<key>`, see
      // modules/templates/renderer.ts) - without this, this object's own
      // already-rendered blocks would keep showing the pre-edit value until
      // the page was reloaded.
      queryClient.invalidateQueries({ queryKey: ["blocksRendered", objectId] }),
    ]);
  }

  return {
    updateValue: async (objectId, propertyKey, value) => {
      await objectApi.update(objectId, { values: { [propertyKey]: value } });
      await invalidate(objectId);
    },
    addRelation: async (objectId, property, targetObjectId) => {
      await objectApi.createRelation(workspaceId, { propertyId: property.id, sourceObjectId: objectId, targetObjectId });
      await invalidate(objectId);
    },
    removeRelation: async (objectId, property, targetObjectId) => {
      await objectApi.deleteRelationByTriple(workspaceId, property.id, objectId, targetObjectId);
      await invalidate(objectId);
    },
  };
}
