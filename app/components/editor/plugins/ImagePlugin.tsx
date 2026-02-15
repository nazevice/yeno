import { useEffect, useCallback } from "react";
import { createCommand, COMMAND_PRIORITY_EDITOR, COMMAND_PRIORITY_CRITICAL, PASTE_COMMAND } from "lexical";
import { $insertNodes } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

import { $createImageNode } from "../nodes/ImageNode";

export interface ImageTokenPayload {
  name: string;
  alt: string;
}

export interface ImageAssetPayload {
  name: string;
  alt: string;
  data: Uint8Array;
}

export const INSERT_IMAGE_TOKEN_COMMAND = createCommand<ImageTokenPayload>("INSERT_IMAGE_TOKEN_COMMAND");
export const INSERT_IMAGE_ASSET_COMMAND = createCommand<ImageAssetPayload>("INSERT_IMAGE_ASSET_COMMAND");

export function ImagePlugin() {
  const [editor] = useLexicalComposerContext();

  const handleInsertImageToken = useCallback((payload: ImageTokenPayload) => {
    editor.update(() => {
      const imageNode = $createImageNode({
        assetName: payload.name,
        alt: payload.alt || payload.name,
      });
      $insertNodes([imageNode]);
    });
    return true;
  }, [editor]);

  useEffect(() => {
    return editor.registerCommand<ImageTokenPayload>(
      INSERT_IMAGE_TOKEN_COMMAND,
      handleInsertImageToken,
      COMMAND_PRIORITY_EDITOR,
    );
  }, [editor, handleInsertImageToken]);

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event: ClipboardEvent) => {
        const items = event.clipboardData?.items;
        if (!items) {
          return false;
        }

        for (const item of items) {
          if (item.type.startsWith("image/")) {
            const file = item.getAsFile();
            if (!file) {
              return false;
            }

            const reader = new FileReader();
            reader.onload = () => {
              const arrayBuffer = reader.result as ArrayBuffer;
              const bytes = new Uint8Array(arrayBuffer);
              const name = `pasted-${Date.now()}-${file.name || "image.png"}`;

              editor.dispatchCommand(INSERT_IMAGE_ASSET_COMMAND, {
                name,
                alt: name,
                data: bytes,
              });
            };
            reader.readAsArrayBuffer(file);
            return true;
          }
        }

        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
  }, [editor]);

  return null;
}
