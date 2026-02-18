import { createContext, useContext, useMemo, useEffect } from "react";
import type { AssetRef } from "~/lib/doc/schema";

/** Ref for assets added in the same tick before state flushes (e.g. insert then immediate render) */
const pendingAssetsRef = { current: [] as AssetRef[] };

/** Global getter for assets - used when resolving image data URLs (separate from React context) */
let globalGetAssets: () => AssetRef[] = () => [];

export function addPendingAsset(asset: AssetRef) {
  pendingAssetsRef.current = [...pendingAssetsRef.current, asset];
}

/** Resolve asset to data URL from any source (context or global registry). Used by decorators. */
export function resolveAssetDataUrl(name: string, getAssets?: () => AssetRef[]): string | null {
  const assets = getAssets ? getAssets() : globalGetAssets();
  const asset = assets.find((a) => a.name === name);
  if (!asset?.bytes?.length) return null;
  try {
    const mime = inferMimeType(name);
    const base64 = btoa(String.fromCharCode(...asset.bytes));
    return `data:${mime};base64,${base64}`;
  } catch {
    return null;
  }
}

function inferMimeType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const mime: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
  };
  return mime[ext] ?? "image/png";
}

type AssetsContextValue = {
  getAssets: () => AssetRef[];
};

const AssetsContext = createContext<AssetsContextValue>({
  getAssets: () => [],
});

export function AssetsProvider({ assets, children }: { assets: AssetRef[]; children: React.ReactNode }) {
  const value = useMemo(
    () => ({
      getAssets: () => {
        const pending = pendingAssetsRef.current;
        if (pending.length === 0) return assets;
        const seen = new Set(assets.map((a) => a.name));
        const result = [...assets];
        for (const a of pending) {
          if (!seen.has(a.name)) {
            seen.add(a.name);
            result.push(a);
          }
        }
        pendingAssetsRef.current = [];
        return result;
      },
    }),
    [assets],
  );

  useEffect(() => {
    globalGetAssets = value.getAssets;
    return () => {
      globalGetAssets = () => [];
    };
  }, [value]);

  return <AssetsContext.Provider value={value}>{children}</AssetsContext.Provider>;
}

export function useAssets() {
  const { getAssets } = useContext(AssetsContext);

  const resolveDataUrl = useMemo(() => {
    return (name: string): string | null => {
      const assets = getAssets();
      const asset = assets.find((a) => a.name === name);
      if (!asset?.bytes?.length) return null;
      try {
        const mime = inferMimeType(name);
        const base64 = btoa(String.fromCharCode(...asset.bytes));
        return `data:${mime};base64,${base64}`;
      } catch {
        return null;
      }
    };
  }, [getAssets]);

  return { assets: getAssets(), resolveDataUrl };
}
