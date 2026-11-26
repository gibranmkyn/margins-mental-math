import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  anotherSession,
  applyEvent,
  bookletStatus,
  chooseBookletSession,
  chooseMock,
  chooseNextSession,
  chooseSpotCheck,
  drillTimeTrend,
  mockTrend,
  trendSkills,
  continueBooklet,
  DRILLS_PER_SESSION,
  initialProgress,
  masteryFor,
  mockMix,
  nextSprintQuestion,
  personalBest,
  resumeRun,
  retryStatus,
  SCENARIOS_PER_SESSION,
  spotCheckSeen,
  streakStatus,
  totals,
} from '../engine/progress';
import type { TrendRange, Happening, MockInProgress, MockLength, MockPlan, MockRecord, Progress, ProgressEvent, SessionChoice, SessionPlan, SpotCheckLength } from '../engine/progress';
import { createRandom, isDrillQuestion, isScenarioSkill, listSkills, markAnswer } from '../engine/question';
import type { DrillSkill, Question } from '../engine/question';
import type { ProgressStore, StoreNotice } from '../storage/progress-store';
import { createRunStore } from '../storage/run-store';
import type { RunStore } from '../storage/run-store';
import { Home } from './screens/Home';
import type { NextSession } from './screens/Home';
import { Library } from './screens/Library';
import { MockReady, MockResult, MockReview, MockRun } from './screens/Mock';
import type { MockState } from './screens/Mock';
import type { BadgeWin } from './screens/NewBadges';
import { Profile } from './screens/Profile';
import { Settings } from './screens/Settings';
import { ScenarioSession } from './screens/ScenarioSession';
import { Session } from './screens/Session';
import type { Feedback } from './screens/Session';
import { Skills } from './screens/Skills';
import type { SkillGroup, SkillsMode, SprintSkill } from './screens/Skills';
import { Sprint, SprintReady, SprintResult } from './screens/Sprint';
import { Summary } from './screens/Summary';
import { Trends } from './screens/Trends';
import { healthText, noticeText } from './screens/Trouble';
import { createSound } from './sound';
import type { Sound } from './sound';
import { getThemeChoice, setThemeChoice } from './theme';
import { localDay, useNow } from './now';
import { visibleNow } from './visible-clock';
import type { ThemeChoice } from './theme';

type Screen =
  | { name: 'home' }
  | { name: 'profile' }
  | { name: 'settings' }
  | { name: 'trends'; skill: DrillSkill | null; range: TrendRange }
  | { name: 'skills'; mode: SkillsMode }
  | { name: 'library' }
  | { name: 'mock-ready' }
  /** `resume`: where a mock saved before a reload had got to. */
  | { name: 'mock'; plan: MockPlan; startedAt: number; resume?: MockState }
  /** The result, or one question of it under review. */
  | { name: 'mock-result'; plan: MockPlan; result: MockRecord; promotedTo: string | null; badges: BadgeWin[]; reviewing: number | null }
  | { name: 'sprint-ready'; skill: DrillSkill }
  | { name: 'sprint'; skill: DrillSkill; run: number }
  | { name: 'sprint-result'; result: Extract<Happening, { kind: 'sprint-finished' }>; badges: BadgeWin[]; promotedTo: string | null }
  /** A session being played, drill or scenario alike (the plan's kind says which). */
  | { name: 'play'; plan: SessionPlan; index: number; results: boolean[]; feedback: Given | null; shownAt: number; levelUps: string[]; badges: BadgeWin[] }
  | {
      name: 'summary';
      result: Extract<Happening, { kind: 'session-finished' }>;
      results: boolean[];
      levelUps: string[];
      badges: BadgeWin[];
      plan: SessionPlan;
    };

/** The answer given to the question showing, with its mark and XP: a typed value, or a chosen option's index. */
interface Given {
  value: number;
  mark: Feedback['mark'];
  xp: Feedback['xp'];
  promotedTo: string | null;
}

const SKILLS = listSkills();

