/**
 * WASM Worker Script
 * 
 * Runs in a Web Worker and executes WASM operations.
 * Communicates with the main thread via postMessage.
 */

import type { WorkerResponse } from './worker-pool';

// WASM module reference (loaded on initialization)
let wasm: Awaited<ReturnType<typeof import('./loader')['loadWasm']>> | null = null;

// ============================================================================
// Message Handler
// ============================================================================

interface WorkerMessage {
  id: string;
  type: string;
  [key: string]: unknown;
}

async function handleMessage(event: MessageEvent<WorkerMessage>): Promise<void> {
  const { id, type, ...payload } = event.data;

  try {
    // Load WASM on first use
    if (!wasm) {
      const { loadWasm } = await import('./loader');
      wasm = await loadWasm();
    }

    let result: unknown;

    switch (type) {
      // Compression operations
      case 'compress': {
        const { data } = payload as { data: Uint8Array };
        result = wasm.compress(data);
        break;
      }
      case 'decompress': {
        const { data } = payload as { data: Uint8Array };
        result = wasm.decompress(data);
        break;
      }
      case 'compress_string': {
        const { text } = payload as { text: string };
        result = wasm.compress_string(text);
        break;
      }
      case 'decompress_to_string': {
        const { data } = payload as { data: Uint8Array };
        result = wasm.decompress_to_string(data);
        break;
      }

      // Search operations
      case 'search': {
        const { text, pattern, caseSensitive } = payload as {
          text: string;
          pattern: string;
          caseSensitive: boolean;
        };
        result = wasm.search(text, pattern, caseSensitive);
        break;
      }
      case 'search_regex': {
        const { text, pattern, caseSensitive } = payload as {
          text: string;
          pattern: string;
          caseSensitive: boolean;
        };
        result = wasm.search_regex(text, pattern, caseSensitive);
        break;
      }
      case 'search_multi': {
        const { text, patterns, caseSensitive } = payload as {
          text: string;
          patterns: string[];
          caseSensitive: boolean;
        };
        result = wasm.search_multi(text, patterns, caseSensitive);
        break;
      }

      // Diff operations
      case 'diff': {
        const { oldText, newText } = payload as { oldText: string; newText: string };
        result = wasm.diff(oldText, newText);
        break;
      }
      case 'diff_chars': {
        const { oldText, newText } = payload as { oldText: string; newText: string };
        result = wasm.diff_chars(oldText, newText);
        break;
      }
      case 'diff_words': {
        const { oldText, newText } = payload as { oldText: string; newText: string };
        result = wasm.diff_words(oldText, newText);
        break;
      }
      case 'unified_diff': {
        const { oldText, newText, oldName, newName, contextLines } = payload as {
          oldText: string;
          newText: string;
          oldName: string;
          newName: string;
          contextLines: number;
        };
        result = wasm.unified_diff(oldText, newText, oldName, newName, contextLines);
        break;
      }

      default:
        throw new Error(`Unknown operation type: ${type}`);
    }

    // Send success response
    const response: WorkerResponse = {
      id,
      success: true,
      result: serializeResult(result),
    };
    self.postMessage(response);
  } catch (error) {
    // Send error response
    const response: WorkerResponse = {
      id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
}

/**
 * Serialize result for postMessage transfer.
 * 
 * Handles Uint8Array and other special types that need explicit handling.
 */
function serializeResult(result: unknown): unknown {
  if (result === null || result === undefined) {
    return result;
  }

  // Handle Uint8Array - needs to be transferred, not cloned
  if (result instanceof Uint8Array) {
    return result;
  }

  // Handle objects with Uint8Array properties (like CompressResult)
  if (typeof result === 'object' && result !== null) {
    const obj = result as Record<string, unknown>;
    
    // Check if this looks like a CompressResult
    if ('data' in obj && obj.data instanceof Uint8Array) {
      return {
        ...obj,
        data: obj.data,
      };
    }

    // For other objects, convert to plain object
    if (typeof (result as object).constructor !== 'function' || 
        (result as object).constructor === Object) {
      return result;
    }

    // Convert WASM objects to plain objects
    const plain: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(result)) {
      plain[key] = serializeResult(value);
    }
    return plain;
  }

  return result;
}

// ============================================================================
// Worker Initialization
// ============================================================================

// Set up message handler
self.onmessage = handleMessage;

// Signal ready to main thread
self.postMessage({ type: 'ready' });

// Export for type checking
export {};
