import React, { useRef, useState, useEffect } from 'react';

interface ScalableLabelProps {
  children: React.ReactNode;
  widthMm: number;
  heightMm: number;
}

export const ScalableLabel: React.FC<ScalableLabelProps> = ({ children, widthMm, heightMm }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleResize = () => {
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      
      if (!containerWidth || !containerHeight) return;

      // 1mm is approximately 3.78px in standard CSS
      const pxPerMm = 3.779527559055;
      const targetWidth = widthMm * pxPerMm;
      const targetHeight = heightMm * pxPerMm;

      // Subtract padding to keep a safe margin around the card
      const padding = 24; 
      const maxWidth = Math.max(100, containerWidth - padding);
      const maxHeight = Math.max(100, containerHeight - padding);

      const scaleX = maxWidth / targetWidth;
      const scaleY = maxHeight / targetHeight;
      const newScale = Math.min(scaleX, scaleY, 1); // Never scale up past 100% of real print size
      
      setScale(newScale);
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(container);
    handleResize();

    // Re-run on layout changes
    window.addEventListener('resize', handleResize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [widthMm, heightMm]);

  // Translate mm to target pixels
  const pxPerMm = 3.779527559055;
  const targetWidth = widthMm * pxPerMm;
  const targetHeight = heightMm * pxPerMm;

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full min-h-0 flex items-center justify-center overflow-hidden p-2"
    >
      <div 
        style={{
          width: `${targetWidth}px`,
          height: `${targetHeight}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          flexShrink: 0,
        }}
        className="transition-transform duration-150 ease-out shadow-2xl shadow-black/10 rounded-2xl overflow-hidden bg-white"
      >
        {children}
      </div>
    </div>
  );
};
