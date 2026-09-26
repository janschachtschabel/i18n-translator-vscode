import type { FormatId } from '../area/areaDefinition';
import type { FormatAdapter } from './adapter';
import { jsonNestedAdapter } from './json/jsonNested';

/** One adapter per supported format; adding a format means adding its adapter here. */
export const ADAPTERS: Readonly<Record<FormatId, FormatAdapter>> = {
  'json-nested': jsonNestedAdapter,
};
