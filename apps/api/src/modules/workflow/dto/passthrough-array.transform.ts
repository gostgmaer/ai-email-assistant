import { Transform } from 'class-transformer';

/**
 * Use on any array-of-plain-objects DTO property that has no @Type()
 * (i.e. its elements aren't a real class — a discriminated union like
 * WorkflowCondition/WorkflowAction can't cleanly be one).
 *
 * Without this, class-transformer's plainToInstance — run by the global
 * ValidationPipe (transform: true) — reflects the property's design:type
 * as the generic `Array` constructor (TypeScript erases `T[]` to just
 * `Array`), then applies that as the target type to each ELEMENT too:
 * `new Array()` followed by `Object.assign(that array, sourceElement)`.
 * A plain object like `{ field: 'category', ... }` has no integer-index
 * properties, so the result looks like `[]` to anything that only reads
 * numeric indices or calls JSON.stringify (which ignores non-index
 * properties on an array) — silently discarding the entire payload.
 *
 * The fix reads straight from the untransformed source object
 * (`obj[key]`) rather than the already-mangled `value` class-transformer
 * would otherwise hand to a plain `@Transform(({ value }) => value)`,
 * which does NOT avoid the bug — `value` there has already been through
 * the same per-element coercion.
 */
export function passthroughArray(): PropertyDecorator {
  return Transform(
    ({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key],
  );
}
