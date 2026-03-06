import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard } from "react-native";
import type { KeyboardEvent, LayoutChangeEvent, View } from "react-native";

export const useKeyboardOverlap = () => {
  const containerRef = useRef<View | null>(null);
  const keyboardTopRef = useRef<number | null>(null);
  const [keyboardOffset, setKeyboardOffset] = useState<number>(0);

  const measureKeyboardOverlap = useCallback((keyboardTop: number | null) => {
    if (keyboardTop === null) {
      setKeyboardOffset((currentOffset) => (currentOffset === 0 ? currentOffset : 0));
      return;
    }

    containerRef.current?.measureInWindow((_x, y, _width, height) => {
      const containerBottom = y + height;
      const overlap = Math.max(0, containerBottom - keyboardTop);
      setKeyboardOffset((currentOffset) => (currentOffset === overlap ? currentOffset : overlap));
    });
  }, []);

  useEffect(() => {
    const handleKeyboardShow = (event: KeyboardEvent) => {
      keyboardTopRef.current = event.endCoordinates.screenY;
      measureKeyboardOverlap(event.endCoordinates.screenY);
    };

    const handleKeyboardHide = () => {
      keyboardTopRef.current = null;
      measureKeyboardOverlap(null);
    };

    const showSubscription = Keyboard.addListener("keyboardDidShow", handleKeyboardShow);
    const hideSubscription = Keyboard.addListener("keyboardDidHide", handleKeyboardHide);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [measureKeyboardOverlap]);

  const handleContainerLayout = useCallback((_event: LayoutChangeEvent) => {
    if (keyboardTopRef.current !== null) {
      measureKeyboardOverlap(keyboardTopRef.current);
    }
  }, [measureKeyboardOverlap]);

  return {
    containerRef,
    handleContainerLayout,
    keyboardOffset
  };
};
