import { ReactNode } from "react";

type SectionCardProps = {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
};

export function SectionCard({ title, eyebrow, action, children }: SectionCardProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h2>{title}</h2>
        </div>
        {action}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}
