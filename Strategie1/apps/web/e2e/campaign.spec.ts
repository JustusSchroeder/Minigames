import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const places = JSON.parse(
  readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../../../packages/map-data/generated/places.json"),
    "utf8",
  ),
) as { warsaw: string; berlin: string; attackTo: string; attackToName: string };

test("plays a paused campaign, orders a march, and restores the save", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("play-germany").click();
  await expect(page.getByTestId("game-date")).toHaveText("1 September, 68 Ma, 04:00");
  const pausedDate = await page.getByTestId("game-date").textContent();
  await page.waitForTimeout(1200);
  await expect(page.getByTestId("game-date")).toHaveText(pausedDate ?? "");

  await page.getByTestId("speed-2").click();
  await expect(page.getByTestId("speed-label")).toHaveText("2x");
  await expect.poll(async () => page.getByTestId("game-date").textContent()).not.toBe(pausedDate);
  await page.getByTestId("pause").click();
  await expect(page.getByTestId("speed-label")).toHaveText("Paused");
  await page.waitForTimeout(500);
  const held = await page.getByTestId("game-date").textContent();
  await page.waitForTimeout(1200);
  await expect(page.getByTestId("game-date")).toHaveText(held ?? "");

  await page.getByTestId("toggle-industry").click();
  await expect(page.getByTestId("industry-panel")).toContainText("Steel");
  await page.getByTestId("build-civilian").click();
  await expect(page.getByTestId("industry-panel")).toContainText("Civilian factory");
  await expect(page.getByTestId("order-report")).toContainText(/construction queue/i);

  const search = page.getByTestId("province-search");
  if (!(await search.isVisible())) await page.getByTestId("province-find").click();
  await search.fill("Warsaw");
  await page.getByTestId(`province-${places.warsaw}`).click();
  await expect(page.getByTestId("province-panel")).toContainText("Warsaw");

  await page.getByTestId("open-front-poland").click();
  await page.getByTestId("draw-front-germany-front-poland").click();
  await expect(page.getByTestId("order-banner")).toContainText(/frontline/i);
  const frontStroke = [
    { x: 663, y: 396 },
    { x: 665, y: 409 },
    { x: 667, y: 421 },
    { x: 669, y: 433 },
  ];
  const start = frontStroke[0];
  if (start) {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (const point of frontStroke.slice(1)) {
      await page.mouse.move(point.x, point.y, { steps: 6 });
    }
    await page.mouse.up();
  }
  await expect(page.getByTestId("front-gaps-poland")).toContainText(/Frontline set/);

  await page.getByTestId("division-ger-silesia").click();
  await page.getByTestId("assign-front-poland").click();
  await expect(page.getByTestId("order-report")).toContainText(/front/i);
  await expect(page.getByTestId("front-gaps-poland")).toContainText("1 assigned");
  await expect(page.getByTestId("front-plan-poland")).toContainText("No arrow yet.");

  await page.getByTestId("toggle-designer").click();
  await expect(page.getByTestId("designer-panel")).toBeVisible();
  await expect(page.getByTestId("designer-soft-attack")).toHaveText("24");
  await page.getByTestId("battalion-add-ceratops").click();
  await expect(page.getByTestId("designer-soft-attack")).toHaveText("31");
  await expect(page.getByTestId("battalion-count-ceratops")).toHaveText("1");
  await page.getByTestId("province-find").click();
  await page.getByTestId("province-search").fill("Berlin");
  await page.getByTestId(`province-${places.berlin}`).click();
  await page.getByTestId("recruit-name").fill("Raised Corps");
  await page.getByTestId("recruit-division").click();
  await expect(page.getByTestId("order-report")).toContainText(/Raised Corps/);
  await expect(page.getByTestId("designer-pool")).toHaveAttribute("data-equipment", "2980");
  await expect(page.getByTestId("division-germany-raised-1")).toContainText("Raised Corps");

  await page.getByTestId("save-campaign").click();
  await expect(page.getByTestId("order-report")).toContainText(/Saved/);
  const date = await page.getByTestId("game-date").textContent();

  await page.reload();
  await page.getByTestId("continue-save").click();
  await expect(page.getByTestId("game-date")).toHaveText(date ?? "");
  await page.getByTestId("division-ger-silesia").click();
  await expect(page.getByTestId("front-gaps-poland")).toContainText("1 assigned");
  await expect(page.getByTestId("division-germany-raised-1")).toContainText("Raised Corps");
});
