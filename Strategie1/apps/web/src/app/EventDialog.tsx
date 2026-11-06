import type { CampaignSnapshot } from "@meridian/core";

export function EventDialog({
  event,
  onChoose,
}: {
  event: NonNullable<CampaignSnapshot["pendingEvent"]>;
  onChoose: (choiceId: string) => void;
}) {
  return (
    <div className="dialog-backdrop">
      <section className="dialog" role="dialog" aria-labelledby="event-title">
        <p className="eyebrow">Decision</p>
        <h2 id="event-title">{event.title}</h2>
        <p>{event.description}</p>
        <div className="choice-row">
          {event.choices.map((choice) => (
            <button key={choice.id} data-testid={`choice-${choice.id}`} onClick={() => onChoose(choice.id)}>
              <strong>{choice.label}</strong>
              <div className="muted">{choice.detail}</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
