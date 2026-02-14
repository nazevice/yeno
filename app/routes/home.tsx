import type { Route } from "./+types/home";
import { EditorShell } from "../components/editor/EditorShell";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Yeno Editor" },
    { name: "description", content: "Desktop-first rich text editor." },
  ];
}

export default function Home() {
  return <EditorShell />;
}
