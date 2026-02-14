import { useEffect } from "react";
import { createCommand, $createTextNode, $getSelection, COMMAND_PRIORITY_EDITOR } from "lexical";
import { $insertNodes } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

export interface ImageTokenPayload {
  name: string;
  alt: string;
}

export const INSERT_IMAGE_TOKEN_COMMAND = createCommand<ImageTokenPayload>("INSERT_IMAGE_TOKEN_COMMAND");

export function ImagePlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand<ImageTokenPayload>(
      INSERT_IMAGE_TOKEN_COMMAND,
      (payload) => {
        const selection = $getSelection();
        if (!selection) {
          return false;
        }
        const token = `![${payload.alt || payload.name}](asset://${payload.name})`;
        $insertNodes([$createTextNode(token)]);
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    );
  }, [editor]);

  return null;
}