/** Every skill with its mastery, drills first, for the skills screen. */
function skillGroups(progress: Progress): SkillGroup[] {
  const of = (kind: 'drill' | 'scenario' | 'chart') => SKILLS.filter((s) => s.kind === kind).map((s) => masteryFor(progress, s.skill));
  return [
    { label: `Drills · ${DRILLS_PER_SESSION} per session`, skills: of('drill') },
    { label: `Scenarios · ${SCENARIOS_PER_SESSION} per session`, skills: of('scenario') },
    { label: `Charts · ${SCENARIOS_PER_SESSION} per session`, skills: of('chart') },
  ].filter((group) => group.skills.length > 0);
}

/** What Home says about the session the app picked. */
function describe(plan: SessionPlan, progress: Progress): NextSession {
  const scenario = isScenarioSkill(plan.skill);
  const first = plan.questions[0];
  return {
    skill: plan.skill,
    tier: plan.tier,
    stars: masteryFor(progress, plan.skill).stars,
    length: plan.questions.length,
    noun: scenario ? 'questions' : 'drills',
    marking: first && isDrillQuestion(first) ? first.answer.marking : null,
    retries: plan.retries?.length ?? 0,
  };
}

/** Drill skills with their stars and sprint bests, for the sprint list. */
function sprintSkills(progress: Progress): SprintSkill[] {
  return SKILLS.flatMap((s) =>
    s.kind === 'drill' ? [{ skill: s.skill, stars: masteryFor(progress, s.skill).stars, best: personalBest(progress, s.skill) }] : [],
  );
}

/** The result screen for a submitted mock, from what the progress engine said happened. */
function mockResultScreen(plan: MockPlan, happened: Happening[]): Screen {
  const finished = happened.find((h) => h.kind === 'mock-finished');
  const promotion = happened.find((h) => h.kind === 'level-up');
  const badges = happened.filter((h): h is BadgeWin => h.kind === 'badge-unlocked');
  if (!finished || finished.kind !== 'mock-finished') return { name: 'home' };
  return { name: 'mock-result', plan, result: finished.mock, promotedTo: promotion && promotion.kind === 'level-up' ? promotion.to : null, badges, reviewing: null };
}

/** The event that finishes a session; a spot check says so, so its record is marked. */
function finishEvent(plan: SessionPlan): ProgressEvent {
  return { type: 'session-finished', sessionId: plan.id, ...(plan.spotCheck && { spotCheck: true }) };
}

/** The summary screen for a finished session, from what the progress engine said happened. */
function summaryScreen(plan: SessionPlan, results: boolean[], levelUps: string[], badges: BadgeWin[], happened: Happening[]): Screen {
  const finished = happened.find((h) => h.kind === 'session-finished');
  const earned = [...badges, ...happened.filter((h): h is BadgeWin => h.kind === 'badge-unlocked')];
  return finished && finished.kind === 'session-finished' ? { name: 'summary', result: finished, results, levelUps, badges: earned, plan } : { name: 'home' };
}

interface Boot {
  progress: Progress;
  notice: StoreNotice | null;
  screen: Screen;
}

/**
 * Open the app: load progress, then pick up a mock or session that a reload or the
 * phone closing the app interrupted. A mock whose time ran out meanwhile is submitted
 * with its saved answers; a session whose every question was answered is finished.
 */
