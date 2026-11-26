import { SPRINT_MS } from '../../engine/progress';
import type { SkillMastery } from '../../engine/progress';
import type { DrillSkill, Skill } from '../../engine/question';
import { formatNumber, SKILL_NAMES } from '../format';
import { Button, Chip, ChipGroup, Row, RowList, Screen, Stars } from '../parts';

export interface SkillGroup {
  /** "Drills · 5 per session". */
  label: string;
  skills: SkillMastery[];
}

/** A drill skill as the sprint list shows it. */
export interface SprintSkill {
  skill: DrillSkill;
  stars: number;
  /** Personal best sprint score; null before the first sprint. */
  best: number | null;
}

/** `session`: every skill, tap to start a session. `sprint`: drill skills, tap to get ready for a sprint. */
export type SkillsMode = 'session' | 'sprint';

interface Props {
  mode: SkillsMode;
  onMode(mode: SkillsMode): void;
  groups: SkillGroup[];
  sprintSkills: SprintSkill[];
  onStart(skill: Skill): void;
  onSprint(skill: DrillSkill): void;
  onHome(): void;
}

/** Every skill with its stars; tapping one starts a session in it (or readies a sprint), overriding the app's pick. */
export function Skills({ mode, onMode, groups, sprintSkills, onStart, onSprint, onHome }: Props) {
  return (
    <Screen
      class="skills"
      actions={
        <Button variant="secondary" onClick={onHome}>
          Home
        </Button>
      }
    >
      <header class="skills-head">
        <h1 class="skills-title">Skills</h1>
        <p class="meta">{mode === 'session' ? 'Tap one to start a session in it.' : `Tap one to get ready for a ${formatNumber(SPRINT_MS / 1000)}-second sprint.`}</p>
      </header>

      <ChipGroup label="Practice">
        <Chip pressed={mode === 'session'} onClick={() => onMode('session')}>
          Session
        </Chip>
        <Chip pressed={mode === 'sprint'} onClick={() => onMode('sprint')}>
          Sprint
        </Chip>
      </ChipGroup>

      {mode === 'session' ? (
        groups.map(({ label, skills }) => (
          <section class="skills-group" aria-label={label} key={label}>
            <p class="label">{label}</p>
            <RowList label={label}>
              {skills.map((m) => (
                <Row
                  key={m.skill}
                  testId={`skill-${m.skill}`}
                  title={SKILL_NAMES[m.skill]}
                  meta={m.answered === 0 ? `Tier ${m.tier} · new` : `Tier ${m.tier} · ${formatNumber(m.answered)} answered`}
                  trailing={<Stars value={m.stars} />}
                  onClick={() => onStart(m.skill)}
                />
              ))}
            </RowList>
          </section>
        ))
      ) : (
        <section class="skills-group" aria-label="Sprints">
          <p class="label">Sprints · {formatNumber(SPRINT_MS / 1000)} seconds</p>
          <RowList label="Sprint skills">
            {sprintSkills.map(({ skill, stars, best }) => (
              <Row
                key={skill}
                testId={`sprint-${skill}`}
                title={SKILL_NAMES[skill]}
                meta={best === null ? 'No best yet' : `Best ${formatNumber(best)}`}
                trailing={<Stars value={stars} />}
                onClick={() => onSprint(skill)}
              />
            ))}
          </RowList>
        </section>
      )}
    </Screen>
  );
}
