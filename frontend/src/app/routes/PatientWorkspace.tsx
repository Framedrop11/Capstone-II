import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { Button, Card, RiskBadge } from '../../design/components';
import { useAuthSession } from '../../shared/auth/useAuthSession';
import { getQuestionnairePollDelay } from '../../shared/api/query-policy';
import { isFriendlyApiError } from '../../shared/api/query-policy';
import { useCountdown } from '../../shared/utils/useCountdown';
import { createPatientApi, type PatientApi } from '../../features/patient/api';

const responseSchema = z.object({
  ageYears: z.coerce.number().int().min(18).max(120),
  bmi: z.coerce.number().min(10).max(100),
  waistCm: z.coerce.number().min(40).max(200),
  sex: z.enum(['female', 'male']),
  activity30MinDaily: z.boolean(),
  fruitVegetablesDaily: z.boolean(),
  antihypertensiveTreatment: z.boolean(),
  historyHighGlucose: z.boolean(),
  familyHistoryDiabetes: z.enum(['none', 'second_degree', 'first_degree']),
});
type ResponseForm = z.infer<typeof responseSchema>;
type ResponseInput = z.input<typeof responseSchema>;
type Prediction = Awaited<ReturnType<PatientApi['predictions']>>['items'][number];
type Notification = Awaited<ReturnType<PatientApi['notifications']>>['items'][number];
type Panel = 'home' | 'checkup' | 'report' | 'sharing' | 'activity';

const fields = [
  {
    name: 'ageYears',
    title: 'How old are you?',
    help: 'Your age helps make this screening estimate more relevant.',
    type: 'number',
    min: 18,
    max: 120,
    unit: 'years',
  },
  {
    name: 'bmi',
    title: 'What is your BMI?',
    help: 'You can find this on a recent health check. A value from 10 to 100 is accepted.',
    type: 'number',
    min: 10,
    max: 100,
    step: 0.1,
    unit: 'BMI',
  },
  {
    name: 'waistCm',
    title: 'What is your waist measurement?',
    help: 'Measure around your waist in centimetres, if you know it.',
    type: 'number',
    min: 40,
    max: 200,
    unit: 'cm',
  },
  {
    name: 'sex',
    title: 'Which screening waist reference should we use?',
    help: 'This is used only for the validated waist thresholds in this questionnaire.',
    type: 'choice',
    options: [
      ['female', 'Female'],
      ['male', 'Male'],
    ],
  },
  {
    name: 'activity30MinDaily',
    title: 'Are you active for at least 30 minutes most days?',
    help: 'Count walking, cycling, housework or another activity that gets you moving.',
    type: 'boolean',
  },
  {
    name: 'fruitVegetablesDaily',
    title: 'Do you eat vegetables or fruit every day?',
    help: 'Choose the answer that best reflects a usual day.',
    type: 'boolean',
  },
  {
    name: 'antihypertensiveTreatment',
    title: 'Do you take medicine for high blood pressure?',
    help: 'This includes medication prescribed by a clinician.',
    type: 'boolean',
  },
  {
    name: 'historyHighGlucose',
    title: 'Have you ever had high blood glucose?',
    help: 'For example, during a health check or while pregnant.',
    type: 'boolean',
  },
  {
    name: 'familyHistoryDiabetes',
    title: 'Has a close family member had diabetes?',
    help: 'Choose the closest relationship that applies.',
    type: 'choice',
    options: [
      ['none', 'No'],
      ['second_degree', 'Grandparent, aunt, uncle or cousin'],
      ['first_degree', 'Parent, sibling or child'],
    ],
  },
] as const;

function readableError(error: unknown): string {
  return isFriendlyApiError(error)
    ? error.message
    : 'We could not load this just now. Please try again.';
}

function riskLevelFor(band: string | undefined): 'low' | 'moderate' | 'high' | null {
  if (band === 'low') return 'low';
  if (band === 'slightly_elevated' || band === 'moderate') return 'moderate';
  if (band === 'high' || band === 'very_high') return 'high';
  return null;
}

