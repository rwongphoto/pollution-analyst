import type { ReactNode } from "react";

export function InfoTip({
  heading,
  body,
  ariaLabel = "What this means",
}: {
  heading?: string;
  body: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <span className="info-tip" tabIndex={0} role="button" aria-label={ariaLabel}>
      <span className="info-tip__icon" aria-hidden="true">i</span>
      <span className="info-tip__pop" role="tooltip">
        {heading ? <span className="info-tip__heading">{heading}</span> : null}
        {body}
      </span>
    </span>
  );
}
