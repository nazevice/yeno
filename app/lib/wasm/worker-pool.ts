/**
 * Web Worker Pool for WASM Operations
 * 
 * Provides a pool of Web Workers for executing WASM operations
 * off the main thread, preventing UI blocking during CPU-intensive tasks.
 */

import type { YenoWasm, CompressResult, SearchResult, DiffResult, DocState, MultiSearchResult } from './types';

// ============================================================================
// Worker Message Types
// ============================================================================

interface WorkerMessage<T = unknown> {
  id: string;
  type: string;
  payload: T;
}

interface WorkerResponse<T = unknown> {
  id: string;
  success: boolean;
  result?: T;
  error?: string;
}

// ============================================================================
// Operation Types
// ============================================================================

type CompressOperation = {
  type: 'compress';
  data: Uint8Array;
};

type DecompressOperation = {
  type: 'decompress';
  data: Uint8Array;
};

type CompressStringOperation = {
  type: 'compress_string';
  text: string;
};

type DecompressToStringOperation = {
  type: 'decompress_to_string';
  data: Uint8Array;
};

type SearchOperation = {
  type: 'search';
  text: string;
  pattern: string;
  caseSensitive: boolean;
};

type SearchRegexOperation = {
  type: 'search_regex';
  text: string;
  pattern: string;
  caseSensitive: boolean;
};

type SearchMultiOperation = {
  type: 'search_multi';
  text: string;
  patterns: string[];
  caseSensitive: boolean;
};

type DiffOperation = {
  type: 'diff';
  oldText: string;
  newText: string;
};

type DiffCharsOperation = {
  type: 'diff_chars';
  oldText: string;
  newText: string;
};

type DiffWordsOperation = {
  type: 'diff_words';
  oldText: string;
  newText: string;
};

type UnifiedDiffOperation = {
  type: 'unified_diff';
  oldText: string;
  newText: string;
  oldName: string;
  newName: string;
  contextLines: number;
};

type Operation =
  | CompressOperation
  | DecompressOperation
  | CompressStringOperation
  | DecompressToStringOperation
  | SearchOperation
  | SearchRegexOperation
  | SearchMultiOperation
  | DiffOperation
  | DiffCharsOperation
  | DiffWordsOperation
  | UnifiedDiffOperation;

// ============================================================================
// Worker Pool
// ============================================================================

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

/**
 * A pool of Web Workers for executing WASM operations.
 */
export class WasmWorkerPool {
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private requestId = 0;
  private maxWorkers: number;
  private workerUrl: string;

  /**
   * Create a new worker pool.
   * 
   * @param workerUrl - URL to the worker script
   * @param maxWorkers - Maximum number of workers (default: navigator.hardwareConcurrency or 4)
   */
  constructor(workerUrl: string, maxWorkers?: number) {
    this.workerUrl = workerUrl;
    this.maxWorkers = maxWorkers ?? (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 4) ?? 4;
  }

  /**
   * Initialize the worker pool.
   * 
   * Creates the initial workers.
   */
  async initialize(): Promise<void> {
    // Create one worker initially, more will be created on demand
    await this.createWorker();
  }

  private async createWorker(): Promise<Worker> {
    const worker = new Worker(this.workerUrl, { type: 'module' });
    
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const { id, success, result, error } = event.data;
      const pending = this.pendingRequests.get(id);
      
      if (pending) {
        this.pendingRequests.delete(id);
        if (success) {
          pending.resolve(result);
        } else {
          pending.reject(new Error(error ?? 'Unknown worker error'));
        }
      }
      
      // Return worker to pool
      if (!this.availableWorkers.includes(worker)) {
        this.availableWorkers.push(worker);
      }
    };

    worker.onerror = (event) => {
      console.error('Worker error:', event.message);
    };

    this.workers.push(worker);
    
    // Wait for worker to be ready
    return new Promise((resolve, reject) => {
      const readyHandler = (event: MessageEvent) => {
        if (event.data.type === 'ready') {
          worker.removeEventListener('message', readyHandler);
          this.availableWorkers.push(worker);
          resolve(worker);
        }
      };
      worker.addEventListener('message', readyHandler);
      
      // Timeout after 5 seconds
      setTimeout(() => {
        worker.removeEventListener('message', readyHandler);
        reject(new Error('Worker initialization timeout'));
      }, 5000);
    });
  }

  private getWorker(): Worker {
    if (this.availableWorkers.length > 0) {
      return this.availableWorkers.pop()!;
    }
    
    if (this.workers.length < this.maxWorkers) {
      // Create a new worker synchronously (it will be added to available when ready)
      throw new Error('No available workers. Call initialize() first or wait for pending operations.');
    }
    
    throw new Error('All workers are busy. Consider increasing pool size or waiting for pending operations.');
  }

  /**
   * Execute an operation on a worker.
   */
  async execute<T>(operation: Operation): Promise<T> {
    const id = `req_${++this.requestId}`;
    const worker = this.getWorker();

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve: resolve as (value: unknown) => void, reject });
      
      worker.postMessage({
        id,
        ...operation,
      } as WorkerMessage);
    });
  }

  /**
   * Terminate all workers in the pool.
   */
  terminate(): void {
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.availableWorkers = [];
    this.pendingRequests.clear();
  }

  /**
   * Get the number of active workers.
   */
  get activeWorkers(): number {
    return this.workers.length - this.availableWorkers.length;
  }

  /**
   * Get the number of available workers.
   */
  get availableCount(): number {
    return this.availableWorkers.length;
  }
}

// ============================================================================
// Singleton Pool Instance
// ============================================================================

let poolInstance: WasmWorkerPool | null = null;

/**
 * Get or create the global worker pool instance.
 */
export function getWorkerPool(): WasmWorkerPool {
  if (!poolInstance) {
    // The worker URL will be resolved at build time
    const workerUrl = new URL('./wasm.worker.js', import.meta.url).href;
    poolInstance = new WasmWorkerPool(workerUrl);
  }
  return poolInstance;
}

/**
 * Initialize the global worker pool.
 */
export async function initializeWorkerPool(): Promise<void> {
  const pool = getWorkerPool();
  await pool.initialize();
}

/**
 * Terminate the global worker pool.
 */
export function terminateWorkerPool(): void {
  if (poolInstance) {
    poolInstance.terminate();
    poolInstance = null;
  }
}
