import { useEffect, useState } from "react";
import { listSaves } from "../db.ts";
import { useUi } from "../state/uiStore.ts";
import { simClient } from "../workers/simClient.ts";
import { GameShell } from "./GameShell.tsx";

export function App() {
  const phase = useUi((state) => state.phase);
  const saves = useUi((state) => state.saves);
  const error = useUi((state) => state.error);
  const setSaves = useUi((state) => state.setSaves);
  const setPhase = useUi((state) => state.setPhase);
  const setSnapshot = useUi((state) => state.setSnapshot);
  const setError = useUi((state) => state.setError);
  const setReport = useUi((state) => state.setReport);
  const [seedText, setSeedText] = useState("68090101");

  useEffect(() => {
    void listSaves()
      .then(setSaves)
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Could not read saves.");
      });
  }, [setError, setSaves]);

  async function begin(playerCountryId: string) {
    const parsed = Number.parseInt(seedText, 10);
    const seed = Number.isInteger(parsed) ? parsed : 68090101;
    setError(null);
    try {
      const response = await simClient().send({ type: "start", playerCountryId, seed });
      if (response.type !== "snapshot") throw new Error("The simulation did not start.");
      setSnapshot(response.snapshot);
      setReport(null);
      setPhase("game");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start the campaign.");
    }
  }

  async function resume(id: string) {
    const row = saves.find((save) => save.id === id);
    if (!row) return;
    setError(null);
    try {
      const response = await simClient().send({ type: "load", save: row.data });
      if (response.type !== "snapshot") throw new Error("The save could not be restored.");
      setSnapshot(response.snapshot);
      setReport(response.report);
      setPhase("game");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load the save.");
    }
  }

  if (phase === "game") return <GameShell />;

  return (
    <main className="title-screen">
      <section className="title-card">
        <p className="eyebrow">1 September, 68 Ma</p>
        <h1>Meridian Front</h1>
        <p>
          The Rhenish Massif and Holy Cross Island are already at war. You attack by sending a pack into the
          island. Every other landmass is neutral, and your army cannot enter their ground. The simulation
          stays in this browser.
        </p>
        <label>
          Seed{" "}
          <input
            className="search"
            value={seedText}
            onChange={(event) => setSeedText(event.target.value)}
            inputMode="numeric"
          />
        </label>
        <div className="choice-row">
          <button className="country-choice" data-testid="play-germany" onClick={() => void begin("germany")}>
            <img src="flags/germany.svg" alt="" />
            <span>Play Rhenish Massif</span>
          </button>
          <button className="country-choice" data-testid="play-poland" onClick={() => void begin("poland")}>
            <img src="flags/poland.svg" alt="" />
            <span>Play Holy Cross Island</span>
          </button>
        </div>
        {saves.length > 0 ? (
          <>
            <h2>Saved campaigns</h2>
            <div className="save-list">
              {saves.map((save, index) => (
                <button
                  key={save.id}
                  data-testid={index === 0 ? "continue-save" : `save-${save.id}`}
                  onClick={() => void resume(save.id)}
                >
                  {save.name}
                </button>
              ))}
            </div>
          </>
        ) : null}
        {error ? <p className="error-banner">{error}</p> : null}
      </section>
    </main>
  );
}
