/**
 * useIntersectionObserver Hook
 *
 * Detects when an element enters the viewport using the Intersection Observer API.
 * Used for lazy loading Embeds - only initialize when scrolled into view.
 *
 * @param {Object} options - Configuration options
 * @param {number} options.threshold - Percentage of element visibility to trigger (0-1)
 * @param {string} options.rootMargin - CSS margin around viewport to trigger early (e.g., '200px')
 * @param {boolean} options.triggerOnce - Whether to stop observing after first trigger
 * @returns {[Function, boolean]} - [ref callback, isVisible boolean]
 *
 * @example
 * const [ref, isVisible] = useIntersectionObserver({
 *   threshold: 0.1,      // Trigger when 10% visible
 *   rootMargin: '200px', // Load 200px before entering viewport
 *   triggerOnce: true    // Only load once, don't unload when scrolled away
 * });
 *
 * return <div ref={ref}>{isVisible ? <Content /> : <Skeleton />}</div>;
 */

import { useEffect, useRef, useState } from 'react';

export function useIntersectionObserver(options = {}) {
  const {
    threshold = 0.1,
    rootMargin = '200px',
    triggerOnce = true,
    enabled = true // New option to disable the observer
  } = options;

  const [isVisible, setIsVisible] = useState(!enabled); // If disabled, always visible
  const [node, setNode] = useState(null);
  const observerRef = useRef(null);

  // Ref callback to attach observer to element
  const ref = (element) => {
    if (enabled) {
      setNode(element);
    }
  };

  useEffect(() => {
    // If disabled, skip all observation logic
    if (!enabled) {
      return;
    }

    // Don't observe if already visible and triggerOnce is true
    if (isVisible && triggerOnce) {
      return;
    }

    // Don't observe if no node
    if (!node) {
      return;
    }

    // Create observer
    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.isIntersecting;
        setIsVisible(visible);

        // If triggerOnce and now visible, disconnect observer
        if (visible && triggerOnce && observerRef.current) {
          observerRef.current.disconnect();
        }
      },
      {
        threshold,
        rootMargin
      }
    );

    observerRef.current = observer;
    observer.observe(node);

    // Cleanup
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [node, threshold, rootMargin, triggerOnce, isVisible, enabled]);

  return [ref, isVisible];
}
