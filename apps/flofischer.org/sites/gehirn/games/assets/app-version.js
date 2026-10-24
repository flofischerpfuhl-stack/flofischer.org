// Storage compatibility boundary for persisted work sessions.
//
// Bump APP_STORAGE_VERSION when a new release may require files/sessions to be
// re-read instead of restored from older persisted state. User preferences
// such as theme, panel sizes, or point size should not depend on this.
export const APP_STORAGE_VERSION = 'oo-storage-v20260614b';

const TOOL_STORAGE_VERSIONS = {
  pdfSession: `${APP_STORAGE_VERSION}:pdf-session-v4`,
  imageTools: `${APP_STORAGE_VERSION}:image-tools-v2`,
  pointcloud: `${APP_STORAGE_VERSION}:pointcloud-v2`,
};

export function storageVersion(scope = '') {
  return TOOL_STORAGE_VERSIONS[String(scope)] || APP_STORAGE_VERSION;
}
