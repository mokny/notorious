import type { ObjectRecord, Property } from "@notorious/shared";
import { PropertyField } from "./PropertyField.js";
import { useObjectMutations } from "../../hooks/useObjectMutations.js";

interface PropertyCellProps {
  workspaceId: string;
  object: ObjectRecord;
  property: Property;
}

/** Wires a single property's editor up to the shared object-value mutations. */
export function PropertyCell({ workspaceId, object, property }: PropertyCellProps) {
  const mutations = useObjectMutations(workspaceId);

  return (
    <PropertyField
      property={property}
      value={object.values[property.key] ?? null}
      workspaceId={workspaceId}
      objectId={object.id}
      onChange={(value) => void mutations.updateValue(object.id, property.key, value)}
      onRelationAdd={(targetId) => void mutations.addRelation(object.id, property, targetId)}
      onRelationRemove={(targetId) => void mutations.removeRelation(object.id, property, targetId)}
    />
  );
}
