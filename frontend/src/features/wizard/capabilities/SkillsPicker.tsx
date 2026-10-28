import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getAgentSkills, getSkills, setAgentSkill } from "../../../shared/api/capabilities";
import { Button, Card, Skeleton } from "../../../shared/ui";

type Props = { agentId: string; token: string };

export function SkillsPicker({ agentId, token }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const catalog = useQuery({ queryKey: ["skills", "catalog"], queryFn: () => getSkills(token) });
  const assigned = useQuery({ queryKey: ["skills", "agent", agentId], queryFn: () => getAgentSkills(token, agentId) });
  const toggle = useMutation({
    mutationFn: ({ skillId, enabled }: { skillId: string; enabled: boolean }) =>
      setAgentSkill(token, agentId, skillId, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["skills", "agent", agentId] }),
  });
  const base = "wizard.capabilities.skills";

  let content;
  if (catalog.isPending || assigned.isPending) {
    content = (
      <div role="status" aria-label={t(`${base}.loading`)}>
        <Skeleton className="wizard-skeleton" />
      </div>
    );
  } else if (catalog.isError || assigned.isError) {
    content = (
      <div role="alert" className="wizard-error">
        <p>{t(`${base}.loadError`)}</p>
        <Button
          type="button"
          onClick={() => {
            void catalog.refetch();
            void assigned.refetch();
          }}
        >
          {t("app.retry")}
        </Button>
      </div>
    );
  } else {
    const selected = new Set(assigned.data.filter((item) => item.enabled).map((item) => item.skill.id));
    const skills = catalog.data.filter((skill) => skill.enabled && skill.status === "published");
    content =
      skills.length === 0 ? (
        <p>{t(`${base}.empty`)}</p>
      ) : (
        <ul className="skills-list">
          {skills.map((skill) => {
            const inputId = `skill-${skill.id}`;
            return (
              <li key={skill.id} className="skills-list__item">
                <input
                  id={inputId}
                  type="checkbox"
                  checked={selected.has(skill.id)}
                  disabled={toggle.isPending}
                  aria-label={t(`${base}.toggleLabel`, { name: skill.name })}
                  onChange={(event) => toggle.mutate({ skillId: skill.id, enabled: event.target.checked })}
                />
                <div>
                  <label htmlFor={inputId}>{skill.name}</label>
                  <p className="field-hint">{skill.description}</p>
                </div>
              </li>
            );
          })}
        </ul>
      );
  }

  return (
    <Card className="skills-picker" aria-labelledby="skills-title">
      <h2 id="skills-title">{t(`${base}.title`)}</h2>
      <p className="field-hint">{t(`${base}.description`)}</p>
      {content}
      {toggle.isError ? (
        <p role="alert" className="field-error">
          {t(`${base}.saveError`)}
        </p>
      ) : null}
    </Card>
  );
}
