import { useCallback, useEffect, useState } from 'react';
import {
  createVersion,
  listVersions,
  getVersion,
  diffVersions,
  restoreVersion,
  deleteVersion,
} from '~/lib/versioning';
import type { VersionSummary, VersionDiff, DocumentVersion } from '~/lib/versioning';
import { DiffViewer } from './DiffViewer';

interface VersionPanelProps {
  /** Path to the document file */
  documentPath: string;
  /** Current document content */
  currentContent: string;
  /** Callback when a version is restored */
  onRestore: (content: string) => void;
  /** Callback to close the panel */
  onClose: () => void;
}

type ViewState = 
  | { type: 'list' }
  | { type: 'loading' }
  | { type: 'diff'; diff: VersionDiff }
  | { type: 'preview'; version: DocumentVersion }
  | { type: 'error'; message: string };

/**
 * Panel for managing document versions.
 * Provides create, list, compare, restore, and delete operations.
 */
export function VersionPanel({
  documentPath,
  currentContent,
  onRestore,
  onClose,
}: VersionPanelProps) {
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<ViewState>({ type: 'list' });
  const [selectedForDiff, setSelectedForDiff] = useState<string | null>(null);
  const [versionLabel, setVersionLabel] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Load versions on mount
  const loadVersions = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await listVersions(documentPath);
      setVersions(response.versions);
      setView({ type: 'list' });
    } catch (error) {
      setView({ type: 'error', message: String(error) });
    } finally {
      setIsLoading(false);
    }
  }, [documentPath]);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  // Create a new version
  const handleCreateVersion = useCallback(async () => {
    setIsCreating(true);
    try {
      const response = await createVersion(
        documentPath,
        currentContent,
        versionLabel || undefined
      );
      setVersions(response.allVersions);
      setVersionLabel('');
    } catch (error) {
      setView({ type: 'error', message: String(error) });
    } finally {
      setIsCreating(false);
    }
  }, [documentPath, currentContent, versionLabel]);

  // Start diff selection
  const handleSelectForDiff = useCallback((versionId: string) => {
    setSelectedForDiff(versionId);
  }, []);

  // Compare two versions
  const handleCompare = useCallback(async (toVersionId: string) => {
    if (!selectedForDiff) return;

    setView({ type: 'loading' });
    try {
      const diff = await diffVersions(documentPath, selectedForDiff, toVersionId);
      setView({ type: 'diff', diff });
    } catch (error) {
      setView({ type: 'error', message: String(error) });
    }
    setSelectedForDiff(null);
  }, [documentPath, selectedForDiff]);

  // Preview a version
  const handlePreview = useCallback(async (versionId: string) => {
    setView({ type: 'loading' });
    try {
      const response = await getVersion(documentPath, versionId);
      setView({ type: 'preview', version: response.version });
    } catch (error) {
      setView({ type: 'error', message: String(error) });
    }
  }, [documentPath]);

  // Restore a version
  const handleRestore = useCallback(async (versionId: string) => {
    try {
      const response = await restoreVersion(documentPath, versionId);
      setVersions(response.allVersions);
      onRestore(response.version.content);
      setView({ type: 'list' });
    } catch (error) {
      setView({ type: 'error', message: String(error) });
    }
  }, [documentPath, onRestore]);

  // Delete a version
  const handleDelete = useCallback(async (versionId: string) => {
    if (!confirm('Are you sure you want to delete this version? This cannot be undone.')) {
      return;
    }

    try {
      const response = await deleteVersion(documentPath, versionId);
      setVersions(response.versions);
    } catch (error) {
      setView({ type: 'error', message: String(error) });
    }
  }, [documentPath]);

  // Format date for display
  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Render current view
  if (view.type === 'diff' && view.diff) {
    return (
      <DiffViewer
        diff={view.diff}
        onClose={() => setView({ type: 'list' })}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-zinc-900">Document Versions</h2>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
          >
            Close
          </button>
        </div>

        {/* Create Version Section */}
        <div className="border-b border-zinc-100 px-6 py-4">
          <label className="mb-2 block text-sm font-medium text-zinc-700">
            Create New Version
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Optional label (e.g., 'Before major edit')"
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
              className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={handleCreateVersion}
              disabled={isCreating}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isCreating ? 'Creating...' : 'Create Version'}
            </button>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Current document: {currentContent.length.toLocaleString()} characters
          </p>
        </div>

        {/* Version List or Other View */}
        <div className="flex-1 overflow-auto p-4">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            </div>
          )}

          {view.type === 'error' && (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
              Error: {view.message}
            </div>
          )}

          {view.type === 'loading' && (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            </div>
          )}

          {view.type === 'preview' && view.version && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-zinc-900">
                  Version {view.version.versionNumber}
                  {view.version.label && `: ${view.version.label}`}
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRestore(view.version.id)}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                  >
                    Restore
                  </button>
                  <button
                    onClick={() => setView({ type: 'list' })}
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
                  >
                    Back
                  </button>
                </div>
              </div>
              <div className="rounded-lg bg-zinc-50 p-4">
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap font-mono text-sm text-zinc-700">
                  {view.version.content || '(empty document)'}
                </pre>
              </div>
            </div>
          )}

          {view.type === 'list' && !isLoading && (
            <>
              {selectedForDiff && (
                <div className="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
                  Select another version to compare, or{' '}
                  <button
                    onClick={() => setSelectedForDiff(null)}
                    className="underline"
                  >
                    cancel
                  </button>
                </div>
              )}

              {versions.length === 0 ? (
                <div className="py-8 text-center text-zinc-500">
                  No versions yet. Create your first version above.
                </div>
              ) : (
                <ul className="divide-y divide-zinc-100">
                  {versions.map((version) => (
                    <li
                      key={version.id}
                      className={`flex items-center justify-between py-3 ${
                        selectedForDiff === version.id ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-zinc-900">
                            v{version.versionNumber}
                          </span>
                          {version.label && (
                            <span className="truncate text-sm text-zinc-500">
                              {version.label}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-4 text-xs text-zinc-500">
                          <span>{formatDate(version.createdAt)}</span>
                          <span>{version.charCount.toLocaleString()} chars</span>
                          <span>{version.lineCount.toLocaleString()} lines</span>
                        </div>
                      </div>
                      <div className="ml-4 flex shrink-0 gap-1">
                        {selectedForDiff && selectedForDiff !== version.id ? (
                          <button
                            onClick={() => handleCompare(version.id)}
                            className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                          >
                            Compare
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => handleSelectForDiff(version.id)}
                              className="rounded px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
                              title="Compare with another version"
                            >
                              Diff
                            </button>
                            <button
                              onClick={() => handlePreview(version.id)}
                              className="rounded px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
                            >
                              View
                            </button>
                            <button
                              onClick={() => handleRestore(version.id)}
                              className="rounded px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50"
                            >
                              Restore
                            </button>
                            <button
                              onClick={() => handleDelete(version.id)}
                              className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
