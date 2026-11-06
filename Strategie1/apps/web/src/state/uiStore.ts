import type { CampaignSnapshot } from "@meridian/core";
import type { Command, MapMode, SaveFile } from "@meridian/shared";
import { create } from "zustand";
import type { SaveRow } from "../db.ts";

interface UiState {
  phase: "title" | "game";
  snapshot: CampaignSnapshot | null;
  selectedProvinceId: string | null;
  selectedDivisionId: string | null;
  mapMode: MapMode;
  drawingFrontId: string | null;
  drawingKind: "front" | "offensive" | null;
  orderArmed: boolean;
  industryOpen: boolean;
  designerOpen: boolean;
  researchOpen: boolean;
  report: string | null;
  error: string | null;
  saves: SaveRow[];
  camera: { x: number; y: number; zoom: number };
  setPhase: (phase: "title" | "game") => void;
  setSnapshot: (snapshot: CampaignSnapshot) => void;
  setSelectedProvinceId: (id: string | null) => void;
  setSelectedDivisionId: (id: string | null) => void;
  setMapMode: (mode: MapMode) => void;
  setDrawingFrontId: (frontId: string | null, kind?: "front" | "offensive" | null) => void;
  setOrderArmed: (armed: boolean) => void;
  setIndustryOpen: (open: boolean) => void;
  setDesignerOpen: (open: boolean) => void;
  setResearchOpen: (open: boolean) => void;
  setReport: (report: string | null) => void;
  setError: (error: string | null) => void;
  setSaves: (saves: SaveRow[]) => void;
  setCamera: (camera: { x: number; y: number; zoom: number }) => void;
}

export const useUi = create<UiState>((set) => ({
  phase: "title",
  snapshot: null,
  selectedProvinceId: null,
  selectedDivisionId: null,
  mapMode: "political",
  drawingFrontId: null,
  drawingKind: null,
  orderArmed: false,
  industryOpen: false,
  designerOpen: false,
  researchOpen: false,
  report: null,
  error: null,
  saves: [],
  camera: { x: 40, y: 40, zoom: 0.45 },
  setPhase: (phase) => set({ phase }),
  setSnapshot: (snapshot) => set({ snapshot }),
  setSelectedProvinceId: (selectedProvinceId) => set({ selectedProvinceId }),
  setSelectedDivisionId: (selectedDivisionId) => set({ selectedDivisionId }),
  setMapMode: (mapMode) => set({ mapMode }),
  setDrawingFrontId: (drawingFrontId, kind) =>
    set({
      drawingFrontId,
      drawingKind: drawingFrontId ? (kind ?? "front") : null,
    }),
  setOrderArmed: (orderArmed) => set({ orderArmed }),
  setIndustryOpen: (industryOpen) =>
    set(industryOpen ? { industryOpen: true, designerOpen: false, researchOpen: false } : { industryOpen: false }),
  setDesignerOpen: (designerOpen) =>
    set(designerOpen ? { designerOpen: true, industryOpen: false, researchOpen: false } : { designerOpen: false }),
  setResearchOpen: (researchOpen) =>
    set(researchOpen ? { researchOpen: true, industryOpen: false, designerOpen: false } : { researchOpen: false }),
  setReport: (report) => set({ report }),
  setError: (error) => set({ error }),
  setSaves: (saves) => set({ saves }),
  setCamera: (camera) => set({ camera }),
}));

export type { Command, SaveFile };
