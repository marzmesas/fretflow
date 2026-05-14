import type { CatalogTrackStub } from "./types";
import { STATIC_REMOTE_CATALOG_SEED } from "./catalog-seed";
import { normalizeRemoteCatalogPayload } from "./remote-catalog";

export const MOCK_CATALOG: CatalogTrackStub[] = normalizeRemoteCatalogPayload(
  STATIC_REMOTE_CATALOG_SEED,
).tracks;
