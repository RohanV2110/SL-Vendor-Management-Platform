import {
  createQuestionPromptAction,
  deleteQuestionPromptAction
} from "@/lib/actions";
import { SectionCard } from "@/components/section-card";
import { SubmitButton } from "@/components/submit-button";
import { prisma } from "@/lib/prisma";

export default async function AdminQuestionnairePage() {
  const prompts = await prisma.questionPrompt.findMany({
    where: { isActive: true },
    include: { product: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
  });

  return (
    <div className="stack-lg">
      <SectionCard title="Application questions" eyebrow="Admin-managed questionnaire">
        {prompts.length === 0 ? (
          <div className="empty-state">No questions yet.</div>
        ) : (
          <div className="stack-lg">
            {prompts.map((prompt) => (
              <div key={prompt.id} className="note">
                <div className="inline-form" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <strong>{prompt.label}</strong>
                    <br />
                    <span className="muted">
                      {prompt.product?.name ?? "All products"} · Sort {prompt.sortOrder}
                    </span>
                    {prompt.helperText ? <p className="muted">{prompt.helperText}</p> : null}
                  </div>
                  <form action={deleteQuestionPromptAction}>
                    <input type="hidden" name="id" value={prompt.id} />
                    <SubmitButton
                      className="button button-ghost table-action-button"
                      label="Delete"
                      pendingLabel="Removing..."
                    />
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Add question" eyebrow="Subjective questions">
        <form action={createQuestionPromptAction} className="stack-md">
          <label className="field">
            <span>Question</span>
            <input className="input" name="label" required />
          </label>
          <label className="field">
            <span>Helper text</span>
            <textarea className="textarea" name="helperText" />
          </label>
          <label className="field">
            <span>Sort order</span>
            <input className="input" name="sortOrder" type="number" min="0" defaultValue={prompts.length + 1} />
          </label>
          <label className="field">
            <span>
              <input type="checkbox" name="isRequired" defaultChecked /> Required
            </span>
          </label>
          <SubmitButton label="Add question" pendingLabel="Adding..." />
        </form>
      </SectionCard>
    </div>
  );
}
