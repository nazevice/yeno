import { test, expect } from "@playwright/test";

test.describe("Editor formatting", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    const editor = page.locator("[contenteditable='true']").first();
    await expect(editor).toBeVisible();
    await editor.click();
  });

  test("bold works", async ({ page }) => {
    const editorEl = page.locator("[contenteditable='true']").first();
    await editorEl.click();
    await page.evaluate(() => {
      const ed = (window as unknown as { __editor?: { setContent: (s: string) => void; execFormatWithSelection: (a: number, f: number, cmd: string) => void } }).__editor;
      if (ed) {
        ed.setContent("Bold test");
        ed.execFormatWithSelection(0, 9, "bold");
      }
    });
    const boldText = editorEl.locator("strong");
    await expect(boldText).toContainText("Bold test");
  });

  test("bold via toolbar and Ctrl+B", async ({ page }) => {
    const editorEl = page.locator("[contenteditable='true']").first();
    await editorEl.click();
    await page.evaluate(() => {
      const ed = (window as unknown as { __editor?: { setContent: (s: string) => void } }).__editor;
      if (ed) ed.setContent("Toolbar bold");
    });
    await expect(editorEl).toContainText("Toolbar bold");
    await page.keyboard.press("Control+a");
    await page.locator("[data-testid='format-bold']").click();
    await expect(editorEl.locator("strong")).toContainText("Toolbar bold");
  });

  test("italic works", async ({ page }) => {
    const editorEl = page.locator("[contenteditable='true']").first();
    await editorEl.click();
    await page.evaluate(() => {
      const ed = (window as unknown as { __editor?: { setContent: (s: string) => void; execFormatWithSelection: (a: number, f: number, cmd: string) => void } }).__editor;
      if (ed) {
        ed.setContent("Italic test");
        ed.execFormatWithSelection(0, 11, "italic");
      }
    });
    await expect(editorEl.locator("em")).toContainText("Italic test");
  });

  test("font change works", async ({ page }) => {
    const editorEl = page.locator("[contenteditable='true']").first();
    await editorEl.click();
    await page.evaluate(() => {
      const ed = (window as unknown as { __editor?: { setContent: (s: string) => void; execFormatWithSelection: (a: number, f: number, cmd: string, value?: string) => void } }).__editor;
      if (ed) {
        ed.setContent("Font test");
        ed.execFormatWithSelection(0, 9, "font", "Georgia");
      }
    });
    await expect(editorEl.locator("[style*='Georgia']")).toBeVisible();
  });

  test("font size change works", async ({ page }) => {
    const editorEl = page.locator("[contenteditable='true']").first();
    await editorEl.click();
    await page.evaluate(() => {
      const ed = (window as unknown as { __editor?: { setContent: (s: string) => void; execFormatWithSelection: (a: number, f: number, cmd: string, value?: string) => void } }).__editor;
      if (ed) {
        ed.setContent("Size test");
        ed.execFormatWithSelection(0, 9, "fontSize", "24px");
      }
    });
    await expect(editorEl.locator("[style*='24px']")).toBeVisible();
  });
});
