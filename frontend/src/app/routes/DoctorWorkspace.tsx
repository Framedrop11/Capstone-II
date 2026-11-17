import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, RiskBadge, type RiskLevel } from '../../design/components';
import { useAuthSession } from '../../shared/auth/useAuthSession';
import { createDoctorApi, type DoctorApi } from '../../features/doctor/api';
import { useCountdown } from '../../shared/utils/useCountdown';
import { formatCountdown } from '../../shared/utils/countdown';

type WorkItem = Awaited<ReturnType<DoctorApi['worklist']>>['items'][number];
type Report = Awaited<ReturnType<DoctorApi['readReport']>>;
type ActiveReport = { item: WorkItem; report: Report; token: string; expiresAt: number };
const level = (band?: string): RiskLevel | undefined =>
  band === 'low'
    ? 'low'
    : band === 'slightly_elevated' || band === 'moderate'
      ? 'moderate'
      : band === 'high' || band === 'very_high'
        ? 'high'
        : undefined;
const severity = (band?: string) =>
  band === 'very_high' || band === 'high'
    ? 3
    : band === 'moderate' || band === 'slightly_elevated'
      ? 2
      : band === 'low'
        ? 1
        : 0;

export function DoctorWorkspace() {
  const { session } = useAuthSession();
  const api = useMemo(() => createDoctorApi(session), [session]);
  const worklist = useQuery({
    queryKey: ['doctor', 'worklist'],
    queryFn: api.worklist,
    refetchInterval: 30_000,
  });
  const [active, setActive] = useState<ActiveReport | null>(null);
  const [loadingId, setLoadingId] = useState('');
  const [ended, setEnded] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [outcome, setOutcome] = useState('');
  const [saving, setSaving] = useState(false);
  const ordered = useMemo(
    () =>
      [...(worklist.data?.items ?? [])].sort(
        (a, b) =>
          severity(b.riskBand) - severity(a.riskBand) ||
          Date.parse(b.sharedAt) - Date.parse(a.sharedAt),
      ),
    [worklist.data],
  );
  const filtered = ordered.filter((item) => {
    const term = search.trim().toLowerCase();
    return (
      (!term ||
        item.patientId.toLowerCase().includes(term) ||
        item.predictionId.toLowerCase().includes(term)) &&
      (riskFilter === 'all' || item.riskBand === riskFilter)
    );
  });
  const remaining = useCountdown(active?.expiresAt ?? 0);

  const openReport = useCallback(
    async (item: WorkItem) => {
      setLoadingId(item.predictionId);
      setMessage('');
      setEnded(false);
      setActive(null);
      setOutcome('');
      try {
        const issued = await api.issueReportAccess(item.predictionId);
        const report = await api.readReport(item.predictionId, issued.accessToken);
        setActive({
          item,
          report,
          token: issued.accessToken,
          expiresAt: Date.now() + issued.expiresIn * 1000,
        });
      } catch (error) {
        const status = (error as { status?: number }).status;
        if (status === 409 || status === 401 || status === 404) {
          setEnded(true);
          setActive({ item, report: {} as Report, token: '', expiresAt: 0 });
        } else setMessage('We could not open this report. Please try again.');
      } finally {
        setLoadingId('');
      }
    },
    [api],
  );

  useEffect(() => {
    if (!active?.token || ended) return;
    let stopped = false;
    const expiryTimer = window.setTimeout(
      () => setEnded(true),
      Math.max(0, active.expiresAt - Date.now()),
    );
    const timer = window.setInterval(() => {
      void api.readReport(active.item.predictionId, active.token).catch((error: unknown) => {
        const status = (error as { status?: number }).status;
        if (!stopped && (status === 409 || status === 401 || status === 404)) setEnded(true);
      });
    }, 10_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.clearTimeout(expiryTimer);
    };
  }, [active, api, ended]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const inWorklist = Boolean(target?.closest('.cl-doctor-cards'));
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (target?.tagName === 'BUTTON' && !inWorklist) return;
      const move = (nextIndex: number) => {
        setSelectedIndex(nextIndex);
        window.requestAnimationFrame(() => {
          document.querySelectorAll<HTMLButtonElement>('.cl-doctor-item')[nextIndex]?.focus();
        });
      };
      if (event.key.toLowerCase() === 'j') {
        if (!filtered.length) return;
        event.preventDefault();
        move(Math.min(selectedIndex + 1, filtered.length - 1));
      }
      if (event.key.toLowerCase() === 'k') {
        if (!filtered.length) return;
        event.preventDefault();
        move(Math.max(selectedIndex - 1, 0));
      }
      if (event.key === 'Enter' && target?.tagName !== 'BUTTON' && filtered[selectedIndex])
        void openReport(filtered[selectedIndex]!);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filtered, openReport, selectedIndex]);

  async function submitOutcome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active || !outcome.trim()) return;
    setSaving(true);
    setMessage('');
    try {
      await api.submitOutcome(active.item.predictionId, outcome.trim());
      setMessage('Outcome recorded. Thank you; this helps improve future screening.');
      setOutcome('');
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 409 || status === 401) setEnded(true);
      else setMessage('We could not record this outcome. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="cl-workspace cl-doctor">
      <header className="cl-workspace-header">
        <div>
          <p className="cl-eyebrow">CareLens clinician access</p>
          <h1>Shared reports</h1>
          <p>Reports appear here while the patient’s sharing permission is active.</p>
        </div>
        <Button variant="quiet" onClick={() => void session.signOut()}>
          Sign out
        </Button>
      </header>
      <div className="cl-doctor-layout">
        <section aria-label="Shared patient worklist" className="cl-doctor-list">
          <Card>
            <h2>Worklist</h2>
            <label className="cl-field">
              Search by patient or report ID
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setSelectedIndex(0);
                }}
              />
            </label>
            <label className="cl-field">
              Risk level
              <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}>
                <option value="all">All risk levels</option>
                <option value="very_high">Very high</option>
                <option value="high">High</option>
                <option value="moderate">Moderate</option>
                <option value="slightly_elevated">Slightly elevated</option>
                <option value="low">Low</option>
              </select>
            </label>
            {worklist.isLoading ? (
              <p role="status">Loading shared reports…</p>
            ) : worklist.isError ? (
              <div role="alert">
                <p>We could not load shared reports.</p>
                <Button variant="secondary" onClick={() => void worklist.refetch()}>
                  Try again
                </Button>
              </div>
            ) : filtered.length === 0 ? (
              <p>
                {ordered.length
                  ? 'No reports match these filters.'
                  : 'No patients have shared reports with you yet.'}
              </p>
            ) : (
              <div className="cl-doctor-cards">
                {filtered.map((item, index) => (
                  <button
                    key={item.predictionId}
                    className={`cl-doctor-item${selectedIndex === index ? ' is-selected' : ''}`}
                    aria-current={selectedIndex === index ? 'true' : undefined}
                    data-worklist-index={index}
                    onFocus={() => setSelectedIndex(index)}
                    onClick={() => void openReport(item)}
                  >
                    <strong>Patient {item.patientId.slice(-6)}</strong>
                    <span>Report {item.predictionId.slice(-6)}</span>
                    {level(item.riskBand) ? (
                      <RiskBadge level={level(item.riskBand)!} />
                    ) : (
                      <span>Risk summary not included in sharing permission</span>
                    )}
                    <small>Shared {new Date(item.sharedAt).toLocaleDateString()}</small>
                    {loadingId === item.predictionId && <span role="status">Opening…</span>}
                  </button>
                ))}
              </div>
            )}
            <p className="cl-helper">Keyboard: j / k to move, Enter to open.</p>
          </Card>
        </section>
        <section aria-label="Shared report" className="cl-doctor-report">
          {!active && !ended && (
            <Card>
              <h2>Report details</h2>
              <p>Select a report to view details permitted by the patient.</p>
            </Card>
          )}
          {ended && (
            <Card>
              <h2>Access has ended</h2>
              <p role="status">
                The patient’s sharing permission or this short-lived report access is no longer
                active. Return to the worklist to select another report.
              </p>
              <Button
                variant="secondary"
                onClick={() => {
                  setActive(null);
                  setEnded(false);
                }}
              >
                Back to worklist
              </Button>
            </Card>
          )}
          {active && !ended && (
            <Card>
              <div className="cl-report-heading">
                <div>
                  <h2>Shared report</h2>
                  <p>
                    Patient {active.item.patientId.slice(-6)} · Report{' '}
                    {active.item.predictionId.slice(-6)}
                  </p>
                </div>
                <p className="cl-expiry" aria-live="polite">
                  Access ends in <strong>{formatCountdown(remaining)}</strong>
                </p>
              </div>
              {remaining === 0 && (
                <p role="status">
                  Access has ended. Return to the worklist to reopen a report if sharing remains
                  active.
                </p>
              )}
              {active.report.riskBand && level(active.report.riskBand) && (
                <RiskBadge level={level(active.report.riskBand)!} />
              )}
              {active.report.basicScore !== undefined && (
                <p>
                  <strong>Basic score:</strong> {active.report.basicScore}
                </p>
              )}
              {active.report.mlScore !== undefined && active.report.mlScore !== null && (
                <p>
                  <strong>Model score:</strong> {active.report.mlScore}
                </p>
              )}
              {active.report.scoreSource && (
                <p>
                  <strong>Score source:</strong> {active.report.scoreSource}
                </p>
              )}
              {active.report.factors && (
                <>
                  <h3>Factors</h3>
                  <ul>
                    {active.report.factors.map((factor) => (
                      <li key={factor}>{factor}</li>
                    ))}
                  </ul>
                </>
              )}
              {active.report.explanation && <p>{active.report.explanation}</p>}
              <p className="cl-helper">{active.report.disclaimer}</p>
              {remaining > 0 && (
                <form onSubmit={(event) => void submitOutcome(event)} className="cl-outcome-form">
                  <h3>Confirm an outcome</h3>
                  <p>A brief note helps improve future screening.</p>
                  <label className="cl-field" htmlFor="outcome-note">
                    Outcome note
                    <input
                      id="outcome-note"
                      value={outcome}
                      onChange={(event) => setOutcome(event.target.value)}
                      maxLength={200}
                      required
                    />
                  </label>
                  <small>{outcome.length}/200 characters</small>
                  <Button type="submit" disabled={saving || !outcome.trim()}>
                    {saving ? 'Saving…' : 'Record outcome'}
                  </Button>
                </form>
              )}
            </Card>
          )}
          {message && <p role="status">{message}</p>}
        </section>
      </div>
    </main>
  );
}
