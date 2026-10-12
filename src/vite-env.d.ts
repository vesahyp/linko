/// <reference types="vite/client" />
declare const __BUILD__: string;

interface ImportMetaEnv {
  /** The tracking pixel. Empty until infra/ exists, so the tracker stays off. */
  readonly VITE_PIXEL_URL?: string;
}