function boot(store: ProgressStore, runs: RunStore, now: Date): Boot {
  const loaded = store.load();
  const { notice } = loaded;
  // Badges already earned in the history (after a migration, say) unlock now rather than on the next answer.
  const opened = applyEvent(loaded.progress, { type: 'app-opened' }, now);
  if (opened.progress !== loaded.progress) store.save(opened.progress);
  const progress = opened.progress;
  const run = runs.load();
  if (!run) return { progress, notice, screen: { name: 'home' } };
  const resume = resumeRun(run, now);
  const settle = (event: ProgressEvent, at = now) => {
    const next = applyEvent(progress, event, at);
    store.save(next.progress);
    runs.clear();
    return next;
  };
  switch (resume.action) {
    case 'resume-mock': {
      const { plan, startedAt, index, choices, flagged, spentMs } = resume.run;
      return { progress, notice, screen: { name: 'mock', plan, startedAt, resume: { index, choices, flagged, spentMs } } };
    }
    case 'submit-mock': {
      const { plan, choices, spentMs } = resume.run;
      const next = settle({ type: 'mock-finished', mock: plan, choices, timesMs: spentMs, timeMs: resume.timeMs });
      return { progress: next.progress, notice, screen: mockResultScreen(plan, next.happened) };
    }
    case 'resume-session': {
      const { plan, results, levelUps, badges } = resume.run;
      return { progress, notice, screen: { name: 'play', plan, index: resume.index, results, feedback: null, shownAt: visibleNow(), levelUps, badges } };
    }
    case 'finish-session': {
      const { plan, results, levelUps, badges } = resume.run;
      const next = settle(finishEvent(plan), resume.at);
      return { progress: next.progress, notice, screen: summaryScreen(plan, results, levelUps, badges, next.happened) };
    }
    case 'end-session':
      runs.clear();
      return { progress, notice, screen: { name: 'home' } };
  }
}

function freshSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

interface AppProps {
  store: ProgressStore;
  runs?: RunStore;
  sound?: Sound;
  /** Told whether the owner is on Home, the one place a new version may reload the page. */
  onIdle?(idle: boolean): void;
}

