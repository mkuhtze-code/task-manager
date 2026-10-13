'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { TodayHeader } from '@/components/TodayHeader';

type TodayHeaderProps = React.ComponentProps<typeof TodayHeader>;

type TodayHeaderStateValue = {
  headerProps: TodayHeaderProps | null;
  setHeaderProps: React.Dispatch<React.SetStateAction<TodayHeaderProps | null>>;
};

const TodayHeaderStateContext = createContext<TodayHeaderStateValue | null>(null);

export function TodayHeaderProvider({ children }: { children: ReactNode }) {
  const [headerProps, setHeaderProps] = useState<TodayHeaderProps | null>(null);

  return (
    <TodayHeaderStateContext.Provider value={{ headerProps, setHeaderProps }}>
      {children}
    </TodayHeaderStateContext.Provider>
  );
}

export function useTodayHeaderState() {
  const value = useContext(TodayHeaderStateContext);
  if (!value) {
    throw new Error('useTodayHeaderState must be used within TodayHeaderProvider');
  }
  return value;
}

/** Publishes Today’s live context to the persistent app chrome without duplicating its logic. */
export function TodayHeaderBridge(props: TodayHeaderProps) {
  const { setHeaderProps } = useTodayHeaderState();

  useEffect(() => {
    setHeaderProps((previous) => {
      if (previous) {
        const previousKeys = Object.keys(previous) as Array<keyof TodayHeaderProps>;
        const nextKeys = Object.keys(props) as Array<keyof TodayHeaderProps>;
        if (
          previousKeys.length === nextKeys.length &&
          nextKeys.every((key) => previous[key] === props[key])
        ) {
          return previous;
        }
      }
      return props;
    });
  }, [props, setHeaderProps]);

  return null;
}