export function PatientWorkspace() {
  const { session } = useAuthSession();
  const api = useMemo(() => createPatientApi(session), [session]);
  const queryClient = useQueryClient();
  const [panel, setPanel] = useState<Panel>('home');
  const [selectedPrediction, setSelectedPrediction] = useState('');
  const [questionnaireId, setQuestionnaireId] = useState('');
  const [shareDoctorQuery, setShareDoctorQuery] = useState('');
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [sharePrediction, setSharePrediction] = useState('');
  const [shareDuration, setShareDuration] = useState(7);
  const [confirmRevoke, setConfirmRevoke] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [activityFilter, setActivityFilter] = useState('all');

  const predictions = useQuery({ queryKey: ['patient', 'predictions'], queryFn: api.predictions });
  const consents = useQuery({
    queryKey: ['patient', 'consents'],
    queryFn: api.consents,
    staleTime: 10_000,
  });
  const audit = useInfiniteQuery({
    queryKey: ['patient', 'audit'],
    queryFn: ({ pageParam }) => api.audit(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const notifications = useQuery({
    queryKey: ['patient', 'notifications'],
    queryFn: api.notifications,
    refetchInterval: 30_000,
  });
  const doctors = useQuery({
    queryKey: ['patient', 'doctors', shareDoctorQuery],
    queryFn: () => api.doctors(shareDoctorQuery),
    enabled: panel === 'sharing',
    staleTime: 60_000,
  });
  const questionnaireStatus = useQuery({
    queryKey: ['patient', 'questionnaire-status', questionnaireId],
    queryFn: () => api.questionnaireStatus(questionnaireId),
    enabled: Boolean(questionnaireId),
    refetchInterval: (query) =>
      query.state.data?.status === 'pending'
        ? getQuestionnairePollDelay(query.state.dataUpdateCount)
        : false,
  });
  const completedPredictionId =
    questionnaireStatus.data?.status === 'complete'
      ? questionnaireStatus.data.predictionId
      : undefined;
  const reportId =
    completedPredictionId || selectedPrediction || predictions.data?.items[0]?.predictionId || '';
  const report = useQuery({
    queryKey: ['patient', 'report', reportId],
    queryFn: () => api.report(reportId),
    enabled: Boolean(reportId),
    staleTime: 10_000,
  });
  const submit = useMutation({
    mutationFn: ({ answers, key }: { answers: ResponseForm; key: string }) =>
      api.submitQuestionnaire(answers, key),
  });
  const grant = useMutation({ mutationFn: api.share });
  const revoke = useMutation({ mutationFn: api.revoke });
  const markRead = useMutation({ mutationFn: api.markRead });

  useEffect(() => {
    if (questionnaireStatus.data?.status === 'complete' && questionnaireStatus.data.predictionId) {
      void queryClient.invalidateQueries({ queryKey: ['patient', 'predictions'] });
      void queryClient.invalidateQueries({ queryKey: ['patient', 'notifications'] });
    }
  }, [questionnaireStatus.data, queryClient]);

  const activePanel =
    panel === 'checkup' && questionnaireStatus.data?.status === 'complete' ? 'report' : panel;
  const activeShares = (consents.data?.items ?? []).filter((item) => !item.revoked);
  const recentPrediction = predictions.data?.items[0];
  const revokeShare = async (consentId: string) => {
    await revoke.mutateAsync(consentId);
    setConfirmRevoke('');
    await queryClient.invalidateQueries({ queryKey: ['patient', 'consents'] });
  };

  return (
    <main className="patient-page">
      <header className="patient-header">
        <a
          className="patient-brand"
          href="/patient"
          onClick={(event) => {
            event.preventDefault();
            setPanel('home');
          }}
        >
          CareLens<span aria-hidden="true">•</span>
        </a>
        <nav aria-label="Patient navigation" className="patient-nav">
          {(
            [
              ['home', 'Overview'],
              ['checkup', 'Check-up'],
              ['sharing', 'Sharing'],
              ['activity', 'Activity'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              aria-current={activePanel === key ? 'page' : undefined}
              onClick={() => setPanel(key)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="patient-header-actions">
          <button
            className="notification-trigger"
            aria-label={`Notifications, ${notifications.data?.unreadCount ?? 0} unread`}
            aria-expanded={notificationsOpen}
            onClick={() => setNotificationsOpen((value) => !value)}
          >
            🔔<span>{notifications.data?.unreadCount ?? 0}</span>
          </button>
          <Button variant="quiet" onClick={() => void session.signOut()}>
            Sign out
          </Button>
        </div>
      </header>

      {notificationsOpen && (
        <NotificationPanel
          items={notifications.data?.items ?? []}
          error={notifications.error ?? markRead.error}
          onRead={async (item) => {
            await markRead.mutateAsync(item.notificationId);
            await queryClient.invalidateQueries({ queryKey: ['patient', 'notifications'] });
          }}
          onClose={() => setNotificationsOpen(false)}
        />
      )}

      <section className="patient-content">
        {activePanel === 'home' && (
          <Dashboard
            prediction={recentPrediction}
            report={report.data}
            shares={activeShares}
            isLoading={predictions.isLoading}
            error={predictions.error}
            onStart={() => {
              setQuestionnaireId('');
              setPanel('checkup');
            }}
            onOpenReport={(id) => {
              setSelectedPrediction(id);
              setPanel('report');
            }}
            onShare={() => {
              setSharePrediction(recentPrediction?.predictionId ?? '');
              setPanel('sharing');
            }}
          />
        )}
        {activePanel === 'checkup' && (
          <Checkup
            onSubmit={async (answers, key) => {
              const result = await submit.mutateAsync({ answers, key });
              return result.questionnaireId;
            }}
            submitError={submit.error}
            submitting={submit.isPending}
            status={questionnaireStatus.data}
            statusError={questionnaireStatus.error}
            isPolling={questionnaireStatus.isFetching}
            onSubmitted={(id) => setQuestionnaireId(id)}
            onBack={() => setPanel('home')}
          />
        )}
        {activePanel === 'report' && (
          <ReportView
            predictions={predictions.data?.items ?? []}
            report={report.data}
            selectedId={reportId}
            isLoading={report.isLoading}
            error={report.error}
            onSelect={setSelectedPrediction}
            onBack={() => setPanel('home')}
            onShare={() => {
              setSharePrediction(reportId);
              setPanel('sharing');
            }}
          />
        )}
        {activePanel === 'sharing' && (
          <Sharing
            predictions={predictions.data?.items ?? []}
            consents={consents.data?.items ?? []}
            doctors={doctors.data?.items ?? []}
            query={shareDoctorQuery}
            onQuery={setShareDoctorQuery}
            selectedDoctor={selectedDoctor}
            onSelectDoctor={setSelectedDoctor}
            predictionId={sharePrediction || recentPrediction?.predictionId || ''}
            onSelectPrediction={setSharePrediction}
            duration={shareDuration}
            onDuration={setShareDuration}
            onGrant={async (input) => {
              await grant.mutateAsync(input);
              await queryClient.invalidateQueries({ queryKey: ['patient', 'consents'] });
            }}
            onRevoke={revokeShare}
            confirmRevoke={confirmRevoke}
            onConfirmRevoke={setConfirmRevoke}
            busy={grant.isPending || revoke.isPending}
            error={grant.error ?? revoke.error ?? doctors.error ?? consents.error}
          />
        )}
        {activePanel === 'activity' && (
          <Activity
            items={audit.data?.pages.flatMap((page) => page.items) ?? []}
            error={audit.error}
            filter={activityFilter}
            onFilter={setActivityFilter}
            hasMore={audit.hasNextPage}
            loadingMore={audit.isFetchingNextPage}
            onLoadMore={() => void audit.fetchNextPage()}
          />
        )}
      </section>
      <footer className="patient-footer">
        CareLens offers a screening estimate to support a conversation with a healthcare
        professional.
      </footer>
    </main>
  );
}

function Dashboard({
  prediction,
  report,
  shares,
  isLoading,
  error,
  onStart,
  onOpenReport,
  onShare,
}: {
  prediction: Prediction | undefined;
  report: Awaited<ReturnType<PatientApi['report']>> | undefined;
  shares: Awaited<ReturnType<PatientApi['consents']>>['items'];
  isLoading: boolean;
  error: unknown;
  onStart: () => void;
  onOpenReport: (id: string) => void;
  onShare: () => void;
}) {
  const value = report?.mlScore ?? report?.basicScore;
  return (
    <>
      <div className="patient-hero">
        <div>
          <p className="eyebrow">YOUR HEALTH, AT YOUR PACE</p>
          <h1>A clearer picture starts with a check-in.</h1>
          <p>
            Answer a few questions to get a screening estimate you can discuss with your care team.
          </p>
          <Button onClick={onStart}>
            Start a new check-up <span aria-hidden="true">→</span>
          </Button>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-gauge">
            <span>{typeof value === 'number' ? `${Math.round(value * 100)}%` : '—'}</span>
            <small>screening score</small>
          </div>
          <div className="hero-note">Small steps count</div>
        </div>
      </div>
      <div className="patient-section-heading">
        <div>
          <p className="eyebrow">YOUR SPACE</p>
          <h2>Welcome to your health hub</h2>
        </div>
      </div>
      {Boolean(error) && (
        <p role="alert" className="patient-error">
          {readableError(error)}
        </p>
      )}
      {isLoading ? (
        <Card>
          <p role="status">Loading your latest check-in…</p>
        </Card>
      ) : prediction ? (
        <div className="patient-grid">
          <Card className="result-card">
            <div className="section-top">
              <div>
                <p className="eyebrow">LATEST SCREENING</p>
                <h3>Your estimate is ready</h3>
              </div>
              <span
                className={`score-source ${prediction.scoreSource === 'basic_only' ? 'score-source--basic' : ''}`}
              >
                {prediction.scoreSource === 'basic_only' ? 'Basic score only' : 'Refined score'}
              </span>
            </div>
            <div className="result-score">
              <div
                className="score-gauge"
                role="img"
                aria-label={`Screening score ${Math.round((report?.mlScore ?? prediction.mlScore ?? prediction.basicScore) * 100)} percent`}
                style={
                  {
                    '--score': `${Math.round((report?.mlScore ?? prediction.mlScore ?? prediction.basicScore) * 100)}%`,
                  } as CSSProperties
                }
              >
                <span>
                  {Math.round(
                    (report?.mlScore ?? prediction.mlScore ?? prediction.basicScore) * 100,
                  )}
                  <small>%</small>
                </span>
              </div>
              <div>
                <strong>Screening score</strong>
                {riskLevelFor(report?.riskBand) && (
                  <RiskBadge level={riskLevelFor(report?.riskBand)!} />
                )}
                <p>
                  This is an estimate from your answers. A qualified professional can help put it in
                  context.
                </p>
              </div>
            </div>
            <div className="action-row">
              <Button variant="secondary" onClick={() => onOpenReport(prediction.predictionId)}>
                View report
              </Button>
              <Button onClick={onShare}>Share with a doctor</Button>
            </div>
          </Card>
          <Card className="history-card">
            <div className="section-top">
              <div>
                <p className="eyebrow">YOUR CHECK-INS</p>
                <h3>Recent history</h3>
              </div>
            </div>
            <p className="history-item">
              <span className="history-dot" aria-hidden="true" />
              <span>
                <strong>{new Date(prediction.predictionTimestamp).toLocaleDateString()}</strong>
                <small>
                  {prediction.scoreSource === 'basic_only' ? 'Basic score only' : 'Refined score'}
                </small>
              </span>
              <button
                onClick={() => onOpenReport(prediction.predictionId)}
                aria-label="Open this screening report"
              >
                →
              </button>
            </p>
            <p className="support-note">
              Your results are private. You choose if and when to share them.
            </p>
          </Card>
        </div>
      ) : (
        <Card className="empty-card">
          <span className="empty-illustration" aria-hidden="true">
            ✦
          </span>
          <h3>Your first check-in is ready when you are</h3>
          <p>It takes a few minutes. You can review each answer before sending it.</p>
          <Button onClick={onStart}>Start a check-up</Button>
        </Card>
      )}
      {shares.length > 0 && (
        <Card className="pending-shares">
          <p className="eyebrow">SHARED REPORTS</p>
          <h3>You are in control of access</h3>
          <p>
            {shares.length} report{shares.length === 1 ? ' is' : 's are'} currently shared with your
            chosen care team.
          </p>
        </Card>
      )}
      <p className="screening-disclaimer">CareLens is a screening aid, not a diagnosis.</p>
    </>
  );
}

function Checkup({
  onSubmit,
  submitError,
  submitting,
  status,
  statusError,
  isPolling,
  onSubmitted,
  onBack,
}: {
  onSubmit: (answers: ResponseForm, key: string) => Promise<string>;
  submitError: unknown;
  submitting: boolean;
  status: Awaited<ReturnType<PatientApi['questionnaireStatus']>> | undefined;
  statusError: unknown;
  isPolling: boolean;
  onSubmitted: (id: string) => void;
  onBack: () => void;
}) {
  const form = useForm<ResponseInput, unknown, ResponseForm>({
    resolver: zodResolver(responseSchema),
    mode: 'onTouched',
  });
  const [step, setStep] = useState(0);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const item = fields[step]!;
  const watchedField = useWatch({ control: form.control, name: item.name });
  const bmi = useWatch({ control: form.control, name: 'bmi' });
  const busy = submitting || status?.status === 'pending';
  const next = async () => {
    const valid = await form.trigger(item.name);
    if (!valid) return;
    if (step < fields.length - 1) setStep((value) => value + 1);
    else
      void form.handleSubmit(async (answers) => {
        const key = idempotencyKey || crypto.randomUUID();
        setIdempotencyKey(key);
        try {
          const id = await onSubmit(answers, key);
          onSubmitted(id);
        } catch (error) {
          if (isFriendlyApiError(error)) {
            for (const [field, message] of Object.entries(error.fieldErrors)) {
              if (field in responseSchema.shape) {
                form.setError(field as keyof ResponseForm, { type: 'server', message });
              }
            }
          }
        }
      })();
  };
  if (status?.status === 'pending')
    return (
      <Card className="working-card">
        <p className="eyebrow">CHECK-IN RECEIVED</p>
        <div className="working-spinner" aria-hidden="true" />
        <h1>We are working on your estimate</h1>
        <p>
          Your answers are saved securely. We will show your result as soon as processing finishes.
        </p>
        <div className="progress-track" aria-hidden="true">
          <span />
        </div>
        <p role="status">{isPolling ? 'Checking for your result…' : 'Processing your answers…'}</p>
      </Card>
    );
  if (status?.status === 'failed')
    return (
      <Card className="working-card">
        <p className="eyebrow">CHECK-IN STATUS</p>
        <h1>We could not finish this estimate</h1>
        <p>Your answers remain private. Please start a new check-up or try again later.</p>
        <Button onClick={onBack}>Return to overview</Button>
      </Card>
    );
  return (
    <div className="wizard-wrap">
      <div className="wizard-heading">
        <button className="text-back" onClick={onBack}>
          ← Overview
        </button>
        <p className="eyebrow">
          YOUR CHECK-UP · STEP {step + 1} OF {fields.length}
        </p>
        <h1>A few questions about your health</h1>
        <p>
          Answer each question as best you can. You can review your answers before sending them.
        </p>
      </div>
      <Card className="wizard-card">
        <div
          className="wizard-progress"
          role="progressbar"
          aria-label="Check-up progress"
          aria-valuemin={1}
          aria-valuemax={fields.length}
          aria-valuenow={step + 1}
          aria-valuetext={`Step ${step + 1} of ${fields.length}`}
        >
          <span style={{ width: `${((step + 1) / fields.length) * 100}%` }} />
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void next();
          }}
          noValidate
        >
          <label className="wizard-question" htmlFor={`field-${item.name}`}>
            {item.title}
          </label>
          <p id={`help-${item.name}`} className="field-help">
            {item.help}
          </p>
          {'type' in item && item.type === 'number' && (
            <>
              <div className="number-field">
                <input
                  id={`field-${item.name}`}
                  aria-describedby={`help-${item.name}${form.formState.errors[item.name] ? ` error-${item.name}` : ''}`}
                  type="number"
                  min={item.min}
                  max={item.max}
                  step={'step' in item ? item.step : 1}
                  {...form.register(item.name, { valueAsNumber: true })}
                />
                <span>{'unit' in item ? item.unit : ''}</span>
              </div>
              <input
                className="patient-slider"
                aria-label={`${item.title} slider`}
                aria-describedby={`help-${item.name}`}
                type="range"
                min={item.min}
                max={item.max}
                step={'step' in item ? item.step : 1}
                value={Number(watchedField) || item.min}
                onChange={(event) =>
                  form.setValue(item.name, Number(event.target.value), { shouldValidate: true })
                }
              />
              {item.name === 'bmi' && (
                <div className="bmi-meter">
                  <span
                    style={{
                      left: `${typeof bmi === 'number' && Number.isFinite(bmi) ? Math.min(100, Math.max(0, ((bmi - 10) / 90) * 100)) : 0}%`,
                    }}
                  />
                  <small>
                    Live BMI value{' '}
                    <strong>
                      {typeof bmi === 'number' && Number.isFinite(bmi) ? bmi.toFixed(1) : '—'}
                    </strong>
                  </small>
                </div>
              )}
            </>
          )}
          {'type' in item && item.type === 'choice' && (
            <fieldset className="choice-grid">
              <legend className="sr-only">{item.title}</legend>
              {item.options.map(([value, label]) => (
                <label
                  key={value}
                  className={`choice-card ${watchedField === value ? 'choice-card--selected' : ''}`}
                >
                  <input
                    type="radio"
                    value={value}
                    aria-describedby={`help-${item.name}`}
                    {...form.register(item.name)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
          )}
          {'type' in item && item.type === 'boolean' && (
            <fieldset className="choice-grid choice-grid--two">
              <legend className="sr-only">{item.title}</legend>
              {[
                [true, 'Yes'],
                [false, 'No'],
              ].map(([value, label]) => (
                <label
                  key={String(value)}
                  className={`choice-card ${watchedField === value ? 'choice-card--selected' : ''}`}
                >
                  <input
                    type="radio"
                    aria-describedby={`help-${item.name}`}
                    value={String(value)}
                    checked={watchedField === value}
                    onChange={() =>
                      form.setValue(item.name, value as boolean, { shouldValidate: true })
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
          )}
          {form.formState.errors[item.name] && (
            <p id={`error-${item.name}`} className="field-error" role="alert">
              {form.formState.errors[item.name]?.message ||
                'Please enter a valid answer to continue.'}
            </p>
          )}
          <div className="wizard-actions">
            {step > 0 && (
              <Button variant="quiet" onClick={() => setStep((value) => value - 1)}>
                Back
              </Button>
            )}
            <Button type="submit" disabled={busy}>
              {step === fields.length - 1 ? 'Get my estimate' : 'Continue'}
            </Button>
          </div>
          {Boolean(submitError) && (
            <p role="alert" className="patient-error">
              {readableError(submitError)}
            </p>
          )}
          {Boolean(statusError) && (
            <p role="alert" className="patient-error">
              {readableError(statusError)}
            </p>
          )}
        </form>
      </Card>
      <p className="screening-disclaimer">CareLens is a screening aid, not a diagnosis.</p>
    </div>
  );
}

function ReportView({
  predictions,
  report,
  selectedId,
  isLoading,
  error,
  onSelect,
  onBack,
  onShare,
}: {
  predictions: Prediction[];
  report: Awaited<ReturnType<PatientApi['report']>> | undefined;
  selectedId: string;
  isLoading: boolean;
  error: unknown;
  onSelect: (id: string) => void;
  onBack: () => void;
  onShare: () => void;
}) {
  const [factorsOpen, setFactorsOpen] = useState(false);
  if (isLoading)
    return (
      <Card>
        <p role="status">Opening your report…</p>
      </Card>
    );
  if (error || !report)
    return (
      <Card>
        <h1>Your report is unavailable right now</h1>
        <p role="alert" className="patient-error">
          {readableError(error)}
        </p>
        <button className="text-back" onClick={onBack}>
          ← Overview
        </button>
      </Card>
    );
  const score = report.mlScore ?? report.basicScore ?? 0;
  const bandLabels: Record<string, string> = {
    low: 'Lower screening range',
    slightly_elevated: 'Slightly elevated screening range',
    moderate: 'Moderate screening range',
    high: 'Higher screening range',
    very_high: 'Higher screening range',
  };
  return (
    <div className="report-layout">
      <header className="report-heading">
        <button className="text-back" onClick={onBack}>
          ← Overview
        </button>
        <p className="eyebrow">YOUR SCREENING REPORT</p>
        <h1>A starting point for a conversation</h1>
        <p>
          This estimate is based on the answers you shared. It does not tell the whole story of your
          health.
        </p>
      </header>
      <Card className="report-main">
        <div className="report-score-row">
          <div
            className="score-gauge score-gauge--large"
            role="img"
            aria-label={`Screening score ${Math.round(score * 100)} percent`}
            style={{ '--score': `${Math.round(score * 100)}%` } as CSSProperties}
          >
            <span>
              {Math.round(score * 100)}
              <small>%</small>
            </span>
          </div>
          <div>
            <p className="eyebrow">SCREENING ESTIMATE</p>
            {riskLevelFor(report.riskBand) && <RiskBadge level={riskLevelFor(report.riskBand)!} />}
            <h2>{bandLabels[report.riskBand ?? ''] ?? 'Screening estimate'}</h2>
            <p>
              {report.scoreSource === 'basic_only'
                ? 'Basic score only'
                : 'Refined with the screening model'}{' '}
              · {report.modelVersion}
            </p>
          </div>
        </div>
        <p className="supportive-copy">
          This is one piece of information, not a diagnosis. If you have questions, talking with a
          healthcare professional is a good next step.
        </p>
        <details open={factorsOpen} onToggle={(event) => setFactorsOpen(event.currentTarget.open)}>
          <summary>What contributed to this estimate?</summary>
          <p>{report.explanation}</p>
          <ul>
            {(report.factors ?? []).map((factor) => (
              <li key={factor}>{factor}</li>
            ))}
          </ul>
        </details>
        <div className="report-next-step">
          <span aria-hidden="true">♡</span>
          <div>
            <strong>Consider checking in with your care team</strong>
            <p>A clinician can help you understand what this result means for you.</p>
          </div>
        </div>
        <Button onClick={onShare}>Share with a doctor</Button>
        <p className="screening-disclaimer">
          {report.disclaimer || 'CareLens is a screening aid, not a diagnosis.'}
        </p>
      </Card>
      <aside className="report-history">
        <Card>
          <p className="eyebrow">PAST CHECK-INS</p>
          <h3>Your history</h3>
          {predictions.map((item) => (
            <button
              className="history-select"
              key={item.predictionId}
              aria-current={selectedId === item.predictionId ? 'true' : undefined}
              onClick={() => onSelect(item.predictionId)}
            >
              <span>{new Date(item.predictionTimestamp).toLocaleDateString()}</span>
              <span>{item.scoreSource === 'basic_only' ? 'Basic' : 'Refined'} →</span>
            </button>
          ))}
        </Card>
      </aside>
    </div>
  );
}

function Sharing({
  predictions,
  consents,
  doctors,
  query,
  onQuery,
  selectedDoctor,
  onSelectDoctor,
  predictionId,
  onSelectPrediction,
  duration,
  onDuration,
  onGrant,
  onRevoke,
  confirmRevoke,
  onConfirmRevoke,
  busy,
  error,
}: {
  predictions: Prediction[];
  consents: Awaited<ReturnType<PatientApi['consents']>>['items'];
  doctors: Awaited<ReturnType<PatientApi['doctors']>>['items'];
  query: string;
  onQuery: (value: string) => void;
  selectedDoctor: string;
  onSelectDoctor: (id: string) => void;
  predictionId: string;
  onSelectPrediction: (id: string) => void;
  duration: number;
  onDuration: (days: number) => void;
  onGrant: (input: {
    doctorId: string;
    predictionId: string;
    scope: string;
    expiresAt: string;
  }) => Promise<void>;
  onRevoke: (id: string) => Promise<void>;
  confirmRevoke: string;
  onConfirmRevoke: (id: string) => void;
  busy: boolean;
  error: unknown;
}) {
  const [success, setSuccess] = useState(false);
  const [customDuration, setCustomDuration] = useState(14);
  const active = consents.filter((item) => !item.revoked);
  return (
    <div className="sharing-wrap">
      <p className="eyebrow">YOU ARE IN CONTROL</p>
      <h1>Share a report with your doctor</h1>
      <p>Access is time-limited. You can end it at any time.</p>
      <Card>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setSuccess(false);
            void onGrant({
              doctorId: selectedDoctor,
              predictionId,
              scope: 'full_report',
              expiresAt: new Date(
                Date.now() + (duration || customDuration) * 86_400_000,
              ).toISOString(),
            })
              .then(() => {
                setSuccess(true);
                onSelectDoctor('');
              })
              .catch(() => setSuccess(false));
          }}
        >
          <label className="form-label" htmlFor="doctor-search">
            Find a doctor
          </label>
          <input
            id="doctor-search"
            className="patient-text-input"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search by name"
            autoComplete="off"
          />
          <div className="doctor-results" role="group" aria-label="Doctor search results">
            {doctors.map((doctor) => (
              <button
                type="button"
                aria-pressed={selectedDoctor === doctor.doctorId}
                key={doctor.doctorId}
                onClick={() => onSelectDoctor(doctor.doctorId)}
              >
                {doctor.name}
                <span>{selectedDoctor === doctor.doctorId ? 'Selected ✓' : 'Select'}</span>
              </button>
            ))}
          </div>
          <label className="form-label" htmlFor="share-prediction">
            Choose a report
          </label>
          <select
            id="share-prediction"
            className="patient-text-input"
            value={predictionId}
            onChange={(event) => onSelectPrediction(event.target.value)}
          >
            {predictions.map((item) => (
              <option key={item.predictionId} value={item.predictionId}>
                {new Date(item.predictionTimestamp).toLocaleDateString()} ·{' '}
                {item.scoreSource === 'basic_only' ? 'Basic score' : 'Refined score'}
              </option>
            ))}
          </select>
          <fieldset className="duration-options">
            <legend className="form-label">How long should access last?</legend>
            {[
              [1, '24 hours'],
              [7, '7 days'],
              [30, '30 days'],
            ].map(([days, label]) => (
              <label
                key={days}
                className={`duration-chip ${duration === days ? 'duration-chip--selected' : ''}`}
              >
                <input
                  type="radio"
                  name="duration"
                  checked={duration === days}
                  onChange={() => onDuration(days as number)}
                />
                {label}
              </label>
            ))}
            <label className={`duration-chip ${duration === 0 ? 'duration-chip--selected' : ''}`}>
              <input
                type="radio"
                name="duration"
                checked={duration === 0}
                onChange={() => onDuration(0)}
              />
              Custom
            </label>
          </fieldset>
          {duration === 0 && (
            <label className="form-label" htmlFor="custom-duration">
              Custom duration (1 to 30 days)
              <input
                id="custom-duration"
                className="patient-text-input"
                type="number"
                min={1}
                max={30}
                value={customDuration}
                onChange={(event) =>
                  setCustomDuration(Math.min(30, Math.max(1, Number(event.target.value))))
                }
              />
            </label>
          )}
          <Button type="submit" disabled={busy || !selectedDoctor || !predictionId}>
            Share this report
          </Button>
          {Boolean(error) && (
            <p role="alert" className="patient-error">
              {readableError(error)}
            </p>
          )}
          {success && (
            <p role="status" className="patient-success">
              Report access is now active for your selected doctor.
            </p>
          )}
        </form>
      </Card>
      <section className="active-shares">
        <h2>Current access</h2>
        {active.length === 0 ? (
          <Card>
            <p>No active shares. Your reports are private until you choose to share.</p>
          </Card>
        ) : (
          active.map((item) => (
            <ActiveShare
              key={item.consentId}
              item={item}
              onRevoke={onRevoke}
              confirmRevoke={confirmRevoke}
              onConfirm={onConfirmRevoke}
              busy={busy}
            />
          ))
        )}
      </section>
    </div>
  );
}

function ActiveShare({
  item,
  onRevoke,
  confirmRevoke,
  onConfirm,
  busy,
}: {
  item: Awaited<ReturnType<PatientApi['consents']>>['items'][number];
  onRevoke: (id: string) => Promise<void>;
  confirmRevoke: string;
  onConfirm: (id: string) => void;
  busy: boolean;
}) {
  const remaining = useCountdown(item.expiresAt);
  return (
    <Card className="active-share">
      <div>
        <strong>{item.doctorName}</strong>
        <p>
          Access ends in {Math.floor(remaining / 86_400)}d {Math.floor((remaining % 86_400) / 3600)}
          h {Math.floor((remaining % 3600) / 60)}m
        </p>
      </div>
      {confirmRevoke === item.consentId ? (
        <div className="action-row">
          <span>End access now?</span>
          <Button variant="secondary" disabled={busy} onClick={() => onConfirm('')}>
            Keep access
          </Button>
          <Button
            disabled={busy}
            onClick={() => void onRevoke(item.consentId).catch(() => undefined)}
          >
            Confirm revoke
          </Button>
        </div>
      ) : (
        <Button variant="secondary" disabled={busy} onClick={() => onConfirm(item.consentId)}>
          Revoke access
        </Button>
      )}
    </Card>
  );
}

function Activity({
  items,
  error,
  filter,
  onFilter,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  items: Awaited<ReturnType<PatientApi['audit']>>['items'];
  error: unknown;
  filter: string;
  onFilter: (value: string) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  const filtered = items.filter((item) => filter === 'all' || item.action === filter);
  const listRef = useRef<HTMLDivElement>(null);
  // TanStack Virtual exposes a mutable virtualizer instance; use it directly during render.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 82,
    overscan: 8,
    getItemKey: (index) => filtered[index]?.auditLogId ?? index,
  });
  return (
    <div className="activity-wrap">
      <p className="eyebrow">YOUR PRIVACY</p>
      <h1>Activity around your reports</h1>
      <p>See when your information was used in CareLens.</p>
      <label className="form-label" htmlFor="activity-filter">
        Show
      </label>
      <select
        id="activity-filter"
        className="patient-text-input filter-input"
        value={filter}
        onChange={(event) => onFilter(event.target.value)}
      >
        <option value="all">All activity</option>
        <option value="view_report">Report viewed</option>
        <option value="grant_consent">Sharing started</option>
        <option value="revoke_consent">Access revoked</option>
        <option value="score_generated">Check-up completed</option>
      </select>
      {Boolean(error) && (
        <p role="alert" className="patient-error">
          {readableError(error)}
        </p>
      )}
      {filtered.length === 0 ? (
        <Card>
          <p>
            {items.length === 0 ? 'No activity to show yet.' : 'No activity matches this filter.'}
          </p>
        </Card>
      ) : (
        <div
          ref={listRef}
          className="activity-list-viewport"
          role="list"
          aria-label="Recent activity"
          tabIndex={0}
        >
          <div className="activity-list-virtual" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const item = filtered[virtualItem.index]!;
              return (
                <div
                  role="listitem"
                  className="activity-list-row"
                  key={item.auditLogId}
                  style={{ transform: `translateY(${virtualItem.start}px)` }}
                >
                  <Card className="activity-item">
                    <span className="activity-icon" aria-hidden="true">
                      ✦
                    </span>
                    <div>
                      <strong>{activityLabel(item.action)}</strong>
                      <p>{new Date(item.timestamp).toLocaleString()}</p>
                    </div>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {hasMore && (
        <Button variant="secondary" disabled={loadingMore} onClick={onLoadMore}>
          {loadingMore ? 'Loading activity…' : 'Load more activity'}
        </Button>
      )}
      <p className="support-note">
        Only a limited recent history is shown here. Your care team cannot see this activity list.
      </p>
    </div>
  );
}

function activityLabel(action: string): string {
  const labels: Record<string, string> = {
    view_report: 'A report was viewed',
    grant_consent: 'You shared report access',
    revoke_consent: 'You ended report access',
    score_generated: 'A check-up result was created',
  };
  return labels[action] ?? 'CareLens activity';
}

function NotificationPanel({
  items,
  error,
  onRead,
  onClose,
}: {
  items: Notification[];
  error: unknown;
  onRead: (item: Notification) => Promise<void>;
  onClose: () => void;
}) {
  return (
    <aside className="notification-panel" aria-label="Notifications">
      <div className="section-top">
        <h2>Notifications</h2>
        <button onClick={onClose} aria-label="Close notifications">
          ×
        </button>
      </div>
      {Boolean(error) && (
        <p role="alert" className="patient-error">
          {readableError(error)}
        </p>
      )}
      {items.length === 0 ? (
        <p>You are all caught up.</p>
      ) : (
        items.map((item) => (
          <div
            className={`notification-item ${item.readAt ? '' : 'notification-item--unread'}`}
            key={item.notificationId}
          >
            <div>
              <strong>
                {item.kind === 'report_ready'
                  ? 'Your check-up result is ready'
                  : 'A report was shared with you'}
              </strong>
              <small>{new Date(item.createdAt).toLocaleString()}</small>
            </div>
            {!item.readAt && (
              <Button variant="quiet" onClick={() => void onRead(item).catch(() => undefined)}>
                Mark read
              </Button>
            )}
          </div>
        ))
      )}
    </aside>
  );
}