export function App({ store, runs: runsFor, sound: soundFor, onIdle }: AppProps) {
  const runs = useRef(runsFor ?? createRunStore()).current;
  const [loaded] = useState(() => boot(store, runs, new Date()));
  const [progress, setProgress] = useState<Progress>(loaded.progress);
  const [screen, setScreen] = useState<Screen>(loaded.screen);
  const [mockLength, setMockLength] = useState<MockLength>('short');
  const random = useRef(createRandom(freshSeed()));
  const sound = useRef(soundFor ?? createSound());
  const [soundOn, setSoundOn] = useState(() => sound.current.enabled());
  const [theme, setTheme] = useState<ThemeChoice>(() => getThemeChoice());
  const summary = useMemo(() => totals(progress), [progress]);
  // Home's "today": refreshed when the app comes back into view and at midnight.
  const now = useNow(screen.name === 'home');
  const retriesNow = retryStatus(progress, now);
  // The app's pick, chosen once per visit to Home so the session started is the one described; chosen again
  // when a new day starts or a retry falls due while Home is showing.
  const next = useMemo(
    () => (screen.name === 'home' ? chooseNextSession(progress, now, random.current) : null),
    [progress, screen.name, localDay(now), retriesNow.due],
  );

  // Whether progress is being saved, checked each time Home shows (a save may have failed since).
  const health = useMemo(() => (screen.name === 'home' ? healthText(store.health(), store.backupCount() > 0) : null), [screen.name, progress]);

  /** Every event goes through the progress engine and is saved at once, so leaving never loses credit. */
  const record = (event: ProgressEvent): Happening[] => {
    const next = applyEvent(progress, event, new Date());
    store.save(next.progress);
    setProgress(next.progress);
    return next.happened;
  };

  // A session in progress is saved on every change, so a reload can carry on; anything else clears it.
  // A mock saves itself through onChange, with the answers it holds. Saved as the change commits, so a reload straight after cannot miss it.
  useLayoutEffect(() => {
    if (screen.name === 'play') {
      const { plan, results, levelUps, badges } = screen;
      runs.save({ kind: 'session', plan, results, levelUps, badges, savedAt: Date.now() });
    } else if (screen.name !== 'mock') {
      runs.clear();
    }
  }, [screen]);

  useLayoutEffect(() => onIdle?.(screen.name === 'home'), [screen.name]);

  // Another tab or window saved: carry on from its progress, so neither overwrites the other's answers.
  useEffect(() => store.watch(setProgress), []);

  const play = (plan: SessionPlan) => {
    setScreen({ name: 'play', plan, index: 0, results: [], feedback: null, shownAt: visibleNow(), levelUps: [], badges: [] });
  };

  /** The owner's own pick: the skill they chose, at the tier its mastery points to. */
  const startSession = (chosen: SessionChoice) => play(chooseNextSession(progress, new Date(), random.current, chosen));

  /** A spot check of 1 or 3 test-level questions, mixed across skills. */
  const startSpotCheck = (length: SpotCheckLength) => play(chooseSpotCheck(progress, length, new Date(), random.current));

  /** Continue a booklet where the owner left off. */
  const startBooklet = (bookletId: string) => play(chooseBookletSession(progress, bookletId, new Date(), random.current));

  /** Record an answer and pull out what the screens show: XP earned and any promotions. */
  const recordAnswer = (plan: SessionPlan, question: Question, correct: boolean, shownAt: number) => {
    const timeMs = Math.round(visibleNow() - shownAt);
    const happened = record({ type: 'answer-recorded', sessionId: plan.id, question, correct, timeMs });
    const ups = happened.flatMap((h) => (h.kind === 'level-up' ? [h.to] : []));
    const badges = happened.filter((h): h is BadgeWin => h.kind === 'badge-unlocked');
    sound.current.play(ups.length > 0 || badges.length > 0 ? 'celebrate' : correct ? 'hit' : 'miss');
    return { xp: happened.find((h) => h.kind === 'xp-earned') ?? null, ups, badges };
  };

  const finish = (plan: SessionPlan, results: boolean[], levelUps: string[], badges: BadgeWin[]) => {
    const happened = record(finishEvent(plan));
    if (happened.some((h) => h.kind === 'badge-unlocked')) sound.current.play('celebrate');
    setScreen(summaryScreen(plan, results, levelUps, badges, happened));
  };

  if (screen.name === 'sprint-ready') {
    const { skill } = screen;
    return (
      <SprintReady
        skill={skill}
        best={personalBest(progress, skill)}
        onStart={() => setScreen({ name: 'sprint', skill, run: Date.now() })}
        onHome={() => setScreen({ name: 'home' })}
      />
    );
  }

  if (screen.name === 'sprint') {
    const { skill } = screen;
    return (
      <Sprint
        key={screen.run}
        skill={skill}
        best={personalBest(progress, skill)}
        nextQuestion={(previous) => nextSprintQuestion(skill, random.current, previous)}
        onFinish={(score, attempted) => {
          const happened = record({ type: 'sprint-finished', skill, score, attempted });
          const result = happened.find((h) => h.kind === 'sprint-finished');
          const badges = happened.filter((h): h is BadgeWin => h.kind === 'badge-unlocked');
          const promotion = happened.find((h) => h.kind === 'level-up');
          const promotedTo = promotion && promotion.kind === 'level-up' ? promotion.to : null;
          if ((result && result.kind === 'sprint-finished' && result.newBest) || badges.length > 0 || promotedTo) sound.current.play('celebrate');
          setScreen(result && result.kind === 'sprint-finished' ? { name: 'sprint-result', result, badges, promotedTo } : { name: 'home' });
        }}
        onAnswered={(correct) => sound.current.play(correct ? 'hit' : 'miss')}
        onLeave={() => setScreen({ name: 'home' })}
      />
    );
  }

  if (screen.name === 'sprint-result') {
    const { result } = screen;
    return <SprintResult result={result} badges={screen.badges} promotedTo={screen.promotedTo} onAgain={() => setScreen({ name: 'sprint-ready', skill: result.skill })} onHome={() => setScreen({ name: 'home' })} />;
  }

  if (screen.name === 'play') {
    const { plan, index, results, feedback, shownAt } = screen;
    const question = plan.questions[index]!;
    const retry = plan.retries?.includes(question.id) ?? false;
    /** Mark an answer, record it, and show its feedback. */
    const answer = (value: number) => {
      const mark = markAnswer(question, question.answer.kind === 'choice' ? { kind: 'choice', index: value } : { kind: 'numeric', value });
      const { xp, ups, badges } = recordAnswer(plan, question, mark.correct, shownAt);
      setScreen({ ...screen, results: [...results, mark.correct], feedback: { value, mark, xp, promotedTo: ups.at(-1) ?? null }, levelUps: [...screen.levelUps, ...ups], badges: [...screen.badges, ...badges] });
    };
    const onNext = () => {
      if (index + 1 < plan.questions.length) {
        setScreen({ ...screen, index: index + 1, feedback: null, shownAt: visibleNow() });
        return;
      }
      finish(plan, results, screen.levelUps, screen.badges);
    };
    const common = { retry, index, total: plan.questions.length, results, onAnswer: answer, onNext };
    if (plan.kind === 'scenario') {
      return (
        <ScenarioSession
          {...common}
          spotCheck={plan.spotCheck !== undefined}
          question={question}
          feedback={feedback && { chosen: feedback.value, mark: feedback.mark, xp: feedback.xp, promotedTo: feedback.promotedTo }}
          onLeave={() => setScreen(plan.booklet ? { name: 'library' } : { name: 'home' })}
        />
      );
    }
    // A drill session only ever holds drills.
    if (!isDrillQuestion(question)) return null;
    return (
      <Session
        {...common}
        question={question}
        feedback={feedback && { typed: feedback.value, mark: feedback.mark, xp: feedback.xp, promotedTo: feedback.promotedTo }}
        onLeave={() => setScreen({ name: 'home' })}
      />
    );
  }

  if (screen.name === 'mock-ready') {
    return (
      <MockReady
        length={mockLength}
        mix={mockMix(progress, mockLength)}
        history={progress.mocks}
        onLength={setMockLength}
        onStart={() => setScreen({ name: 'mock', plan: chooseMock(progress, mockLength, new Date(), random.current), startedAt: Date.now() })}
        onHome={() => setScreen({ name: 'home' })}
      />
    );
  }

  if (screen.name === 'profile') {
    return (
      <Profile
        totals={summary}
        longestStreak={streakStatus(progress, new Date()).longest}
        earned={progress.badges.map((b) => b.id)}
        onSettings={() => setScreen({ name: 'settings' })}
        onHome={() => setScreen({ name: 'home' })}
      />
    );
  }

  if (screen.name === 'trends') {
    const now = new Date();
    return (
      <Trends
        mocks={mockTrend(progress, now, screen.range)}
        time={drillTimeTrend(progress, now, { range: screen.range, ...(screen.skill ? { skill: screen.skill } : {}) })}
        skills={trendSkills(progress)}
        skill={screen.skill}
        onSkill={(skill) => setScreen({ ...screen, skill })}
        range={screen.range}
        onRange={(range) => setScreen({ ...screen, range })}
        totals={summary}
        longestStreak={streakStatus(progress, now).longest}
        onHome={() => setScreen({ name: 'home' })}
      />
    );
  }

  if (screen.name === 'mock') {
    const { plan } = screen;
    return (
      <MockRun
        key={plan.id}
        plan={plan}
        startedAt={screen.startedAt}
        {...(screen.resume ? { resume: screen.resume } : {})}
        onChange={(state) => {
          const run: MockInProgress = { kind: 'mock', plan, startedAt: screen.startedAt, ...state };
          runs.save(run);
        }}
        onSubmit={(choices, timesMs, timeMs) => {
          const happened = record({ type: 'mock-finished', mock: plan, choices, timesMs, timeMs });
          const next = mockResultScreen(plan, happened);
          if (next.name === 'mock-result' && (next.result.passed || next.promotedTo || next.badges.length > 0)) sound.current.play('celebrate');
          setScreen(next);
        }}
        onLeave={() => setScreen({ name: 'mock-ready' })}
      />
    );
  }

  if (screen.name === 'mock-result') {
    const { plan, result, reviewing } = screen;
    if (reviewing !== null) {
      return (
        <MockReview
          question={plan.questions[reviewing]!}
          result={result.questions[reviewing]!}
          index={reviewing}
          total={plan.questions.length}
          onGo={(i) => setScreen({ ...screen, reviewing: i })}
          onBack={() => setScreen({ ...screen, reviewing: null })}
        />
      );
    }
    return (
      <MockResult
        result={result}
        promotedTo={screen.promotedTo}
        badges={screen.badges}
        onReview={(i) => setScreen({ ...screen, reviewing: i })}
        onHome={() => setScreen({ name: 'home' })}
      />
    );
  }

  if (screen.name === 'settings') {
    return (
      <Settings
        sound={soundOn}
        theme={theme}
        dailyGoal={progress.dailyGoal}
        onSound={(on) => {
          sound.current.setEnabled(on);
          setSoundOn(on);
          sound.current.play('hit');
        }}
        onTheme={(choice) => {
          setThemeChoice(choice);
          setTheme(choice);
        }}
        onDailyGoal={(goal) => void record({ type: 'daily-goal-set', goal })}
        onReset={() => {
          const fresh = initialProgress();
          store.save(fresh);
          setProgress(fresh);
        }}
        backups={store.backups()}
        onRestore={(key) => {
          const restored = store.restore(key);
          if (restored) setProgress(restored);
          return restored !== null;
        }}
        onDeleteBackups={() => store.deleteBackups()}
        onHome={() => setScreen({ name: 'home' })}
      />
    );
  }

  if (screen.name === 'library') {
    const booklets = bookletStatus(progress);
    const next = continueBooklet(progress);
    return (
      <Library
        booklets={booklets}
        next={booklets.find((b) => b.id === next)}
        onOpen={startBooklet}
        onHome={() => setScreen({ name: 'home' })}
      />
    );
  }

  if (screen.name === 'summary') {
    const { plan } = screen;
    return (
      <Summary
        result={screen.result}
        results={screen.results}
        levelUps={screen.levelUps}
        badges={screen.badges}
        xpNow={progress.xp}
        noun={plan.kind === 'scenario' ? 'question' : 'drill'}
        {...(plan.spotCheck && { spotCheck: { length: plan.spotCheck, targetTimeMs: plan.questions[0]!.targetTimeMs, seen: spotCheckSeen(progress) } })}
        onAgain={() => play(anotherSession(progress, plan, new Date(), random.current))}
        onHome={() => setScreen({ name: 'home' })}
      />
    );
  }

  if (screen.name === 'skills') {
    return (
      <Skills
        mode={screen.mode}
        onMode={(mode) => setScreen({ name: 'skills', mode })}
        groups={skillGroups(progress)}
        sprintSkills={sprintSkills(progress)}
        onStart={(skill) => startSession({ skill })}
        onSprint={(skill) => setScreen({ name: 'sprint-ready', skill })}
        onHome={() => setScreen({ name: 'home' })}
      />
    );
  }

  if (!next) return null;
  return (
    <Home
      notice={(loaded.notice ? noticeText(loaded.notice) : null) ?? health}
      totals={summary}
      retriesPending={retriesNow.pending}
      xp={progress.xp}
      streak={streakStatus(progress, now)}
      next={describe(next, progress)}
      onStart={() => play(next)}
      onSpotCheck={startSpotCheck}
      onSkills={() => setScreen({ name: 'skills', mode: 'session' })}
      onSprint={() => setScreen({ name: 'skills', mode: 'sprint' })}
      booklets={bookletStatus(progress)}
      onOpenLibrary={() => {
        setScreen({ name: 'library' });
        window.scrollTo(0, 0);
      }}
      mocks={progress.mocks}
      onOpenMocks={() => {
        setScreen({ name: 'mock-ready' });
        window.scrollTo(0, 0);
      }}
      onOpenTrends={() => {
        setScreen({ name: 'trends', skill: null, range: '3m' });
        window.scrollTo(0, 0);
      }}
      onProfile={() => setScreen({ name: 'profile' })}
      onSettings={() => setScreen({ name: 'settings' })}
    />
  );
}
