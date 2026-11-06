import { useEffect, useRef, useState } from "react";
import { HOURS_PER_REAL_SECOND, MAX_HOURS_PER_FRAME, type Command } from "@meridian/shared";
import { db } from "../db.ts";
import { MapView } from "../map/MapView.tsx";
import { useUi } from "../state/uiStore.ts";
import { simClient } from "../workers/simClient.ts";
import { DesignerPanel } from "./DesignerPanel.tsx";
import { DivisionList } from "./DivisionList.tsx";
import { IndustryPanel } from "./IndustryPanel.tsx";
import { ResearchPanel } from "./ResearchPanel.tsx";
import { EventDialog } from "./EventDialog.tsx";
import { ProvincePanel } from "./ProvincePanel.tsx";
import { TopBar } from "./TopBar.tsx";

export function GameShell() {
  const snapshot = useUi((state) => state.snapshot);
  const mode = useUi((state) => state.mapMode);
  const selectedProvinceId = useUi((state) => state.selectedProvinceId);
  const drawingFrontId = useUi((state) => state.drawingFrontId);
  const drawingKind = useUi((state) => state.drawingKind);
  const setDrawingFrontId = useUi((state) => state.setDrawingFrontId);
  const orderArmed = useUi((state) => state.orderArmed);
  const setOrderArmed = useUi((state) => state.setOrderArmed);
  const industryOpen = useUi((state) => state.industryOpen);
  const designerOpen = useUi((state) => state.designerOpen);
  const researchOpen = useUi((state) => state.researchOpen);
  const setSnapshot = useUi((state) => state.setSnapshot);
  const setReport = useUi((state) => state.setReport);
  const report = useUi((state) => state.report);
  const setError = useUi((state) => state.setError);
  const setSelectedProvinceId = useUi((state) => state.setSelectedProvinceId);
  const setSaves = useUi((state) => state.setSaves);
  const hours = useRef(0);
  const shellRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === shellRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  async function toggleFullscreen() {
    const shell = shellRef.current;
    if (!shell) return;
    try {
      if (document.fullscreenElement === shell) await document.exitFullscreen();
      else await shell.requestFullscreen();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Full screen is not available in this window.");
    }
  }

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let stopped = false;
    const tick = (now: number) => {
      if (stopped) return;
      const current = useUi.getState().snapshot;
      const elapsed = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (current && !current.paused) {
        hours.current += elapsed * HOURS_PER_REAL_SECOND[current.speed];
        const whole = Math.floor(hours.current);
        if (whole > 0) {
          hours.current -= whole;
          const capped = Math.min(MAX_HOURS_PER_FRAME, whole);
          void simClient()
            .send({ type: "advance", hours: capped })
            .then((response) => {
              if (response.type === "snapshot") {
                setSnapshot(response.snapshot);
                if (response.report) setReport(response.report);
              }
            })
            .catch((reason: unknown) => {
              setError(reason instanceof Error ? reason.message : "The simulation stopped.");
            });
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
  }, [setError, setReport, setSnapshot]);

  async function send(command: Command) {
    setError(null);
    try {
      const response = await simClient().send({ type: "command", command });
      if (response.type !== "snapshot") return;
      setSnapshot(response.snapshot);
      setReport(response.report);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The order failed.");
    }
  }

  function chooseProvince(id: string) {
    setSelectedProvinceId(id);
  }

  function moveToPoint(lon: number, lat: number) {
    const divisionId = useUi.getState().selectedDivisionId;
    if (!useUi.getState().orderArmed || !divisionId) return;
    setOrderArmed(false);
    void send({ type: "moveDivision", divisionId, lon, lat });
  }

  function drawStroke(frontId: string, points: Array<{ lon: number; lat: number }>, kind: "front" | "offensive") {
    setDrawingFrontId(null);
    void send(kind === "front" ? { type: "drawFront", frontId, points } : { type: "drawOffensive", frontId, points });
  }

  function drawHint(message: string) {
    setReport(message);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (drawingFrontId) {
        event.preventDefault();
        setDrawingFrontId(null);
        setReport("Drawing cancelled.");
        return;
      }
      if (orderArmed) {
        event.preventDefault();
        setOrderArmed(false);
        setReport("Move cancelled.");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawingFrontId, orderArmed, setDrawingFrontId, setOrderArmed, setReport]);

  useEffect(() => {
    if (!drawingFrontId) return;
    const cancel = document.querySelector<HTMLButtonElement>("[data-testid=cancel-drawing]");
    cancel?.focus();
  }, [drawingFrontId, drawingKind]);

  async function save() {
    if (!snapshot) return;
    try {
      const response = await simClient().send({
        type: "save",
        name: `${snapshot.scenarioName} — ${snapshot.dateLabel}`,
      });
      if (response.type !== "saved") return;
      await db.saves.put({
        id: response.save.savedAt,
        name: response.save.name,
        updatedAt: response.save.savedAt,
        summary: response.save.state.playerCountryId,
        data: response.save,
      });
      setSaves(await db.saves.orderBy("updatedAt").reverse().toArray());
      setReport(`Saved ${response.save.name}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save.");
    }
  }

  if (!snapshot) return null;

  return (
    <div className={`game-shell${drawingFrontId || orderArmed ? " map-drawing" : ""}`} ref={shellRef}>
      <MapView
        snapshot={snapshot}
        mode={mode}
        selectedProvinceId={selectedProvinceId}
        drawingFrontId={drawingFrontId}
        drawingKind={drawingKind}
        onProvince={chooseProvince}
        onMovePoint={moveToPoint}
        onStroke={drawStroke}
        onDrawHint={drawHint}
      />
      <TopBar
        snapshot={snapshot}
        fullscreen={fullscreen}
        onCommand={(command) => void send(command)}
        onSave={() => void save()}
        onToggleFullscreen={() => void toggleFullscreen()}
      />
      {researchOpen ? (
        <div className="hud-industry">
          <ResearchPanel onCommand={(command) => void send(command)} />
        </div>
      ) : designerOpen ? (
        <div className="hud-industry">
          <DesignerPanel onCommand={(command) => void send(command)} />
        </div>
      ) : industryOpen ? (
        <div className="hud-industry">
          <IndustryPanel onCommand={(command) => void send(command)} />
        </div>
      ) : null}
      {drawingFrontId ? (
        <div className="order-banner" role="status" aria-live="polite" data-testid="order-banner">
          <p>
            {drawingKind === "offensive"
              ? "Drag on the map to draw the gold attack arrow. Release to set it. Corps stay put until you start the attack."
              : "Drag on the map to draw the red hashed frontline. Assigned corps will hold along that line."}
          </p>
          <button
            type="button"
            data-testid="cancel-drawing"
            aria-keyshortcuts="Escape"
            onClick={() => {
              setDrawingFrontId(null);
              setReport("Drawing cancelled.");
            }}
          >
            Cancel drawing
          </button>
          <p className="muted">Press Escape to cancel. Pan is paused while you draw.</p>
          {report ? <p className="banner-hint">{report}</p> : null}
        </div>
      ) : orderArmed ? (
        <div className="order-banner" role="status" aria-live="polite" data-testid="order-banner">
          <p>Click a point on land. That corps marches to the clicked point, not to a province center.</p>
          <button type="button" data-testid="cancel-drawing" onClick={() => setOrderArmed(false)}>
            Cancel move
          </button>
        </div>
      ) : null}
      <div className="hud-side">
        <DivisionList onCommand={(command) => void send(command)} />
        <ProvincePanel onProvince={chooseProvince} />
      </div>
      {snapshot.pendingEvent ? (
        <EventDialog
          event={snapshot.pendingEvent}
          onChoose={(choiceId) =>
            void send({
              type: "resolveEvent",
              eventId: snapshot.pendingEvent?.id ?? "",
              choiceId,
            })
          }
        />
      ) : null}
    </div>
  );
}
