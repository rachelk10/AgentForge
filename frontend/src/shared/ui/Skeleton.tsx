import type { HTMLAttributes } from "react";

export function Skeleton(props: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} aria-hidden="true" className={`skeleton ${props.className ?? ""}`.trim()} />;
}
