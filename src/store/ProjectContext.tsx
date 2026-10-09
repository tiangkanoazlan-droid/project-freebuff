import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
} from 'react';
import type { ProjectState } from '../types';
import { projectReducer, type ProjectAction } from './projectReducer';
import { loadProjectState, saveProjectState } from './storage';

interface ProjectContextValue {
  state: ProjectState;
  dispatch: Dispatch<ProjectAction>;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProjectState>(() => loadProjectState());

  useEffect(() => {
    saveProjectState(state);
  }, [state]);

  const dispatch = useCallback<ProjectDispatch>((action) => {
    setState((prev) => projectReducer(prev, action));
  }, []);

  const value = useMemo(() => ({ state, dispatch }), [state, dispatch]);

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

type ProjectDispatch = Dispatch<ProjectAction>;

export function useProject(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject harus dipakai di dalam <ProjectProvider>');
  }
  return context;
}
