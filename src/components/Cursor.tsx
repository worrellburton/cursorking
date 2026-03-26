"use client";

type CursorProps = {
  x: number;
  y: number;
  color: string;
};

export default function Cursor({ x, y, color }: CursorProps) {
  return (
    <div
      className="pointer-events-none absolute top-0 left-0 transition-transform duration-75 ease-out"
      style={{ transform: `translate(${x}px, ${y}px)` }}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M5.65376 12.3673H5.46026L5.31717 12.4976L0.500002 16.8829L0.500002 1.19841L11.7841 12.3673H5.65376Z"
          fill={color}
          stroke="white"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}
