import { create } from 'zustand';

interface UiState {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;

  // Collapse state for schedule grid (set of collapsed IDs)
  collapsedSections: Set<string>;
  collapsedCategories: Set<string>;
  collapsedLocations: Set<string>;
  toggleSectionCollapse: (id: string) => void;
  toggleCategoryCollapse: (id: string) => void;
  toggleLocationCollapse: (id: string) => void;
  collapseAll: (sectionIds: string[], categoryIds: string[], locationIds: string[]) => void;
  expandAll: () => void;

  // Undo/redo history (opaque actions)
  undoStack: UndoAction[];
  redoStack: UndoAction[];
  pushUndo: (action: UndoAction) => void;
  undo: () => UndoAction | undefined;
  redo: () => UndoAction | undefined;

  // Save status
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  setSaveStatus: (status: UiState['saveStatus']) => void;
}

interface UndoAction {
  type: string;
  payload: unknown;
  inverse: unknown;
}

export const useUiStore = create<UiState>((set, get) => ({
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  collapsedSections: new Set(),
  collapsedCategories: new Set(),
  collapsedLocations: new Set(),

  toggleSectionCollapse: (id) =>
    set((s) => {
      const next = new Set(s.collapsedSections);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { collapsedSections: next };
    }),

  toggleCategoryCollapse: (id) =>
    set((s) => {
      const next = new Set(s.collapsedCategories);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { collapsedCategories: next };
    }),

  toggleLocationCollapse: (id) =>
    set((s) => {
      const next = new Set(s.collapsedLocations);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { collapsedLocations: next };
    }),

  collapseAll: (sectionIds, categoryIds, locationIds) =>
    set({
      collapsedSections: new Set(sectionIds),
      collapsedCategories: new Set(categoryIds),
      collapsedLocations: new Set(locationIds),
    }),

  expandAll: () =>
    set({ collapsedSections: new Set(), collapsedCategories: new Set(), collapsedLocations: new Set() }),

  undoStack: [],
  redoStack: [],

  pushUndo: (action) =>
    set((s) => ({
      undoStack: [...s.undoStack.slice(-49), action],
      redoStack: [],
    })),

  undo: () => {
    const { undoStack } = get();
    if (!undoStack.length) return undefined;
    const action = undoStack[undoStack.length - 1];
    set((s) => ({ undoStack: s.undoStack.slice(0, -1), redoStack: [...s.redoStack, action] }));
    return action;
  },

  redo: () => {
    const { redoStack } = get();
    if (!redoStack.length) return undefined;
    const action = redoStack[redoStack.length - 1];
    set((s) => ({ redoStack: s.redoStack.slice(0, -1), undoStack: [...s.undoStack, action] }));
    return action;
  },

  saveStatus: 'idle',
  setSaveStatus: (status) => set({ saveStatus: status }),
}));
