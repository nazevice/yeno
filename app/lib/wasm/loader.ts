/**
 * WASM Module Loader
 * 
 * Provides lazy loading and initialization of the Yeno WASM module.
 * Handles both browser and Tauri environments.
 */

import type { YenoWasm } from './types';

// Singleton instance
let wasmInstance: YenoWasm | null = null;
let loadingPromise: Promise<YenoWasm> | null = null;

/**
 * Load and initialize the WASM module.
 * 
 * Uses a singleton pattern to ensure the module is only loaded once.
 * Subsequent calls return the cached instance.
 * 
 * @returns Promise resolving to the initialized WASM module
 * @throws Error if the module fails to load
 */
export async function loadWasm(): Promise<YenoWasm> {
  // Return cached instance if available
  if (wasmInstance) {
    return wasmInstance;
  }

  // Return existing loading promise to prevent duplicate loads
  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    try {
      // Dynamic import of the WASM module - built by wasm-pack to app/lib/wasm/pkg/
      // Using a module path so Vite can resolve and process it (public/ files cannot be imported)
      const wasmModule = await import(
        /* @vite-ignore */
        '~/lib/wasm/pkg/yeno_wasm.js'
      );
      
      // Initialize the module (this loads the .wasm binary)
      // The default export is the init function for wasm-bindgen
      if (typeof wasmModule.default === 'function') {
        await wasmModule.default();
      }
      
      // Call the init function to set up panic hooks
      if (typeof wasmModule.init === 'function') {
        wasmModule.init();
      }
      
      wasmInstance = wasmModule as YenoWasm;
      return wasmInstance;
    } catch (error) {
      // Reset state on failure to allow retry
      loadingPromise = null;
      throw new Error(`Failed to load WASM module: ${error instanceof Error ? error.message : String(error)}`);
    }
  })();

  return loadingPromise;
}

/**
 * Check if the WASM module is currently loaded.
 */
export function isWasmLoaded(): boolean {
  return wasmInstance !== null;
}

/**
 * Get the current WASM instance without loading.
 * Returns null if not loaded.
 */
export function getWasm(): YenoWasm | null {
  return wasmInstance;
}

/**
 * Reset the WASM module state.
 * 
 * This unloads the module and allows it to be reloaded.
 * Useful for testing or recovery from corrupted state.
 */
export function resetWasm(): void {
  wasmInstance = null;
  loadingPromise = null;
}

/**
 * Get the WASM module version.
 * 
 * @returns Version string or null if not loaded
 */
export function getWasmVersion(): string | null {
  if (!wasmInstance) {
    return null;
  }
  return wasmInstance.version();
}
