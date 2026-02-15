import { useMemo } from "react";
import { useAssets, resolveAssetDataUrl } from "../AssetsContext";

interface ImageComponentProps {
  assetName: string;
  alt: string;
}

export function ImageComponent({ assetName, alt }: ImageComponentProps) {
  const assetsContext = useAssets();
  const dataUrl = useMemo(() => {
    const fromContext = assetsContext.resolveDataUrl(assetName);
    if (fromContext) return fromContext;
    return resolveAssetDataUrl(assetName);
  }, [assetsContext.resolveDataUrl, assetsContext.assets, assetName]);
  const displayAlt = alt || assetName || "Image";

  if (!dataUrl) {
    return (
      <span
        className="my-2 flex min-h-[80px] items-center justify-center rounded-lg border border-zinc-200 bg-zinc-100 px-4 py-3 text-sm text-zinc-500"
        title={`Asset: ${assetName}`}
      >
        Image: {displayAlt}
      </span>
    );
  }

  return (
    <img
      src={dataUrl}
      alt={displayAlt}
      className="my-2 max-h-[400px] max-w-full rounded-lg object-contain"
      loading="lazy"
      draggable={false}
    />
  );
}
